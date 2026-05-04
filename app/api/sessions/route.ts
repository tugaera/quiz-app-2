import { NextResponse } from "next/server";
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";
import { generateJoinCode } from "@/lib/utils/joinCode";

export async function POST(req: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { quiz_id } = (await req.json()) as { quiz_id?: string };
  if (!quiz_id) {
    return NextResponse.json({ error: "quiz_id required" }, { status: 400 });
  }

  const { data: quiz, error: quizErr } = await supabase
    .from("quizzes")
    .select("id, host_id")
    .eq("id", quiz_id)
    .single();
  if (quizErr || !quiz || quiz.host_id !== user.id) {
    return NextResponse.json({ error: "Quiz not found" }, { status: 404 });
  }

  const admin = createServiceRoleClient();
  let join_code = "";
  for (let i = 0; i < 8; i++) {
    join_code = generateJoinCode(6);
    const { data: existing } = await admin
      .from("sessions")
      .select("id")
      .eq("join_code", join_code)
      .maybeSingle();
    if (!existing) break;
  }

  const { data: session, error } = await admin
    .from("sessions")
    .insert({
      quiz_id,
      host_id: user.id,
      join_code,
      status: "waiting",
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ session });
}
