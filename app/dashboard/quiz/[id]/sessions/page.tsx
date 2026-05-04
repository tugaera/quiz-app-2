"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
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
  const id = String(params.id ?? "");
  const supabase = createClient();
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("sessions")
        .select("id, join_code, status, created_at")
        .eq("quiz_id", id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (data) setRows(data as Row[]);
    })();
  }, [id, supabase]);

  return (
    <main className="p-8 max-w-2xl mx-auto">
      <Link href={`/dashboard/quiz/${id}/edit`} className="text-sm underline">
        ← Edit quiz
      </Link>
      <h1 className="text-2xl font-bold mt-4 mb-6">Sessions</h1>
      <ul className="space-y-2">
        {rows.map((r) => (
          <li
            key={r.id}
            className="border rounded-lg p-3 flex justify-between items-center text-sm"
          >
            <div>
              <span className="font-mono mr-2">{r.join_code}</span>
              <span className="text-neutral-500">{r.status}</span>
            </div>
            <div className="flex gap-3">
              <Link href={`/host/${r.id}`} className="underline">
                {r.status === "waiting" ? "Resume lobby" : "Host view"}
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
