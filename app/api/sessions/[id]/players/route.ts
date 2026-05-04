import { NextResponse } from "next/server";
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";
import { broadcastSessionMessage } from "@/lib/realtime/sessionChannel";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: session_id } = await params;
  const body = await req.json();
  const { nickname, player_id: existingPlayerId } = body as {
    nickname?: string;
    player_id?: string | null;
  };

  if (!nickname || typeof nickname !== "string" || nickname.length < 1) {
    return NextResponse.json({ error: "nickname required" }, { status: 400 });
  }

  const admin = createServiceRoleClient();
  const { data: session, error: se } = await admin
    .from("sessions")
    .select("id, status, allow_late_join")
    .eq("id", session_id)
    .single();

  if (se || !session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  if (session.status === "finished") {
    return NextResponse.json(
      { error: "This session has ended" },
      { status: 403 }
    );
  }

  if (session.status !== "waiting" && !session.allow_late_join) {
    return NextResponse.json(
      { error: "This game has already started" },
      { status: 403 }
    );
  }

  const { data: maxRow } = await admin
    .from("app_settings")
    .select("value")
    .eq("key", "max_players_per_session")
    .maybeSingle();
  const maxPlayers = maxRow?.value ? parseInt(maxRow.value, 10) : 100;

  const { count } = await admin
    .from("session_players")
    .select("id", { count: "exact", head: true })
    .eq("session_id", session_id)
    .eq("is_active", true);

  if ((count ?? 0) >= maxPlayers) {
    return NextResponse.json({ error: "Session is full" }, { status: 403 });
  }

  if (existingPlayerId) {
    const { data: row } = await admin
      .from("session_players")
      .select("id, session_id, nickname")
      .eq("id", existingPlayerId)
      .maybeSingle();
    if (row && row.session_id === session_id) {
      const { error: upErr } = await admin
        .from("session_players")
        .update({ is_active: true, nickname: nickname.trim() })
        .eq("id", existingPlayerId);
      if (upErr) {
        return NextResponse.json({ error: upErr.message }, { status: 500 });
      }
      return NextResponse.json({ player_id: existingPlayerId, rejoined: true });
    }
  }

  const { data: created, error: insErr } = await admin
    .from("session_players")
    .insert({ session_id, nickname: nickname.trim() })
    .select()
    .single();

  if (insErr) {
    if (insErr.code === "23505") {
      return NextResponse.json(
        { error: "That nickname is taken — please choose another" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  return NextResponse.json({ player_id: created.id, player: created });
}

export async function PATCH(
  req: Request,
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

  const { player_id, active } = (await req.json()) as {
    player_id?: string;
    active?: boolean;
  };
  if (!player_id) {
    return NextResponse.json({ error: "player_id required" }, { status: 400 });
  }

  const admin = createServiceRoleClient();
  const { data: session } = await admin
    .from("sessions")
    .select("host_id")
    .eq("id", session_id)
    .single();
  if (!session || session.host_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error } = await admin
    .from("session_players")
    .update({ is_active: active ?? false })
    .eq("id", player_id)
    .eq("session_id", session_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await broadcastSessionMessage(admin, session_id, "session:players_updated", {
    server_ts: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true });
}
