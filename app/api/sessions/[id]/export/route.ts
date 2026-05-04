import { NextResponse } from "next/server";
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";
import { buildResultsCsv } from "@/lib/utils/csvExport";
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
      quiz:quizzes(*, questions(*))
    `
    )
    .eq("id", id)
    .single();

  if (error || !session || session.host_id !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const quiz = session.quiz as unknown as QuizWithQuestions;
  const sortedQs = [...quiz.questions].sort((a, b) => a.position - b.position);

  const { data: players } = await admin
    .from("session_players")
    .select("id, nickname, total_points")
    .eq("session_id", id)
    .eq("is_active", true)
    .order("nickname");

  const { data: answers } = await admin
    .from("player_answers")
    .select("player_id, question_id, points")
    .eq("session_id", id);

  const nicknames = (players ?? []).map((p) => p.nickname);
  const totalPoints = (players ?? []).map((p) => p.total_points);
  const pointsByQuestion = (players ?? []).map((p) =>
    sortedQs.map((q) => {
      const row = (answers ?? []).find(
        (a) => a.player_id === p.id && a.question_id === q.id
      );
      return row?.points ?? 0;
    })
  );

  const csv = buildResultsCsv({ nicknames, totalPoints, pointsByQuestion });

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="session-${id}.csv"`,
    },
  });
}
