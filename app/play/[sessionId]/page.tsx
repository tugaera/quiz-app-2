"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { useServerAnchoredTimer } from "@/lib/hooks/useServerAnchoredTimer";
import type { QuizSanitized, ReviewStats, SessionStatus } from "@/lib/types/database";
import { getQuestionByIndex } from "@/lib/utils/sessionQuiz";

const Confetti = dynamic(() => import("@/components/shared/Confetti"), {
  ssr: false,
});

type Phase = SessionStatus | "loading";

export default function PlayPage() {
  const params = useParams();
  const sessionId = String(params.sessionId ?? "");
  const supabase = createClient();
  const [phase, setPhase] = useState<Phase>("loading");
  const [serverPayload, setServerPayload] = useState<{
    serverTs: string;
    questionStartedAt: string | null;
    timeLimitSecs: number;
    questionIndex: number;
  } | null>(null);
  const [quiz, setQuiz] = useState<QuizSanitized | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [reviewCorrectText, setReviewCorrectText] = useState<string | null>(
    null
  );
  const [reviewStats, setReviewStats] = useState<ReviewStats | null>(null);
  const [lastReviewMeta, setLastReviewMeta] = useState<{
    questionIndex: number;
    isLast: boolean;
  } | null>(null);
  const [finalLb, setFinalLb] = useState<
    { rank: number; nickname: string; total_points: number; player_id: string }[]
  >([]);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [answeredOverlay, setAnsweredOverlay] = useState(false);
  const [timeUpOverlay, setTimeUpOverlay] = useState(false);
  const [waitMs] = useState(5000);
  const [reconnecting, setReconnecting] = useState(false);
  const playerIdRef = useRef<string | null>(null);
  const [nickname, setNickname] = useState("");
  const phaseRef = useRef<Phase>(phase);
  phaseRef.current = phase;
  const nicknameRef = useRef(nickname);
  nicknameRef.current = nickname;
  const sessionChannelRef = useRef<ReturnType<
    ReturnType<typeof createClient>["channel"]
  > | null>(null);

  /** Stable unique key per mount so players don't share one Realtime presence slot. */
  const presenceKeyRef = useRef<string | null>(null);

  /** Drop stale HTTP responses; abort previous fetch so completions are ordered. */
  const syncAbortRef = useRef<AbortController | null>(null);

  const sync = useCallback(async () => {
    if (!sessionId) return;
    syncAbortRef.current?.abort();
    const ac = new AbortController();
    syncAbortRef.current = ac;

    let res: Response;
    try {
      res = await fetch(`/api/sessions/${sessionId}`, {
        cache: "no-store",
        signal: ac.signal,
      });
    } catch (e: unknown) {
      const name = e instanceof Error ? e.name : "";
      if (name === "AbortError") return;
      throw e;
    }

    if (!res.ok) return;
    const json = await res.json();
    const s = json.session as {
      join_code: string;
      status: SessionStatus;
      current_question_index: number;
      question_started_at: string | null;
      quiz: QuizSanitized;
      review?: {
        stats: ReviewStats;
        correct_option_text: string | null;
        is_last_question: boolean;
      } | null;
      final_leaderboard?: typeof finalLb;
    };
    if (!s?.quiz?.questions?.length) return;

    /* Never let a stale "waiting" body clobber an in-progress game (fixes out-of-order HTTP). */
    if (s.status === "waiting") {
      const p = phaseRef.current;
      if (p === "question" || p === "review" || p === "finished") return;
    }

    setQuiz((prev) => (prev?.id === s.quiz.id ? prev : s.quiz));
    setJoinCode((prev) => (prev === s.join_code ? prev : s.join_code));
    setPhase((prev) => (prev === s.status ? prev : s.status));

    if (s.status === "finished") {
      if (Array.isArray(s.final_leaderboard)) {
        setFinalLb(s.final_leaderboard);
      }
      setServerPayload(null);
      setReviewStats(null);
      setLastReviewMeta(null);
      setReviewCorrectText(null);
      return;
    }

    if (s.status === "review") {
      setServerPayload(null);
      if (s.review) {
        setReviewStats(s.review.stats);
        setReviewCorrectText(s.review.correct_option_text ?? null);
        setLastReviewMeta({
          questionIndex: s.current_question_index,
          isLast: s.review.is_last_question,
        });
      }
      return;
    }

    if (s.status === "question" && s.question_started_at) {
      setReviewStats(null);
      setLastReviewMeta(null);
      setReviewCorrectText(null);
      const q = getQuestionByIndex(s.quiz, s.current_question_index);
      if (q) {
        setServerPayload((prev) => {
          if (
            prev &&
            prev.questionIndex === s.current_question_index &&
            prev.questionStartedAt === s.question_started_at &&
            prev.timeLimitSecs === q.time_limit_secs
          ) {
            return prev;
          }
          return {
            serverTs: new Date().toISOString(),
            questionStartedAt: s.question_started_at,
            timeLimitSecs: q.time_limit_secs,
            questionIndex: s.current_question_index,
          };
        });
      } else {
        setServerPayload(null);
      }
      return;
    }

    setServerPayload(null);
    setReviewStats(null);
    setLastReviewMeta(null);
    setReviewCorrectText(null);
  }, [sessionId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    playerIdRef.current = localStorage.getItem(`quiz_player_${sessionId}`);
    setNickname(localStorage.getItem("quiz_nickname") || "");
  }, [sessionId]);

  useEffect(() => {
    sync();
  }, [sync]);

  /** Backup if a broadcast is missed; interval kept moderate to avoid resetting UI every tick. */
  useEffect(() => {
    if (phase !== "question" && phase !== "review") return;
    const tick = window.setInterval(() => {
      void sync();
    }, 5000);
    return () => window.clearInterval(tick);
  }, [phase, sync]);

  useEffect(() => {
    if (!presenceKeyRef.current) {
      presenceKeyRef.current =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `p-${sessionId}-${Math.random().toString(36).slice(2)}`;
    }

    const channel = supabase
      .channel(`session:${sessionId}`, {
        config: {
          broadcast: { ack: false },
          presence: { key: presenceKeyRef.current },
        },
      })
      .on(
        "broadcast",
        { event: "session:question" },
        ({ payload }: { payload: Record<string, unknown> }) => {
          const p = payload as {
            server_ts: string;
            question_index: number;
            question_id: string;
            question_started_at: string;
            time_limit_secs: number;
          };
          setPhase("question");
          setSelectedOption(null);
          setAnsweredOverlay(false);
          setTimeUpOverlay(false);
          setReviewStats(null);
          setLastReviewMeta(null);
          setReviewCorrectText(null);
          setServerPayload((prev) => {
            if (
              prev &&
              prev.questionIndex === p.question_index &&
              prev.questionStartedAt === p.question_started_at &&
              prev.timeLimitSecs === p.time_limit_secs &&
              prev.serverTs === p.server_ts
            ) {
              return prev;
            }
            return {
              serverTs: p.server_ts,
              questionStartedAt: p.question_started_at,
              timeLimitSecs: p.time_limit_secs,
              questionIndex: p.question_index,
            };
          });
        }
      )
      .on(
        "broadcast",
        { event: "session:review" },
        ({ payload }: { payload: Record<string, unknown> }) => {
          const p = payload as {
            server_ts: string;
            question_index: number;
            is_last_question: boolean;
            stats: ReviewStats;
            correct_option_text?: string | null;
          };
          setPhase("review");
          setServerPayload(null);
          setReviewStats(p.stats);
          setReviewCorrectText(p.correct_option_text ?? null);
          setLastReviewMeta({
            questionIndex: p.question_index,
            isLast: p.is_last_question,
          });
        }
      )
      .on(
        "broadcast",
        { event: "session:finished" },
        ({ payload }: { payload: Record<string, unknown> }) => {
          const p = payload as {
            final_leaderboard: typeof finalLb;
          };
          setPhase("finished");
          setFinalLb(p.final_leaderboard);
        }
      )
      .subscribe(async (status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setReconnecting(true);
        }
        if (status === "SUBSCRIBED") {
          setReconnecting(false);
          sessionChannelRef.current = channel;
          const id = playerIdRef.current;
          if (
            id &&
            (phaseRef.current === "waiting" || phaseRef.current === "loading")
          ) {
            await channel.track({
              player_id: id,
              nickname: nicknameRef.current || "Player",
              joined_at: new Date().toISOString(),
            });
          }
        }
      });

    const dbCh = supabase
      .channel(`session-db:${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "sessions",
          filter: `id=eq.${sessionId}`,
        },
        () => {
          sync();
        }
      )
      .subscribe();

    return () => {
      sessionChannelRef.current = null;
      supabase.removeChannel(channel);
      supabase.removeChannel(dbCh);
    };
  }, [sessionId, supabase, sync]);

  useEffect(() => {
    const ch = sessionChannelRef.current;
    if (!ch || (phase !== "waiting" && phase !== "loading")) return;
    const id = playerIdRef.current;
    if (!id) return;
    void ch.track({
      player_id: id,
      nickname: nickname || "Player",
      joined_at: new Date().toISOString(),
    });
  }, [phase, nickname, sessionId]);

  const currentQuestion = useMemo(() => {
    if (!quiz || !serverPayload) return null;
    return getQuestionByIndex(quiz, serverPayload.questionIndex);
  }, [quiz, serverPayload]);

  const remainingMs = useServerAnchoredTimer({
    questionStartedAtIso: serverPayload?.questionStartedAt ?? null,
    serverAnchorIso: serverPayload?.serverTs ?? "",
    timeLimitSecs: serverPayload?.timeLimitSecs ?? 10,
    onExpire: () => {
      if (phaseRef.current !== "question") return;
      if (selectedOption) setAnsweredOverlay(true);
      else setTimeUpOverlay(true);
      window.setTimeout(() => {
        setAnsweredOverlay(false);
        setTimeUpOverlay(false);
      }, waitMs);
    },
  });

  async function submitAnswer(optionId: string) {
    if (!currentQuestion || !playerIdRef.current || phase !== "question")
      return;
    setSelectedOption(optionId);
    await fetch(`/api/sessions/${sessionId}/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        player_id: playerIdRef.current,
        question_id: currentQuestion.id,
        answer_option_id: optionId,
      }),
    });
  }

  const playerRank = finalLb.find((r) => r.player_id === playerIdRef.current);
  const colors = [
    "bg-answerA",
    "bg-answerB",
    "bg-answerC",
    "bg-answerD",
  ] as const;
  const labels = ["A", "B", "C", "D"];

  return (
    <main className="min-h-screen bg-neutral-50 text-neutral-900 pb-8">
      {reconnecting && (
        <div className="bg-amber-100 text-amber-900 text-center text-sm py-1">
          Reconnecting…
        </div>
      )}
      <AnimatePresence mode="sync">
        {(phase === "waiting" || phase === "loading") && (
          <motion.div
            key="wait"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center min-h-screen gap-4 p-6"
          >
            <div className="h-3 w-3 rounded-full bg-emerald-500 animate-pulse" />
            <p className="text-lg font-medium">
              Waiting for the host to start…
            </p>
            <p className="text-neutral-600">{nickname}</p>
            <p className="text-xs text-neutral-400">Code {joinCode}</p>
          </motion.div>
        )}

        {phase === "question" && currentQuestion && serverPayload && (
          <motion.div
            key={`q-${serverPayload.questionIndex}`}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col min-h-screen"
          >
            <div className="h-2 w-full bg-neutral-200 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 via-yellow-400 to-red-500 transition-[width] duration-100 ease-linear"
                style={{
                  width: `${Math.min(
                    100,
                    (remainingMs / (serverPayload.timeLimitSecs * 1000)) * 100
                  )}%`,
                }}
              />
            </div>
            <div className="p-4 flex-1 flex flex-col gap-4">
              <p className="text-xs text-neutral-500 text-right tabular-nums">
                {Math.ceil(remainingMs / 1000)}s
              </p>
              <h2 className="text-2xl font-bold leading-tight">
                {currentQuestion.text}
              </h2>
              <div className="grid grid-cols-2 gap-3 flex-1">
                {currentQuestion.answer_options.map((opt, i) => {
                  const picked = selectedOption === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => submitAnswer(opt.id)}
                      disabled={remainingMs <= 0}
                      className={`min-h-[72px] rounded-xl text-white font-bold text-left px-3 py-3 shadow ${
                        colors[i] ?? "bg-neutral-600"
                      } ${picked ? "ring-4 ring-white ring-offset-2 ring-offset-neutral-900" : ""} ${
                        selectedOption && !picked ? "opacity-40" : ""
                      }`}
                    >
                      <span className="text-xl mr-2">{labels[i]}</span>
                      {opt.text}
                    </button>
                  );
                })}
              </div>
            </div>
            {(answeredOverlay || timeUpOverlay) && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-6 z-10">
                <div className="bg-white rounded-xl p-6 max-w-sm text-center shadow-xl">
                  {answeredOverlay && (
                    <p className="font-semibold">
                      Answer submitted ✓ — waiting for next question…
                    </p>
                  )}
                  {timeUpOverlay && (
                    <p className="font-semibold">
                      Time&apos;s up! — waiting for next question…
                    </p>
                  )}
                </div>
              </div>
            )}
          </motion.div>
        )}

        {phase === "review" && reviewStats && lastReviewMeta && quiz && (
          <motion.div
            key="rev"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="p-6 flex flex-col gap-4"
          >
            {(() => {
              const ans = reviewStats.per_player_rows?.find(
                (r) => r.player_id === playerIdRef.current
              );
              const showConfetti = ans?.is_correct;
              return (
                <>
                  {showConfetti && <Confetti />}
                  {ans?.is_correct && (
                    <p className="text-2xl font-bold text-emerald-600">
                      ✓ Correct! +{ans.points} points
                    </p>
                  )}
                  {ans && !ans.is_correct && ans.answer_label !== "—" && (
                    <p className="text-xl font-semibold text-red-600">
                      ✗ Incorrect
                    </p>
                  )}
                  {ans && ans.answer_label === "—" && (
                    <p className="text-xl font-semibold">
                      Time&apos;s up! You didn&apos;t answer
                    </p>
                  )}
                  {reviewCorrectText && (
                    <p className="text-neutral-600">
                      Correct answer: {reviewCorrectText}
                    </p>
                  )}
                  <div className="border rounded-xl p-4 bg-white">
                    <p className="text-sm font-medium text-neutral-500 mb-2">
                      Top 3
                    </p>
                    <ul className="text-sm space-y-1">
                      {reviewStats.leaderboard_top5.slice(0, 3).map((r) => (
                        <li key={r.player_id}>
                          {r.rank}. {r.nickname} — {r.total_points} pts
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              );
            })()}
          </motion.div>
        )}

        {phase === "finished" && (
          <motion.div
            key="fin"
            className="p-6 flex flex-col items-center gap-4 min-h-screen"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            {playerRank?.rank === 1 && <Confetti />}
            <h2 className="text-2xl font-bold">Game over</h2>
            {playerRank && (
              <p className="text-lg text-center">
                You finished {playerRank.rank}
                {nth(playerRank.rank)} out of {finalLb.length} players with{" "}
                {playerRank.total_points.toLocaleString()} points.
              </p>
            )}
            <Link
              href="/join"
              className="mt-4 bg-neutral-900 text-white px-5 py-3 rounded-lg min-h-[48px] flex items-center"
            >
              Join another quiz
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}

function nth(n: number) {
  if (n % 100 >= 11 && n % 100 <= 13) return "th";
  switch (n % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
}
