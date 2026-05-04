export async function invokeAdvanceQuestion(body: {
  session_id: string;
  action:
    | "schedule_question_end"
    | "expire_question"
    | "end_review";
}) {
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/advance-question`;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    console.warn("SUPABASE_SERVICE_ROLE_KEY missing; edge timer not scheduled");
    return;
  }
  await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(body),
  });
}
