import { NextResponse } from "next/server";
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";
import { broadcastSessionMessage } from "@/lib/realtime/sessionChannel";

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
    .select("host_id, status")
    .eq("id", session_id)
    .single();

  if (error || !session || session.host_id !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (session.status === "finished") {
    return NextResponse.json({ ok: true });
  }

  const server_ts = new Date().toISOString();

  const { data: leaderboard } = await admin
    .from("session_players")
    .select("id, nickname, total_points")
    .eq("session_id", session_id)
    .eq("is_active", true)
    .order("total_points", { ascending: false });

  const ranked = (leaderboard ?? []).map((p, i) => ({
    rank: i + 1,
    player_id: p.id,
    nickname: p.nickname,
    total_points: p.total_points,
  }));

  await admin
    .from("sessions")
    .update({
      status: "finished",
      finished_at: server_ts,
    })
    .eq("id", session_id);

  await broadcastSessionMessage(admin, session_id, "session:finished", {
    server_ts,
    final_leaderboard: ranked,
  });

  return NextResponse.json({ ok: true });
}
