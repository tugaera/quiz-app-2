import type { SupabaseClient } from "@supabase/supabase-js";

export async function broadcastSessionMessage(
  supabase: SupabaseClient,
  sessionId: string,
  event: string,
  payload: Record<string, unknown>
) {
  const channel = supabase.channel(`session:${sessionId}`, {
    config: { broadcast: { ack: false } },
  });
  await new Promise<void>((resolve, reject) => {
    channel.subscribe((status, err) => {
      if (status === "SUBSCRIBED") resolve();
      else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT")
        reject(err ?? new Error(status));
    });
  });
  await channel.send({
    type: "broadcast",
    event,
    payload,
  });
  await supabase.removeChannel(channel);
}

export async function fetchWaitAfterMs(
  supabase: SupabaseClient
): Promise<number> {
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "wait_after_answer_ms")
    .maybeSingle();
  const n = data?.value ? parseInt(data.value, 10) : 5000;
  return Number.isFinite(n) && n > 0 ? n : 5000;
}
