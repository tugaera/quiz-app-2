"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { randomPlayerNickname } from "@/lib/utils/nicknames";

export default function JoinCodePage() {
  const params = useParams();
  const joinCode = String(params.joinCode ?? "").toUpperCase();
  const router = useRouter();
  const supabase = createClient();
  const [nickname, setNickname] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setNickname(
      typeof window !== "undefined"
        ? localStorage.getItem("quiz_nickname") || randomPlayerNickname()
        : ""
    );
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("sessions")
        .select("id, status")
        .eq("join_code", joinCode)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        setErr("Game not found. Check the code.");
        return;
      }
      setSessionId(data.id);
      setStatus(data.status);
      const stored =
        typeof window !== "undefined"
          ? localStorage.getItem(`quiz_player_${data.id}`)
          : null;
      if (
        stored &&
        data.status !== "waiting" &&
        data.status !== "finished"
      ) {
        router.replace(`/play/${data.id}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [joinCode, supabase, router]);

  async function join(e: React.FormEvent) {
    e.preventDefault();
    if (!sessionId) return;
    setErr(null);
    const stored =
      typeof window !== "undefined"
        ? localStorage.getItem(`quiz_player_${sessionId}`)
        : null;
    const res = await fetch(`/api/sessions/${sessionId}/players`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nickname: nickname.trim(), player_id: stored }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErr(json.error ?? "Could not join");
      return;
    }
    localStorage.setItem("quiz_nickname", nickname.trim());
    localStorage.setItem(`quiz_player_${sessionId}`, json.player_id);
    if (status === "finished") {
      setErr("This session has ended");
      return;
    }
    router.push(`/play/${sessionId}`);
  }

  if (err && !sessionId) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center">
          <p className="text-red-600 mb-4">{err}</p>
          <Link href="/join" className="underline">
            Try another code
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-white">
      <form
        onSubmit={join}
        className="w-full max-w-sm border rounded-xl p-6 shadow-sm flex flex-col gap-3"
      >
        <p className="text-sm text-neutral-500">Code: {joinCode}</p>
        <h1 className="text-xl font-semibold">Enter your name</h1>
        <input
          className="border rounded-lg px-3 py-3 text-lg"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          required
          minLength={1}
        />
        <button
          type="button"
          className="text-sm text-neutral-500 underline"
          onClick={() => setNickname(randomPlayerNickname())}
        >
          Random nickname
        </button>
        {err && <p className="text-red-600 text-sm">{err}</p>}
        <button
          type="submit"
          disabled={!sessionId}
          className="bg-neutral-900 text-white rounded-lg py-3 font-medium min-h-[48px] disabled:opacity-50"
        >
          Join game
        </button>
      </form>
    </main>
  );
}
