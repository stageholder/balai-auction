import { config } from "dotenv";
import { defineConfig } from "vitest/config";

// Point @auction/db's prisma client at the test DB for integration tests.
config({ path: ".env.test" });

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    globalSetup: ["src/test/global-setup.ts"],
    fileParallelism: false,
  },
});
