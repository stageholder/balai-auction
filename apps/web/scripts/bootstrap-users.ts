/**
 * Local dev convenience: create default Supabase auth accounts (email-confirmed)
 * and their matching domain `User` rows with the right roles, so you can sign in
 * immediately without manually promoting anyone.
 *
 * Auth is Supabase; our domain `User.id` must equal the Supabase auth user id
 * (that's how getCurrentUser resolves the session), so we create the auth user
 * first, then upsert the domain row by that id.
 *
 * Idempotent — safe to re-run. Run via `pnpm seed:admin` (needs `supabase start`).
 */
import { config } from "dotenv";

// Load apps/web/.env.local (DATABASE_URL + Supabase keys) BEFORE importing
// @auction/db, whose Prisma client reads DATABASE_URL at module load.
config({ path: new URL("../.env.local", import.meta.url).pathname });

const { createClient } = await import("@supabase/supabase-js");
const { prisma, upsertUserById, setUserRole } = await import("@auction/db");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in apps/web/.env.local.\n" +
      "Run `supabase start` first, then paste its keys into apps/web/.env.local."
  );
  process.exit(1);
}

const PASSWORD = "password123";
const DEFAULT_USERS: { email: string; role: "staff" | "consignor" | "buyer" }[] = [
  { email: "admin@balai.test", role: "staff" },
  { email: "consignor@balai.test", role: "consignor" },
  { email: "buyer@balai.test", role: "buyer" },
];

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function findAuthUserId(email: string): Promise<string | null> {
  // listUsers is paginated; a fresh local stack fits in the first page.
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  return data.users.find((u) => u.email === email)?.id ?? null;
}

async function main(): Promise<void> {
  for (const { email, role } of DEFAULT_USERS) {
    const created = await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
    });
    let id = created.data.user?.id ?? null;
    if (!id) {
      // Already registered (re-run) — look it up.
      id = await findAuthUserId(email);
    }
    if (!id) {
      console.error(`✗ ${email}: could not create or find the auth user`);
      continue;
    }
    await upsertUserById(prisma, { id, email });
    await setUserRole(prisma, id, role);
    console.log(`✓ ${email}  (${role})  password: ${PASSWORD}`);
  }
  console.log(
    "\nDefault users ready. Sign in at http://localhost:3000/sign-in\n" +
      "  admin@balai.test     → staff (full admin)\n" +
      "  consignor@balai.test → consignor (self-verify + payouts)\n" +
      "  buyer@balai.test     → buyer\n" +
      `  password for all: ${PASSWORD}`
  );
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("bootstrap-users failed:", err);
  process.exit(1);
});
