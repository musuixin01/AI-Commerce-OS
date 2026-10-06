import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { createApp } from "../services/api/src/app";
import { CatalogGenerationWorker } from "../services/api/src/catalog-generation.worker";
import type {
  CatalogFieldProvider,
  CatalogGenerationInput,
} from "../services/api/src/catalog-generation.provider";
import { pool } from "../services/api/src/db";

type Client = { cookie: string; csrf: string };
let app: any;
let base = "";
let ops: Client;
let png: Buffer;

async function call(
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
      ...(client
        ? { Cookie: client.cookie, "X-CSRF-Token": client.csrf }
        : {}),
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

async function login() {
  const result = await call(undefined, "/auth/dev-login", "POST", {
    role: "ops",
    tenant: "1",
  });
  assert.equal(result.status, 201);
  return {
    cookie: result.headers.get("set-cookie")!.split(";")[0],
    csrf: result.body.csrf,
  };
}

async function createCatalog(title: string) {
  const created = await call(ops, "/catalog-tasks", "POST", {
    fields: {
      title,
      category: "",
      seller_sku: "MANUAL-SKU",
      price: "128.00",
      currency: "CNY",
      description: "人工资料：农机配件实拍图",
      source_refs: "线下实物与供应商资料",
    },
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  return created.body;
}

async function upload(t: any) {
  const form = new FormData();
  form.append(
    "file",
    new Blob([new Uint8Array(png)], { type: "image/png" }),
    "真实商品.png",
  );
  const response = await fetch(base + "/catalog-tasks/" + t.id + "/assets", {
    method: "POST",
    headers: {
      Cookie: ops.cookie,
      "X-CSRF-Token": ops.csrf,
      "Idempotency-Key": randomUUID(),
      "If-Match": String(t.version),
    },
    body: form,
  });
  const body = await response.json();
  assert.equal(response.status, 201, JSON.stringify(body));
  return body;
}

class FakeFieldProvider implements CatalogFieldProvider {
  readonly provider = "fixture-provider";
  readonly model = "fixture-vision-model";
  seen?: CatalogGenerationInput;
  calls = 0;
  configured() {
    return true;
  }
  reserveCostMicros() {
    return 1_234;
  }
  async generate(input: CatalogGenerationInput) {
    this.calls++;
    this.seen = input;
    return {
      operation_ref: "fixture-operation",
      usage: { input_tokens: 20, output_tokens: 10 },
      output: {
        title: "AI 生成但待确认的商品标题",
        category: "农机配件",
        description: "基于实拍图和人工资料整理的描述。",
        attributes: [
          {
            name: "外观",
            value: "金属部件",
            evidence_type: "VISIBLE" as const,
            source_ref: "media-asset:fixture",
          },
        ],
        unknowns: ["适配机型待人工确认", "材质待资料确认"],
        evidence: [
          {
            fact: "存在实拍商品主体",
            source_ref: "media-asset:fixture",
          },
        ],
      },
    };
  }
}

before(async () => {
  app = await createApp();
  await app.listen(0, "127.0.0.1");
  base = (await app.getUrl()) + "/api/v1";
  ops = await login();
  png = await sharp({
    create: { width: 48, height: 36, channels: 3, background: "#ad8f62" },
  })
    .png()
    .toBuffer();
});

after(async () => {
  await app?.close();
  await pool.end();
});

test("catalog field worker reads pinned private originals and persists review artifacts", async () => {
  let catalog = await createCatalog("待 AI 整理");
  catalog = await upload(catalog);
  assert.equal(catalog.version, 2);
  assert.equal(catalog.assets.length, 1);

  const task = await call(
    ops,
    "/catalog-tasks/" + catalog.id + "/agent-tasks",
    "POST",
    {
      intent: "CATALOG_GENERATION",
      budget: { currency: "USD", max_amount_micros: 10_000 },
      max_attempts: 2,
    },
    catalog.version,
  );
  assert.equal(task.status, 201, JSON.stringify(task.body));
  assert.equal(task.body.state, "QUEUED");

  const provider = new FakeFieldProvider();
  const worker = new CatalogGenerationWorker(provider, undefined, "fixture-worker");
  const result = await worker.runOnce();
  assert.equal(result.status, "succeeded");
  assert.equal(provider.calls, 1);
  assert.equal(provider.seen?.catalog_task_id, catalog.id);
  assert.equal(provider.seen?.input_version, 2);
  assert.equal(provider.seen?.images.length, 1);
  assert.equal(provider.seen?.images[0].id, catalog.assets[0].id);
  assert.ok(provider.seen?.images[0].bytes.equals(png));
  assert.equal(provider.seen?.fields.price, "128.00");

  const fetched = await call(ops, "/agent-tasks/" + task.body.id);
  assert.equal(fetched.status, 200);
  assert.equal(fetched.body.state, "SUCCEEDED");
  assert.equal(fetched.body.budget.spent_amount_micros, 1_234);
  assert.equal(fetched.body.attempts[0].provider, "fixture-provider");
  assert.equal(fetched.body.attempts[0].model, "fixture-vision-model");
  const fields = fetched.body.artifacts.find((x: any) => x.kind === "FIELD_DRAFT");
  assert.equal(fields.content.fields.title, "AI 生成但待确认的商品标题");
  assert.deepEqual(fields.content.unknowns, ["适配机型待人工确认", "材质待资料确认"]);
  assert.ok(fields.source_refs.includes(`catalog-task:${catalog.id}:v2`));
  assert.ok(fields.source_refs.includes(`media-asset:${catalog.assets[0].id}`));
  const receipt = fetched.body.artifacts.find(
    (x: any) => x.kind === "PROVIDER_RECEIPT",
  );
  assert.equal(receipt.content.cost_basis, "configured_reserve_estimate");
});

test("catalog field worker fails before provider boundary when originals are absent", async () => {
  const catalog = await createCatalog("没有原图");
  const task = await call(
    ops,
    "/catalog-tasks/" + catalog.id + "/agent-tasks",
    "POST",
    {
      intent: "CATALOG_GENERATION",
      budget: { currency: "USD", max_amount_micros: 10_000 },
      max_attempts: 2,
    },
    catalog.version,
  );
  assert.equal(task.status, 201);
  const provider = new FakeFieldProvider();
  const worker = new CatalogGenerationWorker(provider, undefined, "no-image-worker");
  const result = await worker.runOnce();
  assert.equal(result.status, "failed");
  assert.equal(provider.calls, 0);
  const fetched = await call(ops, "/agent-tasks/" + task.body.id);
  assert.equal(fetched.body.state, "FAILED");
  assert.equal(fetched.body.last_error_code, "INPUT_IMAGES_REQUIRED");
  assert.equal(fetched.body.budget.spent_amount_micros, 0);
});

