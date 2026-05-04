import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-4xl font-bold tracking-tight">Quiz Live</h1>
      <p className="text-neutral-600 text-center max-w-md">
        Host runs a quiz on the big screen. Players join on their phones with a
        code or QR link.
      </p>
      <div className="flex gap-4 flex-wrap justify-center">
        <Link
          href="/login"
          className="rounded-lg bg-neutral-900 text-white px-5 py-2.5 font-medium"
        >
          Host login
        </Link>
        <Link
          href="/join"
          className="rounded-lg border border-neutral-300 px-5 py-2.5 font-medium"
        >
          Join a game
        </Link>
      </div>
    </main>
  );
}
