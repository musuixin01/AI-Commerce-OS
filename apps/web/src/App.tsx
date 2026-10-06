import WorkPet from "./WorkPet";
import WorkflowPanel from "./WorkflowPanel";
import McpPanel from "./McpPanel";
import KnowledgePanel from "./KnowledgePanel";
import EmployeeHome from "./EmployeeHome";
import CatalogStudio from "./CatalogStudio";
import { CustomerCenter, ShopCenter, InsightCenter } from "./BusinessPanels";
import { useEffect, useState, useRef } from "react";
import type { FormEvent } from "react";
import {
  LayoutDashboard,
  Package,
  CheckCheck,
  ArrowUpRight,
  Plus,
  Search,
  Settings,
  ChevronRight,
  Leaf,
  LogOut,
  FileDown,
  Clock,
  ShieldCheck,
  X,
  LoaderCircle,
  Menu,
  BookOpen,
  Workflow,
  MessageSquare,
  Plug,
  ChartNoAxesCombined,
  Store,
  BarChart3,
} from "lucide-react";
import type { Actor, Product, Approval } from "@commerce/contracts";
import { states } from "@commerce/contracts";
import { api, download } from "./api";
type View =
  | "overview"
  | "products"
  | "approvals"
  | "packages"
  | "settings"
  | "knowledge"
  | "workflow"
  | "support"
  | "mcp"
  | "analysis"
  | "data"
  | "shops";
const navigation = [
  ["overview", "工作台", LayoutDashboard],
  ["products", "商品中心", Package],
  ["support", "客服中心", MessageSquare],
  ["analysis", "市场中心", ChartNoAxesCombined],
  ["data", "数据中心", BarChart3],
  ["shops", "店铺中心", Store],
] as const;
const future = [
  ["approvals", "审批中心", CheckCheck],
  ["packages", "发布记录", FileDown],
  ["workflow", "工作流", Workflow],
  ["knowledge", "知识库", BookOpen],
  ["mcp", "MCP 管理", Plug],
] as const;
const money = (p: Product) =>
  new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: p.currency,
  }).format(p.amount_minor / 100);
export default function App() {
  const [actor, setActor] = useState<Actor | null>(null),
    [view, setView] = useState<View>("overview"),
    [productTab, setProductTab] = useState<"studio" | "list">("studio"),
    [products, setProducts] = useState<Product[]>([]),
    [approvals, setApprovals] = useState<(Approval & { title: string })[]>([]),
    [packs, setPacks] = useState<any[]>([]),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("all"),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [editing, setEditing] = useState<Product | "new" | null>(null),
    [mobileNav, setMobileNav] = useState(false);
  async function refresh() {
    const [p, a, k] = await Promise.all([
      api("/products?limit=100"),
      api("/approvals"),
      api("/packages"),
    ]);
    setProducts(p.data);
    setApprovals(a);
    setPacks(k);
  }
  useEffect(() => {
    api<Actor>("/me")
      .then(async (a) => {
        setActor(a);
        await refresh();
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function login(role: "ops" | "owner") {
    await run(async () => {
      await api("/auth/dev-login", { method: "POST", body: { role } });
      setActor(await api("/me"));
      await refresh();
    });
  }
  function go(v: View) {
    if (["overview", "products", "approvals", "packages"].includes(v)) {
      void refresh().catch((e: Error) => setError(e.message));
    }
    setView(v);
    setMobileNav(false);
    setSearch("");
    setFilter("all");
  }
  const pending = approvals.filter((a) => a.state === "pending"),
    visible = products.filter(
      (p) =>
        (filter === "all" || p.state === filter) &&
        (p.title + p.seller_sku).toLowerCase().includes(search.toLowerCase()),
    );
  async function request(p: Product) {
    await run(async () => {
      await api("/approvals", {
        method: "POST",
        body: { product_id: p.id },
        version: p.version,
      });
      await refresh();
      setNotice("审批已提交，请由另一位有权限的成员审核。");
    });
  }
  async function decide(a: Approval, decision: string) {
    await run(async () => {
      await api("/approvals/" + a.id + "/decisions", {
        method: "POST",
        body: { decision },
        version: a.version,
      });
      await refresh();
      setNotice(
        decision === "approved" ? "已批准，可生成发布包。" : "已退回草稿。",
      );
    });
  }
  async function exportProduct(p: Product) {
    await run(async () => {
      const k = await api("/products/" + p.id + "/export", {
        method: "POST",
        version: p.version,
      });
      download(k.payload, p.seller_sku + "-发布包.json");
      await refresh();
      setNotice("发布包已生成。请人工上传到目标平台；商品尚未自动发布。");
    });
  }
  if (loading)
    return (
      <div className="splash">
        <LoaderCircle className="spin" />
        正在连接工作区…
      </div>
    );
  if (!actor)
    return (
      <main className="login">
        <div className="login-brand">
          <span className="logo">
            <Leaf size={24} />
          </span>
          <span>Commerce OS</span>
        </div>
        <section className="login-card">
          <p className="eyebrow">AI COMMERCE WORKSPACE</p>
          <h1>
            让每一次经营，
            <br />
            更从容。
          </h1>
          <p>从商品资料到审批发布，在一个清晰的工作空间里协作。</p>
          <div className="login-note">
            <ShieldCheck size={20} />
            <span>本地体验环境 · 使用虚构样例数据</span>
          </div>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <button
            className="primary wide"
            disabled={busy}
            onClick={() => login("ops")}
          >
            以运营身份进入 <ArrowUpRight size={18} />
          </button>
          <button
            className="secondary wide"
            disabled={busy}
            onClick={() => login("owner")}
          >
            以审批身份进入
          </button>
          <small>运营提交，审批人确认。两种身份独立授权。</small>
        </section>
        <footer>AI Commerce OS · 为长期经营而设计</footer>
      </main>
    );
  const title = (
    [...navigation, ...future, ["settings", "系统设置", Settings]] as const
  ).find((x) => x[0] === view)?.[1];
  return (
    <div className="shell">
      <aside className={mobileNav ? "sidebar open" : "sidebar"}>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            go("overview");
          }}
        >
          <span className="logo">
            <Leaf size={21} />
          </span>
          <span>
            Commerce<span className="brand-os">OS</span>
          </span>
        </a>
        <div className="workspace">
          <span className="workspace-icon">青</span>
          <div>
            <strong>青禾商贸</strong>
            <small>默认工作区 · 演示</small>
          </div>
        </div>
        <p className="nav-label">日常工作</p>
        <nav>
          {navigation.map(([id, label, Icon]) => (
            <button
              key={id}
              className={view === id ? "nav-item active" : "nav-item"}
              onClick={() => go(id)}
            >
              <Icon size={19} />
              {label}
            </button>
          ))}
          <p className="nav-label">协作与管理</p>
          {future.map(([id, label, Icon]) => (
            <button
              aria-label={label}
              key={id}
              className={view === id ? "nav-item active" : "nav-item"}
              onClick={() => go(id)}
            >
              <Icon size={19} />
              {label}
              {id === "approvals" && pending.length > 0 && (
                <span className="count">{pending.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="environment">
            <span />
            本地开发环境
          </div>
          <button className="nav-item" onClick={() => go("settings")}>
            <Settings size={19} />
            系统设置
          </button>
          <div className="profile">
            <span className="avatar">{actor.name[0]}</span>
            <div>
              <strong>{actor.name}</strong>
              <small>
                {actor.role === "owner" ? "组织负责人 / 审批" : "商品运营"}
              </small>
            </div>
            <button
              aria-label="退出登录"
              className="icon-button"
              onClick={() =>
                run(async () => {
                  await api("/auth/logout", { method: "POST" });
                  setActor(null);
                })
              }
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      {mobileNav && (
        <button
          className="nav-scrim"
          aria-label="关闭导航"
          onClick={() => setMobileNav(false)}
        />
      )}
      <div className="main">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            aria-label="打开导航"
            aria-expanded={mobileNav}
            onClick={() => setMobileNav(!mobileNav)}
          >
            <Menu />
          </button>
          <span>
            工作空间 <ChevronRight size={14} /> <strong>{title}</strong>
          </span>
          <div className="topbar-right">
            <span className="demo-badge">内部体验</span>
            <span className="avatar small">{actor.name[0]}</span>
          </div>
        </header>
        <main className="content">
          {error && (
            <div role="alert" className="banner error">
              {error}
              <button
                className="icon-button"
                aria-label="关闭错误"
                onClick={() => setError("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {notice && (
            <div role="status" className="banner success">
              {notice}
              <button
                className="icon-button"
                aria-label="关闭提示"
                onClick={() => setNotice("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          <div className="page-heading">
            <div>
              <p className="eyebrow">
                {view === "overview"
                  ? "YOUR AI COMMERCE TEAM"
                  : "COMMERCE WORKSPACE"}
              </p>
              <h1>{view === "overview" ? "经营总览" : title}</h1>
              <p>
                {view === "overview"
                  ? "掌握经营全貌，聚焦需要你决定的事。"
                  : view === "products"
                    ? "从原始素材到发布成果，在这里完成商品制作与审核。"
                    : view === "approvals"
                      ? "核对商品内容，再决定是否批准发布包。"
                      : view === "packages"
                        ? "保留每一次导出的内容与审批依据。"
                        : "清晰连接团队、数据与 AI 能力。"}
              </p>
            </div>
            {view === "overview" && (
              <button
                className="primary"
                onClick={() => {
                  go("products");
                  setProductTab("studio");
                }}
              >
                进入商品中心
                <ArrowUpRight size={16} />
              </button>
            )}
            {view === "products" && productTab === "list" && (
              <button className="primary" onClick={() => setEditing("new")}>
                <Plus size={16} />
                新建商品
              </button>
            )}
          </div>
          {view === "overview" && (
            <EmployeeHome
              products={products}
              approvals={pending}
              packageCount={packs.length}
              go={go}
            />
          )}
          {view === "products" && (
            <>
              <div
                className="catalog-nav"
                role="tablist"
                aria-label="商品中心视图"
              >
                <button
                  role="tab"
                  aria-selected={productTab === "studio"}
                  onClick={() => setProductTab("studio")}
                >
                  商品制作
                </button>
                <button
                  role="tab"
                  aria-selected={productTab === "list"}
                  onClick={() => setProductTab("list")}
                >
                  商品列表<span>{products.length}</span>
                </button>
                <div>图文准备 → 审核确认 → 发布</div>
              </div>
              <div hidden={productTab !== "studio"}>
                <CatalogStudio
                  onSaved={async () => {
                    await refresh();
                    setNotice(
                      "文字草稿已保存，图片尚未保存；提交审批后可导出。",
                    );
                    setProductTab("list");
                  }}
                />
              </div>
            </>
          )}
          {view === "products" && productTab === "list" && (
            <section className="panel">
              {view === "products" && (
                <div className="table-toolbar">
                  <div className="tabs">
                    {[
                      ["all", "全部"],
                      ["draft", "草稿"],
                      ["pending", "待审批"],
                      ["approved", "已批准"],
                      ["exported", "已导出"],
                    ].map(([id, label]) => (
                      <button
                        key={id}
                        className={filter === id ? "selected" : ""}
                        onClick={() => setFilter(id)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <label className="search">
                    <Search size={16} />
                    <input
                      aria-label="搜索商品"
                      placeholder="搜索名称或 SKU"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </label>
                </div>
              )}
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>商品信息</th>
                      <th>分类</th>
                      <th>价格</th>
                      <th>状态</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((p, i) => (
                      <tr key={p.id}>
                        <td>
                          <button
                            className="product-cell"
                            onClick={() => setEditing(p)}
                          >
                            <span className={"product-icon tone-" + (i % 3)}>
                              <Package size={25} />
                            </span>
                            <span>
                              <strong>{p.title}</strong>
                              <small>
                                {p.seller_sku} · v{p.version}
                              </small>
                            </span>
                          </button>
                        </td>
                        <td>{p.category}</td>
                        <td className="price">{money(p)}</td>
                        <td>
                          <span className={"status " + p.state}>
                            <i />
                            {states[p.state]}
                          </span>
                        </td>
                        <td>
                          <div className="row-actions">
                            <button
                              className="text-button"
                              onClick={() => setEditing(p)}
                            >
                              详情
                            </button>
                            {p.state === "draft" && (
                              <button
                                className="text-button accent"
                                disabled={busy}
                                onClick={() => request(p)}
                              >
                                提交审批
                              </button>
                            )}
                            {p.state === "approved" && (
                              <button
                                className="text-button accent"
                                disabled={busy}
                                onClick={() => exportProduct(p)}
                              >
                                导出发布包
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {visible.length === 0 && (
                <div className="empty">
                  <Package />
                  <h3>还没有符合条件的商品</h3>
                  <p>新建商品，或调整筛选条件。</p>
                </div>
              )}
              <div className="panel-foot">
                <span>显示 {visible.length} 件商品</span>
                <span>资料来源与审批记录持续保留</span>
              </div>
            </section>
          )}
          {view === "approvals" && (
            <div className="approval-list">
              {pending.length === 0 && (
                <div className="panel empty">
                  <CheckCheck />
                  <h3>所有审批已处理</h3>
                  <p>提交商品后，新任务会出现在这里。</p>
                </div>
              )}
              {pending.map((a) => (
                <section className="panel approval-card" key={a.id}>
                  <div className="approval-head">
                    <span className="status pending">待审批</span>
                    <small>
                      有效至 {new Date(a.expires_at).toLocaleString("zh-CN")}
                    </small>
                  </div>
                  <h2>{a.title}</h2>
                  <p>
                    商品版本 v{a.product_version} · 内容摘要{" "}
                    {a.digest.slice(0, 16)}…
                  </p>
                  <p>批准仅授权生成这份内容的人工发布包。</p>
                  <div className="row-actions">
                    <button
                      className="secondary"
                      onClick={() =>
                        setEditing(
                          products.find((p) => p.id === a.product_id) || null,
                        )
                      }
                    >
                      查看商品资料
                    </button>
                    {actor.role === "owner" && actor.id !== a.requested_by ? (
                      <>
                        <button
                          className="secondary"
                          disabled={busy}
                          onClick={() => decide(a, "rejected")}
                        >
                          退回修改
                        </button>
                        <button
                          className="primary"
                          disabled={busy}
                          onClick={() => decide(a, "approved")}
                        >
                          <CheckCheck size={17} />
                          批准发布包
                        </button>
                      </>
                    ) : (
                      <span className="muted">等待另一位审批人处理</span>
                    )}
                  </div>
                </section>
              ))}
            </div>
          )}
          {view === "packages" && (
            <section className="panel">
              {packs.length === 0 ? (
                <div className="empty">
                  <FileDown />
                  <h3>尚未生成发布包</h3>
                  <p>商品批准后，可在商品中心导出。</p>
                </div>
              ) : (
                packs.map((k) => (
                  <div className="package-row" key={k.id}>
                    <span className="product-icon">
                      <FileDown />
                    </span>
                    <div>
                      <strong>{k.payload.product.title}</strong>
                      <p>
                        {new Date(k.created_at).toLocaleString("zh-CN")} ·
                        人工发布包
                      </p>
                    </div>
                    <button
                      className="secondary"
                      onClick={() => download(k.payload, k.id + ".json")}
                    >
                      下载
                    </button>
                  </div>
                ))
              )}
            </section>
          )}
          {view === "settings" && (
            <section className="panel settings">
              <h2>工作区与接入状态</h2>
              <dl>
                <dt>当前成员</dt>
                <dd>
                  {actor.name} / {actor.role}
                </dd>
                <dt>数据库</dt>
                <dd>PostgreSQL · 服务端持久化</dd>
                <dt>电商连接</dt>
                <dd>尚未授权 · 当前支持人工发布包</dd>
                <dt>AI 模型</dt>
                <dd>配置与可用状态请查看客服中心；生成结果需人工核验。</dd>
                <dt>环境</dt>
                <dd>本地开发，未开放生产登录</dd>
              </dl>
              <p className="muted">
                退出后可切换演示运营 / 审批身份，体验职责分离。
              </p>
            </section>
          )}
          {view === "knowledge" && (
            <KnowledgePanel canPublish={actor.role === "owner"} />
          )}
          {view === "support" && <CustomerCenter connect={() => go("shops")} />}
          {view === "shops" && <ShopCenter />}
          {view === "data" && <InsightCenter connect={() => go("shops")} />}
          {view === "analysis" && (
            <InsightCenter market connect={() => go("shops")} />
          )}
          {view === "workflow" && <WorkflowPanel actor={actor} />}
          {view === "mcp" && <McpPanel owner={actor.role === "owner"} />}
          <footer className="page-footer">
            <span>AI Commerce OS</span>
            <span>清晰协作 · 有据可循</span>
          </footer>
        </main>
      </div>
      <WorkPet pending={pending.length} go={go} />
      {editing && (
        <ProductEditor
          value={editing}
          busy={busy}
          onClose={() => setEditing(null)}
          onSave={(b) =>
            run(async () => {
              await api(
                editing === "new" ? "/products" : "/products/" + editing.id,
                {
                  method: editing === "new" ? "POST" : "PATCH",
                  body: b,
                  version: editing === "new" ? undefined : editing.version,
                },
              );
              await refresh();
              setEditing(null);
              setNotice("商品已保存。修改内容后需要重新审批。");
            })
          }
        />
      )}
    </div>
  );
}
function ProductEditor({
  value,
  busy,
  onClose,
  onSave,
}: {
  value: Product | "new";
  busy: boolean;
  onClose: () => void;
  onSave: (v: unknown) => void;
}) {
  const dialog = useRef<HTMLElement>(null);
  const p = value === "new" ? null : value;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    function trap(e: KeyboardEvent) {
      if (e.key !== "Tab") return;
      const nodes = dialog.current?.querySelectorAll<HTMLElement>(
        "button:not(:disabled),input,textarea,select",
      );
      if (!nodes?.length) return;
      const first = nodes[0],
        last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", trap);
    return () => {
      document.removeEventListener("keydown", trap);
      previous?.focus();
    };
  }, []);
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    onSave({
      title: d.get("title"),
      category: d.get("category"),
      seller_sku: d.get("seller_sku"),
      description: d.get("description"),
      source_refs: d.get("source_refs"),
      amount_minor: Math.round(Number(d.get("price")) * 100),
      currency: d.get("currency"),
    });
  }
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onClose();
    }
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [busy, onClose]);
  return (
    <div className="overlay">
      <section
        ref={dialog}
        className="editor"
        role="dialog"
        aria-modal="true"
        aria-labelledby="editor-title"
      >
        <header>
          <div>
            <p className="eyebrow">PRODUCT DETAILS</p>
            <h2 id="editor-title">{p ? "商品资料" : "新建商品"}</h2>
          </div>
          <button
            className="icon-button"
            aria-label="关闭商品资料"
            disabled={busy}
            onClick={onClose}
          >
            <X />
          </button>
        </header>
        <form onSubmit={submit}>
          <div className="form-body">
            <label>
              商品名称
              <input
                name="title"
                autoFocus
                required
                maxLength={160}
                defaultValue={p?.title}
                placeholder="例如：精密轴承 6205"
              />
            </label>
            <div className="form-grid">
              <label>
                商品分类
                <input
                  name="category"
                  required
                  maxLength={80}
                  defaultValue={p?.category}
                  placeholder="农机配件"
                />
              </label>
              <label>
                商家 SKU
                <input
                  name="seller_sku"
                  required
                  maxLength={80}
                  defaultValue={p?.seller_sku}
                  placeholder="唯一商品编码"
                />
              </label>
              <label>
                销售价格
                <input
                  name="price"
                  required
                  type="number"
                  min="0"
                  max="1000000"
                  step="0.01"
                  defaultValue={p ? p.amount_minor / 100 : undefined}
                  placeholder="0.00"
                />
              </label>
              <label>
                币种
                <select name="currency" defaultValue={p?.currency || "CNY"}>
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
                defaultValue={p?.description}
                placeholder="填写经过核验的规格、适用范围和说明"
              />
            </label>
            <label>
              资料来源
              <textarea
                name="source_refs"
                rows={2}
                maxLength={2000}
                defaultValue={p?.source_refs}
                placeholder="记录供应商资料名称、版本或链接"
              />
            </label>
            <div className="info-note">
              <ShieldCheck size={19} />
              <span>保存修改会使已有审批失效，商品回到草稿状态。</span>
            </div>
          </div>
          <footer>
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={onClose}
            >
              取消
            </button>
            <button className="primary" disabled={busy}>
              {busy ? <LoaderCircle className="spin" size={17} /> : null}
              保存商品
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
