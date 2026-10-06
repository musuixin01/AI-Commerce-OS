import { existsSync } from "node:fs";
import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { assertTestDatabase } from "../../../scripts/test-database";
export class LocalMediaStore {
  readonly root: string;
  constructor() {
    let dir = process.cwd();
    while (!existsSync(resolve(dir, "database"))) {
      const parent = dirname(dir);
      if (parent === dir) throw new Error("Project root unavailable");
      dir = parent;
    }
    if (process.env.COMMERCE_TEST_MODE === "1") {
      assertTestDatabase();
      this.root = resolve(
        dir,
        ".local/test-media",
        new URL(process.env.DATABASE_URL!).pathname.slice(1),
      );
    } else this.root = resolve(dir, ".local/media");
  }
  private path(key: string) {
    if (
      !/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(original|webp|generated|generated\.webp)$/.test(
        key,
      )
    )
      throw new Error("Invalid object key");
    return resolve(this.root, key);
  }
  async put(key: string, bytes: Buffer) {
    const path = this.path(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes, { flag: "wx", mode: 0o600 });
  }
  async get(key: string) {
    return readFile(this.path(key));
  }
  async discard(key: string) {
    await unlink(this.path(key)).catch((e) => {
      if (e.code !== "ENOENT") throw e;
    });
  }
}
