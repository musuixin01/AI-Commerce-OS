import { z } from "zod";
import { agentTaskCreateInput } from "../services/api/src/agent-tasks.schema";

export function addAgentTaskContract(paths: any, schemas: any) {
  const uuid = { type: "string", format: "uuid" };
  schemas.AgentTaskCreate = z.toJSONSchema(agentTaskCreateInput);
  schemas.AgentTask = {
    type: "object",
    required: [
      "id",
      "catalog_task_id",
      "input_version",
      "input_digest",
      "intent",
      "plan_version",
      "state",
      "budget",
      "max_attempts",
      "attempt_count",
      "version",
      "attempts",
      "artifacts",
    ],
    properties: {
      id: uuid,
      catalog_task_id: uuid,
      input_version: { type: "integer", minimum: 1 },
      input_digest: { type: "string", pattern: "^[a-f0-9]{64}$" },
      intent: { const: "CATALOG_GENERATION" },
      plan_version: { type: "string" },
      state: {
        enum: [
          "QUEUED",
          "RUNNING",
          "WAITING_RETRY",
          "WAITING_CONFIRMATION",
          "SUCCEEDED",
          "PARTIAL",
          "FAILED",
          "UNKNOWN",
          "CANCELLED",
        ],
      },
      budget: {
        type: "object",
        properties: {
          currency: { enum: ["CNY", "USD", "EUR"] },
          max_amount_micros: { type: "integer", minimum: 1 },
          spent_amount_micros: { type: "integer", minimum: 0 },
          reserved_amount_micros: { type: "integer", minimum: 0 },
        },
      },
      max_attempts: { type: "integer", minimum: 1, maximum: 5 },
      attempt_count: { type: "integer", minimum: 0, maximum: 5 },
      next_attempt_at: { type: ["string", "null"], format: "date-time" },
      last_error_code: { type: ["string", "null"] },
      last_error_retryable: { type: ["boolean", "null"] },
      version: { type: "integer", minimum: 1 },
      attempts: { type: "array", items: { type: "object" } },
      artifacts: { type: "array", items: { type: "object" } },
    },
  };

  const errors: any = {};
  for (const code of [400, 401, 403, 404, 409, 428, 503])
    errors[code] = {
      description: "Rejected request",
      content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
    };

  paths["/catalog-tasks/{id}/agent-tasks"] = {
    get: {
      operationId: "ListAgentTasks",
      summary: "ListAgentTasks",
      description:
        "Lists persisted AI execution tasks for one catalog draft. Tasks pin an immutable catalog input version.",
      parameters: [
        { name: "id", in: "path", required: true, schema: uuid },
      ],
      security: [{ sessionCookie: [] }, { bearerToken: [] }],
      responses: {
        "200": {
          description: "Latest tasks",
          content: {
            "application/json": {
              schema: {
                type: "array",
                maxItems: 30,
                items: { $ref: "#/components/schemas/AgentTask" },
              },
            },
          },
        },
        ...errors,
      },
    },
    post: {
      operationId: "CreateAgentTask",
      summary: "CreateAgentTask",
      description:
        "Creates a queued execution record only; it does not itself call a model. If-Match pins the exact catalog draft version. Runtime worker leases, budget reservations, retries and UNKNOWN reconciliation are internal execution contracts.",
      parameters: [
        { name: "id", in: "path", required: true, schema: uuid },
        {
          name: "Idempotency-Key",
          in: "header",
          required: true,
          schema: { type: "string", minLength: 1, maxLength: 160 },
        },
        { name: "If-Match", in: "header", required: true, schema: { type: "string" } },
      ],
      security: [{ sessionCookie: [] }, { bearerToken: [] }],
      requestBody: {
        required: true,
        content: {
          "application/json": { schema: { $ref: "#/components/schemas/AgentTaskCreate" } },
        },
      },
      responses: {
        "201": {
          description: "Persisted queued task; no model execution implied",
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/AgentTask" } },
          },
        },
        ...errors,
      },
    },
  };
  paths["/agent-tasks/{id}"] = {
    get: {
      operationId: "GetAgentTask",
      summary: "GetAgentTask",
      description:
        "Returns task state, immutable input identity, budget/cost, attempts and immutable artifact versions. Lease tokens and provider request keys are never exposed.",
      parameters: [{ name: "id", in: "path", required: true, schema: uuid }],
      security: [{ sessionCookie: [] }, { bearerToken: [] }],
      responses: {
        "200": {
          description: "Agent task",
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/AgentTask" } },
          },
        },
        ...errors,
      },
    },
  };
}
