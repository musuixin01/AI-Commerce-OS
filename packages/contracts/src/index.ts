export type ProductState = "draft" | "pending" | "approved" | "exported";
export interface Product {
  id: string;
  title: string;
  category: string;
  description: string;
  seller_sku: string;
  amount_minor: number;
  currency: string;
  source_refs: string;
  state: ProductState;
  version: number;
  updated_at: string;
}
export interface Actor {
  id: string;
  name: string;
  role: "ops" | "owner";
  organization_id: string;
  workspace_id: string;
}
export interface Approval {
  id: string;
  product_id: string;
  requested_by: string;
  approved_by: string | null;
  state: "pending" | "approved" | "rejected";
  digest: string;
  product_version: number;
  expires_at: string;
  version: number;
}
export interface ApiError {
  code: string;
  message: string;
  details: unknown;
  trace_id: string;
  retryable: boolean;
}
export const states: Record<ProductState, string> = {
  draft: "草稿",
  pending: "待审批",
  approved: "已批准",
  exported: "已导出",
};
