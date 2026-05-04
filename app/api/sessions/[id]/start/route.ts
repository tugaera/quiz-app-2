import { NextResponse } from "next/server";
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";
import { invokeAdvanceQuestion } from "@/lib/edge/advanceQuestion";
import { broadcastSessionMessage } from "@/lib/realtime/sessionChannel";
import type { QuizWithQuestions } from "@/lib/types/database";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
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

  if (error || !session || session.host_id !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (session.status !== "waiting") {
    return NextResponse.json({ error: "Already started" }, { status: 409 });
  }

  const quiz = session.quiz as unknown as QuizWithQuestions;
  const sorted = [...quiz.questions].sort((a, b) => a.position - b.position);
  if (sorted.length === 0) {
    return NextResponse.json({ error: "Quiz has no questions" }, { status: 400 });
  }

  const first = sorted[0]!;
  const server_ts = new Date().toISOString();

  const { error: upErr } = await admin
    .from("sessions")
    .update({
      status: "question",
      current_question_index: 0,
      question_started_at: server_ts,
      started_at: session.started_at ?? server_ts,
    })
    .eq("id", id);

  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  await broadcastSessionMessage(admin, id, "session:question", {
    server_ts,
    question_index: 0,
    question_id: first.id,
    question_started_at: server_ts,
    time_limit_secs: first.time_limit_secs,
  });

  if (quiz.type === "sequential") {
    const invoked = await invokeAdvanceQuestion({
      session_id: id,
      action: "schedule_question_end",
    });
    if (!invoked.ok) {
      console.error("[start] schedule_question_end failed:", invoked);
    }
  }

  return NextResponse.json({ ok: true });
}
