import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { configure } from "./local-config";
configure();
async function main() {
  const p = new Pool({ connectionString: process.env.DATABASE_URL });
  const c = await p.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT pg_advisory_xact_lock(810027)");
    await c.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY, applied_at timestamptz DEFAULT now())",
    );
    for (const name of [
      "001_core",
      "002_knowledge_ai",
      "003_workflow_mcp",
      "004_catalog_materials",
      "005_agent_tasks",
      "006_generated_media",
    ]) {
      if (
        !(
          await c.query("SELECT 1 FROM schema_migrations WHERE name=$1", [name])
        ).rowCount
      ) {
        await c.query(readFileSync("database/" + name + ".sql", "utf8"));
        await c.query("INSERT INTO schema_migrations(name)VALUES($1)", [name]);
      }
    }
    await c.query("COMMIT");
    console.log("Migration complete");
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
    await p.end();
  }
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
