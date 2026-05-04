import { NextResponse } from "next/server";
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";
import type { QuizWithQuestions, ReviewStats } from "@/lib/types/database";
import {
  sanitizeQuizForPlayer,
  unwrapEmbeddedQuiz,
} from "@/lib/utils/sessionQuiz";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const admin = createServiceRoleClient();
  const { data: session, error } = await admin
    .from("sessions")
    .select(
      `
      *,
      quiz:quizzes(
        *,
        questions(
          *,
          answer_options(*)
        )
      )
    `
    )
    .eq("id", id)
    .single();

  if (error || !session) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const userSb = await createServerSupabaseClient();
  const {
    data: { user },
  } = await userSb.auth.getUser();
  const quiz = unwrapEmbeddedQuiz(
    session.quiz as unknown as QuizWithQuestions | QuizWithQuestions[] | null
  );
  if (!quiz?.questions?.length) {
    return NextResponse.json({ error: "Invalid session quiz" }, { status: 500 });
  }

  const isHost = user?.id === session.host_id;

  const orderedQuiz: QuizWithQuestions = {
    ...quiz,
    questions: [...quiz.questions]
      .sort((a, b) => a.position - b.position)
      .map((q) => ({
        ...q,
        answer_options: [...(q.answer_options ?? [])].sort(
          (a, b) => a.position - b.position
        ),
      })),
  };

  const safeQuiz = isHost ? orderedQuiz : sanitizeQuizForPlayer(orderedQuiz);

  const sortedQs = orderedQuiz.questions;

  let review: {
    stats: ReviewStats;
    correct_option_text: string | null;
    is_last_question: boolean;
  } | null = null;

  if (session.status === "review") {
    const curQ = sortedQs[session.current_question_index];
    if (curQ) {
      const { data: statsRaw, error: rpcErr } = await admin.rpc(
        "compute_question_stats",
        {
          p_session_id: id,
          p_question_id: curQ.id,
        }
      );
      if (!rpcErr && statsRaw != null) {
        const correctOpt = curQ.answer_options.find((o) => o.is_correct);
        review = {
          stats: statsRaw as unknown as ReviewStats,
          correct_option_text: correctOpt?.text ?? null,
          is_last_question: session.current_question_index >= sortedQs.length - 1,
        };
      }
    }
  }

  let final_leaderboard:
    | {
        rank: number;
        player_id: string;
        nickname: string;
        total_points: number;
      }[]
    | undefined;

  if (session.status === "finished") {
    const { data: leaderboard } = await admin
      .from("session_players")
      .select("id, nickname, total_points")
      .eq("session_id", id)
      .eq("is_active", true)
      .order("total_points", { ascending: false });
    final_leaderboard = (leaderboard ?? []).map((p, i) => ({
      rank: i + 1,
      player_id: p.id,
      nickname: p.nickname,
      total_points: p.total_points,
    }));
  }

  return NextResponse.json(
    {
      session: {
        id: session.id,
        quiz_id: session.quiz_id,
        host_id: session.host_id,
        join_code: session.join_code,
        status: session.status,
        current_question_index: session.current_question_index,
        question_started_at: session.question_started_at,
        review_ends_at: session.review_ends_at,
        allow_late_join: session.allow_late_join,
        started_at: session.started_at,
        finished_at: session.finished_at,
        created_at: session.created_at,
        quiz: safeQuiz,
        review,
        final_leaderboard,
      },
    },
    {
      headers: {
        "Cache-Control": "private, no-store, max-age=0, must-revalidate",
      },
    }
  );
}
