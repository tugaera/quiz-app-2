"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const supabase = createClient();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setErr(error.message);
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-sm border rounded-xl p-6 shadow-sm bg-white">
        <h1 className="text-xl font-semibold mb-4">Host login</h1>
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <input
            className="border rounded-lg px-3 py-2"
            type="email"
            required
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            className="border rounded-lg px-3 py-2"
            type="password"
            required
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {err && <p className="text-red-600 text-sm">{err}</p>}
          <button
            type="submit"
            className="bg-neutral-900 text-white rounded-lg py-2 font-medium"
          >
            Sign in
          </button>
        </form>
        <p className="mt-4 text-sm text-neutral-600">
          New host?{" "}
          <Link href="/register" className="underline">
            Register
          </Link>
        </p>
        <p className="mt-2 text-sm">
          <Link href="/" className="text-neutral-500">
            ← Home
          </Link>
        </p>
      </div>
    </main>
  );
}
