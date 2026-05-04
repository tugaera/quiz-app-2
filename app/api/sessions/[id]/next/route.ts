import { NextResponse } from "next/server";
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";
import { broadcastSessionMessage } from "@/lib/realtime/sessionChannel";
import type { QuizWithQuestions } from "@/lib/types/database";

function sortQs(quiz: QuizWithQuestions) {
  return [...quiz.questions].sort((a, b) => a.position - b.position);
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: session_id } = await params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createServiceRoleClient();
  const { data: session, error } = await admin
    .from("sessions")
    .select(
      `
      *,
      quiz:quizzes(*, questions(*, answer_options(*)))
    `
    )
    .eq("id", session_id)
    .single();

  if (error || !session || session.host_id !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const quiz = session.quiz as unknown as QuizWithQuestions;
  if (quiz.type !== "host_paced") {
    return NextResponse.json({ error: "host_paced only" }, { status: 409 });
  }

  if (session.status !== "review") {
    return NextResponse.json({ error: "Not in review phase" }, { status: 409 });
  }

  const qs = sortQs(quiz);
  const isLast = session.current_question_index >= qs.length - 1;
  const server_ts = new Date().toISOString();

  if (isLast) {
    const { data: leaderboard } = await admin
      .from("session_players")
      .select("id, nickname, total_points")
      .eq("session_id", session_id)
      .eq("is_active", true)
      .order("total_points", { ascending: false });

    const ranked = (leaderboard ?? []).map((p, i) => ({
      rank: i + 1,
      player_id: p.id,
      nickname: p.nickname,
      total_points: p.total_points,
    }));

    await admin
      .from("sessions")
      .update({
        status: "finished",
        finished_at: server_ts,
        review_ends_at: null,
      })
      .eq("id", session_id);

    await broadcastSessionMessage(admin, session_id, "session:finished", {
      server_ts,
      final_leaderboard: ranked,
    });

    return NextResponse.json({ ok: true, finished: true });
  }

  const nextIdx = session.current_question_index + 1;
  const nextQ = qs[nextIdx]!;

  await admin
    .from("sessions")
    .update({
      status: "question",
      current_question_index: nextIdx,
      question_started_at: server_ts,
      review_ends_at: null,
    })
    .eq("id", session_id);

  await broadcastSessionMessage(admin, session_id, "session:question", {
    server_ts,
    question_index: nextIdx,
    question_id: nextQ.id,
    question_started_at: server_ts,
    time_limit_secs: nextQ.time_limit_secs,
  });

  return NextResponse.json({ ok: true, question_index: nextIdx });
}
