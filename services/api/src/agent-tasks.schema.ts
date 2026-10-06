import { z } from "zod";

export const agentTaskCreateInput = z
  .object({
    intent: z.enum(["CATALOG_GENERATION", "CATALOG_IMAGE_GENERATION"]),
    budget: z
      .object({
        currency: z.enum(["CNY", "USD", "EUR"]),
        max_amount_micros: z.number().int().min(1).max(1_000_000_000_000),
      })
      .strict(),
    max_attempts: z.number().int().min(1).max(5).default(2),
  })
  .strict();

export const agentArtifactInput = z
  .object({
    logical_key: z.string().trim().min(1).max(120),
    kind: z.enum([
      "FIELD_DRAFT",
      "IMAGE",
      "DETAIL_IMAGE",
      "TEXT",
      "PROVIDER_RECEIPT",
    ]),
    content: z.record(z.string(), z.unknown()).default({}),
    source_refs: z.array(z.string().max(500)).max(50).default([]),
  })
  .strict();

export const agentExternalCallInput = z
  .object({
    provider: z.string().trim().min(1).max(120),
    model: z.string().trim().min(1).max(160),
    estimated_cost_micros: z.number().int().min(0).max(1_000_000_000_000),
  })
  .strict();

export const agentAttemptResultInput = z
  .object({
    provider: z.string().trim().min(1).max(120),
    model: z.string().trim().min(1).max(160),
    provider_operation_ref: z.string().trim().max(500).optional(),
    cost_amount_micros: z.number().int().min(0).max(1_000_000_000_000),
    artifacts: z.array(agentArtifactInput).max(32).default([]),
    outcome: z.enum(["SUCCEEDED", "PARTIAL"]).default("SUCCEEDED"),
  })
  .strict();

export const agentKnownFailureInput = z
  .object({
    error_code: z.string().trim().min(1).max(120),
    retryable: z.boolean(),
    cost_amount_micros: z.number().int().min(0).max(1_000_000_000_000),
    retry_delay_seconds: z.number().int().min(0).max(86_400).default(5),
    provider: z.string().trim().min(1).max(120).optional(),
    model: z.string().trim().min(1).max(160).optional(),
    provider_operation_ref: z.string().trim().max(500).optional(),
  })
  .strict();

export const agentReconcileFailureInput = z
  .object({
    error_code: z.string().trim().min(1).max(120),
    retryable: z.boolean(),
    cost_amount_micros: z.number().int().min(0).max(1_000_000_000_000).default(0),
    retry_delay_seconds: z.number().int().min(0).max(86_400).default(0),
  })
  .strict();

export const agentUnknownInput = z
  .object({
    provider: z.string().trim().min(1).max(120),
    model: z.string().trim().min(1).max(160),
    provider_operation_ref: z.string().trim().max(500).optional(),
  })
  .strict();
