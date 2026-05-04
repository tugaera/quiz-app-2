-- Row Level Security policies

alter table public.profiles enable row level security;

create policy profiles_select_own on public.profiles for
select
  using (id = auth.uid ());

create policy profiles_update_own on public.profiles for
update using (id = auth.uid ());

-- Quizzes
alter table public.quizzes enable row level security;

create policy quizzes_host_all on public.quizzes for all using (host_id = auth.uid ())
with
  check (host_id = auth.uid ());

create policy quizzes_public_read on public.quizzes for
select
  using (is_public = true);

-- Questions: hosts manage their quiz; anyone can read questions for quizzes that have at least one session (join flow)
alter table public.questions enable row level security;

create policy questions_host_all on public.questions for all using (
  exists (
    select
      1
    from
      public.quizzes q
    where
      q.id = questions.quiz_id
      and q.host_id = auth.uid ()
  )
)
with
  check (
    exists (
      select
        1
      from
        public.quizzes q
      where
        q.id = questions.quiz_id
        and q.host_id = auth.uid ()
    )
  );

create policy questions_read_if_session_exists on public.questions for
select
  using (
    exists (
      select
        1
      from
        public.sessions s
      where
        s.quiz_id = questions.quiz_id
    )
  );

-- Answer options: only hosts (authenticated) may read/write — players receive sanitized options from API routes
alter table public.answer_options enable row level security;

create policy answer_options_host_all on public.answer_options for all using (
  exists (
    select
      1
    from
      public.questions qu
      join public.quizzes q on q.id = qu.quiz_id
    where
      qu.id = answer_options.question_id
      and q.host_id = auth.uid ()
  )
)
with
  check (
    exists (
      select
        1
      from
        public.questions qu
        join public.quizzes q on q.id = qu.quiz_id
    where
      qu.id = answer_options.question_id
      and q.host_id = auth.uid ()
    )
  );

-- Sessions
alter table public.sessions enable row level security;

create policy sessions_public_read on public.sessions for
select
  using (true);

create policy sessions_host_all on public.sessions for all using (host_id = auth.uid ())
with
  check (host_id = auth.uid ());

-- Session players: writes via service-role API only (join / host tools)
alter table public.session_players enable row level security;

create policy session_players_select on public.session_players for
select
  using (true);

create policy session_players_host_update on public.session_players for
update using (
  exists (
    select
      1
    from
      public.sessions s
    where
      s.id = session_players.session_id
      and s.host_id = auth.uid ()
  )
);

-- Player answers: writes via service-role API only
alter table public.player_answers enable row level security;

create policy player_answers_select on public.player_answers for
select
  using (true);

-- App settings
alter table public.app_settings enable row level security;

create policy app_settings_read_authenticated on public.app_settings for
select
  using (auth.uid () is not null);

create policy app_settings_write_authenticated on public.app_settings for all using (
  auth.uid () is not null
)
with
  check (auth.uid () is not null);
