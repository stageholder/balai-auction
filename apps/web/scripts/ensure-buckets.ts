/**
 * Ensure the Storage buckets the app needs exist on whichever Supabase project
 * apps/web/.env.local points at (local OR hosted). Local `supabase start` reads
 * buckets from supabase/config.toml, but a hosted project does not — this makes
 * bucket provisioning one command everywhere.
 *
 *   - `lots`      public  — catalogue + consignment photos
 *   - `kyc-docs`  private — consignor identity documents (signed-URL access only)
 *
 * Idempotent — safe to re-run. Run via `pnpm storage:setup`.
 */
import { config } from "dotenv";

config({ path: new URL("../.env.local", import.meta.url).pathname });

const { createClient } = await import("@supabase/supabase-js");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in apps/web/.env.local."
  );
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
const BUCKETS = [
  { id: "lots", public: true, allowedMimeTypes: IMAGE_TYPES },
  {
    id: "kyc-docs",
    public: false,
    allowedMimeTypes: [...IMAGE_TYPES, "application/pdf"],
  },
] as const;

for (const b of BUCKETS) {
  const { error } = await admin.storage.createBucket(b.id, {
    public: b.public,
    allowedMimeTypes: [...b.allowedMimeTypes],
    fileSizeLimit: "10MB",
  });
  if (!error) {
    console.log(`✔ created bucket "${b.id}" (${b.public ? "public" : "private"})`);
  } else if (/already exists/i.test(error.message)) {
    console.log(`• bucket "${b.id}" already exists — skipped`);
  } else {
    console.error(`✗ failed to create bucket "${b.id}": ${error.message}`);
    process.exit(1);
  }
}

console.log("Storage buckets ready.");
