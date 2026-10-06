import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { pool, transaction } from "./db";
import { digest, fail, hash, match, preflight, productInput } from "./domain";
export type Subject = {
  id: string;
  organization_id: string;
  workspace_id: string;
  role: string;
  name: string;
  csrf: string;
};
const selection =
  "SELECT p.*,s.seller_sku,s.amount_minor,s.currency FROM products p JOIN skus s ON s.organization_id=p.organization_id AND s.product_id=p.id";
export class CatalogService {
  async get(c: PoolClient | typeof pool, a: Subject, id: string, lock = false) {
    const r = await c.query(
      selection +
        " WHERE p.organization_id=$1 AND p.workspace_id=$2 AND p.id=$3" +
        (lock ? " FOR UPDATE OF p" : ""),
      [a.organization_id, a.workspace_id, id],
    );
    if (!r.rowCount) fail(404, "NOT_FOUND", "商品不存在");
    return r.rows[0];
  }
  async list(a: Subject, query: any) {
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const cursor = query.cursor ? String(query.cursor) : null;
    if (cursor && !/^[0-9a-f-]{36}$/i.test(cursor))
      fail(400, "INVALID_CURSOR", "游标格式错误");
    const r = await pool.query(
      selection +
        " WHERE p.organization_id=$1 AND p.workspace_id=$2 AND ($3::uuid IS NULL OR p.id<$3::uuid) ORDER BY p.id DESC LIMIT $4",
      [a.organization_id, a.workspace_id, cursor, limit + 1],
    );
    return {
      data: r.rows.slice(0, limit),
      meta: {
        next_cursor: r.rows.length > limit ? r.rows[limit - 1].id : null,
        as_of: new Date().toISOString(),
      },
    };
  }
  async audit(
    c: PoolClient,
    a: Subject,
    action: string,
    id: string,
    trace: string,
    details: any = {},
  ) {
    await c.query(
      "INSERT INTO audit_entries(organization_id,workspace_id,actor_id,action,resource_id,trace_id,details)VALUES($1,$2,$3,$4,$5,$6,$7)",
      [a.organization_id, a.workspace_id, a.id, action, id, trace, details],
    );
  }
  async write(
    a: Subject,
    action: string,
    key: string | undefined,
    body: any,
    fn: (c: PoolClient, trace: string) => Promise<any>,
  ) {
    if (!key || key.length > 160)
      fail(428, "IDEMPOTENCY_REQUIRED", "缺少有效的请求标识");
    return transaction(async (c) => {
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        a.organization_id + a.id + action + key,
      ]);
      const active = await c.query(
        "SELECT 1 FROM memberships WHERE user_id=$1 AND organization_id=$2 AND workspace_id=$3 AND active=true FOR SHARE",
        [a.id, a.organization_id, a.workspace_id],
      );
      if (!active.rowCount) fail(403, "MEMBERSHIP_REVOKED", "成员权限已撤销");
      const d = hash(body);
      const old = await c.query(
        "SELECT * FROM idempotency WHERE organization_id=$1 AND actor_id=$2 AND action=$3 AND key=$4",
        [a.organization_id, a.id, action, key],
      );
      if (old.rowCount) {
        if (old.rows[0].digest !== d)
          fail(409, "IDEMPOTENCY_CONFLICT", "请求标识已用于不同内容");
        return old.rows[0].response;
      }
      const result = await fn(c, randomUUID());
      await c.query(
        "INSERT INTO idempotency(organization_id,actor_id,action,key,digest,response)VALUES($1,$2,$3,$4,$5,$6)",
        [a.organization_id, a.id, action, key, d, result],
      );
      return result;
    });
  }
  async save(
    a: Subject,
    key: string | undefined,
    input: unknown,
    id?: string,
    version?: string,
  ) {
    const b = productInput.parse(input);
    return this.write(
      a,
      id ? "product.update:" + id : "product.create",
      key,
      { ...b, version },
      async (c, t) => {
        let p;
        if (id) {
          p = await this.get(c, a, id, true);
          match(version, p.version);
          await c.query(
            "UPDATE approvals SET state='invalidated',version=version+1 WHERE organization_id=$1 AND product_id=$2 AND state IN('pending','approved')",
            [a.organization_id, id],
          );
          await c.query(
            "UPDATE products SET title=$1,category=$2,description=$3,source_refs=$4,state='draft',version=version+1,updated_at=now() WHERE id=$5 AND organization_id=$6",
            [
              b.title,
              b.category,
              b.description,
              b.source_refs,
              id,
              a.organization_id,
            ],
          );
          await c.query(
            "UPDATE skus SET seller_sku=$1,amount_minor=$2,currency=$3 WHERE product_id=$4 AND organization_id=$5",
            [b.seller_sku, b.amount_minor, b.currency, id, a.organization_id],
          );
        } else {
          p = (
            await c.query(
              "INSERT INTO products(organization_id,workspace_id,title,category,description,source_refs)VALUES($1,$2,$3,$4,$5,$6)RETURNING *",
              [
                a.organization_id,
                a.workspace_id,
                b.title,
                b.category,
                b.description,
                b.source_refs,
              ],
            )
          ).rows[0];
          id = p.id;
          await c.query(
            "INSERT INTO skus(organization_id,product_id,seller_sku,amount_minor,currency)VALUES($1,$2,$3,$4,$5)",
            [a.organization_id, id, b.seller_sku, b.amount_minor, b.currency],
          );
        }
        await this.audit(c, a, "product.saved", id!, t);
        return this.get(c, a, id!);
      },
    );
  }
  async request(
    a: Subject,
    key: string | undefined,
    id: string,
    version: string,
  ) {
    return this.write(
      a,
      "approval.request:" + id,
      key,
      { id, version },
      async (c, t) => {
        const p = await this.get(c, a, id, true);
        match(version, p.version);
        if (p.state !== "draft") fail(409, "INVALID_STATE", "仅草稿可提交审批");
        const issues = preflight(p);
        if (issues.length) fail(422, "PREFLIGHT_FAILED", issues.join("；"));
        const result = (
          await c.query(
            "INSERT INTO approvals(organization_id,product_id,product_version,digest,requested_by)VALUES($1,$2,$3,$4,$5)RETURNING *",
            [a.organization_id, id, p.version + 1, digest(p), a.id],
          )
        ).rows[0];
        await c.query(
          "UPDATE products SET state='pending',version=version+1,updated_at=now() WHERE id=$1 AND organization_id=$2",
          [id, a.organization_id],
        );
        await this.audit(c, a, "approval.requested", id, t);
        return result;
      },
    );
  }
  async approvals(a: Subject) {
    return (
      await pool.query(
        "SELECT a.*,p.title FROM approvals a JOIN products p ON p.id=a.product_id AND p.organization_id=a.organization_id WHERE p.organization_id=$1 AND p.workspace_id=$2 ORDER BY a.created_at DESC LIMIT 100",
        [a.organization_id, a.workspace_id],
      )
    ).rows;
  }
  async decide(
    a: Subject,
    key: string | undefined,
    id: string,
    version: string,
    decision: string,
  ) {
    if (a.role !== "owner") fail(403, "FORBIDDEN", "需要审批权限");
    if (!["approved", "rejected"].includes(decision))
      fail(400, "INVALID_DECISION", "审批决定无效");
    return this.write(
      a,
      "approval.decide:" + id,
      key,
      { id, version, decision },
      async (c, t) => {
        const ar = await c.query(
          "SELECT a.* FROM approvals a JOIN products p ON p.id=a.product_id AND p.organization_id=a.organization_id WHERE a.id=$1 AND p.organization_id=$2 AND p.workspace_id=$3",
          [id, a.organization_id, a.workspace_id],
        );
        if (!ar.rowCount) fail(404, "NOT_FOUND", "审批不存在");
        const p = await this.get(c, a, ar.rows[0].product_id, true);
        const ap = (
          await c.query("SELECT * FROM approvals WHERE id=$1 FOR UPDATE", [id])
        ).rows[0];
        match(version, ap.version);
        if (ap.requested_by === a.id)
          fail(403, "SELF_APPROVAL", "申请人不能审批自己的申请");
        if (
          ap.state !== "pending" ||
          p.state !== "pending" ||
          p.version !== ap.product_version ||
          digest(p) !== ap.digest ||
          new Date(ap.expires_at) <= new Date()
        )
          fail(409, "STALE_APPROVAL", "审批已失效，请重新申请");
        await c.query(
          "UPDATE approvals SET state=$1,approved_by=$2,version=version+1,product_version=product_version+1 WHERE id=$3",
          [decision, a.id, id],
        );
        await c.query(
          "UPDATE products SET state=$1,version=version+1,updated_at=now() WHERE id=$2 AND organization_id=$3",
          [
            decision === "approved" ? "approved" : "draft",
            p.id,
            a.organization_id,
          ],
        );
        await this.audit(c, a, "approval." + decision, p.id, t);
        return { id, state: decision };
      },
    );
  }
  async export(
    a: Subject,
    key: string | undefined,
    id: string,
    version: string,
  ) {
    return this.write(
      a,
      "product.export:" + id,
      key,
      { id, version },
      async (c, t) => {
        const p = await this.get(c, a, id, true);
        match(version, p.version);
        if (p.state !== "approved")
          fail(409, "APPROVAL_REQUIRED", "导出需要有效审批");
        const ap = (
          await c.query(
            "SELECT * FROM approvals WHERE organization_id=$1 AND product_id=$2 AND state='approved' AND product_version=$3 AND expires_at>now() ORDER BY created_at DESC LIMIT 1",
            [a.organization_id, id, p.version],
          )
        ).rows[0];
        if (!ap || ap.digest !== digest(p))
          fail(409, "STALE_APPROVAL", "审批已失效");
        const payload = {
          mode: "manual_export",
          notice: "人工发布包，尚未发布到任何电商平台",
          product: {
            title: p.title,
            category: p.category,
            description: p.description,
            source_refs: p.source_refs,
            seller_sku: p.seller_sku,
            amount_minor: p.amount_minor,
            currency: p.currency,
          },
          approval_id: ap.id,
          digest: ap.digest,
        };
        const pack = (
          await c.query(
            "INSERT INTO publication_packages(organization_id,product_id,approval_id,payload)VALUES($1,$2,$3,$4)RETURNING *",
            [a.organization_id, id, ap.id, payload],
          )
        ).rows[0];
        await c.query(
          "UPDATE products SET state='exported',version=version+1,updated_at=now() WHERE id=$1 AND organization_id=$2",
          [id, a.organization_id],
        );
        await c.query(
          "INSERT INTO outbox_events(organization_id,aggregate_id,event_type,payload)VALUES($1,$2,'publication.package.created',$3)",
          [a.organization_id, id, { package_id: pack.id }],
        );
        await this.audit(c, a, "package.exported", id, t, {
          package_id: pack.id,
        });
        return pack;
      },
    );
  }
}
