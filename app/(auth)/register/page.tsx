"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function RegisterPage() {
  const router = useRouter();
  const open =
    process.env.NEXT_PUBLIC_REGISTRATION_OPEN === "true" ||
    process.env.NEXT_PUBLIC_REGISTRATION_OPEN === "1";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const supabase = createClient();

  if (!open) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold mb-2">Registrations closed</h1>
          <p className="text-neutral-600 mb-4">
            New host sign-up is disabled for this deployment.
          </p>
          <Link href="/login" className="underline">
            Back to login
          </Link>
        </div>
      </main>
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName || email.split("@")[0] } },
    });
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
        <h1 className="text-xl font-semibold mb-4">Create host account</h1>
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <input
            className="border rounded-lg px-3 py-2"
            placeholder="Display name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
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
            Sign up
          </button>
        </form>
        <p className="mt-4 text-sm">
          <Link href="/login" className="underline">
            Already have an account?
          </Link>
        </p>
      </div>
    </main>
  );
}
