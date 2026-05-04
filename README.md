# Quiz Live

Real-time multiplayer quiz platform (Next.js 14, Supabase, Vercel) with host projection view, mobile player UI, server-anchored timers, and an `advance-question` Edge Function that drives sequential mode.

## Prerequisites

- Node 18+
- A [Supabase](https://supabase.com) project
- Optional: [Supabase CLI](https://supabase.com/docs/guides/cli) for local DB

## Local development

1. Clone the repo and install dependencies (ensure enough disk space for `node_modules`):

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env.local` and fill in Supabase URL, anon key, service role key, and `NEXT_PUBLIC_APP_URL` (use `http://localhost:3000` locally).

3. In the Supabase SQL Editor (or via CLI migrations), run migrations in order:

   - `supabase/migrations/001_initial_schema.sql`
   - `supabase/migrations/002_rls_policies.sql`
   - `supabase/migrations/003_functions.sql`
   - `supabase/migrations/004_pg_cron_notes.sql` (documentation only)

4. **Realtime:** In Supabase Dashboard → Database → Replication, enable replication for `public.sessions` (and optionally other tables you want via Postgres Changes).

5. **Edge Function:** Deploy `supabase/functions/advance-question` (Supabase CLI: `supabase functions deploy advance-question`). The function expects `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in the Edge environment (set automatically when deployed to Supabase).

6. **Seed (optional):** Edit `supabase/seed.sql` and replace `00000000-0000-0000-0000-000000000000` with your `profiles.id`, then run the script in the SQL Editor.

7. Start Next.js:

   ```bash
   npm run dev
   ```

8. Register a host (set `NEXT_PUBLIC_REGISTRATION_OPEN=true` temporarily) or create a user in Supabase Auth; the `handle_new_user` trigger creates a `profiles` row.

### Flow

- **Host:** `/login` → `/dashboard` → create quiz → **Host live** → `/host/[sessionId]`.
- **Players:** `/join/[code]` → `/play/[sessionId]`.

Sequential mode schedules timer expiry via the `advance-question` function (self-chaining with `EdgeRuntime.waitUntil`). You can also use pg_cron + `net.http_post` (see migration `004` notes) if you prefer database-owned schedules.

## Deploy (Vercel)

1. Create a Vercel project from this repo.
2. Add the same environment variables as in `.env.example` in the Vercel project settings (`SUPABASE_SERVICE_ROLE_KEY` as a **server** secret).
3. Set `NEXT_PUBLIC_APP_URL` to your production URL (used for QR codes and join links).
4. Deploy Supabase Edge Function `advance-question` to the same Supabase project referenced by env vars.

## Security notes

- Player-facing reads use `GET /api/sessions/[id]` so correct answers are not exposed until the review broadcast.
- `session_players` and `player_answers` mutations are intended to go through API routes using the **service role** (RLS blocks direct anon writes).

## Scripts

- `npm run dev` — development server
- `npm run build` — production build
- `npm run start` — start production server
- `npm run lint` — ESLint
