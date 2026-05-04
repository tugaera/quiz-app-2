import { NextResponse } from "next/server";
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";
import type { QuizWithQuestions } from "@/lib/types/database";

export async function GET(
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
      quiz:quizzes(*, questions(*, answer_options(*)))
    `
    )
    .eq("id", id)
    .single();

  if (error || !session || session.host_id !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (session.status !== "finished") {
    return NextResponse.json({ error: "Session not finished" }, { status: 409 });
  }

  const quiz = session.quiz as unknown as QuizWithQuestions;
  const sortedQs = [...quiz.questions].sort((a, b) => a.position - b.position);

  const { data: answers } = await admin
    .from("player_answers")
    .select("question_id, is_correct, player_id")
    .eq("session_id", id);

  const perQ = sortedQs.map((q) => {
    const forQ = (answers ?? []).filter((a) => a.question_id === q.id);
    const correct = forQ.filter((a) => a.is_correct).length;
    const total = Math.max(forQ.length, 1);
    return {
      question_id: q.id,
      position: q.position,
      text: q.text,
      correct_pct: Math.round((correct / total) * 100),
    };
  });

  const hardest = perQ.reduce(
    (a, b) => (a.correct_pct <= b.correct_pct ? a : b),
    perQ[0]!
  );
  const easiest = perQ.reduce(
    (a, b) => (a.correct_pct >= b.correct_pct ? a : b),
    perQ[0]!
  );

  return NextResponse.json({
    session_id: id,
    quiz_title: quiz.title,
    per_question: perQ,
    hardest_question: hardest,
    easiest_question: easiest,
  });
}
