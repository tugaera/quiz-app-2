"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Row = {
  id: string;
  join_code: string;
  status: string;
  created_at: string;
};

export default function QuizSessionsPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params.id ?? "");
  const supabase = createClient();
  const [rows, setRows] = useState<Row[]>([]);
  const [creating, setCreating] = useState(false);
  const [createErr, setCreateErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("sessions")
      .select("id, join_code, status, created_at")
      .eq("quiz_id", id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (data) setRows(data as Row[]);
  }, [id, supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createSessionAndOpenHost() {
    setCreateErr(null);
    setCreating(true);
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quiz_id: id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCreateErr(
          typeof json.error === "string" ? json.error : "Could not create session"
        );
        return;
      }
      const sid = json.session?.id as string | undefined;
      if (sid) router.push(`/host/${sid}`);
    } finally {
      setCreating(false);
    }
  }

  return (
    <main className="p-8 max-w-2xl mx-auto">
      <Link href={`/dashboard/quiz/${id}/edit`} className="text-sm underline">
        ← Edit quiz
      </Link>
      <h1 className="text-2xl font-bold mt-4 mb-2">Sessions</h1>
      <p className="text-sm text-neutral-600 mb-6">
        Create a session to open the host screen: you&apos;ll get a join link and
        QR for players. The quiz only starts when you tap{" "}
        <span className="font-medium text-neutral-800">Start Quiz</span> in the
        host view — use that to prep the room and start later.
      </p>

      <div className="flex flex-wrap gap-3 mb-8">
        <button
          type="button"
          onClick={() => void createSessionAndOpenHost()}
          disabled={creating}
          className="rounded-lg bg-neutral-900 text-white px-4 py-2.5 text-sm font-medium disabled:opacity-50"
        >
          {creating ? "Creating…" : "New session — host screen & QR"}
        </button>
        <Link
          href="/dashboard"
          className="rounded-lg border border-neutral-300 px-4 py-2.5 text-sm font-medium inline-flex items-center"
        >
          Dashboard
        </Link>
      </div>
      {createErr && (
        <p className="text-sm text-red-600 mb-4" role="alert">
          {createErr}
        </p>
      )}

      <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-wide mb-2">
        Past &amp; open sessions
      </h2>
      <ul className="space-y-2">
        {rows.length === 0 && (
          <li className="text-sm text-neutral-500 border rounded-lg p-4">
            No sessions yet. Use the button above to create one and open the
            host lobby.
          </li>
        )}
        {rows.map((r) => (
          <li
            key={r.id}
            className="border rounded-lg p-3 flex flex-wrap justify-between items-center gap-3 text-sm"
          >
            <div>
              <span className="font-mono font-medium">{r.join_code}</span>
              <span className="text-neutral-500 mx-2">·</span>
              <span className="text-neutral-600">{r.status}</span>
              <span className="text-neutral-400 mx-2 text-xs">
                {new Date(r.created_at).toLocaleString()}
              </span>
            </div>
            <Link
              href={`/host/${r.id}`}
              className="rounded-md bg-violet-600 text-white px-3 py-1.5 text-sm font-medium whitespace-nowrap"
            >
              {r.status === "waiting"
                ? "Host dashboard (lobby & QR)"
                : "Host dashboard"}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
