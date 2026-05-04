"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function JoinIndexPage() {
  const [code, setCode] = useState("");
  const router = useRouter();

  function go(e: React.FormEvent) {
    e.preventDefault();
    const c = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (c.length < 4) return;
    router.push(`/join/${c}`);
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-white">
      <form
        onSubmit={go}
        className="w-full max-w-sm flex flex-col gap-3 border rounded-xl p-6 shadow-sm"
      >
        <h1 className="text-xl font-semibold">Join with code</h1>
        <input
          className="border rounded-lg px-3 py-3 text-lg uppercase tracking-widest text-center"
          placeholder="ABC123"
          value={code}
          maxLength={8}
          onChange={(e) => setCode(e.target.value)}
        />
        <button
          type="submit"
          className="bg-neutral-900 text-white rounded-lg py-3 font-medium min-h-[48px]"
        >
          Continue
        </button>
      </form>
    </main>
  );
}
