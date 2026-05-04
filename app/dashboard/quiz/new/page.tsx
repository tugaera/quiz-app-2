"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function NewQuizPage() {
  const router = useRouter();
  const supabase = createClient();
  const [title, setTitle] = useState("My quiz");
  const [type, setType] = useState<"sequential" | "host_paced">("sequential");
  const [err, setErr] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { data, error } = await supabase
      .from("quizzes")
      .insert({
        host_id: user.id,
        title: title.trim(),
        type,
        is_public: false,
      })
      .select()
      .single();
    if (error) {
      setErr(error.message);
      return;
    }
    router.push(`/dashboard/quiz/${data.id}/edit`);
  }

  return (
    <main className="min-h-screen p-8 max-w-lg mx-auto">
      <Link href="/dashboard" className="text-sm underline">
        ← Dashboard
      </Link>
      <h1 className="text-2xl font-bold mt-4 mb-6">New quiz</h1>
      <form onSubmit={create} className="flex flex-col gap-4">
        <input
          className="border rounded-lg px-3 py-2"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
        <label className="flex flex-col gap-1 text-sm">
          Mode
          <select
            className="border rounded-lg px-3 py-2"
            value={type}
            onChange={(e) =>
              setType(e.target.value as "sequential" | "host_paced")
            }
          >
            <option value="sequential">Sequential (auto timer)</option>
            <option value="host_paced">Host paced</option>
          </select>
        </label>
        {err && <p className="text-red-600 text-sm">{err}</p>}
        <button
          type="submit"
          className="bg-neutral-900 text-white rounded-lg py-2 font-medium"
        >
          Create and edit questions
        </button>
      </form>
    </main>
  );
}
