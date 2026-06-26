import { config } from "dotenv";
import { defineConfig } from "vitest/config";

// Load TEST_DATABASE_URL before tests and global setup run.
config({ path: ".env.test" });

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    globalSetup: ["src/test/global-setup.ts"],
    // Repositories share one Postgres; run files serially to avoid
    // truncation in one file wiping another file's rows mid-test.
    fileParallelism: false,
  },
});
