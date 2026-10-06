import { z } from "zod";
export const studioFields = z
  .object({
    title: z.string().max(160).default(""),
    category: z.string().max(80).default(""),
    seller_sku: z.string().max(80).default(""),
    price: z
      .string()
      .max(30)
      .regex(/^(?:\d{1,7}(?:\.\d{0,2})?)?$/)
      .default(""),
    currency: z.enum(["CNY", "USD", "EUR"]).default("CNY"),
    description: z.string().max(5000).default(""),
    source_refs: z.string().max(2000).default(""),
  })
  .strict();
