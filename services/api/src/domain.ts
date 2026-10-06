import { createHash } from "node:crypto";
import { HttpException } from "@nestjs/common";
import { z } from "zod";
export const productInput = z
  .object({
    title: z.string().trim().min(1).max(160),
    category: z.string().trim().min(1).max(80),
    description: z.string().max(5000).default(""),
    source_refs: z.string().max(2000).default(""),
    seller_sku: z.string().trim().min(1).max(80),
    amount_minor: z.number().int().min(0).max(100000000),
    currency: z.enum(["CNY", "USD", "EUR"]),
  })
  .strict();
export const hash = (v: unknown) =>
  createHash("sha256")
    .update(typeof v === "string" ? v : JSON.stringify(v))
    .digest("hex");
export function fail(status: number, code: string, message: string): never {
  throw new HttpException(
    { code, message, details: [], retryable: false },
    status,
  );
}
export function digest(p: any) {
  return hash({
    id: p.id,
    title: p.title,
    category: p.category,
    description: p.description,
    source_refs: p.source_refs,
    seller_sku: p.seller_sku,
    amount_minor: p.amount_minor,
    currency: p.currency,
  });
}
export function match(v: unknown, actual: number) {
  if (v === undefined) fail(428, "VERSION_REQUIRED", "请刷新并携带资源版本");
  if (String(v).replaceAll('"', "") !== String(actual))
    fail(409, "VERSION_CONFLICT", "内容已更新，请刷新后重试");
}
export function preflight(p: any) {
  const issues: string[] = [];
  if (!p.source_refs.trim()) issues.push("请填写商品资料来源");
  if (p.amount_minor <= 0) issues.push("价格必须大于零");
  if (!p.description.trim()) issues.push("请填写商品说明");
  return issues;
}
