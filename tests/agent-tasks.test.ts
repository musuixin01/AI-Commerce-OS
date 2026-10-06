import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createApp } from "../services/api/src/app";
import { AgentTasks } from "../services/api/src/agent-tasks.service";
import { pool } from "../services/api/src/db";

type Client = { cookie: string; csrf: string };
let app: any;
let base: string;
let ops: Client;
let owner: Client;
let other: Client;
const runtime = new AgentTasks();

async function call(
  client: Client | undefined,
  path: string,
  method = "GET",
  body?: unknown,
  version?: number,
  key = randomUUID(),
) {
  const response = await fetch(base + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(client
        ? { Cookie: client.cookie, "X-CSRF-Token": client.csrf }
        : {}),
      "Idempotency-Key": key,
      ...(version ? { "If-Match": String(version) } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    status: response.status,
    body: await response.json(),
    headers: response.headers,
  };
}

async function login(role: string, tenant = "1") {
  const result = await call(undefined, "/auth/dev-login", "POST", { role, tenant });
  assert.equal(result.status, 201);
  return {
    cookie: result.headers.get("set-cookie")!.split(";")[0],
    csrf: result.body.csrf,
  };
}

async function createCatalog(title = "AI 任务测试") {
  const result = await call(ops, "/catalog-tasks", "POST", {
    fields: { title, source_refs: "人工测试资料" },
  });
  assert.equal(result.status, 201, JSON.stringify(result.body));
  return result.body;
}

async function createAgent(
  catalogTask: any,
  options: {
    budget?: number;
    maxAttempts?: number;
    key?: string;
  } = {},
) {
  return call(
    ops,
    "/catalog-tasks/" + catalogTask.id + "/agent-tasks",
    "POST",
    {
      intent: "CATALOG_GENERATION",
      budget: {
        currency: "CNY",
        max_amount_micros: options.budget ?? 1_000_000,
      },
      max_attempts: options.maxAttempts ?? 2,
    },
    catalogTask.version,
    options.key,
  );
}

before(async () => {
  app = await createApp();
  await app.listen(0, "127.0.0.1");
  base = (await app.getUrl()) + "/api/v1";
  ops = await login("ops");
  owner = await login("owner");
  other = await login("ops", "2");
});

after(async () => {
  await app?.close();
  await pool.end();
});

test("agent task pins immutable catalog input version and is tenant scoped", async () => {
  const catalogTask = await createCatalog("固定输入版本");
  const key = randomUUID();
  const created = await createAgent(catalogTask, { key });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.equal(created.body.state, "QUEUED");
  assert.equal(created.body.input_version, 1);
  assert.match(created.body.input_digest, /^[a-f0-9]{64}$/);
  assert.equal(created.body.plan_version, "catalog-generate/v1");
  assert.equal(created.body.attempt_count, 0);
  assert.equal(created.body.budget.max_amount_micros, 1_000_000);

  const changed = await call(
    ops,
    "/catalog-tasks/" + catalogTask.id,
    "PATCH",
    {
      fields: { title: "草稿后续已修改", source_refs: "人工测试资料" },
      asset_ids: [],
    },
    1,
  );
  assert.equal(changed.status, 200);
  assert.equal(changed.body.version, 2);

  const fetched = await call(ops, "/agent-tasks/" + created.body.id);
  assert.equal(fetched.status, 200);
  assert.equal(fetched.body.input_version, 1);
  assert.equal(fetched.body.input_digest, created.body.input_digest);

  const replay = await createAgent(catalogTask, { key });
  assert.equal(replay.status, 201);
  assert.equal(replay.body.id, created.body.id);

  const conflict = await call(
    ops,
    "/catalog-tasks/" + catalogTask.id + "/agent-tasks",
    "POST",
    {
      intent: "CATALOG_GENERATION",
      budget: { currency: "CNY", max_amount_micros: 2_000_000 },
      max_attempts: 2,
    },
    1,
    key,
  );
  assert.equal(conflict.status, 409);

  assert.equal(
    (await call(other, "/agent-tasks/" + created.body.id)).status,
    404,
  );
  assert.equal(
    (
      await call(
        other,
        "/catalog-tasks/" + catalogTask.id + "/agent-tasks",
      )
    ).status,
    404,
  );

  const lease = await runtime.claimNext("test-cleanup", 30);
  assert.equal(lease?.task_id, created.body.id);
  const done = await runtime.completeAttempt(created.body.id, lease!.lease_token, {
    provider: "test-provider",
    model: "fixture-model",
    cost_amount_micros: 0,
    artifacts: [],
  });
  assert.equal(done.state, "SUCCEEDED");
});

test("known failures retry within budget and artifacts keep provenance", async () => {
  const catalogTask = await createCatalog("重试与成果");
  const created = await createAgent(catalogTask, {
    budget: 1_000,
    maxAttempts: 2,
  });
  assert.equal(created.status, 201);

  const first = await runtime.claimNext("worker-a", 30);
  assert.equal(first?.task_id, created.body.id);
  assert.equal(first?.attempt_no, 1);
  assert.equal(first?.input_version, 1);
  assert.notEqual(first?.request_key, first?.lease_token);

  const preparedFirst = await runtime.prepareExternalCall(
    created.body.id,
    first!.lease_token,
    {
      provider: "test-provider",
      model: "fixture-model",
      estimated_cost_micros: 600,
    },
  );
  assert.equal(preparedFirst.request_key, first!.request_key);
  assert.equal(preparedFirst.allowed, true);
  let state = await runtime.failAttempt(created.body.id, first!.lease_token, {
    error_code: "PROVIDER_BUSY",
    retryable: true,
    retry_delay_seconds: 0,
    cost_amount_micros: 100,
    provider: "test-provider",
    model: "fixture-model",
  });
  assert.equal(state.state, "WAITING_RETRY");
  assert.equal(state.budget.spent_amount_micros, 100);
  assert.equal(state.budget.reserved_amount_micros, 0);
  assert.equal(state.attempts[0].state, "FAILED");

  const second = await runtime.claimNext("worker-b", 30);
  assert.equal(second?.task_id, created.body.id);
  assert.equal(second?.attempt_no, 2);
  assert.notEqual(second?.request_key, first?.request_key);

  await assert.rejects(
    () =>
      runtime.prepareExternalCall(created.body.id, second!.lease_token, {
        provider: "test-provider",
        model: "fixture-model",
        estimated_cost_micros: 901,
      }),
    /费用预算不足/,
  );
  const preparedSecond = await runtime.prepareExternalCall(
    created.body.id,
    second!.lease_token,
    {
      provider: "test-provider",
      model: "fixture-model",
      estimated_cost_micros: 800,
    },
  );
  assert.equal(preparedSecond.request_key, second!.request_key);
  assert.equal(preparedSecond.allowed, true);

  state = await runtime.completeAttempt(created.body.id, second!.lease_token, {
    provider: "test-provider",
    model: "fixture-model",
    provider_operation_ref: "fixture-operation-2",
    cost_amount_micros: 700,
    artifacts: [
      {
        logical_key: "listing-fields",
        kind: "FIELD_DRAFT",
        content: { title: "模型生成但尚未人工确认" },
        source_refs: ["catalog-task:" + catalogTask.id + ":v1"],
      },
    ],
  });
  assert.equal(state.state, "SUCCEEDED");
  assert.equal(state.attempt_count, 2);
  assert.equal(state.budget.spent_amount_micros, 800);
  assert.equal(state.budget.reserved_amount_micros, 0);
  assert.equal(state.artifacts.length, 1);
  assert.equal(state.artifacts[0].logical_key, "listing-fields");
  assert.equal(state.artifacts[0].version, 1);
  assert.equal(state.artifacts[0].input_version, 1);
  assert.equal(state.artifacts[0].input_digest, created.body.input_digest);
  assert.equal(state.artifacts[0].provider, "test-provider");
  assert.equal(state.artifacts[0].model, "fixture-model");
});

test("expired or uncertain executions become UNKNOWN until reconciled", async () => {
  const catalogTask = await createCatalog("UNKNOWN 恢复");
  const created = await createAgent(catalogTask, {
    budget: 2_000,
    maxAttempts: 3,
  });
  assert.equal(created.status, 201);

  const first = await runtime.claimNext("worker-crash", 30);
  assert.equal(first?.task_id, created.body.id);
  await runtime.prepareExternalCall(created.body.id, first!.lease_token, {
    provider: "test-provider",
    model: "fixture-model",
    estimated_cost_micros: 400,
  });
  await pool.query(
    "UPDATE agent_tasks SET lease_until=now()-interval '1 second' WHERE id=$1",
    [created.body.id],
  );

  const recovered = await runtime.recoverExpiredLeases();
  assert.ok(recovered >= 1);
  let state = await runtime.get(
    (await call(ops, "/me")).body,
    created.body.id,
  );
  assert.equal(state.state, "UNKNOWN");
  assert.equal(state.budget.reserved_amount_micros, 400);
  assert.equal(state.attempts[0].state, "UNKNOWN");
  assert.equal(state.last_error_code, "LEASE_EXPIRED_UNCERTAIN");

  assert.equal(await runtime.claimNext("worker-must-not-replay", 30), null);

  state = await runtime.reconcileUnknown(created.body.id, {
    state: "FAILED",
    error_code: "PROVIDER_CONFIRMED_NOT_CREATED",
    retryable: true,
    retry_delay_seconds: 0,
    cost_amount_micros: 100,
  });
  assert.equal(state.state, "WAITING_RETRY");
  assert.equal(state.budget.spent_amount_micros, 100);
  assert.equal(state.budget.reserved_amount_micros, 0);

  const second = await runtime.claimNext("worker-reconcile", 30);
  assert.equal(second?.attempt_no, 2);
  await runtime.prepareExternalCall(created.body.id, second!.lease_token, {
    provider: "test-provider",
    model: "fixture-model",
    estimated_cost_micros: 300,
  });
  state = await runtime.markUnknown(created.body.id, second!.lease_token, {
    provider: "test-provider",
    model: "fixture-model",
    provider_operation_ref: "provider-operation-unknown",
  });
  assert.equal(state.state, "UNKNOWN");
  assert.equal(state.budget.reserved_amount_micros, 300);

  state = await runtime.reconcileUnknown(created.body.id, {
    state: "SUCCEEDED",
    provider: "test-provider",
    model: "fixture-model",
    provider_operation_ref: "provider-operation-unknown",
    cost_amount_micros: 250,
    artifacts: [
      {
        logical_key: "provider-receipt",
        kind: "PROVIDER_RECEIPT",
        content: { reconciled: true },
        source_refs: [],
      },
    ],
  });
  assert.equal(state.state, "SUCCEEDED");
  assert.equal(state.budget.spent_amount_micros, 350);
  assert.equal(state.budget.reserved_amount_micros, 0);
  assert.equal(state.attempts[1].state, "SUCCEEDED");
  assert.equal(state.artifacts[0].kind, "PROVIDER_RECEIPT");
});

test("lease expiry before external preparation is safe to retry", async () => {
  const catalogTask = await createCatalog("外部调用前崩溃");
  const created = await createAgent(catalogTask, {
    budget: 1_000,
    maxAttempts: 2,
  });
  assert.equal(created.status, 201);

  const first = await runtime.claimNext("worker-before-external", 30);
  assert.equal(first?.task_id, created.body.id);
  await pool.query(
    "UPDATE agent_tasks SET lease_until=now()-interval '1 second' WHERE id=$1",
    [created.body.id],
  );
  await runtime.recoverExpiredLeases();

  const state = await call(ops, "/agent-tasks/" + created.body.id);
  assert.equal(state.body.state, "WAITING_RETRY");
  assert.equal(state.body.last_error_code, "LEASE_EXPIRED_BEFORE_EXTERNAL");
  assert.equal(state.body.last_error_retryable, true);
  assert.equal(state.body.attempts[0].state, "FAILED");

  const second = await runtime.claimNext("worker-after-safe-retry", 30);
  assert.equal(second?.task_id, created.body.id);
  assert.equal(second?.attempt_no, 2);
  const done = await runtime.completeAttempt(created.body.id, second!.lease_token, {
    provider: "test-provider",
    model: "fixture-model",
    cost_amount_micros: 0,
    artifacts: [],
  });
  assert.equal(done.state, "SUCCEEDED");
});

test("budget and contract guards prevent unsafe execution", async () => {
  const catalogTask = await createCatalog("预算保护");
  assert.equal(
    (
      await call(
        ops,
        "/catalog-tasks/" + catalogTask.id + "/agent-tasks",
        "POST",
        {
          intent: "CATALOG_GENERATION",
          budget: { currency: "CNY", max_amount_micros: 100 },
        },
      )
    ).status,
    428,
  );

  const created = await createAgent(catalogTask, {
    budget: 100,
    maxAttempts: 2,
  });
  assert.equal(created.status, 201);
  const lease = await runtime.claimNext("worker-budget", 30);
  assert.equal(lease?.task_id, created.body.id);
  await runtime.prepareExternalCall(created.body.id, lease!.lease_token, {
    provider: "test-provider",
    model: "fixture-model",
    estimated_cost_micros: 100,
  });
  const failed = await runtime.failAttempt(created.body.id, lease!.lease_token, {
    error_code: "PROVIDER_REJECTED",
    retryable: true,
    retry_delay_seconds: 0,
    cost_amount_micros: 100,
  });
  assert.equal(failed.state, "FAILED");
  assert.equal(failed.budget.spent_amount_micros, 100);
  assert.equal(failed.attempt_count, 1);
  assert.equal(await runtime.claimNext("worker-budget-2", 30), null);

  const actor = (await call(ops, "/me")).body;
  const revokedCatalog = await createCatalog("撤权停止执行");
  const revokedTask = await createAgent(revokedCatalog, { budget: 100 });
  assert.equal(revokedTask.status, 201);
  const revokedLease = await runtime.claimNext("worker-revoked", 30);
  assert.equal(revokedLease?.task_id, revokedTask.body.id);
  try {
    await pool.query(
      "UPDATE memberships SET active=false WHERE user_id=$1 AND organization_id=$2 AND workspace_id=$3",
      [actor.id, actor.organization_id, actor.workspace_id],
    );
    const prepared = await runtime.prepareExternalCall(
      revokedTask.body.id,
      revokedLease!.lease_token,
      {
        provider: "test-provider",
        model: "fixture-model",
        estimated_cost_micros: 50,
      },
    );
    assert.equal(prepared.allowed, false);
    const cancelled = await pool.query(
      "SELECT state,last_error_code FROM agent_tasks WHERE id=$1",
      [revokedTask.body.id],
    );
    assert.equal(cancelled.rows[0].state, "CANCELLED");
    assert.equal(cancelled.rows[0].last_error_code, "MEMBERSHIP_REVOKED");
  } finally {
    await pool.query(
      "UPDATE memberships SET active=true WHERE user_id=$1 AND organization_id=$2 AND workspace_id=$3",
      [actor.id, actor.organization_id, actor.workspace_id],
    );
  }

  const token = (
    await call(owner, "/mcp-tokens", "POST", { label: "agent denial" })
  ).body.token;
  assert.equal(
    (
      await fetch(base + "/agent-tasks/" + created.body.id, {
        headers: { Authorization: "Bearer " + token },
      })
    ).status,
    403,
  );
});
