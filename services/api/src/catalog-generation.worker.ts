import { ZodError } from "zod";
import { AgentTasks } from "./agent-tasks.service";
import {
  OpenAICatalogFieldProvider,
  type CatalogFieldProvider,
  type CatalogGenerationImage,
} from "./catalog-generation.provider";
import { pool } from "./db";
import { LocalMediaStore } from "./media-store";

const activeStates = new Set(["QUEUED", "WAITING_RETRY"]);

export class CatalogGenerationWorker {
  private store = new LocalMediaStore();
  constructor(
    private provider: CatalogFieldProvider = new OpenAICatalogFieldProvider(),
    private runtime: AgentTasks = new AgentTasks(),
    private workerId = `catalog-field-${process.pid}`,
  ) {}

  configured() {
    return this.provider.configured();
  }

  private async loadImages(lease: any): Promise<CatalogGenerationImage[]> {
    const ids = [...new Set((lease.input?.asset_ids || []) as string[])];
    if (!ids.length) return [];
    const result = await pool.query(
      "SELECT id,name,mime,object_key FROM media_assets WHERE organization_id=$1 AND workspace_id=$2 AND task_id=$3 AND id=ANY($4::uuid[])",
      [lease.organization_id, lease.workspace_id, lease.catalog_task_id, ids],
    );
    const ordered = ids
      .map((id) => result.rows.find((row) => row.id === id))
      .filter(Boolean);
    if (ordered.length !== ids.length) throw new Error("INPUT_IMAGE_UNAVAILABLE");
    return Promise.all(
      ordered.map(async (row) => ({
        id: row.id,
        name: row.name,
        mime: row.mime,
        bytes: await this.store.get(row.object_key),
      })),
    );
  }

  async runOnce() {
    if (!this.provider.configured()) return { status: "not_configured" as const };
    const lease = await this.runtime.claimNext(
      this.workerId,
      120,
      "CATALOG_GENERATION",
    );
    if (!lease) return { status: "idle" as const };
    let prepared = false;
    const reserve = this.provider.reserveCostMicros();
    try {
      const images = await this.loadImages(lease);
      if (!images.length)
        return {
          status: "failed" as const,
          task: await this.runtime.failAttempt(lease.task_id, lease.lease_token, {
            error_code: "INPUT_IMAGES_REQUIRED",
            retryable: false,
            retry_delay_seconds: 0,
            cost_amount_micros: 0,
          }),
        };
      const boundary = await this.runtime.prepareExternalCall(
        lease.task_id,
        lease.lease_token,
        {
          provider: this.provider.provider,
          model: this.provider.model,
          estimated_cost_micros: reserve,
        },
      );
      if (!boundary.allowed) return { status: "cancelled" as const, task: boundary };
      prepared = true;
      const result = await this.provider.generate({
        catalog_task_id: lease.catalog_task_id,
        input_version: lease.input_version,
        fields: lease.input.fields || {},
        images,
      });
      const sourceRefs = [
        `catalog-task:${lease.catalog_task_id}:v${lease.input_version}`,
        ...images.map((image) => `media-asset:${image.id}`),
      ];
      return {
        status: "succeeded" as const,
        task: await this.runtime.completeAttempt(lease.task_id, lease.lease_token, {
          provider: this.provider.provider,
          model: this.provider.model,
          provider_operation_ref: result.operation_ref,
          // Internal preview budget accounting uses the configured conservative
          // reservation, not a provider invoice. The raw usage is kept below.
          cost_amount_micros: reserve,
          artifacts: [
            {
              logical_key: "listing-fields",
              kind: "FIELD_DRAFT",
              content: {
                fields: {
                  title: result.output.title,
                  category: result.output.category,
                  description: result.output.description,
                },
                attributes: result.output.attributes,
                unknowns: result.output.unknowns,
                evidence: result.output.evidence,
              },
              source_refs: sourceRefs,
            },
            {
              logical_key: "field-provider-receipt",
              kind: "PROVIDER_RECEIPT",
              content: {
                usage: result.usage || null,
                cost_basis: "configured_reserve_estimate",
                reserved_cost_micros: reserve,
              },
              source_refs: sourceRefs,
            },
          ],
        }),
      };
    } catch (error: any) {
      if (!prepared) {
        return {
          status: "failed" as const,
          task: await this.runtime.failAttempt(lease.task_id, lease.lease_token, {
            error_code: error?.message === "INPUT_IMAGE_UNAVAILABLE"
              ? "INPUT_IMAGE_UNAVAILABLE"
              : "GENERATION_INPUT_UNAVAILABLE",
            retryable: false,
            retry_delay_seconds: 0,
            cost_amount_micros: 0,
          }),
        };
      }
      const status = Number(error?.status);
      if (Number.isFinite(status) || error instanceof ZodError) {
        const retryable = status === 429 || status >= 500;
        return {
          status: "failed" as const,
          task: await this.runtime.failAttempt(lease.task_id, lease.lease_token, {
            error_code:
              error instanceof ZodError
                ? "PROVIDER_OUTPUT_INVALID"
                : `PROVIDER_HTTP_${status}`,
            retryable,
            retry_delay_seconds: retryable ? 10 : 0,
            cost_amount_micros: reserve,
            provider: this.provider.provider,
            model: this.provider.model,
          }),
        };
      }
      return {
        status: "unknown" as const,
        task: await this.runtime.markUnknown(lease.task_id, lease.lease_token, {
          provider: this.provider.provider,
          model: this.provider.model,
        }),
      };
    }
  }
}

export function startCatalogGenerationWorker() {
  const worker = new CatalogGenerationWorker();
  if (!worker.configured()) return { configured: false, stop() {} };
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      let result = await worker.runOnce();
      while (activeStates.has((result as any)?.task?.state)) result = await worker.runOnce();
    } catch (error: any) {
      console.error("catalog generation worker failed", {
        error: error?.name || "Error",
        code: error?.code,
      });
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void tick(), 1200);
  timer.unref();
  setTimeout(() => void tick(), 200).unref();
  return { configured: true, stop: () => clearInterval(timer) };
}

