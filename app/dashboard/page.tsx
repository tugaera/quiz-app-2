"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { Quiz } from "@/lib/types/database";

export default function DashboardPage() {
  const supabase = createClient();
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);

  useEffect(() => {
    let cancel = false;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("quizzes")
        .select("*")
        .eq("host_id", user.id)
        .order("updated_at", { ascending: false });
      if (!cancel && data) setQuizzes(data as Quiz[]);
    })();
    return () => {
      cancel = true;
    };
  }, [supabase]);

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <main className="min-h-screen p-8 max-w-3xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold">Your quizzes</h1>
        <div className="flex gap-3 text-sm">
          <Link href="/dashboard/settings" className="underline">
            Settings
          </Link>
          <button type="button" onClick={signOut} className="underline">
            Sign out
          </button>
        </div>
      </div>
      <Link
        href="/dashboard/quiz/new"
        className="inline-block mb-6 rounded-lg bg-neutral-900 text-white px-4 py-2 text-sm font-medium"
      >
        New quiz
      </Link>
      <ul className="space-y-3">
        {quizzes.map((q) => (
          <li
            key={q.id}
            className="border rounded-lg p-4 flex justify-between items-center gap-4"
          >
            <div>
              <p className="font-medium">{q.title}</p>
              <p className="text-xs text-neutral-500 capitalize">{q.type.replace("_", " ")}</p>
            </div>
            <div className="flex gap-2 flex-wrap justify-end">
              <Link
                href={`/dashboard/quiz/${q.id}/edit`}
                className="text-sm underline"
              >
                Edit
              </Link>
              <Link
                href={`/dashboard/quiz/${q.id}/sessions`}
                className="text-sm underline"
              >
                Sessions
              </Link>
              <HostSessionButton quizId={q.id} />
            </div>
          </li>
        ))}
      </ul>
      {quizzes.length === 0 && (
        <p className="text-neutral-500 text-sm mt-4">No quizzes yet.</p>
      )}
    </main>
  );
}

function HostSessionButton({ quizId }: { quizId: string }) {
  async function createSession() {
    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quiz_id: quizId }),
    });
    const json = await res.json();
    if (json.session?.id) {
      window.location.href = `/host/${json.session.id}`;
    }
  }
  return (
    <button
      type="button"
      onClick={createSession}
      className="text-sm rounded-md bg-violet-600 text-white px-3 py-1"
    >
      Host live
    </button>
  );
}
