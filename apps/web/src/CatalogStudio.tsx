import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  Upload,
  ImagePlus,
  Image,
  FileText,
  Sparkles,
  X,
  ArrowUpRight,
  Check,
  Package,
  ChevronRight,
} from "lucide-react";
import { api, uploadMaterial } from "./api";
type Fields = {
  title: string;
  category: string;
  seller_sku: string;
  price: string;
  currency: string;
  description: string;
  source_refs: string;
};
type Asset = { id: string; name: string; preview_url: string };
type Draft = {
  id: string;
  version: number;
  state: string;
  fields: Fields;
  assets: Asset[];
};
type Summary = {
  id: string;
  title: string;
  version: number;
  asset_count: number;
};
type Capabilities = {
  catalog_generation?: {
    field_draft: "available" | "needs_model_configuration";
    image_generation: "available" | "not_connected";
    cost_basis: string;
  };
};
type AgentArtifact = {
  id: string;
  logical_key: string;
  kind: string;
  version: number;
  content: Record<string, any>;
  source_refs: string[];
};
type AgentTask = {
  id: string;
  intent: "CATALOG_GENERATION" | "CATALOG_IMAGE_GENERATION";
  plan_version?: string;
  state: string;
  input_version: number;
  last_error_code?: string | null;
  artifacts: AgentArtifact[];
  budget: {
    currency: string;
    max_amount_micros: number;
    spent_amount_micros: number;
  };
};
type Photo = {
  id: string;
  name: string;
  url: string;
  file?: File;
  key?: string;
};
const emptyFields: Fields = {
  title: "",
  category: "",
  seller_sku: "",
  price: "",
  currency: "CNY",
  description: "",
  source_refs: "",
};
export default function CatalogStudio({
  onSaved,
}: {
  onSaved: () => Promise<void>;
}) {
  const [photos, setPhotos] = useState<Photo[]>([]),
    [selected, setSelected] = useState(""),
    [preview, setPreview] = useState<"original" | "main" | "detail">(
      "original",
    ),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false),
    [draft, setDraft] = useState<Draft | null>(null),
    [recent, setRecent] = useState<Summary[]>([]),
    [dirty, setDirty] = useState(false),
    [notice, setNotice] = useState(""),
    [capabilities, setCapabilities] = useState<Capabilities | null>(null),
    [agentTask, setAgentTask] = useState<AgentTask | null>(null),
    [generating, setGenerating] = useState(false),
    [imageTask, setImageTask] = useState<AgentTask | null>(null),
    [imageGenerating, setImageGenerating] = useState(false);
  const form = useRef<HTMLFormElement>(null),
    currentDraft = useRef<Draft | null>(null),
    locked = useRef(false);
  const requestKeys = useRef(new Map<string, string>());
  function key(signature: string) {
    let value = requestKeys.current.get(signature);
    if (!value) {
      value = crypto.randomUUID();
      requestKeys.current.set(signature, value);
    }
    return value;
  }
  function accept(next: Draft) {
    currentDraft.current = next;
    setDraft(next);
  }
  async function refreshDrafts() {
    setRecent(await api<Summary[]>("/catalog-tasks"));
  }
  useEffect(() => {
    void refreshDrafts().catch(() =>
      setError("制作草稿列表暂时不可用，请稍后重试。"),
    );
    void api<Capabilities>("/capabilities")
      .then(setCapabilities)
      .catch(() => setCapabilities(null));
  }, []);
  useEffect(() => {
    setAgentTask(null);
    setImageTask(null);
    if (!draft?.id) return;
    void api<AgentTask[]>("/catalog-tasks/" + draft.id + "/agent-tasks")
      .then(async (items) => {
        const field = items.find((item) => item.intent === "CATALOG_GENERATION");
        const image = items.find(
          (item) => item.intent === "CATALOG_IMAGE_GENERATION",
        );
        const [fieldDetail, imageDetail] = await Promise.all([
          field ? api<AgentTask>("/agent-tasks/" + field.id) : Promise.resolve(null),
          image ? api<AgentTask>("/agent-tasks/" + image.id) : Promise.resolve(null),
        ]);
        setAgentTask(fieldDetail);
        setImageTask(imageDetail);
      })
      .catch(() => {});
  }, [draft?.id]);
  useEffect(() => {
    if (!agentTask || !["QUEUED", "RUNNING", "WAITING_RETRY"].includes(agentTask.state))
      return;
    let cancelled = false;
    const timer = window.setInterval(() => {
      void api<AgentTask>("/agent-tasks/" + agentTask.id)
        .then((next) => {
          if (cancelled) return;
          setAgentTask(next);
          if (["SUCCEEDED", "PARTIAL"].includes(next.state))
            setNotice("AI 商品资料已生成，仍需人工核对后才能写入制作草稿。");
        })
        .catch(() => {});
    }, 1200);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [agentTask?.id, agentTask?.state]);
  useEffect(() => {
    if (!imageTask || !["QUEUED", "RUNNING", "WAITING_RETRY"].includes(imageTask.state))
      return;
    let cancelled = false;
    const timer = window.setInterval(() => {
      void api<AgentTask>("/agent-tasks/" + imageTask.id)
        .then((next) => {
          if (cancelled) return;
          setImageTask(next);
          if (["SUCCEEDED", "PARTIAL"].includes(next.state))
            setNotice("AI 主图与详情图已生成，请逐张确认版本后再用于发布。");
        })
        .catch(() => {});
    }, 1200);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [imageTask?.id, imageTask?.state]);
  function readFields(): Fields {
    const d = new FormData(form.current!);
    return Object.fromEntries(
      Object.keys(emptyFields).map((k) => [k, String(d.get(k) || "")]),
    ) as Fields;
  }
  function fillFields(fields: Fields) {
    for (const [k, v] of Object.entries(fields)) {
      const el = form.current?.elements.namedItem(k) as HTMLInputElement | null;
      if (el) el.value = v;
    }
  }
  async function restore(id: string) {
    if (locked.current) return;
    if (dirty && !window.confirm("有未保存的修改，是否放弃并切换制作草稿？"))
      return;
    locked.current = true;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const next = id ? await api<Draft>("/catalog-tasks/" + id) : null;
      currentDraft.current = next;
      setDraft(next);
      requestKeys.current.clear();
      fillFields(next?.fields || emptyFields);
      urls.current.forEach(URL.revokeObjectURL);
      urls.current = [];
      setPhotos(
        next
          ? next.assets.map((a) => ({
              id: a.id,
              name: a.name,
              url: a.preview_url,
            }))
          : [],
      );
      setSelected(next?.assets[0]?.id || "");
      setPreview("original");
      setDirty(false);
      setAgentTask(null);
      setImageTask(null);
      setNotice(
        next
          ? "已恢复服务端制作草稿 · 原图尚未生成"
          : "新制作草稿，保存后可恢复",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      locked.current = false;
      setSaving(false);
    }
  }
  async function persist() {
    if (locked.current) return;
    locked.current = true;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const fields = readFields();
      let t = currentDraft.current;
      if (!t) {
        t = await api<Draft>("/catalog-tasks", {
          method: "POST",
          body: { fields },
          key: key("create:" + JSON.stringify(fields)),
        });
        accept(t);
      }
      const retained = photos.filter((p) => !p.file).map((p) => p.id);
      if (
        (Object.keys(fields) as (keyof Fields)[]).some(
          (k) => fields[k] !== t!.fields[k],
        ) ||
        JSON.stringify(retained) !== JSON.stringify(t.assets.map((a) => a.id))
      ) {
        const body = { fields, asset_ids: retained };
        t = await api<Draft>("/catalog-tasks/" + t.id, {
          method: "PATCH",
          body,
          version: t.version,
          key: key(t.id + ":" + t.version + ":" + JSON.stringify(body)),
        });
        accept(t);
      }
      for (const p of photos.filter((p) => p.file)) {
        t = await uploadMaterial<Draft>(t.id, p.file!, t.version, p.key!);
        accept(t);
        const saved = t.assets[t.assets.length - 1];
        setPhotos((old) =>
          old.map((x) =>
            x.id === p.id
              ? { id: saved.id, name: saved.name, url: saved.preview_url }
              : x,
          ),
        );
        setSelected(saved.id);
      }
      setDirty(false);
      setNotice("素材与进度已保存 · 刷新后可从制作草稿中恢复");
      void refreshDrafts().catch(() =>
        setError("保存成功，但列表刷新失败，请稍后重新打开商品中心。"),
      );
    } catch (e) {
      setError(
        (e as Error).message +
          "；已成功上传的图片保留，未完成部分可重试。版本冲突请先重新载入草稿。",
      );
      void refreshDrafts().catch(() => {});
    } finally {
      locked.current = false;
      setSaving(false);
    }
  }
  const files = useRef<HTMLInputElement>(null),
    urls = useRef<string[]>([]);
  useEffect(() => () => urls.current.forEach(URL.revokeObjectURL), []);
  function add(list: FileList | null) {
    if (locked.current) return;
    if (!list?.length) return;
    const incoming = [...list];
    if (
      incoming.some(
        (f) =>
          !["image/jpeg", "image/png", "image/webp"].includes(f.type) ||
          f.size > 10 * 1024 * 1024,
      )
    ) {
      setError("请使用 10MB 以内的 JPG、PNG 或 WebP 图片。");
      return;
    }
    if (incoming.length + photos.length > 8) {
      setError("最多选择 8 张原图。");
      return;
    }
    const next = incoming.map((f) => ({
      id: crypto.randomUUID(),
      name: f.name,
      file: f,
      key: crypto.randomUUID(),
      url: URL.createObjectURL(f),
    }));
    urls.current.push(...next.map((p) => p.url));
    setPhotos((p) => [...p, ...next]);
    setDirty(true);
    setNotice("");
    setSelected(next[0].id);
    setPreview("original");
    setError("");
  }
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (locked.current) return;
    locked.current = true;
    const d = new FormData(e.currentTarget);
    setSaving(true);
    setError("");
    try {
      await api("/products", {
        method: "POST",
        body: {
          title: d.get("title"),
          category: d.get("category"),
          seller_sku: d.get("seller_sku"),
          amount_minor: Math.round(Number(d.get("price")) * 100),
          currency: d.get("currency"),
          description: d.get("description"),
          source_refs: d.get("source_refs"),
        },
      });
      await onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      locked.current = false;
      setSaving(false);
    }
  }
  async function generateFields() {
    if (locked.current || generating) return;
    if (!draft || dirty) {
      setError("请先保存素材与进度，再基于固定版本启动 AI 生成。");
      return;
    }
    if (!draft.assets.length) {
      setError("请至少保存 1 张真实商品原图后再生成商品资料。");
      return;
    }
    if (capabilities?.catalog_generation?.field_draft !== "available") {
      setError("商品字段 AI 尚未配置。请在 API 环境配置 OPENAI_API_KEY 与 AI_MODEL。");
      return;
    }
    setGenerating(true);
    setError("");
    setNotice("");
    try {
      const next = await api<AgentTask>(
        "/catalog-tasks/" + draft.id + "/agent-tasks",
        {
          method: "POST",
          version: draft.version,
          body: {
            intent: "CATALOG_GENERATION",
            budget: { currency: "USD", max_amount_micros: 2_000_000 },
            max_attempts: 2,
          },
        },
      );
      setAgentTask(next);
      setNotice("AI 任务已建立，正在读取固定版本原图与资料。刷新后也可恢复任务状态。");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGenerating(false);
    }
  }
  const fieldArtifact = [...(agentTask?.artifacts || [])]
    .reverse()
    .find((artifact) => artifact.kind === "FIELD_DRAFT");
  const generatedFields = (fieldArtifact?.content?.fields || {}) as Partial<Fields>;
  function applyGeneratedFields() {
    const currentFields = readFields();
    fillFields({
      ...currentFields,
      title: generatedFields.title || currentFields.title,
      category: generatedFields.category || currentFields.category,
      description: generatedFields.description || currentFields.description,
    });
    setDirty(true);
    setNotice("AI 建议已填入标题、分类和说明；价格、SKU、适配等仍保持人工数据，请核对后保存。");
  }
  async function generateImages() {
    if (locked.current || imageGenerating) return;
    if (!draft || dirty) {
      setError("请先保存素材与进度，再基于固定版本生成主图和详情图。");
      return;
    }
    if (!draft.assets.length) {
      setError("请至少保存 1 张真实商品原图后再生成图片。");
      return;
    }
    if (capabilities?.catalog_generation?.image_generation !== "available") {
      setError("图片生成 AI 尚未配置。请在 API 环境配置 OPENAI_API_KEY 与 AI_IMAGE_MODEL。");
      return;
    }
    setImageGenerating(true);
    setError("");
    setNotice("");
    try {
      const next = await api<AgentTask>(
        "/catalog-tasks/" + draft.id + "/agent-tasks",
        {
          method: "POST",
          version: draft.version,
          body: {
            intent: "CATALOG_IMAGE_GENERATION",
            budget: { currency: "USD", max_amount_micros: 5_000_000 },
            max_attempts: 2,
          },
        },
      );
      setImageTask(next);
      setNotice("图片生成任务已建立，正在按固定原图版本制作主图与详情图。刷新后可恢复状态。");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setImageGenerating(false);
    }
  }
  const mainArtifact = [...(imageTask?.artifacts || [])]
    .reverse()
    .find((artifact) => artifact.kind === "IMAGE");
  const detailArtifact = [...(imageTask?.artifacts || [])]
    .reverse()
    .find((artifact) => artifact.kind === "DETAIL_IMAGE");
  const generatedArtifact =
    preview === "main"
      ? mainArtifact
      : preview === "detail"
        ? detailArtifact
        : undefined;
  async function confirmGenerated(artifact: AgentArtifact) {
    if (!imageTask || artifact.content.review_state === "CONFIRMED") return;
    setSaving(true);
    setError("");
    try {
      await api("/generated-media/" + artifact.content.media_id + "/confirm", {
        method: "POST",
        body: {},
        version: artifact.content.media_version,
      });
      const refreshed = await api<AgentTask>("/agent-tasks/" + imageTask.id);
      setImageTask(refreshed);
      setNotice(
        `${artifact.kind === "IMAGE" ? "主图" : "详情图"} v${artifact.content.media_version} 已确认；确认仅绑定当前生成版本。`,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  const current = photos.find((p) => p.id === selected) || photos[0];
  return (
    <div className="catalog-studio">
      <section className="material-drafts" aria-label="制作草稿管理">
        <div>
          <strong>制作进度</strong>
          <small>
            {draft ? "版本 v" + draft.version : "尚未保存"}
            {dirty ? " · 有未保存修改" : ""}
          </small>
        </div>
        <label>
          <span className="sr-only">恢复制作草稿</span>
          <select
            aria-label="恢复制作草稿"
            value={draft?.id || ""}
            disabled={saving}
            onChange={(e) => void restore(e.target.value)}
          >
            <option value="">新制作草稿</option>
            {draft && (
              <option value={draft.id}>
                {draft.fields.title || "未命名制作草稿"} · {draft.assets.length}{" "}
                张
              </option>
            )}
            {recent
              .filter((t) => t.id !== draft?.id)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title || "未命名制作草稿"} · {t.asset_count} 张
                </option>
              ))}
          </select>
        </label>
        {draft && (
          <button
            className="text-button"
            disabled={saving}
            onClick={() => void restore(draft.id)}
          >
            重新载入草稿
          </button>
        )}
        <button
          className="secondary"
          disabled={saving}
          onClick={() => void restore("")}
        >
          新建制作
        </button>
        <button
          className="primary"
          disabled={saving}
          onClick={() => void persist()}
        >
          {saving ? "正在保存…" : "保存素材与进度"}
        </button>
      </section>
      {notice && (
        <div className="banner success" role="status">
          {notice}
        </div>
      )}

      <div className="studio-process" aria-label="商品制作流程">
        {["导入素材", "生成图文", "审核确认", "发布商品"].map((x, i) => (
          <div
            key={x}
            className={i === (agentTask || imageTask ? 1 : 0) ? "current" : ""}
          >
            <span>{String(i + 1).padStart(2, "0")}</span>
            {x}
            {i < 3 && <ChevronRight size={14} />}
          </div>
        ))}
        <small>制作草稿 · 尚未发布</small>
      </div>
      <section
        className="material-bar"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          add(e.dataTransfer.files);
        }}
      >
        <span className="material-symbol">
          <Upload size={21} />
        </span>
        <div>
          <h2>从商品实拍图开始</h2>
          <p>拖拽图片到这里，或选择文件 · 最多 8 张，每张 10MB</p>
        </div>
        <input
          ref={files}
          className="sr-only"
          aria-label="选择商品图片"
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => {
            add(e.target.files);
            e.target.value = "";
          }}
        />
        <button className="secondary" onClick={() => files.current?.click()}>
          <ImagePlus size={16} />
          {photos.length ? "继续添加" : "上传商品图片"}
        </button>
      </section>
      {error && (
        <div className="banner error" role="alert">
          {error}
        </div>
      )}
      <div className="catalog-columns">
        <section className="catalog-data">
          <header>
            <div>
              <p className="eyebrow">PRODUCT DATA</p>
              <h2>商品发布资料</h2>
            </div>
            <span className="quiet-tag">
              {fieldArtifact
                ? "AI 字段待确认"
                : agentTask
                  ? "AI 任务 · " + agentTask.state
                  : photos.length
                    ? "等待 AI 生成"
                    : "等待导入素材"}
            </span>
          </header>
          <p className="catalog-help">
            AI 只根据已保存原图与人工资料生成待确认建议；价格、SKU、适配与无证据参数不会自动猜测。
          </p>
          <div className="field-generation-panel">
            <div>
              <Sparkles size={16} />
              <span>
                {capabilities?.catalog_generation?.field_draft === "available"
                  ? "视觉识别与商品字段生成已就绪"
                  : "商品字段模型尚未配置"}
              </span>
            </div>
            <button
              type="button"
              className="secondary"
              disabled={
                generating ||
                saving ||
                !draft ||
                dirty ||
                !draft.assets.length ||
                capabilities?.catalog_generation?.field_draft !== "available" ||
                Boolean(
                  agentTask &&
                    ["QUEUED", "RUNNING", "WAITING_RETRY"].includes(agentTask.state),
                )
              }
              onClick={() => void generateFields()}
            >
              {generating
                ? "正在建立任务…"
                : agentTask &&
                    ["QUEUED", "RUNNING", "WAITING_RETRY"].includes(agentTask.state)
                  ? "AI 正在整理资料"
                  : "AI 生成商品资料"}
            </button>
            {!draft || dirty ? (
              <small>先保存素材与进度，AI 才会锁定当前版本执行。</small>
            ) : !draft.assets.length ? (
              <small>至少需要 1 张已保存实拍原图。</small>
            ) : agentTask?.state === "UNKNOWN" ? (
              <small>外部结果未确认，系统不会自动重复调用；需先完成对账。</small>
            ) : agentTask?.state === "FAILED" ? (
              <small>任务失败：{agentTask.last_error_code || "请查看任务记录"}</small>
            ) : (
              <small>生成结果不会自动覆盖草稿，也不会触发商品发布。</small>
            )}
          </div>
          {fieldArtifact && (
            <section className="ai-field-result" aria-label="AI 字段建议">
              <header>
                <div>
                  <strong>AI 字段建议</strong>
                  <small>Artifact v{fieldArtifact.version} · 待人工确认</small>
                </div>
                <button
                  type="button"
                  className="text-button"
                  onClick={applyGeneratedFields}
                >
                  应用到草稿
                </button>
              </header>
              <dl>
                <div>
                  <dt>标题</dt>
                  <dd>{generatedFields.title || "未生成"}</dd>
                </div>
                <div>
                  <dt>分类</dt>
                  <dd>{generatedFields.category || "未生成"}</dd>
                </div>
              </dl>
              {Array.isArray(fieldArtifact.content.unknowns) &&
                fieldArtifact.content.unknowns.length > 0 && (
                  <p>待核验：{fieldArtifact.content.unknowns.join(" · ")}</p>
                )}
            </section>
          )}
          <form
            ref={form}
            onSubmit={save}
            onChange={() => {
              setDirty(true);
              setNotice("");
            }}
          >
            <fieldset
              disabled={saving}
              style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
            >
              <div className="catalog-fieldset">
                <label>
                  商品名称
                  <input
                    name="title"
                    required
                    maxLength={160}
                    placeholder="AI 生成商品标题后，将在这里显示"
                  />
                </label>
                <div className="catalog-form-row">
                  <label>
                    商品分类
                    <input
                      name="category"
                      required
                      maxLength={80}
                      placeholder="待识别商品分类"
                    />
                  </label>
                  <label>
                    商家 SKU
                    <input
                      name="seller_sku"
                      required
                      maxLength={80}
                      placeholder="填写唯一商品编码"
                    />
                  </label>
                </div>
                <div className="catalog-form-row">
                  <label>
                    销售价格
                    <input
                      name="price"
                      required
                      type="number"
                      min="0"
                      max="1000000"
                      step="0.01"
                      placeholder="请核对实际售价"
                    />
                  </label>
                  <label>
                    币种
                    <select name="currency" defaultValue="CNY">
                      <option value="CNY">人民币 CNY</option>
                      <option value="USD">美元 USD</option>
                      <option value="EUR">欧元 EUR</option>
                    </select>
                  </label>
                </div>
                <label>
                  商品说明
                  <textarea
                    name="description"
                    rows={4}
                    maxLength={5000}
                    placeholder="卖点、规格、适用范围与详情文案"
                  />
                </label>
                <label>
                  资料来源
                  <textarea
                    name="source_refs"
                    rows={2}
                    maxLength={2000}
                    placeholder="供应商资料、规格说明或其他可核验来源"
                  />
                </label>
                <div className="catalog-destination">
                  <span>
                    <Package size={15} />
                    目标店铺
                  </span>
                  <strong>尚未连接</strong>
                </div>
              </div>
              <footer className="catalog-actions">
                <p>
                  保存素材与进度可保留原图；下方按钮仅建立文字商品，不含图片、不发布。
                </p>
                <button className="primary" disabled={saving}>
                  {saving ? "正在保存…" : "保存文字草稿"}
                  <Check size={15} />
                </button>
              </footer>
            </fieldset>
          </form>
        </section>
        <section className="catalog-preview">
          <header>
            <div>
              <p className="eyebrow">VISUAL PREVIEW</p>
              <h2>商品图片预览</h2>
            </div>
            <span className="quiet-tag">{photos.length} 张原图</span>
          </header>
          <div className="preview-tabs" role="tablist" aria-label="图片类型">
            {(
              [
                { id: "original", text: "原始图片" },
                { id: "main", text: "商品主图" },
                { id: "detail", text: "详情图片" },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={preview === t.id}
                onClick={() => setPreview(t.id)}
              >
                {t.text}
              </button>
            ))}
          </div>
          <div
            className={
              "image-canvas " + (preview === "detail" ? "detail-canvas" : "")
            }
            role="region"
            aria-label="图片预览"
          >
            {preview === "original" && current ? (
              <>
                <img src={current.url} alt={current.name} />
                <span className="canvas-label">
                  原始素材 · {current.file ? "未保存" : "已保存"} · 未生成
                </span>
              </>
            ) : generatedArtifact ? (
              <>
                <img
                  src={generatedArtifact.content.preview_url}
                  alt={preview === "main" ? "AI 商品主图" : "AI 详情图片"}
                />
                <span className="canvas-label">
                  {preview === "main" ? "商品主图" : "详情图片"} · v
                  {generatedArtifact.content.media_version} · {" "}
                  {generatedArtifact.content.review_state === "CONFIRMED"
                    ? "已确认"
                    : "待确认"}
                </span>
                <div className="generated-review-bar">
                  <span>
                    {generatedArtifact.content.review_state === "CONFIRMED"
                      ? "此版本已由人工确认"
                      : "请核对实物结构、孔位、齿数、方向与文字后确认"}
                  </span>
                  <button
                    type="button"
                    className="secondary"
                    disabled={
                      saving || generatedArtifact.content.review_state === "CONFIRMED"
                    }
                    onClick={() => void confirmGenerated(generatedArtifact)}
                  >
                    {generatedArtifact.content.review_state === "CONFIRMED"
                      ? "已确认此版本"
                      : "确认此版本"}
                  </button>
                </div>
              </>
            ) : (
              <div className="image-canvas-empty">
                <span>
                  {preview === "detail" ? (
                    <FileText size={37} strokeWidth={1} />
                  ) : (
                    <Image size={37} strokeWidth={1} />
                  )}
                </span>
                <h3>
                  {preview === "original"
                    ? "商品原图将在这里显示"
                    : preview === "main"
                      ? "商品主图预览"
                      : "详情图片预览"}
                </h3>
                <p>
                  {preview === "original"
                    ? "上传后可切换查看每一张实拍图。"
                    : capabilities?.catalog_generation?.image_generation === "available"
                      ? "尚未生成该图片类型，可在下方启动 AI 图片任务。"
                      : "图片生成模型尚未配置。"}
                </p>
                {preview === "original" && (
                  <button
                    className="text-button"
                    onClick={() => files.current?.click()}
                  >
                    选择商品图片
                    <ArrowUpRight size={14} />
                  </button>
                )}
              </div>
            )}
          </div>
          {photos.length > 0 && (
            <div className="catalog-thumbnails">
              {photos.map((p) => (
                <div
                  key={p.id}
                  className={p.id === current?.id ? "selected" : ""}
                >
                  <button
                    className="thumbnail-select"
                    aria-label={"预览原图 " + p.name}
                    onClick={() => {
                      setSelected(p.id);
                      setPreview("original");
                    }}
                  >
                    <img src={p.url} alt="" />
                    <span>{p.name}</span>
                  </button>
                  <button
                    className="thumbnail-remove"
                    aria-label={"移除图片 " + p.name}
                    disabled={saving}
                    onClick={() => {
                      URL.revokeObjectURL(p.url);
                      setPhotos((v) => v.filter((x) => x.id !== p.id));
                      setDirty(true);
                      setNotice("移除将在保存素材与进度后生效，历史原件保留。");
                    }}
                  >
                    <X size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="generation-footer">
            <div>
              <Sparkles size={16} />
              <span>主图与详情图生成</span>
            </div>
            <button
              className="secondary wide"
              disabled={
                imageGenerating ||
                saving ||
                !draft ||
                dirty ||
                !draft.assets.length ||
                capabilities?.catalog_generation?.image_generation !== "available" ||
                Boolean(
                  imageTask &&
                    ["QUEUED", "RUNNING", "WAITING_RETRY"].includes(imageTask.state),
                )
              }
              onClick={() => void generateImages()}
            >
              {imageGenerating
                ? "正在建立图片任务…"
                : imageTask &&
                    ["QUEUED", "RUNNING", "WAITING_RETRY"].includes(imageTask.state)
                  ? "AI 正在生成图片"
                  : capabilities?.catalog_generation?.image_generation === "available"
                    ? "AI 生成主图与详情图"
                    : "图片生成模型未配置"}
            </button>
            <p>
              {imageTask?.state === "UNKNOWN"
                ? "外部结果未确认，系统不会自动重复生成；需先完成对账。"
                : imageTask?.state === "FAILED"
                  ? `图片任务失败：${imageTask.last_error_code || "请查看任务记录"}`
                  : mainArtifact || detailArtifact
                    ? "生成图已进入私有版本库；逐张确认后才可作为后续发布成果。"
                    : "保留真实商品主体与关键结构；生成结果需逐张人工确认。"}
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
