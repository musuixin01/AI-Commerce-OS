import { z } from "zod";
import { studioFields } from "../services/api/src/catalog-materials.schema";
export function addMaterialContract(paths: any, schemas: any) {
  const uuid = { type: "string", format: "uuid" },
    integer = { type: "integer", minimum: 1 },
    text = { type: "string" };
  const ref = (name: string) => ({ $ref: "#/components/schemas/" + name });
  schemas.StudioFields = z.toJSONSchema(studioFields);
  const asset = {
    id: uuid,
    name: text,
    mime: { enum: ["image/jpeg", "image/png", "image/webp"] },
    origin: { const: "original" },
    version: { const: 1 },
    sha256: { type: "string", pattern: "^[a-f0-9]{64}$" },
    byte_size: { ...integer, maximum: 10485760 },
    width: integer,
    height: integer,
    preview_url: text,
  };
  schemas.MediaAsset = {
    type: "object",
    required: Object.keys(asset),
    properties: asset,
  };
  const task = {
    id: uuid,
    state: { const: "NEEDS_INPUT" },
    version: integer,
    fields: ref("StudioFields"),
    assets: { type: "array", maxItems: 8, items: ref("MediaAsset") },
    updated_at: { type: "string", format: "date-time" },
  };
  schemas.CatalogTask = {
    type: "object",
    required: Object.keys(task),
    properties: task,
  };
  const summary = {
    id: uuid,
    title: text,
    version: integer,
    asset_count: { type: "integer", minimum: 0, maximum: 8 },
    updated_at: task.updated_at,
  };
  schemas.CatalogTaskSummary = {
    type: "object",
    required: Object.keys(summary),
    properties: summary,
  };
  const input = (properties: any) => ({
    type: "object",
    required: Object.keys(properties),
    additionalProperties: false,
    properties,
  });
  const routes: any[] = [
    [
      "get",
      "/catalog-tasks",
      "ListCatalogTasks",
      undefined,
      { type: "array", maxItems: 30, items: ref("CatalogTaskSummary") },
    ],
    [
      "post",
      "/catalog-tasks",
      "CreateCatalogTask",
      input({ fields: ref("StudioFields") }),
    ],
    ["get", "/catalog-tasks/{id}", "GetCatalogTask"],
    [
      "patch",
      "/catalog-tasks/{id}",
      "SaveCatalogTask",
      input({
        fields: ref("StudioFields"),
        asset_ids: {
          type: "array",
          maxItems: 8,
          uniqueItems: true,
          items: uuid,
        },
      }),
    ],
    [
      "post",
      "/catalog-tasks/{id}/assets",
      "UploadMaterial",
      input({ file: { type: "string", format: "binary" } }),
    ],
    ["get", "/media-assets/{id}/preview", "GetMaterialPreview"],
  ];
  for (const [method, path, operationId, body, response] of routes) {
    const preview = path.endsWith("/preview"),
      upload = path.endsWith("/assets"),
      parameters: any[] = [];
    if (path.includes("{id}"))
      parameters.push({ name: "id", in: "path", required: true, schema: uuid });
    if (method !== "get")
      parameters.push(
        {
          name: "Idempotency-Key",
          in: "header",
          required: true,
          schema: { ...text, minLength: 1, maxLength: 160 },
        },
        {
          name: "X-CSRF-Token",
          in: "header",
          required: false,
          description: "Required with session cookie; not native Bearer.",
          schema: text,
        },
      );
    if (method === "patch" || upload)
      parameters.push({
        name: "If-Match",
        in: "header",
        required: true,
        schema: text,
      });
    const responses: any = {
      [method === "post" ? "201" : "200"]: {
        description: preview ? "Sanitized WebP; private, no-store" : "Success",
        content: {
          [preview ? "image/webp" : "application/json"]: {
            schema: preview
              ? { type: "string", format: "binary" }
              : response || ref("CatalogTask"),
          },
        },
      },
    };
    for (const code of [400, 401, 403, 404, 409, 413, 415, 422, 428, 429, 503])
      responses[code] = {
        description:
          "Rejected request. Domain errors use code/message/details/trace_id/retryable; multipart framework errors may use statusCode/error/message/trace_id.",
        content: { "application/json": { schema: { type: "object" } } },
      };
    paths[path] ??= {};
    paths[path][method] = {
      operationId,
      summary: operationId,
      description:
        "Local preview; active workspace membership, ops/owner writes, MCP denied. List latest 30. One JPEG/PNG/WebP <=10MiB, <=40M pixels, single frame, 8 active assets per task, 100 tasks and 200MiB per org. No AI or publication.",
      parameters,
      security: [{ sessionCookie: [] }, { bearerToken: [] }],
      ...(body
        ? {
            requestBody: {
              required: true,
              content: {
                [upload ? "multipart/form-data" : "application/json"]: {
                  schema: body,
                },
              },
            },
          }
        : {}),
      responses,
    };
  }
}
