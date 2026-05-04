"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { useServerAnchoredTimer } from "@/lib/hooks/useServerAnchoredTimer";
import type { QuizWithQuestions, ReviewStats, SessionStatus } from "@/lib/types/database";
import { getQuestionByIndex } from "@/lib/utils/sessionQuiz";

const QRCodeDisplay = dynamic(() => import("@/components/host/QRCodeDisplay"), {
  ssr: false,
});

export default function HostSessionPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = String(params.sessionId ?? "");
  const supabase = createClient();
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const [session, setSession] = useState<{
    status: SessionStatus;
    join_code: string;
    current_question_index: number;
    question_started_at: string | null;
    quiz: QuizWithQuestions;
  } | null>(null);
  const [serverPayload, setServerPayload] = useState<{
    serverTs: string;
    questionStartedAt: string | null;
    timeLimitSecs: number;
    questionIndex: number;
  } | null>(null);
  const [reviewStats, setReviewStats] = useState<ReviewStats | null>(null);
  const [reviewMeta, setReviewMeta] = useState<{
    isLast: boolean;
    questionIndex: number;
  } | null>(null);
  const [finalLb, setFinalLb] = useState<
    { rank: number; nickname: string; total_points: number; player_id: string }[]
  >([]);
  const [answered, setAnswered] = useState(0);
  const [totalPlayers, setTotalPlayers] = useState(0);
  const [presencePlayers, setPresencePlayers] = useState<
    { player_id: string; nickname: string }[]
  >([]);

  const load = useCallback(async () => {
    const res = await fetch(`/api/sessions/${sessionId}`, { cache: "no-store" });
    if (!res.ok) return;
    const json = await res.json();
    const s = json.session;
    setSession({
      status: s.status,
      join_code: s.join_code,
      current_question_index: s.current_question_index,
      question_started_at: s.question_started_at,
      quiz: s.quiz,
    });
    if (s.status === "question" && s.question_started_at) {
      const qs = [...s.quiz.questions].sort(
        (a: { position: number }, b: { position: number }) => a.position - b.position
      );
      const q = qs[s.current_question_index];
      if (q) {
        setServerPayload({
          serverTs: new Date().toISOString(),
          questionStartedAt: s.question_started_at,
          timeLimitSecs: q.time_limit_secs,
          questionIndex: s.current_question_index,
        });
      }
    }
    const { count } = await supabase
      .from("session_players")
      .select("id", { count: "exact", head: true })
      .eq("session_id", sessionId)
      .eq("is_active", true);
    setTotalPlayers(count ?? 0);
  }, [sessionId, supabase]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const ch = supabase
      .channel(`session:${sessionId}`, {
        config: {
          broadcast: { ack: false },
          presence: { key: "host" },
        },
      })
      .on(
        "broadcast",
        { event: "session:question" },
        ({ payload }: { payload: Record<string, unknown> }) => {
          const p = payload as {
            server_ts: string;
            question_started_at: string;
            time_limit_secs: number;
            question_index: number;
          };
          setSession((prev) =>
            prev
              ? {
                  ...prev,
                  status: "question",
                  question_started_at: p.question_started_at,
                  current_question_index: p.question_index,
                }
              : prev
          );
          setServerPayload({
            serverTs: p.server_ts,
            questionStartedAt: p.question_started_at,
            timeLimitSecs: p.time_limit_secs,
            questionIndex: p.question_index,
          });
          setAnswered(0);
        }
      )
      .on(
        "broadcast",
        { event: "session:review" },
        ({ payload }: { payload: Record<string, unknown> }) => {
          const p = payload as {
            stats: ReviewStats;
            is_last_question: boolean;
            question_index: number;
          };
          setSession((prev) =>
            prev
              ? {
                  ...prev,
                  status: "review",
                  current_question_index: p.question_index,
                }
              : prev
          );
          setReviewStats(p.stats);
          setReviewMeta({
            isLast: p.is_last_question,
            questionIndex: p.question_index,
          });
        }
      )
      .on(
        "broadcast",
        { event: "session:finished" },
        ({ payload }: { payload: Record<string, unknown> }) => {
          const p = payload as { final_leaderboard: typeof finalLb };
          setSession((prev) => (prev ? { ...prev, status: "finished" } : prev));
          setFinalLb(p.final_leaderboard);
        }
      )
      .on(
        "broadcast",
        { event: "answers:updated" },
        ({ payload }: { payload: Record<string, unknown> }) => {
          const p = payload as {
            answered_count?: number;
            total_players?: number;
          };
          if (typeof p.answered_count === "number")
            setAnswered(p.answered_count);
          if (typeof p.total_players === "number")
            setTotalPlayers(p.total_players);
        }
      )
      .on("presence", { event: "sync" }, () => {
        const state = ch.presenceState();
        const byPlayer = new Map<
          string,
          { player_id: string; nickname: string }
        >();
        Object.values(state).forEach((entries) => {
          entries.forEach((e: unknown) => {
            const m = e as { player_id?: string; nickname?: string };
            if (m.player_id && m.player_id !== "host") {
              byPlayer.set(m.player_id, {
                player_id: m.player_id,
                nickname: m.nickname ?? "?",
              });
            }
          });
        });
        setPresencePlayers(Array.from(byPlayer.values()));
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await ch.track({ player_id: "host", nickname: "Host" });
        }
      });

    const dbCh = supabase
      .channel(`session-db-host:${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "sessions",
          filter: `id=eq.${sessionId}`,
        },
        () => {
          load();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
      supabase.removeChannel(dbCh);
    };
  }, [sessionId, supabase, load]);

  /** Sequential mode: Edge background timers are unreliable without waitUntil; nudge transitions from the host tab. */
  useEffect(() => {
    if (!session || session.quiz.type !== "sequential") return;
    if (session.status !== "question" && session.status !== "review") return;

    const run = () => {
      void fetch(`/api/sessions/${sessionId}/sequential-tick`, {
        method: "POST",
      });
    };
    run();
    const t = setInterval(run, 2000);
    return () => clearInterval(t);
  }, [session, sessionId, session?.quiz.type, session?.status]);

  const cq = useMemo(() => {
    if (!session || !serverPayload) return null;
    return getQuestionByIndex(session.quiz, serverPayload.questionIndex);
  }, [session, serverPayload]);

  const remainingMs = useServerAnchoredTimer({
    questionStartedAtIso: serverPayload?.questionStartedAt ?? null,
    serverAnchorIso: serverPayload?.serverTs ?? "",
    timeLimitSecs: serverPayload?.timeLimitSecs ?? 10,
  });

  async function start() {
    const res = await fetch(`/api/sessions/${sessionId}/start`, {
      method: "POST",
    });
    if (res.ok) await load();
  }

  async function reveal() {
    await fetch(`/api/sessions/${sessionId}/reveal`, { method: "POST" });
  }

  async function next() {
    await fetch(`/api/sessions/${sessionId}/next`, { method: "POST" });
  }

  async function playAgain() {
    if (!session) return;
    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quiz_id: session.quiz.id }),
    });
    const json = await res.json();
    if (json.session?.id) router.push(`/host/${json.session.id}`);
  }

  if (!session) {
    return (
      <div className="host-shell flex items-center justify-center">
        Loading…
      </div>
    );
  }

  const joinUrl = `${appUrl.replace(/\/$/, "")}/join/${session.join_code}`;
  const lobbyCount =
    presencePlayers.length > 0 ? presencePlayers.length : totalPlayers;

  return (
    <div className="host-shell min-h-screen">
      <header className="px-6 py-4 flex justify-between items-center border-b border-white/10">
        <h1 className="text-lg font-semibold opacity-90">
          {session.quiz.title}
        </h1>
        <Link href="/dashboard" className="text-sm opacity-70 hover:opacity-100">
          Dashboard
        </Link>
      </header>

      <AnimatePresence mode="wait">
        {session.status === "waiting" && (
          <motion.div
            key="lobby"
            className="p-8 grid md:grid-cols-2 gap-10 max-w-6xl mx-auto"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <div className="flex flex-col items-center gap-4">
              <QRCodeDisplay url={joinUrl} />
              <p className="text-sm opacity-70 break-all text-center">{joinUrl}</p>
              <p className="text-2xl font-bold">
                {lobbyCount} players ready
              </p>
              <p className="text-sm opacity-60 max-w-md text-center">
                Share the QR or link while you set up. You can start the quiz
                whenever you&apos;re ready — players don&apos;t have to join
                first.
              </p>
              <button
                type="button"
                onClick={start}
                className="mt-4 rounded-full bg-violet-600 hover:bg-violet-500 px-8 py-3 font-semibold text-lg"
              >
                Start Quiz
              </button>
            </div>
            <div>
              <h2 className="text-sm uppercase tracking-wider opacity-60 mb-3">
                Players
              </h2>
              <ul className="space-y-2 max-h-[50vh] overflow-auto">
                {presencePlayers.map((p) => (
                  <li
                    key={p.player_id}
                    className="flex justify-between items-center bg-white/5 rounded-lg px-3 py-2"
                  >
                    <span>{p.nickname}</span>
                    <button
                      type="button"
                      className="text-xs text-red-300 hover:text-red-100"
                      onClick={() =>
                        fetch(`/api/sessions/${sessionId}/players`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            player_id: p.player_id,
                            active: false,
                          }),
                        }).then(() => load())
                      }
                    >
                      Remove
                    </button>
                  </li>
                ))}
                {presencePlayers.length === 0 && (
                  <li className="opacity-50 text-sm">Waiting for players…</li>
                )}
              </ul>
            </div>
          </motion.div>
        )}

        {session.status === "question" && cq && serverPayload && (
          <motion.div
            key="q"
            className="p-8 max-w-5xl mx-auto flex flex-col items-center gap-8"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <div
              className="relative w-40 h-40 rounded-full border-8 flex items-center justify-center text-4xl font-bold"
              style={{
                borderColor:
                  remainingMs < serverPayload.timeLimitSecs * 1000 * 0.3
                    ? "#ef4444"
                    : "#22c55e",
              }}
            >
              {Math.ceil(remainingMs / 1000)}
            </div>
            <p className="text-lg opacity-80">
              {answered} / {totalPlayers} answered
            </p>
            <h2 className="text-4xl md:text-5xl font-bold text-center leading-tight">
              {cq.text}
            </h2>
            <div className="grid grid-cols-2 gap-4 w-full max-w-4xl">
              {cq.answer_options.map((o, i) => (
                <div
                  key={o.id}
                  className="rounded-xl bg-white/10 px-4 py-6 text-xl font-medium"
                >
                  <span className="opacity-60 mr-2">
                    {String.fromCharCode(65 + i)}.
                  </span>
                  {o.text}
                </div>
              ))}
            </div>
            {session.quiz.type === "host_paced" && (
              <button
                type="button"
                onClick={reveal}
                className="rounded-full bg-amber-500 text-black px-6 py-2 font-semibold"
              >
                Show results
              </button>
            )}
          </motion.div>
        )}

        {session.status === "review" && reviewStats && reviewMeta && session && (
          <motion.div
            key="rev"
            className="p-8 max-w-6xl mx-auto space-y-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            {(() => {
              const q = getQuestionByIndex(
                session.quiz,
                reviewMeta.questionIndex
              );
              return (
                <>
                  <h2 className="text-3xl font-bold text-center mb-6">
                    Review
                  </h2>
                  <div className="grid md:grid-cols-2 gap-4">
                    {q?.answer_options.map((o, i) => (
                      <div
                        key={o.id}
                        className={`rounded-xl px-4 py-4 text-lg ${
                          o.is_correct
                            ? "bg-emerald-600/40 ring-2 ring-emerald-400"
                            : "bg-white/5 opacity-60"
                        }`}
                      >
                        {String.fromCharCode(65 + i)}. {o.text}
                      </div>
                    ))}
                  </div>
                </>
              );
            })()}
            <div className="grid md:grid-cols-2 gap-8">
              <div>
                <h3 className="font-semibold mb-2">Fastest correct</h3>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left opacity-60">
                      <th className="py-1">#</th>
                      <th>Nickname</th>
                      <th>Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reviewStats.fastest_correct_players.map((r) => (
                      <tr key={r.player_id} className="border-t border-white/10">
                        <td className="py-2">{r.rank}</td>
                        <td>{r.nickname}</td>
                        <td>{r.response_time_ms} ms</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div>
                <h3 className="font-semibold mb-2">Leaderboard</h3>
                <ul className="text-sm space-y-1">
                  {reviewStats.leaderboard_top5.map((r) => (
                    <li key={r.player_id}>
                      {r.rank}. {r.nickname} — {r.total_points}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            {session.quiz.type === "host_paced" && (
              <div className="flex justify-center gap-4">
                <button
                  type="button"
                  onClick={next}
                  className="rounded-full bg-violet-500 px-6 py-3 font-semibold"
                >
                  {reviewMeta.isLast ? "Final results" : "Next question"}
                </button>
              </div>
            )}
          </motion.div>
        )}

        {session.status === "finished" && (
          <motion.div
            key="fin"
            className="p-8 max-w-4xl mx-auto"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <h2 className="text-4xl font-bold text-center mb-10">Final</h2>
            <div className="flex justify-center gap-6 items-end mb-10">
              {finalLb.slice(0, 3).map((p, i) => (
                <div
                  key={p.player_id}
                  className={`flex flex-col items-center bg-white/5 rounded-t-xl px-6 py-4 ${
                    i === 0 ? "order-2 scale-110" : i === 1 ? "order-1" : "order-3"
                  }`}
                  style={{
                    minHeight: i === 0 ? 180 : i === 1 ? 140 : 120,
                  }}
                >
                  <span className="text-3xl font-black text-amber-400">
                    {p.rank}
                  </span>
                  <span className="font-semibold mt-2">{p.nickname}</span>
                  <span className="opacity-80">{p.total_points} pts</span>
                </div>
              ))}
            </div>
            <table className="w-full text-sm">
              <tbody>
                {finalLb.map((r) => (
                  <tr key={r.player_id} className="border-t border-white/10">
                    <td className="py-2">{r.rank}</td>
                    <td>{r.nickname}</td>
                    <td className="text-right">{r.total_points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex gap-4 justify-center mt-8 flex-wrap">
              <button
                type="button"
                onClick={playAgain}
                className="rounded-full bg-violet-500 px-6 py-2 font-medium"
              >
                Play again
              </button>
              <a
                href={`/api/sessions/${sessionId}/export`}
                className="rounded-full border border-white/30 px-6 py-2 font-medium"
              >
                Export CSV
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
