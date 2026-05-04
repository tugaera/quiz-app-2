"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function SettingsPage() {
  const [map, setMap] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/settings");
      if (res.ok) {
        const j = await res.json();
        setMap(j);
      }
    })();
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        wait_after_answer_ms: map.wait_after_answer_ms,
        show_player_list_in_waiting: map.show_player_list_in_waiting,
        allow_answer_change: map.allow_answer_change,
        show_leaderboard_between_q: map.show_leaderboard_between_q,
        max_players_per_session: map.max_players_per_session,
      }),
    });
    setMsg(res.ok ? "Saved" : "Save failed");
  }

  function set(k: string, v: string) {
    setMap((m) => ({ ...m, [k]: v }));
  }

  return (
    <main className="p-8 max-w-md mx-auto">
      <Link href="/dashboard" className="text-sm underline">
        ← Dashboard
      </Link>
      <h1 className="text-2xl font-bold mt-4 mb-6">App settings</h1>
      <form onSubmit={save} className="flex flex-col gap-3 text-sm">
        <label className="flex flex-col gap-1">
          Wait after answer (ms)
          <input
            className="border rounded px-2 py-1"
            value={map.wait_after_answer_ms ?? ""}
            onChange={(e) => set("wait_after_answer_ms", e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1">
          Max players / session
          <input
            className="border rounded px-2 py-1"
            value={map.max_players_per_session ?? ""}
            onChange={(e) => set("max_players_per_session", e.target.value)}
          />
        </label>
        {(
          [
            "show_player_list_in_waiting",
            "allow_answer_change",
            "show_leaderboard_between_q",
          ] as const
        ).map((k) => (
          <label key={k} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={map[k] === "true"}
              onChange={(e) => set(k, e.target.checked ? "true" : "false")}
            />
            {k.replace(/_/g, " ")}
          </label>
        ))}
        <button
          type="submit"
          className="mt-4 bg-neutral-900 text-white rounded-lg py-2"
        >
          Save
        </button>
        {msg && <p className="text-sm text-neutral-600">{msg}</p>}
      </form>
    </main>
  );
}
