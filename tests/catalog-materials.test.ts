import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import sharp from "sharp";
import { createApp } from "../services/api/src/app";
import { pool } from "../services/api/src/db";
import { LocalMediaStore } from "../services/api/src/media-store";
type Client = { cookie: string; csrf: string };
let app: any,
  base: string,
  ops: Client,
  owner: Client,
  other: Client,
  png: Buffer;
async function call(
  c: Client | undefined,
  path: string,
  method = "GET",
  body?: unknown,
  version?: number,
  key = randomUUID(),
) {
  const r = await fetch(base + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(c ? { Cookie: c.cookie, "X-CSRF-Token": c.csrf } : {}),
      "Idempotency-Key": key,
      ...(version ? { "If-Match": String(version) } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, body: await r.json(), headers: r.headers };
}
async function login(role: string, tenant = "1") {
  const r = await call(undefined, "/auth/dev-login", "POST", { role, tenant });
  assert.equal(r.status, 201);
  return {
    cookie: r.headers.get("set-cookie")!.split(";")[0],
    csrf: r.body.csrf,
  };
}
async function upload(
  c: Client | undefined,
  t: any,
  data = png,
  mime = "image/png",
  key = randomUUID(),
  version = t.version,
) {
  const form = new FormData();
  form.append(
    "file",
    new Blob([new Uint8Array(data)], { type: mime }),
    "sample.png",
  );
  const r = await fetch(base + "/catalog-tasks/" + t.id + "/assets", {
    method: "POST",
    headers: {
      ...(c ? { Cookie: c.cookie, "X-CSRF-Token": c.csrf } : {}),
      "Idempotency-Key": key,
      "If-Match": String(version),
    },
    body: form,
  });
  return { status: r.status, body: await r.json() };
}
async function create() {
  const r = await call(ops, "/catalog-tasks", "POST", {
    fields: { title: "制作测试" },
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body;
}
before(async () => {
  app = await createApp();
  await app.listen(0, "127.0.0.1");
  base = (await app.getUrl()) + "/api/v1";
  ops = await login("ops");
  owner = await login("owner");
  other = await login("ops", "2");
  png = await sharp({
    create: { width: 32, height: 24, channels: 3, background: "#c8aa55" },
  })
    .png()
    .toBuffer();
});
after(async () => {
  await app?.close();
  await pool.end();
});
test("material task create replay, schema validation, scope and CSRF", async () => {
  const k = randomUUID(),
    body = { fields: { title: "未完成资料", price: "" } };
  const r = await call(ops, "/catalog-tasks", "POST", body, undefined, k);
  assert.equal(r.status, 201);
  assert.equal(r.body.state, "NEEDS_INPUT");
  assert.equal(r.body.version, 1);
  assert.equal(
    (await call(ops, "/catalog-tasks", "POST", body, undefined, k)).body.id,
    r.body.id,
  );
  assert.equal(
    (
      await call(
        ops,
        "/catalog-tasks",
        "POST",
        { fields: { title: "changed" } },
        undefined,
        k,
      )
    ).status,
    409,
  );
  assert.equal((await call(other, "/catalog-tasks/" + r.body.id)).status, 404);
  assert.equal((await call(undefined, "/catalog-tasks")).status, 401);
  assert.equal(
    (await call({ ...ops, csrf: "bad" }, "/catalog-tasks", "POST", body))
      .status,
    403,
  );
  assert.equal(
    (await call(ops, "/catalog-tasks", "POST", { fields: { price: "NaN" } }))
      .status,
    400,
  );
  assert.equal(
    (
      await call(ops, "/catalog-tasks", "POST", {
        fields: { organization_id: randomUUID() },
      })
    ).status,
    400,
  );
  assert.ok(
    (await call(ops, "/catalog-tasks")).body.some(
      (x: any) => x.id === r.body.id,
    ),
  );
  assert.ok(
    !(await call(other, "/catalog-tasks")).body.some(
      (x: any) => x.id === r.body.id,
    ),
  );
});
test("original bytes immutable, preview private, replay upload and version snapshots", async () => {
  const t = await create(),
    key = randomUUID();
  const r = await upload(ops, t, png, "image/png", key);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.version, 2);
  assert.equal(r.body.assets.length, 1);
  const asset = r.body.assets[0];
  assert.equal(asset.origin, "original");
  assert.equal(asset.sha256, createHash("sha256").update(png).digest("hex"));
  assert.equal(asset.width, 32);
  assert.equal(asset.height, 24);
  assert.equal(asset.object_key, undefined);
  assert.equal(
    (await upload(ops, t, png, "image/png", key)).body.assets[0].id,
    asset.id,
  );
  assert.equal((await upload(ops, t)).status, 409);
  const stored = (
    await pool.query("SELECT * FROM media_assets WHERE id=$1", [asset.id])
  ).rows[0];
  assert.deepEqual(await new LocalMediaStore().get(stored.object_key), png);
  const url = base.replace("/api/v1", "") + asset.preview_url;
  const view = await fetch(url, { headers: { Cookie: ops.cookie } });
  assert.equal(view.status, 200);
  assert.equal(view.headers.get("content-type"), "image/webp");
  assert.match(view.headers.get("cache-control")!, /no-store/);
  const m = await sharp(Buffer.from(await view.arrayBuffer())).metadata();
  assert.equal(m.format, "webp");
  assert.equal(m.exif, undefined);
  assert.equal((await fetch(url)).status, 401);
  assert.equal(
    (await fetch(url, { headers: { Cookie: other.cookie } })).status,
    404,
  );
  const update = await call(
    ops,
    "/catalog-tasks/" + t.id,
    "PATCH",
    { fields: { title: "已移除" }, asset_ids: [] },
    2,
  );
  assert.equal(update.status, 200);
  assert.equal(update.body.version, 3);
  assert.equal(update.body.assets.length, 0);
  assert.deepEqual(await new LocalMediaStore().get(stored.object_key), png);
  const versions = (
    await pool.query(
      "SELECT version,asset_ids FROM catalog_task_versions WHERE task_id=$1 ORDER BY version",
      [t.id],
    )
  ).rows;
  assert.deepEqual(
    versions.map((x) => x.version),
    [1, 2, 3],
  );
  assert.deepEqual(versions[1].asset_ids, [asset.id]);
  assert.equal(
    (await call(ops, "/catalog-tasks/" + t.id)).body.fields.title,
    "已移除",
  );
});
test("invalid, spoofed, oversized and unauthorized uploads do not persist", async () => {
  const t = await create();
  assert.equal((await upload(undefined, t)).status, 401);
  assert.equal((await upload({ ...ops, csrf: "bad" }, t)).status, 403);
  assert.equal((await upload(other, t)).status, 404);
  assert.equal(
    (await upload(ops, t, Buffer.from("<svg/>"), "image/svg+xml")).status,
    415,
  );
  assert.equal((await upload(ops, t, png, "image/jpeg")).status, 415);
  assert.equal((await upload(ops, t, Buffer.from("not an image"))).status, 422);
  assert.equal((await upload(ops, t, png.subarray(0, 40))).status, 422);
  assert.equal(
    (await upload(ops, t, Buffer.alloc(10 * 1024 * 1024 + 1))).status,
    413,
  );
  assert.equal((await call(ops, "/catalog-tasks/" + t.id)).body.version, 1);
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::int n FROM media_assets WHERE task_id=$1",
        [t.id],
      )
    ).rows[0].n,
    0,
  );
});
test("concurrent replay stores one asset, task references and eight-image limit", async () => {
  const original = await create(),
    key = randomUUID();
  const [a, b] = await Promise.all([
    upload(ops, original, png, "image/png", key),
    upload(ops, original, png, "image/png", key),
  ]);
  assert.equal(a.status, 201, JSON.stringify(a.body));
  assert.equal(b.status, 201, JSON.stringify(b.body));
  assert.equal(a.body.assets[0].id, b.body.assets[0].id);
  let t = a.body;
  const another = await create();
  assert.equal(
    (
      await call(
        ops,
        "/catalog-tasks/" + another.id,
        "PATCH",
        { fields: {}, asset_ids: [t.assets[0].id] },
        1,
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await call(
        ops,
        "/catalog-tasks/" + t.id,
        "PATCH",
        { fields: {}, asset_ids: [t.assets[0].id, t.assets[0].id] },
        t.version,
      )
    ).status,
    400,
  );
  while (t.assets.length < 8) {
    const r = await upload(ops, t);
    assert.equal(r.status, 201, JSON.stringify(r.body));
    t = r.body;
  }
  assert.equal((await upload(ops, t)).status, 422);
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::int n FROM media_assets WHERE task_id=$1",
        [t.id],
      )
    ).rows[0].n,
    8,
  );
});
test("same-organization workspace isolation, revoked session and safe object keys", async () => {
  const t = await create(),
    r = await upload(ops, t);
  assert.equal(r.status, 201);
  const { CatalogTasks } =
    await import("../services/api/src/catalog-tasks.service");
  const service = new CatalogTasks(),
    actor = (await call(ops, "/me")).body;
  const foreign = { ...actor, workspace_id: randomUUID() };
  await assert.rejects(() => service.get(foreign, t.id), /制作草稿不存在/);
  await assert.rejects(
    () => service.preview(foreign, r.body.assets[0].id),
    /图片不存在/,
  );
  assert.deepEqual(await service.list(foreign), []);
  await assert.rejects(
    () =>
      service.create({ ...actor, role: "support" }, randomUUID(), {
        fields: {},
      }),
    /无权编辑/,
  );
  await assert.rejects(
    () => new LocalMediaStore().get("../runtime.json"),
    /Invalid object key/,
  );
  try {
    await pool.query("UPDATE memberships SET active=false WHERE user_id=$1", [
      actor.id,
    ]);
    assert.equal((await call(ops, "/catalog-tasks/" + t.id)).status, 401);
    assert.equal((await upload(ops, r.body)).status, 401);
  } finally {
    await pool.query("UPDATE memberships SET active=true WHERE user_id=$1", [
      actor.id,
    ]);
  }
});
test("original plus preview quota includes detached assets", async () => {
  let t = await create();
  const r = await upload(ops, t);
  assert.equal(r.status, 201);
  t = r.body;
  const id = t.assets[0].id;
  const old = (
    await pool.query("SELECT preview_size FROM media_assets WHERE id=$1", [id])
  ).rows[0].preview_size;
  try {
    await pool.query("UPDATE media_assets SET preview_size=$2 WHERE id=$1", [
      id,
      200 * 1024 * 1024,
    ]);
    t = (
      await call(
        ops,
        "/catalog-tasks/" + t.id,
        "PATCH",
        { fields: {}, asset_ids: [] },
        t.version,
      )
    ).body;
    assert.equal((await upload(ops, t)).status, 429);
    assert.equal(
      (await call(ops, "/catalog-tasks/" + t.id)).body.version,
      t.version,
    );
  } finally {
    await pool.query("UPDATE media_assets SET preview_size=$2 WHERE id=$1", [
      id,
      old,
    ]);
  }
});
test("JPEG and WebP accepted and sanitized", async () => {
  let t = await create();
  for (const format of ["jpeg", "webp"] as const) {
    const bytes = await sharp(png).toFormat(format).toBuffer();
    const r = await upload(ops, t, bytes, "image/" + format);
    assert.equal(r.status, 201, JSON.stringify(r.body));
    t = r.body;
    assert.equal(t.assets.at(-1).mime, "image/" + format);
  }
});

test("MCP credentials cannot access material tasks or previews", async () => {
  const t = await create(),
    r = await upload(ops, t);
  assert.equal(r.status, 201);
  const token = (
    await call(owner, "/mcp-tokens", "POST", { label: "material denial" })
  ).body.token;
  const headers = { Authorization: "Bearer " + token };
  assert.equal((await fetch(base + "/catalog-tasks", { headers })).status, 403);
  assert.equal(
    (
      await fetch(base.replace("/api/v1", "") + r.body.assets[0].preview_url, {
        headers,
      })
    ).status,
    403,
  );
});
