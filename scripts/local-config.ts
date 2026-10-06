import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { assertTestDatabase } from "./test-database";
export function configure() {
  if (process.env.COMMERCE_TEST_MODE === "1" || process.env.NODE_TEST_CONTEXT) {
    assertTestDatabase();
    return;
  }

  let dir = process.cwd();
  while (
    !existsSync(resolve(dir, "package.json")) ||
    !existsSync(resolve(dir, "database"))
  ) {
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  const p = resolve(dir, ".local/runtime.json");
  if (process.env.NODE_ENV !== "production" && existsSync(p)) {
    const c = JSON.parse(readFileSync(p, "utf8"));
    for (const [k, v] of Object.entries(c)) process.env[k] ??= String(v);
  }
  if (!process.env.DATABASE_URL)
    throw new Error("Run npm run local:setup or set DATABASE_URL");
}
