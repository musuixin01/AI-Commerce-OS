import { randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import sharp from "sharp";
import { pool } from "./db";
import { CatalogService, Subject } from "./catalog.service";
import { fail, match } from "./domain";
import { LocalMediaStore } from "./media-store";
import type { PoolClient } from "pg";
import { studioFields } from "./catalog-materials.schema";
const catalog = new CatalogService();
const uuid = (v: string) => z.string().uuid().parse(v);
const canWrite = (a: Subject) => {
  if (!["ops", "owner"].includes(a.role))
    fail(403, "FORBIDDEN", "无权编辑制作草稿");
};
let decoding = 0;
export class CatalogTasks {
  private store = new LocalMediaStore();
  async task(
    c: PoolClient | typeof pool,
    a: Subject,
    id: string,
    lock = false,
  ) {
    const r = await c.query(
      "SELECT * FROM catalog_tasks WHERE organization_id=$1 AND workspace_id=$2 AND id=$3" +
        (lock ? " FOR UPDATE" : ""),
      [a.organization_id, a.workspace_id, uuid(id)],
    );
    if (!r.rowCount) fail(404, "NOT_FOUND", "制作草稿不存在");
    return r.rows[0];
  }
  async view(c: PoolClient | typeof pool, a: Subject, t: any) {
    const r = await c.query(
      "SELECT id,name,mime,origin,version,sha256,byte_size,width,height FROM media_assets WHERE organization_id=$1 AND workspace_id=$2 AND task_id=$3 AND id=ANY($4::uuid[])",
      [a.organization_id, a.workspace_id, t.id, t.asset_ids],
    );
    const assets = t.asset_ids
      .map((id: string) => r.rows.find((x) => x.id === id))
      .filter(Boolean)
      .map((x: any) => ({
        ...x,
        preview_url: "/api/v1/media-assets/" + x.id + "/preview",
      }));
    return {
      id: t.id,
      state: t.state,
      version: t.version,
      fields: t.fields,
      assets,
      updated_at: t.updated_at,
    };
  }
  async snapshot(c: PoolClient, a: Subject, t: any) {
    await c.query(
      "INSERT INTO catalog_task_versions(organization_id,workspace_id,task_id,version,fields,asset_ids,created_by)VALUES($1,$2,$3,$4,$5,$6,$7)",
      [
        a.organization_id,
        a.workspace_id,
        t.id,
        t.version,
        t.fields,
        t.asset_ids,
        a.id,
      ],
    );
  }
  async list(a: Subject) {
    const r = await pool.query(
      "SELECT id,fields->>'title' AS title,version,cardinality(asset_ids) AS asset_count,updated_at FROM catalog_tasks WHERE organization_id=$1 AND workspace_id=$2 ORDER BY updated_at DESC,id DESC LIMIT 30",
      [a.organization_id, a.workspace_id],
    );
    return r.rows;
  }
  async get(a: Subject, id: string) {
    return this.view(pool, a, await this.task(pool, a, id));
  }
  async create(a: Subject, key: string | undefined, input: unknown) {
    canWrite(a);
    const b = z.object({ fields: studioFields }).strict().parse(input);
    return catalog.write(a, "catalog-task.create", key, b, async (c, trace) => {
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        "media-quota:" + a.organization_id,
      ]);
      const count = await c.query(
        "SELECT count(*)::int n FROM catalog_tasks WHERE organization_id=$1",
        [a.organization_id],
      );
      if (count.rows[0].n >= 100)
        fail(429, "TASK_QUOTA", "本地预览每组织最多100个制作草稿");
      const r = await c.query(
        "INSERT INTO catalog_tasks(organization_id,workspace_id,created_by,fields)VALUES($1,$2,$3,$4)RETURNING *",
        [a.organization_id, a.workspace_id, a.id, b.fields],
      );
      await this.snapshot(c, a, r.rows[0]);
      await catalog.audit(c, a, "catalog-task.created", r.rows[0].id, trace);
      return this.view(c, a, r.rows[0]);
    });
  }
  async update(
    a: Subject,
    id: string,
    key: string | undefined,
    version: string | undefined,
    input: unknown,
  ) {
    canWrite(a);
    uuid(id);
    const b = z
      .object({
        fields: studioFields,
        asset_ids: z.array(z.string().uuid()).max(8),
      })
      .strict()
      .parse(input);
    if (new Set(b.asset_ids).size !== b.asset_ids.length)
      fail(400, "DUPLICATE_ASSET", "图片不能重复");
    return catalog.write(
      a,
      "catalog-task.update:" + id,
      key,
      { ...b, version },
      async (c, trace) => {
        const t = await this.task(c, a, id, true);
        match(version, t.version);
        const assets = await c.query(
          "SELECT id FROM media_assets WHERE organization_id=$1 AND workspace_id=$2 AND task_id=$3 AND id=ANY($4::uuid[])",
          [a.organization_id, a.workspace_id, id, b.asset_ids],
        );
        if (assets.rowCount !== b.asset_ids.length)
          fail(404, "ASSET_UNAVAILABLE", "原图不存在或不属于此制作草稿");
        const r = await c.query(
          "UPDATE catalog_tasks SET fields=$4,asset_ids=$5,version=version+1,updated_at=now() WHERE organization_id=$1 AND workspace_id=$2 AND id=$3 RETURNING *",
          [a.organization_id, a.workspace_id, id, b.fields, b.asset_ids],
        );
        await this.snapshot(c, a, r.rows[0]);
        await catalog.audit(c, a, "catalog-task.saved", id, trace, {
          version: r.rows[0].version,
        });
        return this.view(c, a, r.rows[0]);
      },
    );
  }
  async upload(
    a: Subject,
    id: string,
    key: string | undefined,
    version: string | undefined,
    file?: { buffer: Buffer; mimetype: string; originalname: string },
  ) {
    canWrite(a);
    await this.task(pool, a, id);
    if (!key || key.length > 160)
      fail(428, "IDEMPOTENCY_REQUIRED", "缺少有效请求标识");
    if (!version) fail(428, "VERSION_REQUIRED", "缺少制作草稿版本");
    if (!file?.buffer?.length || file.buffer.length > 10 * 1024 * 1024)
      fail(413, "IMAGE_SIZE", "请选择10MB以内的图片");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.mimetype))
      fail(415, "IMAGE_TYPE", "仅支持JPG、PNG、WebP原图");
    if (decoding >= 2) fail(429, "IMAGE_BUSY", "图片处理繁忙，请稍后重试");
    let preview: Buffer;
    let width: number, height: number;
    decoding++;
    try {
      const img = sharp(file.buffer, {
        limitInputPixels: 40000000,
        failOn: "warning",
      });
      const m = await img.metadata();
      const formats: Record<string, string> = {
        jpeg: "image/jpeg",
        png: "image/png",
        webp: "image/webp",
      };
      const mime = formats[m.format || ""];
      if (
        !mime ||
        mime !== file.mimetype ||
        (m.pages || 1) !== 1 ||
        !m.width ||
        !m.height
      )
        fail(415, "IMAGE_TYPE", "图片内容与类型不符，或为动画/多页图片");
      width = m.width;
      height = m.height;
      preview = await img
        .rotate()
        .resize({
          width: 1600,
          height: 1600,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 85 })
        .toBuffer();
    } catch (e: any) {
      if (e?.getStatus) throw e;
      fail(
        422,
        "INVALID_IMAGE",
        "图片无法完整解码，请重新导出为JPG、PNG或WebP",
      );
    } finally {
      decoding--;
    }
    const sha = createHash("sha256").update(file.buffer).digest("hex");
    const rawName = file.originalname;
    const decodedName = Buffer.from(rawName, "latin1").toString("utf8");
    const displayName =
      [...rawName].every((c) => c.charCodeAt(0) <= 255) &&
      !decodedName.includes("\ufffd")
        ? decodedName
        : rawName;
    const name =
      displayName.replace(/[\\/\u0000-\u001f\u007f]/g, "_").slice(0, 180) ||
      "原图";
    const assetId = randomUUID(),
      objectKey = a.organization_id + "/" + assetId + ".original",
      previewKey = a.organization_id + "/" + assetId + ".webp";
    const written: string[] = [];
    let committed = false;
    try {
      const result = await catalog.write(
        a,
        "catalog-task.upload:" + id,
        key,
        { sha, name, mime: file.mimetype, version },
        async (c, trace) => {
          await c.query(
            "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
            ["media-quota:" + a.organization_id],
          );
          const t = await this.task(c, a, id, true);
          match(version, t.version);
          if (t.asset_ids.length >= 8)
            fail(422, "IMAGE_LIMIT", "每个制作草稿最多8张原图");
          const used = await c.query(
            "SELECT coalesce(sum(byte_size+preview_size),0)::bigint AS n FROM media_assets WHERE organization_id=$1",
            [a.organization_id],
          );
          if (
            Number(used.rows[0].n) + file.buffer.length + preview.length >
            200 * 1024 * 1024
          )
            fail(429, "MEDIA_QUOTA", "本地预览素材空间已达200MB上限");
          await this.store.put(objectKey, file.buffer);
          written.push(objectKey);
          await this.store.put(previewKey, preview);
          written.push(previewKey);
          await c.query(
            "INSERT INTO media_assets(id,organization_id,workspace_id,task_id,name,mime,sha256,byte_size,preview_size,width,height,object_key,preview_key,created_by)VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)",
            [
              assetId,
              a.organization_id,
              a.workspace_id,
              id,
              name,
              file.mimetype,
              sha,
              file.buffer.length,
              preview.length,
              width,
              height,
              objectKey,
              previewKey,
              a.id,
            ],
          );
          const r = await c.query(
            "UPDATE catalog_tasks SET asset_ids=array_append(asset_ids,$4::uuid),version=version+1,updated_at=now() WHERE organization_id=$1 AND workspace_id=$2 AND id=$3 RETURNING *",
            [a.organization_id, a.workspace_id, id, assetId],
          );
          await this.snapshot(c, a, r.rows[0]);
          await catalog.audit(c, a, "media.uploaded", assetId, trace, {
            task_id: id,
            sha256: sha,
            byte_size: file.buffer.length,
          });
          return this.view(c, a, r.rows[0]);
        },
      );
      committed = true;
      return result;
    } finally {
      if (!committed && written.length) {
        // COMMIT can have an unknown outcome: retain files unless absence is proven.
        const persisted = await pool
          .query("SELECT 1 FROM media_assets WHERE id=$1", [assetId])
          .catch(() => null);
        if (persisted?.rowCount === 0)
          await Promise.all(written.map((k) => this.store.discard(k)));
      }
    }
  }
  async preview(a: Subject, id: string) {
    const r = await pool.query(
      "SELECT preview_key FROM media_assets WHERE organization_id=$1 AND workspace_id=$2 AND id=$3",
      [a.organization_id, a.workspace_id, uuid(id)],
    );
    if (!r.rowCount) fail(404, "NOT_FOUND", "图片不存在");
    try {
      return await this.store.get(r.rows[0].preview_key);
    } catch {
      fail(
        503,
        "MEDIA_UNAVAILABLE",
        "图片暂时不可用，请联系管理员检查素材存储",
      );
    }
  }
}
