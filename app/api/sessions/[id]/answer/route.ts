import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { calculatePoints } from "@/lib/utils/scoring";
import { broadcastSessionMessage } from "@/lib/realtime/sessionChannel";
import type { QuizWithQuestions } from "@/lib/types/database";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: session_id } = await params;
  const body = await req.json();
  const { player_id, question_id, answer_option_id } = body as {
    player_id?: string;
    question_id?: string;
    answer_option_id?: string | null;
  };

  if (!player_id || !question_id) {
    return NextResponse.json(
      { error: "player_id and question_id required" },
      { status: 400 }
    );
  }

  const admin = createServiceRoleClient();
  const { data: session, error: se } = await admin
    .from("sessions")
    .select(
      `
      id,
      status,
      question_started_at,
      current_question_index,
      quiz:quizzes(*, questions(*, answer_options(*)))
    `
    )
    .eq("id", session_id)
    .single();

  if (se || !session) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (session.status !== "question") {
    return NextResponse.json(
      { error: "Question is not active" },
      { status: 409 }
    );
  }

  const { data: ply } = await admin
    .from("session_players")
    .select("id")
    .eq("id", player_id)
    .eq("session_id", session_id)
    .maybeSingle();
  if (!ply) {
    return NextResponse.json({ error: "Invalid player" }, { status: 403 });
  }

  const quiz = session.quiz as unknown as QuizWithQuestions;
  const sorted = [...quiz.questions].sort((a, b) => a.position - b.position);
  const currentQ = sorted[session.current_question_index];
  if (!currentQ || currentQ.id !== question_id) {
    return NextResponse.json({ error: "Wrong question" }, { status: 409 });
  }

  if (!session.question_started_at) {
    return NextResponse.json({ error: "Invalid session state" }, { status: 409 });
  }

  const now = new Date();
  const startedAt = new Date(session.question_started_at);
  const responseTimeMs = now.getTime() - startedAt.getTime();
  const timeLimitMs = currentQ.time_limit_secs * 1000;

  if (responseTimeMs > timeLimitMs + 500) {
    return NextResponse.json({ error: "Time expired" }, { status: 410 });
  }

  const clampedTimeMs = Math.min(responseTimeMs, timeLimitMs);

  let isCorrect = false;
  if (answer_option_id) {
    const { data: option } = await admin
      .from("answer_options")
      .select("is_correct, question_id")
      .eq("id", answer_option_id)
      .single();
    if (!option || option.question_id !== question_id) {
      return NextResponse.json({ error: "Invalid option" }, { status: 400 });
    }
    isCorrect = option.is_correct;
  }

  const points = isCorrect
    ? calculatePoints(clampedTimeMs, currentQ.time_limit_secs)
    : 0;

  const { error: upErr } = await admin.from("player_answers").upsert(
    {
      session_id,
      player_id,
      question_id,
      answer_option_id: answer_option_id ?? null,
      response_time_ms: clampedTimeMs,
      is_correct: isCorrect,
      points,
      answered_at: now.toISOString(),
    },
    { onConflict: "session_id,player_id,question_id" }
  );

  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  await admin.rpc("refresh_player_total", { p_player_id: player_id });

  const { count: answered } = await admin
    .from("player_answers")
    .select("id", { count: "exact", head: true })
    .eq("session_id", session_id)
    .eq("question_id", question_id)
    .not("answer_option_id", "is", null);

  const { count: total_players } = await admin
    .from("session_players")
    .select("id", { count: "exact", head: true })
    .eq("session_id", session_id)
    .eq("is_active", true);

  await broadcastSessionMessage(admin, session_id, "answers:updated", {
    session_id,
    answered_count: answered ?? 0,
    total_players: total_players ?? 0,
    server_ts: now.toISOString(),
  });

  return NextResponse.json({ ok: true, is_correct: isCorrect, points });
}
