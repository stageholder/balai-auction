# @auction/live-runner

Sequences **live-mode** sales: opens each queued lot for `Sale.liveLotSeconds`,
closes+settles it via `@auction/db closeLot` when the timer expires (with
`placeBid`'s short live anti-snipe), and advances to the next lot — broadcasting
`lot-opened` / `lot-closed` / `sale-ended` on the `sale:{saleId}` Supabase
channel. Timed sales are handled by the web app's close-lots cron, not here.

## Run (dev)
    cp services/live-runner/.env.example services/live-runner/.env   # set the Supabase service key
    docker compose up -d postgres
    pnpm --filter @auction/live-runner dev

## Run (Docker / deploy)
The `live-runner` service in `docker-compose.yml` builds from
`services/live-runner/Dockerfile`. Provide `NEXT_PUBLIC_SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` (hosted Supabase in prod) via the host env / a
`.env` beside `docker-compose.yml`. Run a single instance.

## How it works
`index.ts` loops every `RUNNER_TICK_MS` over `listRunningLiveSales`, calling
`tickSale` (pure decision via `@auction/core advanceLiveSale` + injected repo
effects). One instance only; `closeLot`/`openQueuedLot` are atomic so a stray
second instance can't double-settle.
