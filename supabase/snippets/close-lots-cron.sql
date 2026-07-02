-- ────────────────────────────────────────────────────────────────────────────
-- Timed-lot close scheduler (Supabase pg_cron)
--
-- Why: Vercel Hobby (free) can only run crons ONCE PER DAY with imprecise timing,
-- which is far too coarse to hammer lots on time. Supabase is always-on, so we
-- tick the close from the database every minute instead. This calls the app's
-- existing, auth-guarded endpoint (which runs closeDueLots + broadcasts the
-- hammer price + emails winners) — no extra hosting, works on the free tier.
--
-- The web app's vercel.json keeps a once-daily cron as a backstop only.
--
-- HOW TO USE: open the Supabase dashboard → SQL Editor, paste this, replace the
-- two placeholders below, and Run once. Re-running is safe (it re-creates the job).
--   • <APP_URL>      e.g. https://your-app.vercel.app   (no trailing slash)
--   • <CRON_SECRET>  the same value set as CRON_SECRET in the Vercel project env
-- ────────────────────────────────────────────────────────────────────────────

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Idempotent: drop any prior schedule with this name before re-creating it.
do $$
begin
  perform cron.unschedule('close-lots');
exception
  when others then null; -- no existing job → ignore
end
$$;

select cron.schedule(
  'close-lots',
  '* * * * *', -- every minute
  $job$
    select net.http_get(
      url     := '<APP_URL>/api/cron/close-lots',
      headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>')
    );
  $job$
);

-- Verify:  select jobname, schedule, active from cron.job;
-- Recent runs / errors:
--   select job.jobname, d.status, d.return_message, d.start_time
--   from cron.job_run_details d
--   join cron.job job on job.jobid = d.jobid
--   where job.jobname = 'close-lots'
--   order by d.start_time desc limit 20;
-- Unschedule: select cron.unschedule('close-lots');
