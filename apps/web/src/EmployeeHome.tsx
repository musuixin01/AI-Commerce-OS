import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  Package,
  Check,
  Clock,
  AlertCircle,
  ChevronRight,
  Store,
  MessageSquare,
  BarChart3,
  Layers,
} from "lucide-react";
import type { Product, Approval } from "@commerce/contracts";
import { api } from "./api";
type Destination =
  | "products"
  | "approvals"
  | "workflow"
  | "support"
  | "shops"
  | "data"
  | "packages";
type Run = { id: string; title: string; state: string };
export default function EmployeeHome({
  products,
  approvals,
  packageCount,
  go,
}: {
  products: Product[];
  approvals: (Approval & { title: string })[];
  packageCount: number;
  go: (v: Destination) => void;
}) {
  const [runs, setRuns] = useState<Run[]>([]),
    [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    api<Run[]>("/workflow-runs")
      .then((r) => {
        if (active) setRuns(r);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, []);
  const pending = runs.filter((r) => ["RUNNING", "QUEUED"].includes(r.state));
  const failed = runs.filter((r) => ["FAILED", "UNKNOWN"].includes(r.state));
  const total = products.length;
  return (
    <div className="overview-v3">
      <section className="overview-welcome" aria-label="AI 工作概览">
        <div>
          <p className="eyebrow">YOUR COMMERCE, IN GOOD COMPANY</p>
          <h2>把日常交给 AI，把决定留给你。</h2>
          <p>在这里查看工作进展、审核成果，随时接手需要关注的事情。</p>
        </div>
        <span className="welcome-state">
          <i />
          {error
            ? "任务状态暂不可用"
            : pending.length
              ? `${pending.length} 项任务执行中`
              : approvals.length
                ? `${approvals.length} 项成果待你确认`
                : "工作区已就绪"}
        </span>
      </section>
      <div className="overview-metrics">
        {[
          {
            name: "商品资产",
            value: total,
            foot: "当前已加载商品",
            icon: Package,
            view: "products",
          },
          {
            name: "待审批",
            value: approvals.length,
            foot: "需要你的确认",
            icon: Check,
            view: "approvals",
          },
          {
            name: "执行中",
            value: error ? "—" : pending.length,
            foot: error ? "状态暂不可用" : "当前工作流",
            icon: Clock,
            view: "workflow",
          },
          {
            name: "需处理",
            value: error ? "—" : failed.length,
            foot: "异常与未确认结果",
            icon: AlertCircle,
            view: "workflow",
          },
        ].map(({ name, value, foot, icon: Icon, view }) => (
          <button
            className="overview-metric"
            key={name}
            onClick={() => go(view as Destination)}
          >
            <span>
              {name}
              <Icon size={17} />
            </span>
            <strong>{value}</strong>
            <small>
              {foot}
              <ArrowUpRight size={13} />
            </small>
          </button>
        ))}
      </div>
      <div className="overview-columns">
        <div>
          <section className="overview-card">
            <div className="section-heading">
              <div>
                <p className="eyebrow">BUSINESS OVERVIEW</p>
                <h2>经营概况</h2>
              </div>
              <button className="text-button" onClick={() => go("data")}>
                查看数据
                <ArrowUpRight size={15} />
              </button>
            </div>
            <div className="business-numbers">
              {["成交金额", "支付订单", "成交转化率"].map((x) => (
                <div key={x}>
                  <span>{x}</span>
                  <strong>—</strong>
                </div>
              ))}
            </div>
            <div className="overview-data-empty">
              <BarChart3 size={30} />
              <div>
                <h3>连接店铺，查看完整经营表现</h3>
                <p>销售、转化与经营变化将在这里汇总。</p>
              </div>
              <button className="secondary" onClick={() => go("shops")}>
                查看接入
                <ArrowUpRight size={14} />
              </button>
            </div>
          </section>
          <section className="overview-card">
            <div className="section-heading">
              <div>
                <p className="eyebrow">WORK IN PROGRESS</p>
                <h2>任务动态</h2>
              </div>
              <button className="text-button" onClick={() => go("workflow")}>
                全部任务
                <ArrowUpRight size={15} />
              </button>
            </div>
            {error ? (
              <div className="employee-empty">
                暂时无法读取任务状态，请前往工作流重试。
              </div>
            ) : runs.length === 0 ? (
              <div className="employee-empty">
                <Clock size={24} />
                <h3>暂无任务动态</h3>
                <p>从商品中心开始，执行进度将在这里汇总。</p>
              </div>
            ) : (
              runs.slice(0, 5).map((r) => (
                <button
                  key={r.id}
                  className="activity-row"
                  onClick={() => go("workflow")}
                >
                  <span className="activity-icon">
                    <Layers size={17} />
                  </span>
                  <span>
                    <strong>{r.title}</strong>
                    <small>商品审批 · 人工发布包</small>
                  </span>
                  <span className="activity-state">
                    {(
                      {
                        WAITING_APPROVAL: "等待审批",
                        RUNNING: "执行中",
                        QUEUED: "排队中",
                        SUCCEEDED: "已完成",
                        FAILED: "需处理",
                      } as Record<string, string>
                    )[r.state] || r.state}
                  </span>
                  <ChevronRight size={14} />
                </button>
              ))
            )}
          </section>
        </div>
        <aside>
          <section className="overview-card">
            <div className="section-heading">
              <div>
                <p className="eyebrow">YOUR ATTENTION</p>
                <h2>待你确认</h2>
              </div>
              <span className="quiet-tag">{approvals.length} 项</span>
            </div>
            {approvals.length ? (
              approvals.slice(0, 3).map((a) => (
                <button
                  className="approval-summary"
                  key={a.id}
                  onClick={() => go("approvals")}
                >
                  <span className="approval-summary-icon">
                    <Package size={18} />
                  </span>
                  <span>
                    <strong>{a.title}</strong>
                    <small>商品版本 v{a.product_version} · 待审批</small>
                  </span>
                  <ChevronRight size={14} />
                </button>
              ))
            ) : (
              <div className="decision-clear">
                <span>
                  <Check size={25} />
                </span>
                <h3>当前没有待确认事项</h3>
                <p>需要你决定时，我们会把成果放在这里。</p>
              </div>
            )}
            <button className="primary wide" onClick={() => go("approvals")}>
              进入审批中心
              <ArrowUpRight size={15} />
            </button>
          </section>
          <section className="overview-card">
            <p className="eyebrow">WORKSPACE</p>
            <h2>工作区状态</h2>
            <div className="overview-state">
              <span>
                <Store size={15} />
                店铺连接
              </span>
              <strong>未连接</strong>
            </div>
            <div className="overview-state">
              <span>
                <MessageSquare size={15} />
                自动接待
              </span>
              <strong>未启用</strong>
            </div>
            <div className="overview-state">
              <span>
                <Package size={15} />
                人工发布包
              </span>
              <strong>{packageCount} 份</strong>
            </div>
            <p className="overview-state-note">
              仅展示当前真实状态。连接店铺后启用经营数据与消息同步。
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
