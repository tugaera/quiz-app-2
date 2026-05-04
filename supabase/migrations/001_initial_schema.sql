-- Quiz platform initial schema
-- Extensions
create extension if not exists "pgcrypto";

-- ─────────────────────────────────────────────
-- PROFILES
-- ─────────────────────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  created_at timestamptz default now()
);

-- ─────────────────────────────────────────────
-- QUIZZES
-- ─────────────────────────────────────────────
create table public.quizzes (
  id uuid primary key default gen_random_uuid (),
  host_id uuid references public.profiles (id) on delete cascade not null,
  title text not null,
  description text,
  type text check (type in ('sequential', 'host_paced')) not null,
  is_public boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ─────────────────────────────────────────────
-- QUESTIONS
-- ─────────────────────────────────────────────
create table public.questions (
  id uuid primary key default gen_random_uuid (),
  quiz_id uuid references public.quizzes (id) on delete cascade not null,
  position int not null,
  text text not null,
  image_url text,
  time_limit_secs int not null default 10 check (
    time_limit_secs between 5 and 120
  ),
  created_at timestamptz default now()
);

create index questions_quiz_id_position_idx on public.questions (quiz_id, position);

-- ─────────────────────────────────────────────
-- ANSWER OPTIONS
-- ─────────────────────────────────────────────
create table public.answer_options (
  id uuid primary key default gen_random_uuid (),
  question_id uuid references public.questions (id) on delete cascade not null,
  position int not null check (position between 0 and 3),
  text text not null,
  is_correct boolean not null default false
);

create unique index one_correct_answer_per_question on public.answer_options (question_id)
where
  is_correct = true;

create index answer_options_question_id_idx on public.answer_options (question_id);

-- ─────────────────────────────────────────────
-- SESSIONS
-- ─────────────────────────────────────────────
create table public.sessions (
  id uuid primary key default gen_random_uuid (),
  quiz_id uuid references public.quizzes (id) on delete cascade not null,
  host_id uuid references public.profiles (id) not null,
  join_code text unique not null,
  status text check (
    status in (
      'waiting',
      'active',
      'question',
      'review',
      'finished'
    )
  ) not null default 'waiting',
  current_question_index int not null default -1,
  question_started_at timestamptz,
  review_ends_at timestamptz,
  allow_late_join boolean default false,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz default now ()
);

create index sessions_join_code_idx on public.sessions (join_code);

-- ─────────────────────────────────────────────
-- SESSION PLAYERS
-- ─────────────────────────────────────────────
create table public.session_players (
  id uuid primary key default gen_random_uuid (),
  session_id uuid references public.sessions (id) on delete cascade not null,
  nickname text not null,
  joined_at timestamptz default now (),
  is_active boolean default true,
  total_points int not null default 0,
  constraint unique_nickname_per_session unique (session_id, nickname)
);

create index session_players_session_id_idx on public.session_players (session_id);

-- ─────────────────────────────────────────────
-- PLAYER ANSWERS
-- ─────────────────────────────────────────────
create table public.player_answers (
  id uuid primary key default gen_random_uuid (),
  session_id uuid references public.sessions (id) on delete cascade not null,
  player_id uuid references public.session_players (id) on delete cascade not null,
  question_id uuid references public.questions (id) not null,
  answer_option_id uuid references public.answer_options (id),
  response_time_ms int,
  is_correct boolean not null default false,
  points int not null default 0,
  answered_at timestamptz,
  constraint unique_answer_per_player_question unique (session_id, player_id, question_id)
);

create index player_answers_session_question_idx on public.player_answers (session_id, question_id);

-- ─────────────────────────────────────────────
-- APP SETTINGS
-- ─────────────────────────────────────────────
create table public.app_settings (
  key text primary key,
  value text not null
);

insert into
  public.app_settings (key, value)
values
  ('registration_open', 'false'),
  ('wait_after_answer_ms', '5000'),
  ('show_player_list_in_waiting', 'true'),
  ('allow_answer_change', 'true'),
  ('show_leaderboard_between_q', 'true'),
  ('max_players_per_session', '100');

-- New user → profile
create or replace function public.handle_new_user ()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1), 'Host')
  )
  on conflict (id) do update
  set
    display_name = excluded.display_name;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users for each row
execute procedure public.handle_new_user ();

-- Enable Realtime for sessions in Supabase Dashboard (Database > Replication) if needed.
-- alter publication supabase_realtime add table public.sessions;
