import { NextResponse } from "next/server";
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";
import { invokeAdvanceQuestion } from "@/lib/edge/advanceQuestion";
import type { QuizWithQuestions } from "@/lib/types/database";

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
    return NextResponse.json({ error: "Invalid quiz mode" }, { status: 409 });
  }

  if (session.status !== "question") {
    return NextResponse.json(
      { error: "Not in question phase" },
      { status: 409 }
    );
  }

  await invokeAdvanceQuestion({
    session_id,
    action: "expire_question",
  });

  return NextResponse.json({ ok: true });
}
