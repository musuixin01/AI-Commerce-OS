import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";
import { configure } from "./local-config";
configure();
async function main() {
  const pg = new EmbeddedPostgres({
    databaseDir: ".local/postgres",
    user: "commerce",
    password: process.env.POSTGRES_PASSWORD!,
    port: 55432,
    persistent: true,
    authMethod: "scram-sha-256",
    postgresFlags: ["-h", "127.0.0.1"],
    onLog: () => {},
    onError: (e) => console.error(String(e)),
  });
  if (!existsSync(".local/postgres/PG_VERSION")) await pg.initialise();
  await pg.start();
  const c = pg.getPgClient();
  await c.connect();
  if (
    !(await c.query("SELECT 1 FROM pg_database WHERE datname='commerce'"))
      .rowCount
  )
    await c.query("CREATE DATABASE commerce");
  await c.end();
  console.log("PostgreSQL ready on 127.0.0.1:55432");
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    await pg.stop();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  setInterval(() => {}, 30000);
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
