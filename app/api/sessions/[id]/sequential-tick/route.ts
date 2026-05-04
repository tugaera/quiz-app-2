import { NextResponse } from "next/server";
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";
import { invokeAdvanceQuestion } from "@/lib/edge/advanceQuestion";
import type { QuizWithQuestions } from "@/lib/types/database";

/**
 * Host-only. For sequential quizzes, nudges the server when question or review
 * timers should have advanced but the Edge Function background sleep did not run.
 * Safe to call often: edge handlers are idempotent.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sessionId } = await params;
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
    .eq("id", sessionId)
    .single();

  if (error || !session || session.host_id !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const quiz = session.quiz as unknown as QuizWithQuestions;
  if (quiz.type !== "sequential") {
    return NextResponse.json({ ok: true, skipped: true });
  }

  if (session.status === "finished") {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const sorted = [...quiz.questions].sort((a, b) => a.position - b.position);
  const now = Date.now();

  if (session.status === "question" && session.question_started_at) {
    const cur = sorted[session.current_question_index];
    if (cur) {
      const end =
        new Date(session.question_started_at).getTime() +
        cur.time_limit_secs * 1000;
      if (now > end) {
        await invokeAdvanceQuestion({
          session_id: sessionId,
          action: "expire_question",
        });
        return NextResponse.json({ ok: true, nudged: "expire_question" });
      }
    }
  }

  if (session.status === "review" && session.review_ends_at) {
    const end = new Date(session.review_ends_at).getTime();
    if (now > end) {
      await invokeAdvanceQuestion({
        session_id: sessionId,
        action: "end_review",
      });
      return NextResponse.json({ ok: true, nudged: "end_review" });
    }
  }

  return NextResponse.json({ ok: true, nudged: null });
}
