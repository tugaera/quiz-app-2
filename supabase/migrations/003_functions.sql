-- finalize_unanswered + stats + session helpers

create or replace function public.finalize_unanswered (
  p_session_id uuid,
  p_question_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.player_answers (
    session_id,
    player_id,
    question_id,
    is_correct,
    points
  )
  select
    p_session_id,
    sp.id,
    p_question_id,
    false,
    0
  from
    public.session_players sp
  where
    sp.session_id = p_session_id
    and sp.is_active = true
    and not exists (
      select
        1
      from
        public.player_answers pa
      where
        pa.session_id = p_session_id
        and pa.player_id = sp.id
        and pa.question_id = p_question_id
    )
  on conflict (session_id, player_id, question_id) do nothing;
end;
$$;

create or replace function public.increment_player_points (
  p_session_id uuid,
  p_player_id uuid,
  p_delta int
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.session_players
  set
    total_points = total_points + p_delta
  where
    id = p_player_id
    and session_id = p_session_id;
end;
$$;

-- Returns review payload JSON (matches app ReviewStats shape)
create or replace function public.compute_question_stats (
  p_session_id uuid,
  p_question_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_total int;
  v_options jsonb := '{}'::jsonb;
  rec record;
  v_leader jsonb;
  v_fast jsonb;
  v_rows jsonb;
begin
  select
    count(*) into v_total
  from
    public.session_players sp
  where
    sp.session_id = p_session_id
    and sp.is_active = true;

  if v_total is null or v_total = 0 then
    v_total := 1;
  end if;

  for rec in
  select
    ao.id,
    ao.position,
    count(pa.*) as c
  from
    public.answer_options ao
    left join public.player_answers pa on pa.answer_option_id = ao.id
    and pa.session_id = p_session_id
    and pa.question_id = p_question_id
  where
    ao.question_id = p_question_id
  group by
    ao.id,
    ao.position
  order by
    ao.position
  loop
    v_options :=
      v_options
      || jsonb_build_object(
        rec.id::text,
        round((rec.c::numeric / v_total) * 100)::int
      );
  end loop;

  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'rank',
          rnk,
          'nickname',
          nickname,
          'response_time_ms',
          response_time_ms,
          'player_id',
          player_id
        )
        order by
          rnk
      ),
      '[]'::jsonb
    )
  into v_fast
  from (
    select
      row_number() over (
        order by
          pa.response_time_ms asc nulls last
      ) as rnk,
      sp.nickname,
      pa.response_time_ms,
      sp.id as player_id
    from
      public.player_answers pa
      join public.session_players sp on sp.id = pa.player_id
    where
      pa.session_id = p_session_id
      and pa.question_id = p_question_id
      and pa.is_correct = true
      and pa.response_time_ms is not null
    order by
      pa.response_time_ms asc
    limit
      5
  ) s;

  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'rank',
          rnk,
          'nickname',
          nickname,
          'total_points',
          total_points,
          'player_id',
          player_id
        )
        order by
          rnk
      ),
      '[]'::jsonb
    )
  into v_leader
  from (
    select
      row_number() over (
        order by
          sp.total_points desc,
          sp.joined_at asc
      ) as rnk,
      sp.nickname,
      sp.total_points,
      sp.id as player_id
    from
      public.session_players sp
    where
      sp.session_id = p_session_id
      and sp.is_active = true
    order by
      sp.total_points desc
    limit
      5
  ) x;

  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'nickname',
          nickname,
          'answer_label',
          answer_label,
          'is_correct',
          is_correct,
          'response_time_ms',
          response_time_ms,
          'points',
          points,
          'player_id',
          player_id
        )
      ),
      '[]'::jsonb
    )
  into v_rows
  from (
    select
      sp.nickname,
      case
        when pa.answer_option_id is null then '—'
        else chr(65 + ao.position)
      end as answer_label,
      pa.is_correct,
      pa.response_time_ms,
      pa.points,
      sp.id as player_id
    from
      public.session_players sp
      left join public.player_answers pa on pa.player_id = sp.id
      and pa.session_id = p_session_id
      and pa.question_id = p_question_id
      left join public.answer_options ao on ao.id = pa.answer_option_id
    where
      sp.session_id = p_session_id
      and sp.is_active = true
    order by
      sp.nickname
  ) y;

  return jsonb_build_object(
    'option_percentages',
    v_options,
    'fastest_correct_players',
    coalesce(v_fast, '[]'::jsonb),
    'leaderboard_top5',
    coalesce(v_leader, '[]'::jsonb),
    'per_player_rows',
    coalesce(v_rows, '[]'::jsonb)
  );
end;
$$;

grant
execute on function public.finalize_unanswered (uuid, uuid) to service_role;

grant
execute on function public.finalize_unanswered (uuid, uuid) to authenticated;

grant
execute on function public.compute_question_stats (uuid, uuid) to service_role;

grant
execute on function public.compute_question_stats (uuid, uuid) to authenticated;

create or replace function public.refresh_player_total (p_player_id uuid) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.session_players sp
  set
    total_points = coalesce((
      select
        sum(pa.points)
      from
        public.player_answers pa
      where
        pa.player_id = p_player_id
    ), 0)
  where
    sp.id = p_player_id;
end;
$$;

grant
execute on function public.refresh_player_total (uuid) to service_role;

grant
execute on function public.increment_player_points (uuid, uuid, int) to service_role;

grant
execute on function public.increment_player_points (uuid, uuid, int) to authenticated;
