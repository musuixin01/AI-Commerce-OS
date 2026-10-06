import { createHash, randomUUID } from "node:crypto";
import sharp from "sharp";
import { z } from "zod";
import { pool, transaction } from "./db";
import { fail } from "./domain";
import type { Subject } from "./catalog.service";
import { CatalogService } from "./catalog.service";
import { match } from "./domain";
import { LocalMediaStore } from "./media-store";
import type { GeneratedImageRole } from "./catalog-image.provider";

const uuid = (value: string) => z.string().uuid().parse(value);
const catalog = new CatalogService();

export class GeneratedMediaService {
  private store = new LocalMediaStore();

  async persist(input: {
    organization_id: string;
    workspace_id: string;
    catalog_task_id: string;
    agent_task_id: string;
    attempt_no: number;
    role: GeneratedImageRole;
    input_version: number;
    input_digest: string;
    provider: string;
    model: string;
    source_asset_ids: string[];
    bytes: Buffer;
    mime: "image/png" | "image/jpeg" | "image/webp";
  }) {
    if (!input.source_asset_ids.length) throw new Error("SOURCE_IMAGES_REQUIRED");
    if (!input.bytes.length || input.bytes.length > 20 * 1024 * 1024)
      throw new Error("GENERATED_IMAGE_SIZE");
    const image = sharp(input.bytes, {
      failOn: "warning",
      limitInputPixels: 67_108_864,
    });
    const metadata = await image.metadata();
    const formats: Record<string, string> = {
      png: "image/png",
      jpeg: "image/jpeg",
      webp: "image/webp",
    };
    if (
      formats[metadata.format || ""] !== input.mime ||
      !metadata.width ||
      !metadata.height ||
      (metadata.pages || 1) !== 1 ||
      metadata.width > 8192 ||
      metadata.height > 8192
    )
      throw new Error("GENERATED_IMAGE_INVALID");
    const preview = await image
      .rotate()
      .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 88 })
      .toBuffer();
    const id = randomUUID();
    const objectKey = `${input.organization_id}/${id}.generated`;
    const previewKey = `${input.organization_id}/${id}.generated.webp`;
    const sha256 = createHash("sha256").update(input.bytes).digest("hex");
    const written: string[] = [];
    let persisted = false;
    try {
      await this.store.put(objectKey, input.bytes);
      written.push(objectKey);
      await this.store.put(previewKey, preview);
      written.push(previewKey);
      const row = await transaction(async (c) => {
        await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
          "generated-media:" + input.organization_id + ":" + input.catalog_task_id,
        ]);
        const version = await c.query(
          "SELECT coalesce(max(version),0)::int+1 AS version FROM generated_media_versions WHERE organization_id=$1 AND workspace_id=$2 AND catalog_task_id=$3 AND role=$4",
          [
            input.organization_id,
            input.workspace_id,
            input.catalog_task_id,
            input.role,
          ],
        );
        const result = await c.query(
          "INSERT INTO generated_media_versions(id,organization_id,workspace_id,catalog_task_id,agent_task_id,attempt_no,role,version,input_version,input_digest,provider,model,source_asset_ids,mime,sha256,byte_size,preview_size,width,height,object_key,preview_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21) RETURNING id,role,version,mime,width,height,sha256,byte_size",
          [
            id,
            input.organization_id,
            input.workspace_id,
            input.catalog_task_id,
            input.agent_task_id,
            input.attempt_no,
            input.role,
            version.rows[0].version,
            input.input_version,
            input.input_digest,
            input.provider,
            input.model,
            input.source_asset_ids,
            input.mime,
            sha256,
            input.bytes.length,
            preview.length,
            metadata.width,
            metadata.height,
            objectKey,
            previewKey,
          ],
        );
        return result.rows[0];
      });
      persisted = true;
      return {
        ...row,
        preview_url: `/api/v1/generated-media/${id}/preview`,
      };
    } finally {
      if (!persisted && written.length) {
        const known = await pool
          .query("SELECT 1 FROM generated_media_versions WHERE id=$1", [id])
          .catch(() => null);
        if (known?.rowCount === 0)
          await Promise.all(written.map((key) => this.store.discard(key)));
      }
    }
  }

  async preview(actor: Subject, id: string) {
    const result = await pool.query(
      `SELECT g.preview_key
       FROM generated_media_versions g
       JOIN agent_artifacts a
         ON a.organization_id=g.organization_id
        AND a.workspace_id=g.workspace_id
        AND a.task_id=g.agent_task_id
        AND a.content->>'media_id'=g.id::text
       WHERE g.organization_id=$1 AND g.workspace_id=$2 AND g.id=$3
       LIMIT 1`,
      [actor.organization_id, actor.workspace_id, uuid(id)],
    );
    if (!result.rowCount) fail(404, "NOT_FOUND", "生成图片不存在或尚未形成可见成果");
    try {
      return await this.store.get(result.rows[0].preview_key);
    } catch {
      fail(503, "MEDIA_UNAVAILABLE", "生成图片暂时不可用，请检查媒体存储");
    }
  }

  async confirm(
    actor: Subject,
    id: string,
    key: string | undefined,
    version: string | undefined,
  ) {
    if (!["ops", "owner"].includes(actor.role))
      fail(403, "FORBIDDEN", "无权确认生成图片");
    uuid(id);
    return catalog.write(
      actor,
      "generated-media.confirm:" + id,
      key,
      { version },
      async (c, trace) => {
        const found = await c.query(
          "SELECT * FROM generated_media_versions WHERE organization_id=$1 AND workspace_id=$2 AND id=$3 FOR UPDATE",
          [actor.organization_id, actor.workspace_id, id],
        );
        if (!found.rowCount) fail(404, "NOT_FOUND", "生成图片不存在");
        match(version, found.rows[0].version);
        const visible = await c.query(
          "SELECT 1 FROM agent_artifacts WHERE organization_id=$1 AND workspace_id=$2 AND task_id=$3 AND content->>'media_id'=$4 LIMIT 1",
          [actor.organization_id, actor.workspace_id, found.rows[0].agent_task_id, id],
        );
        if (!visible.rowCount)
          fail(409, "ARTIFACT_NOT_READY", "生成图片尚未形成可确认成果");
        const updated = await c.query(
          "UPDATE generated_media_versions SET review_state='CONFIRMED',confirmed_by=$4,confirmed_at=coalesce(confirmed_at,now()) WHERE organization_id=$1 AND workspace_id=$2 AND id=$3 RETURNING id,role,version,review_state,confirmed_at",
          [actor.organization_id, actor.workspace_id, id, actor.id],
        );
        await catalog.audit(c, actor, "generated-media.confirmed", id, trace, {
          role: updated.rows[0].role,
          media_version: updated.rows[0].version,
        });
        return updated.rows[0];
      },
    );
  }
}

