# Deploying to Vercel + Supabase Cloud

Vercel hosts the Next.js app (`apps/web`); Supabase Cloud provides Postgres,
Auth, Storage, and Realtime. Timed sales need nothing else; **live (Model B)
sales** also need the `services/live-runner` process hosted separately (Vercel
can't run a long-lived process) — see the bottom.

## 1. Supabase Cloud project

1. **supabase.com → New project** (region near your users, e.g. Singapore). Save the DB password.
2. **Settings → API** — copy:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` public key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (secret, server-only)
3. **Settings → Database → Connection string** — copy **both**:
   - **Transaction pooler** (host `…pooler.supabase.com`, port **6543**) → `DATABASE_URL`, with `?pgbouncer=true&connection_limit=1` appended. Use this for the app (Vercel is serverless — the pooler prevents connection exhaustion).
   - **Direct** (port **5432**) → `DIRECT_URL`. Used only for migrations.
4. **Storage → New bucket** named **`lots`**, **Public** (admin-uploaded lot images; the code targets bucket `lots`). The seeded `/seed/*.jpg` ship in `public/` and are served by Vercel directly.
5. **Authentication → URL Configuration** — set **Site URL** to your Vercel domain and add redirect `https://<your-app>.vercel.app/**` (do this once you have the domain).

## 2. Prisma datasource (already configured)

`packages/db/prisma/schema.prisma` uses a pooled `url` + a `directUrl`:

```prisma
datasource db {
  url       = env("DATABASE_URL") // pooled (6543) — the app
  directUrl = env("DIRECT_URL")   // direct (5432) — migrations
}
```

`packages/db` has a `postinstall: prisma generate`, so Vercel generates the
client during install — no extra build step needed.

## 3. Run migrations against Supabase

From your machine, point at the **direct** connection once (and after any
schema change):

```bash
DATABASE_URL="<DIRECT 5432 url>" DIRECT_URL="<DIRECT 5432 url>" \
  pnpm --filter @auction/db exec prisma migrate deploy
```

Optional — seed demo data + default login users into the cloud project (set the
cloud `DATABASE_URL`/`DIRECT_URL` + the three Supabase vars in
`apps/web/.env.local` first):

```bash
pnpm db:seed      # demo catalogue (resets it)
pnpm seed:admin   # admin@balai.test etc. in cloud Supabase Auth
```

## 4. Vercel project

1. Push to GitHub.
2. **Vercel → Add New → Project** → import the repo.
3. **Root Directory: `apps/web`** (Vercel auto-detects the pnpm workspace + Next.js; leave install/build commands default).
4. **Environment Variables** (Production + Preview):

| Var | Value |
| --- | --- |
| `DATABASE_URL` | Supabase **pooled** (6543) `…?pgbouncer=true&connection_limit=1` |
| `DIRECT_URL` | Supabase **direct** (5432) |
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key |
| `NEXT_PUBLIC_APP_URL` | `https://<your-app>.vercel.app` |
| `CRON_SECRET` | long random string |
| `XENDIT_SECRET_KEY` | Xendit secret (or blank) |
| `XENDIT_CALLBACK_TOKEN` | Xendit webhook verification token |
| `RESEND_API_KEY` / `RESEND_FROM` | transactional email (optional) |

   `NEXT_PUBLIC_*` are inlined at build time, so they must be set before the first build.
5. **Deploy.** Then set `NEXT_PUBLIC_APP_URL` to the real domain + add it to the Supabase Auth redirect URLs (step 1.5), and **redeploy**.

## 5. Cron + Xendit webhook

- **Close-lots cron is disabled** (`vercel.json` has `"crons": []`). Timed lots
  won't auto-close; close them on demand via the operator console (a lot's
  **Actions → Close now**), or hit `/api/cron/close-lots` with the
  `Authorization: Bearer <CRON_SECRET>` header from your own scheduler.
  To re-enable a Vercel cron, add an entry back, e.g.
  `"crons": [{ "path": "/api/cron/close-lots", "schedule": "0 * * * *" }]`
  (hourly works on Hobby; `* * * * *` every minute needs Pro).
- **Xendit webhook**: Xendit Dashboard → Webhooks → URL
  `https://<your-app>.vercel.app/api/webhooks/xendit`, verification token →
  `XENDIT_CALLBACK_TOKEN`. (The success-redirect confirm route also finalises
  payments without the webhook.)

## 6. Live auctions (optional)

`services/live-runner` advances live (Model B) lots and can't run on Vercel.
If you need live sales, deploy it on a process host (Railway / Render / Fly.io
with its Dockerfile), pointed at the same Supabase project (it needs
`DATABASE_URL` + the Supabase service key for Realtime broadcasts). Timed sales
work without it.

## Gotchas

- Always use the **pooled** `DATABASE_URL` for the app; the direct one only for migrations.
- `NEXT_PUBLIC_*` must be present **before** the build.
- Re-run `prisma migrate deploy` (direct URL) after every schema change.
- Locally, `DIRECT_URL` = `DATABASE_URL` (the same Docker Postgres); only in prod do they differ.
