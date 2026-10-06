import OpenAI, { toFile } from "openai";
import type { CatalogGenerationImage } from "./catalog-generation.provider";

export type GeneratedImageRole = "MAIN_IMAGE" | "DETAIL_IMAGE";
export type GeneratedImage = {
  role: GeneratedImageRole;
  bytes: Buffer;
  mime: "image/png";
  operation_ref?: string;
};
export type CatalogImageGenerationInput = {
  catalog_task_id: string;
  input_version: number;
  fields: Record<string, unknown>;
  images: CatalogGenerationImage[];
};
export type CatalogImageGenerationResult = {
  images: GeneratedImage[];
  usage?: unknown;
};

export interface CatalogImageProvider {
  readonly provider: string;
  readonly model: string;
  configured(): boolean;
  reserveCostMicros(): number;
  generate(input: CatalogImageGenerationInput): Promise<CatalogImageGenerationResult>;
}

function reserveCostMicros() {
  const raw = Number(process.env.AI_IMAGE_RESERVE_USD_MICROS || "2000000");
  if (!Number.isInteger(raw) || raw < 1 || raw > 10_000_000_000)
    return 2_000_000;
  return raw;
}

export class OpenAICatalogImageProvider implements CatalogImageProvider {
  readonly provider = "openai";
  get model() {
    return process.env.AI_IMAGE_MODEL || "";
  }
  configured() {
    return Boolean(process.env.OPENAI_API_KEY && this.model);
  }
  reserveCostMicros() {
    return reserveCostMicros();
  }

  private async edit(
    client: OpenAI,
    input: CatalogImageGenerationInput,
    role: GeneratedImageRole,
  ): Promise<GeneratedImage> {
    const files = await Promise.all(
      input.images.slice(0, 4).map((image) =>
        toFile(image.bytes, image.name || "product-image", { type: image.mime }),
      ),
    );
    const rolePrompt =
      role === "MAIN_IMAGE"
        ? "制作一张方形电商主图：主体居中、干净中性背景、自然真实的商品摄影质感，可调整背景和光影但不要改变商品结构。"
        : "制作一张电商详情图视觉：保留完整真实商品主体，可增加留白和信息排版区域，但不要添加未经资料支持的参数、型号、尺寸、适配或性能文字。";
    const prompt = [
      rolePrompt,
      "必须严格保留输入实物的真实几何和零件特征：齿数、孔位、接口、比例、安装方向、颜色和关键结构不得静默改变、增删或美化成另一款产品。",
      "如果无法在不改变实物结构的前提下完成，宁可保持原商品外观并只处理背景。不要生成品牌承诺、价格、库存或适配结论。",
      "人工资料仅用于理解商品类别，不允许覆盖图片中的真实结构：" +
        JSON.stringify(input.fields),
    ].join("\n");
    const response: any = await client.images.edit({
      model: this.model,
      image: files.length === 1 ? files[0] : files,
      prompt,
      size: "1024x1024",
      quality: "medium",
      output_format: "png",
    } as any);
    const item = response?.data?.[0];
    if (!item?.b64_json) throw new Error("PROVIDER_IMAGE_MISSING");
    return {
      role,
      bytes: Buffer.from(item.b64_json, "base64"),
      mime: "image/png",
      operation_ref: item.revised_prompt ? undefined : String(response?.created || ""),
    };
  }

  async generate(input: CatalogImageGenerationInput): Promise<CatalogImageGenerationResult> {
    if (!this.configured()) throw new Error("IMAGE_MODEL_NOT_CONFIGURED");
    if (!input.images.length) throw new Error("INPUT_IMAGES_REQUIRED");
    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: 120_000,
      maxRetries: 0,
    });
    const main = await this.edit(client, input, "MAIN_IMAGE");
    const detail = await this.edit(client, input, "DETAIL_IMAGE");
    return { images: [main, detail] };
  }
}

