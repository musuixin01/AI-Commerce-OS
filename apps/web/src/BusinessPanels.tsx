import { useState } from "react";
import {
  Store,
  MessageSquare,
  ShieldCheck,
  BarChart3,
  ArrowUpRight,
  Search,
  Globe,
  LockKeyhole,
} from "lucide-react";
import AssistantPanel from "./AssistantPanel";
export function CustomerCenter({ connect }: { connect: () => void }) {
  const [tab, setTab] = useState<"conversations" | "assistant">(
    "conversations",
  );
  return (
    <>
      <div className="business-tabs" role="tablist" aria-label="客服视图">
        <button
          role="tab"
          aria-selected={tab === "conversations"}
          onClick={() => setTab("conversations")}
        >
          接待现场
        </button>
        <button
          role="tab"
          aria-selected={tab === "assistant"}
          onClick={() => setTab("assistant")}
        >
          知识建议
        </button>
        <span>
          <span className="tiny-dot neutral" />
          自动接待未启用
        </span>
      </div>
      {tab === "assistant" ? (
        <AssistantPanel />
      ) : (
        <section className="inbox-layout">
          <aside className="inbox-list">
            <h2>
              全部会话<span>0</span>
            </h2>
            <div className="inbox-search">
              <Search size={15} />
              等待店铺消息接入
            </div>
            <div className="inbox-no-items">
              <MessageSquare size={24} />
              <p>暂无买家会话</p>
            </div>
          </aside>
          <div className="conversation-empty">
            <span className="empty-orbit">
              <MessageSquare size={32} />
            </span>
            <h2>AI 接待，全程看得见</h2>
            <p>
              买家的问题、AI 的回复与发送状态，
              <br />
              将在这里实时呈现。
            </p>
            <button className="primary" onClick={connect}>
              查看店铺接入
              <ArrowUpRight size={15} />
            </button>
            <span className="quiet-tag">会话通道待接入 · 当前未发送消息</span>
          </div>
          <aside className="inbox-context">
            <ShieldCheck size={22} />
            <h3>随时接管，放心交给 AI</h3>
            <p>接待开启后，你可以查看回复依据，也可以随时切换为人工。</p>
            <div>
              <span>自动接待</span>
              <strong>未启用</strong>
            </div>
            <div>
              <span>店铺连接</span>
              <strong>未连接</strong>
            </div>
            <div>
              <span>会话控制权</span>
              <strong>暂无会话</strong>
            </div>
          </aside>
        </section>
      )}
    </>
  );
}
export function ShopCenter() {
  return (
    <div className="business-page">
      <section className="business-intro">
        <span className="ai-mark">
          <Store size={23} />
        </span>
        <div>
          <h2>连接店铺，让 AI 开始协作</h2>
          <p>商品、买家消息和经营数据，在一个工作区内管理。</p>
        </div>
      </section>
      <div className="shop-grid">
        {[
          { name: "拼多多", letter: "拼", tone: "pdd" },
          { name: "淘宝 / 天猫", letter: "淘", tone: "taobao" },
          { name: "京东", letter: "京", tone: "jd" },
        ].map((p) => (
          <section className="shop-card" key={p.name}>
            <span className={"platform-mark " + p.tone}>{p.letter}</span>
            <span className="quiet-tag">尚未接入</span>
            <h2>{p.name}</h2>
            <p>商品管理 · 客服消息 · 经营分析</p>
            <div className="shop-capabilities">
              <span>
                店铺授权<small>待接入</small>
              </span>
              <span>
                商品同步<small>待验证</small>
              </span>
              <span>
                消息收发<small>待验证</small>
              </span>
            </div>
            <button disabled className="secondary wide">
              <LockKeyhole size={15} />
              授权入口尚未开放
            </button>
          </section>
        ))}
      </div>
      <div className="shop-footnote">
        <ShieldCheck size={20} />
        <p>
          各平台能力将按实际授权范围启用。当前不会读取店铺、发送消息或发布商品。
        </p>
      </div>
    </div>
  );
}
export function InsightCenter({
  market,
  connect,
}: {
  market?: boolean;
  connect: () => void;
}) {
  return (
    <div className="business-page">
      <div className="insight-metrics">
        {(market
          ? ["需求趋势", "类目机会", "竞争动态", "选品建议"]
          : ["成交金额", "支付订单", "成交转化率", "退款率"]
        ).map((label) => (
          <section key={label}>
            <p>{label}</p>
            <strong>—</strong>
            <small>等待授权数据</small>
          </section>
        ))}
      </div>
      <section className="insight-empty">
        <span className="empty-orbit">
          {market ? <Globe size={32} /> : <BarChart3 size={32} />}
        </span>
        <p className="eyebrow">
          {market ? "MARKET INTELLIGENCE" : "STORE INSIGHTS"}
        </p>
        <h2>
          {market ? "让每一次选品，都有依据" : "看清经营，再做下一步决定"}
        </h2>
        <p>
          {market
            ? "连接有许可的市场数据后，查看趋势、机会与竞品分析。"
            : "连接店铺后，汇总经营数据，查看 AI 诊断与优先行动建议。"}
        </p>
        <button className="primary" onClick={connect}>
          查看店铺接入
          <ArrowUpRight size={16} />
        </button>
        <div className="insight-pillars">
          <span>来源可追溯</span>
          <span>口径可核对</span>
          <span>缺失数据明确标注</span>
        </div>
      </section>
    </div>
  );
}
