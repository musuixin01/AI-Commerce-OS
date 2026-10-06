import { ZodError } from "zod";
import { AgentTasks } from "./agent-tasks.service";
import {
  OpenAICatalogImageProvider,
  type CatalogImageProvider,
} from "./catalog-image.provider";
import { pool } from "./db";
import { LocalMediaStore } from "./media-store";
import { GeneratedMediaService } from "./generated-media.service";
import type { CatalogGenerationImage } from "./catalog-generation.provider";

export class CatalogImageWorker {
  private store = new LocalMediaStore();
  private generated = new GeneratedMediaService();
  constructor(
    private provider: CatalogImageProvider = new OpenAICatalogImageProvider(),
    private runtime: AgentTasks = new AgentTasks(),
    private workerId = `catalog-image-${process.pid}`,
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
    const rows = ids.map((id) => result.rows.find((row) => row.id === id)).filter(Boolean);
    if (rows.length !== ids.length) throw new Error("INPUT_IMAGE_UNAVAILABLE");
    return Promise.all(
      rows.map(async (row) => ({
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
      240,
      "CATALOG_IMAGE_GENERATION",
    );
    if (!lease) return { status: "idle" as const };
    const reserve = this.provider.reserveCostMicros();
    let prepared = false;
    try {
      const originals = await this.loadImages(lease);
      if (!originals.length)
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
        images: originals,
      });
      const media = [] as any[];
      for (const image of result.images) {
        media.push(
          await this.generated.persist({
            organization_id: lease.organization_id,
            workspace_id: lease.workspace_id,
            catalog_task_id: lease.catalog_task_id,
            agent_task_id: lease.task_id,
            attempt_no: lease.attempt_no,
            role: image.role,
            input_version: lease.input_version,
            input_digest: lease.input_digest,
            provider: this.provider.provider,
            model: this.provider.model,
            source_asset_ids: originals.map((item) => item.id),
            bytes: image.bytes,
            mime: image.mime,
          }),
        );
      }
      const sourceRefs = [
        `catalog-task:${lease.catalog_task_id}:v${lease.input_version}`,
        ...originals.map((image) => `media-asset:${image.id}`),
      ];
      return {
        status: "succeeded" as const,
        task: await this.runtime.completeAttempt(lease.task_id, lease.lease_token, {
          provider: this.provider.provider,
          model: this.provider.model,
          cost_amount_micros: reserve,
          artifacts: media.map((item) => ({
            logical_key: item.role === "MAIN_IMAGE" ? "main-image" : "detail-image",
            kind: item.role === "MAIN_IMAGE" ? "IMAGE" : "DETAIL_IMAGE",
            content: {
              media_id: item.id,
              role: item.role,
              media_version: item.version,
              preview_url: item.preview_url,
              mime: item.mime,
              width: item.width,
              height: item.height,
              sha256: item.sha256,
              review_state: "NEEDS_CONFIRMATION",
              cost_basis: "configured_reserve_estimate",
            },
            source_refs: sourceRefs,
          })),
        }),
      };
    } catch (error: any) {
      if (!prepared) {
        return {
          status: "failed" as const,
          task: await this.runtime.failAttempt(lease.task_id, lease.lease_token, {
            error_code: error?.message === "INPUT_IMAGE_UNAVAILABLE"
              ? "INPUT_IMAGE_UNAVAILABLE"
              : "IMAGE_INPUT_UNAVAILABLE",
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
            error_code: `IMAGE_PROVIDER_${Number.isFinite(status) ? status : "INVALID"}`,
            retryable,
            retry_delay_seconds: retryable ? 15 : 0,
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

export function startCatalogImageWorker() {
  const worker = new CatalogImageWorker();
  if (!worker.configured()) return { configured: false, stop() {} };
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await worker.runOnce();
    } catch (error: any) {
      console.error("catalog image worker failed", {
        error: error?.name || "Error",
        code: error?.code,
      });
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void tick(), 1500);
  timer.unref();
  setTimeout(() => void tick(), 300).unref();
  return { configured: true, stop: () => clearInterval(timer) };
}

