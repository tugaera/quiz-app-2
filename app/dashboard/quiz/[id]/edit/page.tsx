"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { QuestionWithOptions, Quiz } from "@/lib/types/database";

export default function EditQuizPage() {
  const params = useParams();
  const id = String(params.id ?? "");
  const router = useRouter();
  const supabase = createClient();
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [questions, setQuestions] = useState<QuestionWithOptions[]>([]);
  const [text, setText] = useState("");
  const [tlim, setTlim] = useState(15);
  const [a0, setA0] = useState("");
  const [a1, setA1] = useState("");
  const [a2, setA2] = useState("");
  const [a3, setA3] = useState("");
  const [correct, setCorrect] = useState(0);
  const [err, setErr] = useState<string | null>(null);

  async function refresh() {
    const { data: q } = await supabase.from("quizzes").select("*").eq("id", id).single();
    if (q) setQuiz(q as Quiz);
    const { data: qs } = await supabase
      .from("questions")
      .select("*, answer_options(*)")
      .eq("quiz_id", id)
      .order("position");
    if (qs)
      setQuestions(
        (qs as QuestionWithOptions[]).map((q) => ({
          ...q,
          answer_options: [...q.answer_options].sort(
            (x, y) => x.position - y.position
          ),
        }))
      );
  }

  useEffect(() => {
    refresh();
  }, [id]);

  async function addQuestion(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const nextPos =
      questions.length > 0
        ? Math.max(...questions.map((q) => q.position)) + 1
        : 0;
    const opts = [a0, a1, a2, a3].map((t) => t.trim());
    if (opts.some((t) => !t)) {
      setErr("All four answers required");
      return;
    }
    const { data: qRow, error: qe } = await supabase
      .from("questions")
      .insert({
        quiz_id: id,
        position: nextPos,
        text: text.trim(),
        time_limit_secs: Math.min(120, Math.max(5, tlim)),
      })
      .select()
      .single();
    if (qe || !qRow) {
      setErr(qe?.message ?? "Insert failed");
      return;
    }
    for (let i = 0; i < 4; i++) {
      const { error: oe } = await supabase.from("answer_options").insert({
        question_id: qRow.id,
        position: i,
        text: opts[i]!,
        is_correct: i === correct,
      });
      if (oe) {
        setErr(oe.message);
        return;
      }
    }
    setText("");
    setA0("");
    setA1("");
    setA2("");
    setA3("");
    setCorrect(0);
    refresh();
  }

  if (!quiz) {
    return (
      <main className="p-8">
        <p>Loading…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-8 max-w-2xl mx-auto">
      <Link href="/dashboard" className="text-sm underline">
        ← Dashboard
      </Link>
      <h1 className="text-2xl font-bold mt-4">{quiz.title}</h1>
      <p className="text-sm text-neutral-500 capitalize mb-6">
        {quiz.type.replace("_", " ")}
      </p>

      <h2 className="font-semibold mb-2">Questions ({questions.length})</h2>
      <ul className="space-y-4 mb-8">
        {questions.map((q) => (
          <li key={q.id} className="border rounded-lg p-3 text-sm">
            <p className="font-medium">
              {q.position + 1}. {q.text}
            </p>
            <p className="text-neutral-500">{q.time_limit_secs}s</p>
          </li>
        ))}
      </ul>

      <h2 className="font-semibold mb-2">Add question</h2>
      <form onSubmit={addQuestion} className="flex flex-col gap-3 border rounded-xl p-4">
        <textarea
          className="border rounded-lg px-3 py-2 min-h-[80px]"
          placeholder="Question text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          required
        />
        <label className="text-sm flex items-center gap-2">
          Time limit (sec)
          <input
            type="number"
            min={5}
            max={120}
            className="border rounded px-2 py-1 w-24"
            value={tlim}
            onChange={(e) => setTlim(Number(e.target.value))}
          />
        </label>
        {["A", "B", "C", "D"].map((L, i) => (
          <input
            key={L}
            className="border rounded-lg px-3 py-2"
            placeholder={`Answer ${L}`}
            value={[a0, a1, a2, a3][i]}
            onChange={(e) => {
              const v = e.target.value;
              if (i === 0) setA0(v);
              if (i === 1) setA1(v);
              if (i === 2) setA2(v);
              if (i === 3) setA3(v);
            }}
          />
        ))}
        <label className="text-sm flex items-center gap-2">
          Correct
          <select
            className="border rounded px-2 py-1"
            value={correct}
            onChange={(e) => setCorrect(Number(e.target.value))}
          >
            <option value={0}>A</option>
            <option value={1}>B</option>
            <option value={2}>C</option>
            <option value={3}>D</option>
          </select>
        </label>
        {err && <p className="text-red-600 text-sm">{err}</p>}
        <button
          type="submit"
          className="bg-neutral-900 text-white rounded-lg py-2 font-medium"
        >
          Add question
        </button>
      </form>

      <p className="mt-8 text-sm">
        <Link href={`/dashboard/quiz/${id}/sessions`} className="underline">
          Session history
        </Link>
      </p>
    </main>
  );
}
