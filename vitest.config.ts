import path from "node:path";
import { createRequire } from "node:module";
import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

const require = createRequire(import.meta.url);

export default defineWorkersConfig(async () => {
  const { readD1Migrations } = require("@cloudflare/vitest-pool-workers/config");
  const migrations = await readD1Migrations(
    path.join(import.meta.dirname, "migrations"),
  );

  return {
    test: {
      setupFiles: ["./tests/setup/apply-migrations.ts"],
      include: ["tests/**/*.test.ts"],
      poolOptions: {
        workers: {
          wrangler: { configPath: "./wrangler.vitest.jsonc" },
          miniflare: {
            bindings: {
              TEST_MIGRATIONS: migrations,
            },
          },
        },
      },
    },
  };
});
