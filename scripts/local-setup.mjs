import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
mkdirSync(".local", { recursive: true });
const path = ".local/runtime.json";
if (!existsSync(path)) {
  const password = randomBytes(24).toString("hex");
  writeFileSync(
    path,
    JSON.stringify({
      POSTGRES_PASSWORD: password,
      DATABASE_URL:
        "postgresql://commerce:" + password + "@127.0.0.1:55439/commerce",
      APP_MODE: "development",
    }),
    { mode: 0o600 },
  );
}
const config = JSON.parse(readFileSync(path, "utf8"));
const r = spawnSync("docker", ["compose", "up", "-d", "--wait"], {
  stdio: "inherit",
  env: { ...process.env, ...config },
  timeout: 300000,
});
process.exit(r.status ?? 1);
