import { writeFileSync } from "node:fs";
import { z } from "zod";
import { productInput } from "../services/api/src/domain";
import { addMaterialContract } from "./material-openapi";
import { addAgentTaskContract } from "./agent-tasks-openapi";
const schemas: any = {
  ProductInput: z.toJSONSchema(productInput),
  Error: {
    type: "object",
    required: ["code", "message", "trace_id", "retryable"],
    properties: {
      code: { type: "string" },
      message: { type: "string" },
      trace_id: { type: "string" },
      retryable: { type: "boolean" },
      details: {},
    },
  },
};
const routes: [string, string, string, any?][] = [
  ["get", "/health", "Health"],
  [
    "post",
    "/auth/dev-login",
    "DevelopmentLogin",
    {
      type: "object",
      required: ["role"],
      properties: {
        role: { enum: ["ops", "owner"] },
        tenant: { enum: ["1", "2"] },
        client: { enum: ["web", "native"] },
      },
    },
  ],
  ["get", "/me", "CurrentSubject"],
  ["post", "/auth/logout", "Logout"],
  ["get", "/products", "ListProducts"],
  [
    "post",
    "/products",
    "CreateProduct",
    { $ref: "#/components/schemas/ProductInput" },
  ],
  ["get", "/products/{id}", "GetProduct"],
  [
    "patch",
    "/products/{id}",
    "UpdateProduct",
    { $ref: "#/components/schemas/ProductInput" },
  ],
  ["post", "/products/{id}/validate", "ValidateProduct"],
  ["post", "/products/{id}/export", "ExportManualPackage"],
  ["get", "/approvals", "ListApprovals"],
  [
    "post",
    "/approvals",
    "RequestApproval",
    {
      type: "object",
      required: ["product_id"],
      properties: { product_id: { type: "string", format: "uuid" } },
    },
  ],
  [
    "post",
    "/approvals/{id}/decisions",
    "DecideApproval",
    {
      type: "object",
      required: ["decision"],
      properties: { decision: { enum: ["approved", "rejected"] } },
    },
  ],
  ["get", "/packages", "ListPackages"],
  ["get", "/audit-entries", "ListAudit"],
  ["get", "/capabilities", "Capabilities"],
  ["get", "/knowledge-documents", "ListDocuments"],
  [
    "post",
    "/knowledge-documents",
    "CreateDocument",
    {
      type: "object",
      required: ["title", "body", "source_ref"],
      properties: {
        title: { type: "string", maxLength: 160 },
        body: { type: "string", maxLength: 20000 },
        source_ref: { type: "string", maxLength: 500 },
      },
    },
  ],
  ["get", "/knowledge-documents/{id}", "GetDocument"],
  ["post", "/knowledge-documents/{id}/publish", "PublishDocument"],
  ["get", "/ai-runs", "ListAiRuns"],
  [
    "post",
    "/ai-runs",
    "GenerateSuggestion",
    {
      type: "object",
      required: ["profile", "prompt", "source_ids"],
      properties: {
        profile: { enum: ["catalog", "support"] },
        prompt: { type: "string", maxLength: 6000 },
        source_ids: {
          type: "array",
          minItems: 1,
          maxItems: 10,
          items: { type: "string", format: "uuid" },
        },
      },
    },
  ],
  ["get", "/workflow-runs", "ListWorkflowRuns"],
  [
    "post",
    "/workflow-runs",
    "StartWorkflow",
    {
      type: "object",
      required: ["product_id"],
      properties: { product_id: { type: "string", format: "uuid" } },
    },
  ],
  ["get", "/workflow-runs/{id}", "GetWorkflowRun"],
  ["post", "/workflow-runs/{id}/resume", "ResumeWorkflow"],
  ["get", "/mcp-tokens", "ListMcpCredentials"],
  [
    "post",
    "/mcp-tokens",
    "CreateMcpCredential",
    {
      type: "object",
      required: ["label"],
      properties: { label: { type: "string", maxLength: 80 } },
    },
  ],
  ["post", "/mcp-tokens/{id}/revoke", "RevokeMcpCredential"],
];
const paths: any = {};
for (const [method, path, id, body] of routes) {
  const parameters: any[] = [];
  if (path.includes("{id}"))
    parameters.push({
      name: "id",
      in: "path",
      required: true,
      schema: { type: "string", format: "uuid" },
    });
  if (!["get"].includes(method) && !path.startsWith("/auth/"))
    parameters.push({
      name: "Idempotency-Key",
      in: "header",
      required: true,
      schema: { type: "string", maxLength: 160 },
    });
  if (
    method === "patch" ||
    (["/approvals", "/workflow-runs"].includes(path) && method === "post") ||
    path.endsWith("/decisions") ||
    path.endsWith("/publish") ||
    path.endsWith("/export")
  )
    parameters.push({
      name: "If-Match",
      in: "header",
      required: true,
      schema: { type: "string" },
    });
  if (path === "/products" && method === "get")
    parameters.push(
      {
        name: "limit",
        in: "query",
        schema: { type: "integer", default: 20, maximum: 100 },
      },
      {
        name: "cursor",
        in: "query",
        schema: { type: "string", format: "uuid" },
      },
    );
  paths[path] ??= {};
  paths[path][method] = {
    operationId: id,
    summary: id,
    parameters,
    security:
      path === "/health" || path === "/auth/dev-login"
        ? []
        : [{ sessionCookie: [] }, { bearerToken: [] }],
    ...(body
      ? {
          requestBody: {
            required: true,
            content: { "application/json": { schema: body } },
          },
        }
      : {}),
    responses: {
      [method === "post" ? "201" : "200"]: {
        description:
          "Success; response fields documented in shared contracts and implementation. Preview contract.",
      },
      "400": { description: "Invalid input" },
      "401": { description: "Unauthenticated" },
      "403": { description: "Scope denied" },
      "404": { description: "Not found or not visible" },
      "409": { description: "Version/state/idempotency conflict" },
      "428": { description: "Required request header missing" },
      "503": { description: "Dependency unavailable" },
    },
  };
}
addMaterialContract(paths, schemas);
addAgentTaskContract(paths, schemas);
writeFileSync(
  "docs/openapi.json",
  JSON.stringify(
    {
      openapi: "3.1.0",
      info: {
        title: "AI Commerce OS internal preview",
        version: "0.1.0",
        description:
          "Loopback development only. Cookie mutations require X-CSRF-Token from /me. MCP bearer tokens only permit whitelisted read endpoints. Response schema expansion is tracked as contract debt.",
      },
      servers: [{ url: "http://127.0.0.1:4100/api/v1" }],
      paths,
      components: {
        schemas,
        securitySchemes: {
          sessionCookie: {
            type: "apiKey",
            in: "cookie",
            name: "commerce_session",
          },
          bearerToken: { type: "http", scheme: "bearer" },
        },
      },
    },
    null,
    2,
  ),
);
console.log(
  "OpenAPI generated: " +
    Object.values(paths).reduce(
      (n: number, p: any) => n + Object.keys(p).length,
      0,
    ) +
    " operations",
);
