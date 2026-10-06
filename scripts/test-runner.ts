import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readdirSync } from "node:fs";
import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import { Pool } from "pg";
import { configure } from "./local-config";
import { assertTestDatabase } from "./test-database";
async function main() {
  const mode = process.argv[2];
  if (!["unit", "e2e"].includes(mode)) throw new Error("Expected unit or e2e");
  if (process.env.NODE_ENV === "production")
    throw new Error("Tests refuse production mode");
  configure();
  const source = new URL(process.env.DATABASE_URL!);
  if (
    !["127.0.0.1", "localhost", "[::1]"].includes(source.hostname) ||
    source.search ||
    source.hash ||
    process.env.PGOPTIONS
  )
    throw new Error(
      "Test provisioning requires local PostgreSQL without connection overrides",
    );
  const name = "commerce_test_" + randomBytes(8).toString("hex");
  const adminUrl = new URL(source);
  adminUrl.pathname = "/postgres";
  const testUrl = new URL(source);
  testUrl.pathname = "/" + name;
  const env = {
    ...process.env,
    COMMERCE_TEST_MODE: "1",
    NODE_ENV: "test",
    DATABASE_URL: testUrl.toString(),
    APP_MODE: "development",
    PORT: "4101",
    ALLOWED_ORIGINS: "http://127.0.0.1:5174",
    WEB_TEST_PORT: "5174",
    API_PROXY_TARGET: "http://127.0.0.1:4101",
    OPENAI_API_KEY: "",
    AI_MODEL: "",
    AI_IMAGE_MODEL: "",
  };
  assertTestDatabase(env);
  const admin = new Pool({
    connectionString: adminUrl.toString(),
    connectionTimeoutMillis: 10000,
  });
  admin.on("error", () =>
    console.error(
      "Test database connection interrupted; diagnostics suppressed to protect connection details.",
    ),
  );
  let created = false;
  async function run(args: string[]) {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(process.execPath, args, {
        env,
        stdio: "inherit",
        shell: false,
      });
      child.on("error", reject);
      child.on("exit", (code, signal) =>
        code === 0
          ? resolve()
          : reject(new Error("Test command failed (" + (signal || code) + ")")),
      );
    });
  }
  try {
    await admin.query('CREATE DATABASE "' + name + '"');
    created = true;
    console.log("Isolated database created: " + name);
    for (const script of ["migrate", "seed"])
      await run(["node_modules/tsx/dist/cli.mjs", "scripts/" + script + ".ts"]);
    if (mode === "unit")
      await run([
        "node_modules/tsx/dist/cli.mjs",
        "--tsconfig",
        "services/api/tsconfig.json",
        "--test",
        "--test-concurrency=1",
        ...readdirSync("tests")
          .filter((f) => f.endsWith(".test.ts"))
          .map((f) => "tests/" + f),
      ]);
    else
      await run([
        "node_modules/@playwright/test/cli.js",
        "test",
        ...process.argv.slice(3),
      ]);
  } finally {
    // Only the fresh database created by this invocation is eligible for removal.
    try {
      if (created) {
        await admin.query('DROP DATABASE "' + name + '" WITH (FORCE)');
        console.log("Isolated database removed: " + name);
        assertTestDatabase(env);
        await rm(resolve(".local", "test-media", name), {
          recursive: true,
          force: true,
        });
        console.log("Isolated test media removed: " + name);
      }
    } catch {
      console.error(
        "Cleanup incomplete; inspect only this test namespace: " + name,
      );
      throw new Error("Test cleanup failed");
    } finally {
      await admin.end();
    }
  }
}
main().catch(() => {
  console.error(
    "Isolated test run failed; inspect the preceding diagnostics. No demo database was selected for test execution.",
  );
  process.exitCode = 1;
});
