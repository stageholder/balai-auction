import { execSync } from "node:child_process";

/** Apply migrations to the test database once before the suite runs. */
export default function setup(): void {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error("TEST_DATABASE_URL not set (see packages/db/.env.test)");
  }
  execSync("pnpm exec prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: url },
    stdio: "inherit",
  });
}
