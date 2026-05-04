import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";

type Action =
  | "schedule_question_end"
  | "expire_question"
  | "end_review";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-provider-token, apikey, content-type",
};

async function getSessionWithQuiz(
  supabase: ReturnType<typeof createClient>,
  sessionId: string
) {
  const { data, error } = await supabase
    .from("sessions")
    .select(
      `
      *,
      quiz:quizzes(
        *,
        questions(
          *,
          answer_options(*)
        )
      )
    `
    )
    .eq("id", sessionId)
    .single();
  if (error) throw error;
  return data as {
    id: string;
    status: string;
    current_question_index: number;
    question_started_at: string | null;
    quiz_id: string;
    quiz: {
      type: string;
      questions: {
        id: string;
        position: number;
        time_limit_secs: number;
        answer_options: { id: string }[];
      }[];
    };
  };
}

function sortQuestions(
  q: { position: number }[]
): { position: number; id: string; time_limit_secs: number }[] {
  return [...q].sort((a, b) => a.position - b.position);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const body = await req.json().catch(() => ({}));
    const session_id = body.session_id as string;
    const action = (body.action ?? "expire_question") as Action;

    if (!session_id) {
      return new Response(JSON.stringify({ error: "session_id required" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const server_ts = new Date().toISOString();

    const fnUrl = `${supabaseUrl}/functions/v1/advance-question`;

    if (action === "schedule_question_end") {
      const session = await getSessionWithQuiz(supabase, session_id);
      if (session.status !== "question" || !session.question_started_at) {
        return new Response(JSON.stringify({ ok: true, note: "noop" }), {
          headers: { ...cors, "Content-Type": "application/json" },
        });
      }
      const qs = sortQuestions(session.quiz.questions ?? []);
      const cur = qs[session.current_question_index];
      if (!cur) {
        return new Response(JSON.stringify({ ok: true, note: "no question" }), {
          headers: { ...cors, "Content-Type": "application/json" },
        });
      }
      const endMs =
        new Date(session.question_started_at).getTime() +
        cur.time_limit_secs * 1000;
      const wait = Math.max(0, endMs - Date.now());

      const run = async () => {
        await new Promise((r) => setTimeout(r, wait));
        await fetch(fnUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({ session_id, action: "expire_question" }),
        });
      };

      // @ts-expect-error EdgeRuntime in Supabase Edge
      if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
        // @ts-expect-error EdgeRuntime
        EdgeRuntime.waitUntil(run());
      } else {
        run();
      }

      return new Response(JSON.stringify({ ok: true, scheduled_ms: wait }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    if (action === "expire_question") {
      const session = await getSessionWithQuiz(supabase, session_id);
      if (session.status !== "question") {
        return new Response(JSON.stringify({ ok: true, note: "noop" }), {
          headers: { ...cors, "Content-Type": "application/json" },
        });
      }
      const qs = sortQuestions(session.quiz.questions ?? []);
      const currentQ = qs[session.current_question_index];
      if (!currentQ) {
        return new Response(JSON.stringify({ ok: true, note: "no q" }), {
          headers: { ...cors, "Content-Type": "application/json" },
        });
      }

      await supabase.rpc("finalize_unanswered", {
        p_session_id: session_id,
        p_question_id: currentQ.id,
      });

      const { data: settings } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "wait_after_answer_ms")
        .maybeSingle();
      const waitMs = settings?.value
        ? parseInt(settings.value as string, 10)
        : 5000;
      const reviewWait = Number.isFinite(waitMs) && waitMs > 0 ? waitMs : 5000;
      const reviewEnds = new Date(Date.now() + reviewWait).toISOString();

      const { data: updated, error: upErr } = await supabase
        .from("sessions")
        .update({ status: "review", review_ends_at: reviewEnds })
        .eq("id", session_id)
        .eq("status", "question")
        .select("id")
        .maybeSingle();

      if (upErr) throw upErr;
      if (!updated) {
        return new Response(JSON.stringify({ ok: true, note: "race noop" }), {
          headers: { ...cors, "Content-Type": "application/json" },
        });
      }

      const { data: statsRaw } = await supabase.rpc("compute_question_stats", {
        p_session_id: session_id,
        p_question_id: currentQ.id,
      });

      const isLast = session.current_question_index >= qs.length - 1;

      const correctOpt = (currentQ.answer_options ?? []).find(
        (o: { is_correct?: boolean; text?: string }) => o.is_correct
      );

      const ch = supabase.channel(`session:${session_id}`);
      await new Promise<void>((resolve, reject) => {
        ch.subscribe((status, err) => {
          if (status === "SUBSCRIBED") resolve();
          else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT")
            reject(err ?? new Error(status));
        });
      });
      await ch.send({
        type: "broadcast",
        event: "session:review",
        payload: {
          server_ts,
          question_index: session.current_question_index,
          is_last_question: isLast,
          stats: statsRaw,
          correct_option_text: correctOpt?.text ?? null,
        },
      });
      await supabase.removeChannel(ch);

      if (session.quiz.type === "sequential") {
        const runLater = async () => {
          await new Promise((r) => setTimeout(r, reviewWait));
          await fetch(fnUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${serviceKey}`,
            },
            body: JSON.stringify({ session_id, action: "end_review" }),
          });
        };
        // @ts-expect-error EdgeRuntime
        if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
          // @ts-expect-error EdgeRuntime
          EdgeRuntime.waitUntil(runLater());
        } else {
          runLater();
        }
      }

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    if (action === "end_review") {
      const session = await getSessionWithQuiz(supabase, session_id);
      if (session.status !== "review") {
        return new Response(JSON.stringify({ ok: true, note: "noop" }), {
          headers: { ...cors, "Content-Type": "application/json" },
        });
      }
      if (session.quiz.type !== "sequential") {
        return new Response(JSON.stringify({ ok: true, note: "host paced" }), {
          headers: { ...cors, "Content-Type": "application/json" },
        });
      }

      const qs = sortQuestions(session.quiz.questions ?? []);
      const isLast = session.current_question_index >= qs.length - 1;

      if (isLast) {
        const { data: leaderboard } = await supabase
          .from("session_players")
          .select("id, nickname, total_points")
          .eq("session_id", session_id)
          .eq("is_active", true)
          .order("total_points", { ascending: false });

        const ranked = (leaderboard ?? []).map((p, i) => ({
          rank: i + 1,
          player_id: p.id,
          nickname: p.nickname,
          total_points: p.total_points,
        }));

        await supabase
          .from("sessions")
          .update({
            status: "finished",
            finished_at: server_ts,
            review_ends_at: null,
          })
          .eq("id", session_id)
          .eq("status", "review");

        const ch = supabase.channel(`session:${session_id}`);
        await new Promise<void>((resolve, reject) => {
          ch.subscribe((status, err) => {
            if (status === "SUBSCRIBED") resolve();
            else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT")
              reject(err ?? new Error(status));
          });
        });
        await ch.send({
          type: "broadcast",
          event: "session:finished",
          payload: { server_ts, final_leaderboard: ranked },
        });
        await supabase.removeChannel(ch);

        return new Response(JSON.stringify({ ok: true, finished: true }), {
          headers: { ...cors, "Content-Type": "application/json" },
        });
      }

      const nextIdx = session.current_question_index + 1;
      const nextQ = qs[nextIdx];
      const qstart = new Date().toISOString();

      const { error: nErr } = await supabase
        .from("sessions")
        .update({
          status: "question",
          current_question_index: nextIdx,
          question_started_at: qstart,
          review_ends_at: null,
        })
        .eq("id", session_id)
        .eq("status", "review");

      if (nErr) throw nErr;

      const ch2 = supabase.channel(`session:${session_id}`);
      await new Promise<void>((resolve, reject) => {
        ch2.subscribe((status, err) => {
          if (status === "SUBSCRIBED") resolve();
          else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT")
            reject(err ?? new Error(status));
        });
      });
      await ch2.send({
        type: "broadcast",
        event: "session:question",
        payload: {
          server_ts,
          question_index: nextIdx,
          question_id: nextQ.id,
          question_started_at: qstart,
          time_limit_secs: nextQ.time_limit_secs,
        },
      });
      await supabase.removeChannel(ch2);

      const arm = async () => {
        await fetch(fnUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({
            session_id,
            action: "schedule_question_end",
          }),
        });
      };
      // @ts-expect-error EdgeRuntime
      if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
        // @ts-expect-error EdgeRuntime
        EdgeRuntime.waitUntil(arm());
      } else {
        arm();
      }

      return new Response(JSON.stringify({ ok: true, next: nextIdx }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "unknown action" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
