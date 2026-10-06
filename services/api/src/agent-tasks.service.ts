import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
import { pool, transaction } from "./db";
import { CatalogService, type Subject } from "./catalog.service";
import { fail, hash, match } from "./domain";
import {
  agentAttemptResultInput,
  agentExternalCallInput,
  agentKnownFailureInput,
  agentReconcileFailureInput,
  agentTaskCreateInput,
  agentUnknownInput,
} from "./agent-tasks.schema";

const catalog = new CatalogService();
const uuid = (value: string) => z.string().uuid().parse(value);
const canWrite = (actor: Subject) => {
  if (!["ops", "owner"].includes(actor.role))
    fail(403, "FORBIDDEN", "无权创建 AI 制作任务");
};

type RunningTask = {
  id: string;
  organization_id: string;
  workspace_id: string;
  catalog_task_id: string;
  input_version: number;
  input_digest: string;
  created_by: string;
  state: "RUNNING";
  budget_amount_micros: string | number;
  spent_amount_micros: string | number;
  reserved_amount_micros: string | number;
  max_attempts: number;
  attempt_count: number;
  lease_token: string;
  lease_until: Date;
};

export class AgentTasks {
  private async scopedTask(
    c: PoolClient | typeof pool,
    actor: Subject,
    id: string,
    lock = false,
  ) {
    const result = await c.query(
      "SELECT * FROM agent_tasks WHERE organization_id=$1 AND workspace_id=$2 AND id=$3" +
        (lock ? " FOR UPDATE" : ""),
      [actor.organization_id, actor.workspace_id, uuid(id)],
    );
    if (!result.rowCount) fail(404, "NOT_FOUND", "AI 制作任务不存在");
    return result.rows[0];
  }

  private publicTask(task: any, attempts: any[] = [], artifacts: any[] = []) {
    return {
      id: task.id,
      catalog_task_id: task.catalog_task_id,
      input_version: task.input_version,
      input_digest: task.input_digest,
      intent: task.intent,
      plan_version: task.plan_version,
      state: task.state,
      budget: {
        currency: task.budget_currency,
        max_amount_micros: Number(task.budget_amount_micros),
        spent_amount_micros: Number(task.spent_amount_micros),
        reserved_amount_micros: Number(task.reserved_amount_micros),
      },
      max_attempts: task.max_attempts,
      attempt_count: task.attempt_count,
      next_attempt_at: task.next_attempt_at,
      last_error_code: task.last_error_code,
      last_error_retryable: task.last_error_retryable,
      version: task.version,
      created_at: task.created_at,
      updated_at: task.updated_at,
      attempts: attempts.map((attempt) => ({
        id: attempt.id,
        attempt_no: attempt.attempt_no,
        state: attempt.state,
        provider: attempt.provider,
        model: attempt.model,
        cost_amount_micros: Number(attempt.cost_amount_micros),
        error_code: attempt.error_code,
        retryable: attempt.retryable,
        started_at: attempt.started_at,
        finished_at: attempt.finished_at,
      })),
      artifacts: artifacts.map((artifact) => ({
        id: artifact.id,
        logical_key: artifact.logical_key,
        kind: artifact.kind,
        version: artifact.version,
        input_version: artifact.input_version,
        input_digest: artifact.input_digest,
        provider: artifact.provider,
        model: artifact.model,
        content: artifact.content,
        source_refs: artifact.source_refs,
        created_at: artifact.created_at,
      })),
    };
  }

  private async view(c: PoolClient | typeof pool, task: any) {
    const [attempts, artifacts] = await Promise.all([
      c.query(
        "SELECT id,attempt_no,state,provider,model,cost_amount_micros,error_code,retryable,started_at,finished_at FROM agent_task_attempts WHERE organization_id=$1 AND workspace_id=$2 AND task_id=$3 ORDER BY attempt_no",
        [task.organization_id, task.workspace_id, task.id],
      ),
      c.query(
        "SELECT id,logical_key,kind,version,input_version,input_digest,provider,model,content,source_refs,created_at FROM agent_artifacts WHERE organization_id=$1 AND workspace_id=$2 AND task_id=$3 ORDER BY logical_key,version",
        [task.organization_id, task.workspace_id, task.id],
      ),
    ]);
    const mediaIds = artifacts.rows
      .map((artifact) => artifact.content?.media_id)
      .filter((id) => typeof id === "string");
    let media = new Map<string, any>();
    if (mediaIds.length) {
      const result = await c.query(
        "SELECT id,review_state,confirmed_at FROM generated_media_versions WHERE organization_id=$1 AND workspace_id=$2 AND id=ANY($3::uuid[])",
        [task.organization_id, task.workspace_id, mediaIds],
      );
      media = new Map(result.rows.map((row) => [row.id, row]));
    }
    const enriched = artifacts.rows.map((artifact) => {
      const state = media.get(artifact.content?.media_id);
      return state
        ? {
            ...artifact,
            content: {
              ...artifact.content,
              review_state: state.review_state,
              confirmed_at: state.confirmed_at,
            },
          }
        : artifact;
    });
    return this.publicTask(task, attempts.rows, enriched);
  }

  async list(actor: Subject, catalogTaskId: string) {
    const parent = await pool.query(
      "SELECT 1 FROM catalog_tasks WHERE organization_id=$1 AND workspace_id=$2 AND id=$3",
      [actor.organization_id, actor.workspace_id, uuid(catalogTaskId)],
    );
    if (!parent.rowCount) fail(404, "NOT_FOUND", "制作草稿不存在");
    const result = await pool.query(
      "SELECT id,catalog_task_id,input_version,input_digest,intent,plan_version,state,budget_currency,budget_amount_micros,spent_amount_micros,reserved_amount_micros,max_attempts,attempt_count,next_attempt_at,last_error_code,last_error_retryable,version,created_at,updated_at FROM agent_tasks WHERE organization_id=$1 AND workspace_id=$2 AND catalog_task_id=$3 ORDER BY created_at DESC,id DESC LIMIT 30",
      [actor.organization_id, actor.workspace_id, catalogTaskId],
    );
    return result.rows.map((task) => this.publicTask(task));
  }

  async get(actor: Subject, id: string) {
    return this.view(pool, await this.scopedTask(pool, actor, id));
  }

  async create(
    actor: Subject,
    catalogTaskId: string,
    key: string | undefined,
    inputVersion: string | undefined,
    input: unknown,
  ) {
    canWrite(actor);
    uuid(catalogTaskId);
    const body = agentTaskCreateInput.parse(input);
    return catalog.write(
      actor,
      "agent-task.create:" + catalogTaskId,
      key,
      { inputVersion, body },
      async (c, trace) => {
        const parent = await c.query(
          "SELECT * FROM catalog_tasks WHERE organization_id=$1 AND workspace_id=$2 AND id=$3 FOR SHARE",
          [actor.organization_id, actor.workspace_id, catalogTaskId],
        );
        if (!parent.rowCount) fail(404, "NOT_FOUND", "制作草稿不存在");
        match(inputVersion, parent.rows[0].version);
        const snapshot = await c.query(
          "SELECT fields,asset_ids FROM catalog_task_versions WHERE organization_id=$1 AND workspace_id=$2 AND task_id=$3 AND version=$4",
          [
            actor.organization_id,
            actor.workspace_id,
            catalogTaskId,
            parent.rows[0].version,
          ],
        );
        if (!snapshot.rowCount)
          fail(409, "INPUT_VERSION_MISSING", "制作草稿版本快照不存在");
        const inputDigest = hash({
          catalog_task_id: catalogTaskId,
          version: parent.rows[0].version,
          fields: snapshot.rows[0].fields,
          asset_ids: snapshot.rows[0].asset_ids,
        });
        const planVersion =
          body.intent === "CATALOG_IMAGE_GENERATION"
            ? "catalog-image-generate/v1"
            : "catalog-generate/v1";
        const created = await c.query(
          "INSERT INTO agent_tasks(organization_id,workspace_id,catalog_task_id,input_version,input_digest,created_by,intent,plan_version,budget_currency,budget_amount_micros,max_attempts) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *",
          [
            actor.organization_id,
            actor.workspace_id,
            catalogTaskId,
            parent.rows[0].version,
            inputDigest,
            actor.id,
            body.intent,
            planVersion,
            body.budget.currency,
            body.budget.max_amount_micros,
            body.max_attempts,
          ],
        );
        await catalog.audit(c, actor, "agent-task.created", created.rows[0].id, trace, {
          catalog_task_id: catalogTaskId,
          input_version: parent.rows[0].version,
          input_digest: inputDigest,
          plan_version: planVersion,
          budget_currency: body.budget.currency,
          budget_amount_micros: body.budget.max_amount_micros,
          max_attempts: body.max_attempts,
        });
        return this.view(c, created.rows[0]);
      },
    );
  }

  private async systemAudit(
    c: PoolClient,
    task: any,
    action: string,
    details: Record<string, unknown> = {},
  ) {
    await c.query(
      "INSERT INTO audit_entries(organization_id,workspace_id,actor_id,action,resource_id,trace_id,details) VALUES($1,$2,$3,$4,$5,$6,$7)",
      [
        task.organization_id,
        task.workspace_id,
        task.created_by,
        action,
        task.id,
        randomUUID(),
        details,
      ],
    );
  }

  async recoverExpiredLeases() {
    return transaction(async (c) => {
      const expired = await c.query(
        "SELECT * FROM agent_tasks WHERE state='RUNNING' AND lease_until<=now() ORDER BY lease_until FOR UPDATE SKIP LOCKED LIMIT 100",
      );
      for (const task of expired.rows) {
        const attempt = await c.query(
          "SELECT * FROM agent_task_attempts WHERE organization_id=$1 AND workspace_id=$2 AND task_id=$3 AND attempt_no=$4 AND state='RUNNING' FOR UPDATE",
          [
            task.organization_id,
            task.workspace_id,
            task.id,
            task.attempt_count,
          ],
        );
        if (!attempt.rowCount) continue;
        const crossedExternalBoundary = Boolean(
          attempt.rows[0].provider && attempt.rows[0].model,
        );
        if (!crossedExternalBoundary) {
          const mayRetry =
            task.attempt_count < task.max_attempts &&
            Number(task.spent_amount_micros) < Number(task.budget_amount_micros);
          const nextState = mayRetry ? "WAITING_RETRY" : "FAILED";
          await c.query(
            "UPDATE agent_task_attempts SET state='FAILED',error_code='LEASE_EXPIRED_BEFORE_EXTERNAL',retryable=$5,finished_at=now() WHERE organization_id=$1 AND workspace_id=$2 AND task_id=$3 AND attempt_no=$4",
            [
              task.organization_id,
              task.workspace_id,
              task.id,
              task.attempt_count,
              mayRetry,
            ],
          );
          await c.query(
            "UPDATE agent_tasks SET state=$2,reserved_amount_micros=0,lease_owner=NULL,lease_token=NULL,lease_until=NULL,next_attempt_at=CASE WHEN $2='WAITING_RETRY' THEN now() ELSE NULL END,last_error_code='LEASE_EXPIRED_BEFORE_EXTERNAL',last_error_retryable=$3,version=version+1,updated_at=now() WHERE id=$1",
            [task.id, nextState, mayRetry],
          );
          await this.systemAudit(c, task, "agent-task.lease-recovered", {
            attempt_no: task.attempt_count,
            next_state: nextState,
            external_boundary_crossed: false,
          });
          continue;
        }
        await c.query(
          "UPDATE agent_task_attempts SET state='UNKNOWN',error_code='LEASE_EXPIRED_UNCERTAIN',retryable=false,finished_at=now() WHERE organization_id=$1 AND workspace_id=$2 AND task_id=$3 AND attempt_no=$4 AND state='RUNNING'",
          [
            task.organization_id,
            task.workspace_id,
            task.id,
            task.attempt_count,
          ],
        );
        await c.query(
          "UPDATE agent_tasks SET state='UNKNOWN',lease_owner=NULL,lease_token=NULL,lease_until=NULL,last_error_code='LEASE_EXPIRED_UNCERTAIN',last_error_retryable=false,version=version+1,updated_at=now() WHERE id=$1",
          [task.id],
        );
        await this.systemAudit(c, task, "agent-task.lease-unknown", {
          attempt_no: task.attempt_count,
          reserved_amount_micros: Number(task.reserved_amount_micros),
          external_boundary_crossed: true,
        });
      }
      return expired.rowCount || 0;
    });
  }

  async claimNext(workerId: string, leaseSeconds = 60, intent?: string) {
    if (!workerId.trim() || workerId.length > 120)
      fail(400, "INVALID_WORKER", "Worker 标识无效");
    if (!Number.isInteger(leaseSeconds) || leaseSeconds < 10 || leaseSeconds > 300)
      fail(400, "INVALID_LEASE", "租约必须为10到300秒");
    await this.recoverExpiredLeases();
    return transaction(async (c) => {
      const selected = await c.query(
        "SELECT * FROM agent_tasks WHERE (state='QUEUED' OR (state='WAITING_RETRY' AND next_attempt_at<=now())) AND attempt_count<max_attempts AND spent_amount_micros<budget_amount_micros AND ($1::text IS NULL OR intent=$1) ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT 1",
        [intent || null],
      );
      if (!selected.rowCount) return null;
      const task = selected.rows[0];
      const attemptNo = task.attempt_count + 1;
      const leaseToken = randomUUID();
      const requestKey = randomUUID();
      const updated = await c.query(
        "UPDATE agent_tasks SET state='RUNNING',attempt_count=$2,lease_owner=$3,lease_token=$4,lease_until=now()+($5::int*interval '1 second'),next_attempt_at=NULL,last_error_code=NULL,last_error_retryable=NULL,version=version+1,updated_at=now() WHERE id=$1 RETURNING *",
        [task.id, attemptNo, workerId, leaseToken, leaseSeconds],
      );
      await c.query(
        "INSERT INTO agent_task_attempts(organization_id,workspace_id,task_id,attempt_no,state,worker_id,lease_token,request_key) VALUES($1,$2,$3,$4,'RUNNING',$5,$6,$7)",
        [
          task.organization_id,
          task.workspace_id,
          task.id,
          attemptNo,
          workerId,
          leaseToken,
          requestKey,
        ],
      );
      const snapshot = await c.query(
        "SELECT fields,asset_ids FROM catalog_task_versions WHERE organization_id=$1 AND workspace_id=$2 AND task_id=$3 AND version=$4",
        [
          task.organization_id,
          task.workspace_id,
          task.catalog_task_id,
          task.input_version,
        ],
      );
      await this.systemAudit(c, task, "agent-task.claimed", {
        attempt_no: attemptNo,
        worker_id: workerId,
      });
      return {
        task_id: task.id,
        organization_id: task.organization_id,
        workspace_id: task.workspace_id,
        catalog_task_id: task.catalog_task_id,
        attempt_no: attemptNo,
        lease_token: leaseToken,
        request_key: requestKey,
        lease_until: updated.rows[0].lease_until,
        input_version: task.input_version,
        input_digest: task.input_digest,
        intent: task.intent,
        input: snapshot.rows[0],
        budget: {
          currency: task.budget_currency,
          max_amount_micros: Number(task.budget_amount_micros),
          spent_amount_micros: Number(task.spent_amount_micros),
        },
      };
    });
  }

  private async runningByLease(c: PoolClient, id: string, leaseToken: string) {
    const taskResult = await c.query(
      "SELECT * FROM agent_tasks WHERE id=$1 FOR UPDATE",
      [uuid(id)],
    );
    if (!taskResult.rowCount) fail(404, "NOT_FOUND", "AI 制作任务不存在");
    const task = taskResult.rows[0] as RunningTask;
    if (
      task.state !== "RUNNING" ||
      task.lease_token !== uuid(leaseToken) ||
      new Date(task.lease_until).getTime() <= Date.now()
    )
      fail(409, "LEASE_LOST", "任务租约已失效，必须先恢复或对账");
    return task;
  }

  async prepareExternalCall(id: string, leaseToken: string, input: unknown) {
    const body = agentExternalCallInput.parse(input);
    return transaction(async (c) => {
      const task = await this.runningByLease(c, id, leaseToken);
      const spent = Number(task.spent_amount_micros);
      const budget = Number(task.budget_amount_micros);
      const active = await c.query(
        "SELECT 1 FROM memberships WHERE user_id=$1 AND organization_id=$2 AND workspace_id=$3 AND active=true FOR SHARE",
        [task.created_by, task.organization_id, task.workspace_id],
      );
      if (!active.rowCount) {
        await c.query(
          "UPDATE agent_task_attempts SET state='FAILED',error_code='MEMBERSHIP_REVOKED',retryable=false,finished_at=now() WHERE organization_id=$1 AND workspace_id=$2 AND task_id=$3 AND attempt_no=$4 AND state='RUNNING'",
          [
            task.organization_id,
            task.workspace_id,
            task.id,
            task.attempt_count,
          ],
        );
        await c.query(
          "UPDATE agent_tasks SET state='CANCELLED',reserved_amount_micros=0,lease_owner=NULL,lease_token=NULL,lease_until=NULL,last_error_code='MEMBERSHIP_REVOKED',last_error_retryable=false,version=version+1,updated_at=now() WHERE id=$1",
          [task.id],
        );
        await this.systemAudit(c, task, "agent-task.cancelled", {
          attempt_no: task.attempt_count,
          reason: "MEMBERSHIP_REVOKED",
        });
        return {
          allowed: false as const,
          state: "CANCELLED" as const,
          reason: "MEMBERSHIP_REVOKED" as const,
        };
      }
      if (spent + body.estimated_cost_micros > budget)
        fail(409, "BUDGET_EXHAUSTED", "本任务费用预算不足，未执行外部调用");
      const attempt = await c.query(
        "UPDATE agent_task_attempts SET provider=$5,model=$6 WHERE organization_id=$1 AND workspace_id=$2 AND task_id=$3 AND attempt_no=$4 AND state='RUNNING' RETURNING request_key",
        [
          task.organization_id,
          task.workspace_id,
          task.id,
          task.attempt_count,
          body.provider,
          body.model,
        ],
      );
      if (!attempt.rowCount) fail(409, "ATTEMPT_NOT_RUNNING", "执行记录已结束");
      await c.query(
        "UPDATE agent_tasks SET reserved_amount_micros=$2,version=version+1,updated_at=now() WHERE id=$1",
        [task.id, body.estimated_cost_micros],
      );
      await this.systemAudit(c, task, "agent-task.external-prepared", {
        attempt_no: task.attempt_count,
        provider: body.provider,
        model: body.model,
        estimated_cost_micros: body.estimated_cost_micros,
      });
      return {
        allowed: true as const,
        request_key: attempt.rows[0].request_key,
        reserved_amount_micros: body.estimated_cost_micros,
      };
    });
  }

  async failAttempt(id: string, leaseToken: string, input: unknown) {
    const body = agentKnownFailureInput.parse(input);
    return transaction(async (c) => {
      const task = await this.runningByLease(c, id, leaseToken);
      const spent = Number(task.spent_amount_micros) + body.cost_amount_micros;
      const mayRetry =
        body.retryable &&
        task.attempt_count < task.max_attempts &&
        spent < Number(task.budget_amount_micros);
      const nextState = mayRetry ? "WAITING_RETRY" : "FAILED";
      await c.query(
        "UPDATE agent_task_attempts SET state='FAILED',provider=coalesce($5,provider),model=coalesce($6,model),provider_operation_ref=coalesce($7,provider_operation_ref),cost_amount_micros=$8,error_code=$9,retryable=$10,finished_at=now() WHERE organization_id=$1 AND workspace_id=$2 AND task_id=$3 AND attempt_no=$4 AND state='RUNNING'",
        [
          task.organization_id,
          task.workspace_id,
          task.id,
          task.attempt_count,
          body.provider || null,
          body.model || null,
          body.provider_operation_ref || null,
          body.cost_amount_micros,
          body.error_code,
          body.retryable,
        ],
      );
      await c.query(
        "UPDATE agent_tasks SET state=$2,spent_amount_micros=$3,reserved_amount_micros=0,lease_owner=NULL,lease_token=NULL,lease_until=NULL,next_attempt_at=CASE WHEN $2='WAITING_RETRY' THEN now()+($4::int*interval '1 second') ELSE NULL END,last_error_code=$5,last_error_retryable=$6,version=version+1,updated_at=now() WHERE id=$1",
        [
          task.id,
          nextState,
          spent,
          body.retry_delay_seconds,
          body.error_code,
          body.retryable,
        ],
      );
      await this.systemAudit(c, task, "agent-task.failed", {
        attempt_no: task.attempt_count,
        error_code: body.error_code,
        retryable: body.retryable,
        next_state: nextState,
        cost_amount_micros: body.cost_amount_micros,
      });
      const current = (await c.query("SELECT * FROM agent_tasks WHERE id=$1", [task.id]))
        .rows[0];
      return this.view(c, current);
    });
  }

  private async insertArtifacts(
    c: PoolClient,
    task: RunningTask,
    attemptId: string,
    provider: string,
    model: string,
    artifacts: Array<{
      logical_key: string;
      kind: string;
      content: Record<string, unknown>;
      source_refs: string[];
    }>,
  ) {
    for (const artifact of artifacts) {
      const versionResult = await c.query(
        "SELECT coalesce(max(version),0)::int+1 AS version FROM agent_artifacts WHERE organization_id=$1 AND workspace_id=$2 AND task_id=$3 AND logical_key=$4",
        [
          task.organization_id,
          task.workspace_id,
          task.id,
          artifact.logical_key,
        ],
      );
      await c.query(
        "INSERT INTO agent_artifacts(organization_id,workspace_id,task_id,attempt_id,logical_key,kind,version,input_version,input_digest,provider,model,content,source_refs) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)",
        [
          task.organization_id,
          task.workspace_id,
          task.id,
          attemptId,
          artifact.logical_key,
          artifact.kind,
          versionResult.rows[0].version,
          task.input_version,
          task.input_digest,
          provider,
          model,
          artifact.content,
          JSON.stringify(artifact.source_refs),
        ],
      );
    }
  }

  async completeAttempt(id: string, leaseToken: string, input: unknown) {
    const body = agentAttemptResultInput.parse(input);
    return transaction(async (c) => {
      const task = await this.runningByLease(c, id, leaseToken);
      const attempt = await c.query(
        "SELECT id FROM agent_task_attempts WHERE organization_id=$1 AND workspace_id=$2 AND task_id=$3 AND attempt_no=$4 AND state='RUNNING' FOR UPDATE",
        [task.organization_id, task.workspace_id, task.id, task.attempt_count],
      );
      if (!attempt.rowCount) fail(409, "ATTEMPT_NOT_RUNNING", "执行记录已结束");
      await this.insertArtifacts(
        c,
        task,
        attempt.rows[0].id,
        body.provider,
        body.model,
        body.artifacts,
      );
      await c.query(
        "UPDATE agent_task_attempts SET state=$5,provider=$6,model=$7,provider_operation_ref=$8,cost_amount_micros=$9,retryable=false,finished_at=now() WHERE organization_id=$1 AND workspace_id=$2 AND task_id=$3 AND attempt_no=$4",
        [
          task.organization_id,
          task.workspace_id,
          task.id,
          task.attempt_count,
          body.outcome,
          body.provider,
          body.model,
          body.provider_operation_ref || null,
          body.cost_amount_micros,
        ],
      );
      await c.query(
        "UPDATE agent_tasks SET state=$2,spent_amount_micros=spent_amount_micros+$3,reserved_amount_micros=0,lease_owner=NULL,lease_token=NULL,lease_until=NULL,last_error_code=NULL,last_error_retryable=NULL,version=version+1,updated_at=now() WHERE id=$1",
        [task.id, body.outcome, body.cost_amount_micros],
      );
      await this.systemAudit(c, task, "agent-task.completed", {
        attempt_no: task.attempt_count,
        outcome: body.outcome,
        artifact_count: body.artifacts.length,
        cost_amount_micros: body.cost_amount_micros,
      });
      const current = (await c.query("SELECT * FROM agent_tasks WHERE id=$1", [task.id]))
        .rows[0];
      return this.view(c, current);
    });
  }

  async markUnknown(id: string, leaseToken: string, input: unknown) {
    const body = agentUnknownInput.parse(input);
    return transaction(async (c) => {
      const task = await this.runningByLease(c, id, leaseToken);
      await c.query(
        "UPDATE agent_task_attempts SET state='UNKNOWN',provider=$5,model=$6,provider_operation_ref=$7,error_code='EXTERNAL_OUTCOME_UNKNOWN',retryable=false,finished_at=now() WHERE organization_id=$1 AND workspace_id=$2 AND task_id=$3 AND attempt_no=$4 AND state='RUNNING'",
        [
          task.organization_id,
          task.workspace_id,
          task.id,
          task.attempt_count,
          body.provider,
          body.model,
          body.provider_operation_ref || null,
        ],
      );
      await c.query(
        "UPDATE agent_tasks SET state='UNKNOWN',lease_owner=NULL,lease_token=NULL,lease_until=NULL,last_error_code='EXTERNAL_OUTCOME_UNKNOWN',last_error_retryable=false,version=version+1,updated_at=now() WHERE id=$1",
        [task.id],
      );
      await this.systemAudit(c, task, "agent-task.outcome-unknown", {
        attempt_no: task.attempt_count,
        provider: body.provider,
        model: body.model,
        provider_operation_ref: body.provider_operation_ref || null,
      });
      const current = (await c.query("SELECT * FROM agent_tasks WHERE id=$1", [task.id]))
        .rows[0];
      return this.view(c, current);
    });
  }

  async reconcileUnknown(
    id: string,
    outcome:
      | {
          state: "FAILED";
          error_code: string;
          retryable: boolean;
          retry_delay_seconds?: number;
          cost_amount_micros?: number;
        }
      | {
          state: "SUCCEEDED" | "PARTIAL";
          provider: string;
          model: string;
          provider_operation_ref?: string;
          cost_amount_micros: number;
          artifacts?: unknown[];
        },
  ) {
    return transaction(async (c) => {
      const selected = await c.query("SELECT * FROM agent_tasks WHERE id=$1 FOR UPDATE", [
        uuid(id),
      ]);
      if (!selected.rowCount) fail(404, "NOT_FOUND", "AI 制作任务不存在");
      const task = selected.rows[0] as RunningTask;
      if ((task as any).state !== "UNKNOWN")
        fail(409, "NOT_UNKNOWN", "仅可对账 UNKNOWN 任务");
      const attempt = await c.query(
        "SELECT * FROM agent_task_attempts WHERE organization_id=$1 AND workspace_id=$2 AND task_id=$3 AND attempt_no=$4 AND state='UNKNOWN' FOR UPDATE",
        [task.organization_id, task.workspace_id, task.id, task.attempt_count],
      );
      if (!attempt.rowCount) fail(409, "UNKNOWN_ATTEMPT_MISSING", "UNKNOWN 执行记录不存在");
      if (outcome.state === "FAILED") {
        const failure = agentReconcileFailureInput.parse({
          error_code: outcome.error_code,
          retryable: outcome.retryable,
          cost_amount_micros: outcome.cost_amount_micros,
          retry_delay_seconds: outcome.retry_delay_seconds,
        });
        const cost = failure.cost_amount_micros;
        const spent = Number(task.spent_amount_micros) + cost;
        const mayRetry =
          failure.retryable &&
          task.attempt_count < task.max_attempts &&
          spent < Number(task.budget_amount_micros);
        const nextState = mayRetry ? "WAITING_RETRY" : "FAILED";
        await c.query(
          "UPDATE agent_task_attempts SET state='FAILED',cost_amount_micros=$2,error_code=$3,retryable=$4 WHERE id=$1",
          [attempt.rows[0].id, cost, failure.error_code, failure.retryable],
        );
        await c.query(
          "UPDATE agent_tasks SET state=$2,spent_amount_micros=$3,reserved_amount_micros=0,next_attempt_at=CASE WHEN $2='WAITING_RETRY' THEN now()+($4::int*interval '1 second') ELSE NULL END,last_error_code=$5,last_error_retryable=$6,version=version+1,updated_at=now() WHERE id=$1",
          [
            task.id,
            nextState,
            spent,
            failure.retry_delay_seconds,
            failure.error_code,
            failure.retryable,
          ],
        );
      } else {
        const { state, ...result } = outcome;
        const parsed = agentAttemptResultInput.parse({
          ...result,
          outcome: state,
          artifacts: outcome.artifacts || [],
        });
        await this.insertArtifacts(
          c,
          task,
          attempt.rows[0].id,
          parsed.provider,
          parsed.model,
          parsed.artifacts,
        );
        await c.query(
          "UPDATE agent_task_attempts SET state=$2,provider=$3,model=$4,provider_operation_ref=$5,cost_amount_micros=$6,error_code=NULL,retryable=false WHERE id=$1",
          [
            attempt.rows[0].id,
            parsed.outcome,
            parsed.provider,
            parsed.model,
            parsed.provider_operation_ref || null,
            parsed.cost_amount_micros,
          ],
        );
        await c.query(
          "UPDATE agent_tasks SET state=$2,spent_amount_micros=spent_amount_micros+$3,reserved_amount_micros=0,last_error_code=NULL,last_error_retryable=NULL,version=version+1,updated_at=now() WHERE id=$1",
          [task.id, parsed.outcome, parsed.cost_amount_micros],
        );
      }
      await this.systemAudit(c, task, "agent-task.unknown-reconciled", {
        attempt_no: task.attempt_count,
        outcome: outcome.state,
      });
      const current = (await c.query("SELECT * FROM agent_tasks WHERE id=$1", [task.id]))
        .rows[0];
      return this.view(c, current);
    });
  }
}
