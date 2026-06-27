import { execSync } from "node:child_process";

/** Ensure the test DB schema is current before the integration test. */
export default function setup(): void {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set (see services/live-runner/.env.test)");
  execSync("pnpm --filter @auction/db exec prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: url },
    stdio: "inherit",
  });
}
