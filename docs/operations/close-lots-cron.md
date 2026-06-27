# Close-lots job

Closes timed lots whose `closesAt` has passed: settles each from the bid ledger,
writes the invoice + ledger, and flips the lot status. Idempotent and
concurrency-safe.

## Endpoint
`GET /api/cron/close-lots` — requires `Authorization: Bearer $CRON_SECRET`.

## Production (Vercel)
`vercel.json` schedules it every minute. Set `CRON_SECRET` in the Vercel project
environment; Vercel sends it automatically as the Bearer token.

## Local / Docker
Run it on a schedule by hitting the endpoint, e.g. every minute:

    while true; do
      curl -s -H "Authorization: Bearer $CRON_SECRET" \
        http://localhost:3000/api/cron/close-lots ;
      sleep 60 ;
    done

In a Docker Compose deployment, run an equivalent small cron/worker container
that curls the endpoint on the same schedule.

## Manual trigger
    curl -s -H "Authorization: Bearer $CRON_SECRET" \
      http://localhost:3000/api/cron/close-lots | jq
