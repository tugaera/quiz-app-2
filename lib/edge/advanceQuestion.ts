export async function invokeAdvanceQuestion(body: {
  session_id: string;
  action: "schedule_question_end" | "expire_question" | "end_review";
}) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const url = `${base}/functions/v1/advance-question`;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key || !base) {
    console.warn(
      "[invokeAdvanceQuestion] Missing SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL — edge timer will not run."
    );
    return { ok: false as const, status: 0, error: "missing_env" };
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      apikey: key,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(
      `[invokeAdvanceQuestion] ${body.action} failed:`,
      res.status,
      text
    );
    return { ok: false as const, status: res.status, error: text };
  }

  return { ok: true as const, status: res.status };
}
