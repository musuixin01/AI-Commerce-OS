import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { createApp } from "../services/api/src/app";
import { CatalogImageWorker } from "../services/api/src/catalog-image.worker";
import type {
  CatalogImageGenerationInput,
  CatalogImageProvider,
} from "../services/api/src/catalog-image.provider";
import { pool } from "../services/api/src/db";

type Client = { cookie: string; csrf: string };
let app: any;
let base = "";
let ops: Client;
let sourcePng: Buffer;
let mainPng: Buffer;
let detailPng: Buffer;

async function json(
  client: Client | undefined,
  path: string,
  method = "GET",
  body?: unknown,
  version?: number,
) {
  const response = await fetch(base + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(client ? { Cookie: client.cookie, "X-CSRF-Token": client.csrf } : {}),
      "Idempotency-Key": randomUUID(),
      ...(version !== undefined ? { "If-Match": String(version) } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    status: response.status,
    body: await response.json(),
    headers: response.headers,
  };
}

async function login(tenant = "1") {
  const result = await json(undefined, "/auth/dev-login", "POST", {
    role: "ops",
    tenant,
  });
  assert.equal(result.status, 201);
  return {
    cookie: result.headers.get("set-cookie")!.split(";")[0],
    csrf: result.body.csrf,
  };
}

async function createCatalogWithImage() {
  const created = await json(ops, "/catalog-tasks", "POST", {
    fields: {
      title: "实拍农机配件",
      category: "农机配件",
      seller_sku: "MANUAL-IMAGE-SKU",
      price: "99.00",
      currency: "CNY",
      description: "仅允许保持实物结构进行背景与排版处理",
      source_refs: "线下实拍",
    },
  });
  assert.equal(created.status, 201);
  const form = new FormData();
  form.append(
    "file",
    new Blob([new Uint8Array(sourcePng)], { type: "image/png" }),
    "source.png",
  );
  const response = await fetch(base + `/catalog-tasks/${created.body.id}/assets`, {
    method: "POST",
    headers: {
      Cookie: ops.cookie,
      "X-CSRF-Token": ops.csrf,
      "Idempotency-Key": randomUUID(),
      "If-Match": String(created.body.version),
    },
    body: form,
  });
  const body = await response.json();
  assert.equal(response.status, 201, JSON.stringify(body));
  return body;
}

class FakeImageProvider implements CatalogImageProvider {
  readonly provider = "fixture-image-provider";
  readonly model = "fixture-image-edit";
  calls = 0;
  seen?: CatalogImageGenerationInput;
  configured() {
    return true;
  }
  reserveCostMicros() {
    return 2_468;
  }
  async generate(input: CatalogImageGenerationInput) {
    this.calls++;
    this.seen = input;
    return {
      images: [
        { role: "MAIN_IMAGE" as const, bytes: mainPng, mime: "image/png" as const },
        {
          role: "DETAIL_IMAGE" as const,
          bytes: detailPng,
          mime: "image/png" as const,
        },
      ],
    };
  }
}

before(async () => {
  app = await createApp();
  await app.listen(0, "127.0.0.1");
  base = (await app.getUrl()) + "/api/v1";
  ops = await login();
  sourcePng = await sharp({
    create: { width: 64, height: 48, channels: 3, background: "#735b43" },
  })
    .png()
    .toBuffer();
  mainPng = await sharp({
    create: { width: 1024, height: 1024, channels: 3, background: "#f4f0e9" },
  })
    .png()
    .toBuffer();
  detailPng = await sharp({
    create: { width: 1024, height: 1024, channels: 3, background: "#ded8cf" },
  })
    .png()
    .toBuffer();
});

after(async () => {
  await app?.close();
  await pool.end();
});

test("image worker persists versioned private media, exposes artifacts, and confirms exact version", async () => {
  const catalog = await createCatalogWithImage();
  const created = await json(
    ops,
    `/catalog-tasks/${catalog.id}/agent-tasks`,
    "POST",
    {
      intent: "CATALOG_IMAGE_GENERATION",
      budget: { currency: "USD", max_amount_micros: 50_000 },
      max_attempts: 2,
    },
    catalog.version,
  );
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.equal(created.body.plan_version, "catalog-image-generate/v1");

  const provider = new FakeImageProvider();
  const worker = new CatalogImageWorker(provider, undefined, "fixture-image-worker");
  const result = await worker.runOnce();
  assert.equal(result.status, "succeeded");
  assert.equal(provider.calls, 1);
  assert.equal(provider.seen?.input_version, catalog.version);
  assert.equal(provider.seen?.images[0].id, catalog.assets[0].id);
  assert.ok(provider.seen?.images[0].bytes.equals(sourcePng));

  let task = await json(ops, `/agent-tasks/${created.body.id}`);
  assert.equal(task.status, 200);
  assert.equal(task.body.state, "SUCCEEDED");
  assert.equal(task.body.budget.spent_amount_micros, 2_468);
  const main = task.body.artifacts.find((item: any) => item.kind === "IMAGE");
  const detail = task.body.artifacts.find((item: any) => item.kind === "DETAIL_IMAGE");
  assert.equal(main.content.media_version, 1);
  assert.equal(detail.content.media_version, 1);
  assert.equal(main.content.review_state, "NEEDS_CONFIRMATION");
  assert.ok(main.source_refs.includes(`media-asset:${catalog.assets[0].id}`));

  const preview = await fetch(base.replace(/\/api\/v1$/, "") + main.content.preview_url, {
    headers: { Cookie: ops.cookie },
  });
  assert.equal(preview.status, 200);
  assert.match(preview.headers.get("content-type") || "", /image\/webp/);
  assert.ok((await preview.arrayBuffer()).byteLength > 0);

  const otherTenant = await login("2");
  const denied = await fetch(base.replace(/\/api\/v1$/, "") + main.content.preview_url, {
    headers: { Cookie: otherTenant.cookie },
  });
  assert.equal(denied.status, 404);

  const confirmed = await json(
    ops,
    `/generated-media/${main.content.media_id}/confirm`,
    "POST",
    {},
    main.content.media_version,
  );
  assert.equal(confirmed.status, 201);
  assert.equal(confirmed.body.review_state, "CONFIRMED");
  task = await json(ops, `/agent-tasks/${created.body.id}`);
  const mainAfter = task.body.artifacts.find((item: any) => item.kind === "IMAGE");
  assert.equal(mainAfter.content.review_state, "CONFIRMED");
  assert.ok(mainAfter.content.confirmed_at);
});

test("new image task appends a new generated-media version instead of overwriting prior output", async () => {
  const catalog = await createCatalogWithImage();
  const provider = new FakeImageProvider();
  const worker = new CatalogImageWorker(provider, undefined, "version-image-worker");
  const versions: number[] = [];
  for (let i = 0; i < 2; i++) {
    const created = await json(
      ops,
      `/catalog-tasks/${catalog.id}/agent-tasks`,
      "POST",
      {
        intent: "CATALOG_IMAGE_GENERATION",
        budget: { currency: "USD", max_amount_micros: 50_000 },
        max_attempts: 1,
      },
      catalog.version,
    );
    assert.equal(created.status, 201);
    assert.equal((await worker.runOnce()).status, "succeeded");
    const task = await json(ops, `/agent-tasks/${created.body.id}`);
    versions.push(
      task.body.artifacts.find((item: any) => item.kind === "IMAGE").content
        .media_version,
    );
  }
  assert.deepEqual(versions, [1, 2]);
});

