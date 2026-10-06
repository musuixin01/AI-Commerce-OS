import Spirit from "./Spirit";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ArrowUpRight, ChevronDown, Pause, Play, X } from "lucide-react";
import { getPetActivity, subscribePet } from "./petActivity";
import "./workPet.css";
export default function WorkPet({
  pending,
  go,
}: {
  pending: number;
  go: (v: "support" | "workflow" | "approvals") => void;
}) {
  const task = useSyncExternalStore(subscribePet, getPetActivity),
    [open, setOpen] = useState(false),
    [paused, setPaused] = useState(false),
    [compact, setCompact] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const state = task.state === "idle" && pending > 0 ? "waiting" : task.state;
  const title =
    task.state === "idle" && pending > 0
      ? `有 ${pending} 项待你审批`
      : task.title;
  const detail =
    task.state === "idle" && pending > 0
      ? "成果已准备好，请进入审批中心核对"
      : task.detail;
  useEffect(() => {
    function close(e: KeyboardEvent) {
      if (e.key === "Escape" && open) {
        setOpen(false);
        trigger.current?.focus();
      }
    }
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [open]);
  return (
    <aside
      className={`work-pet ${state} ${paused ? "pet-paused" : ""} ${compact ? "pet-compact" : ""}`}
      aria-label="AI 工作伙伴"
      data-state={state}
    >
      {open && (
        <section className="pet-panel" id="pet-panel" aria-label="工作伙伴详情">
          <header>
            <div>
              <span>YOUR AI COMPANION</span>
              <h2>小墨 · 工作伙伴</h2>
            </div>
            <button
              className="icon-button"
              aria-label="关闭伙伴详情"
              onClick={() => {
                setOpen(false);
                trigger.current?.focus();
              }}
            >
              <X size={16} />
            </button>
          </header>
          <strong>{title}</strong>
          <p>{detail}</p>
          <small>
            跟随本页发起的 AI 建议与工作流请求；刷新后以任务记录为准。
          </small>
          <button
            className="primary wide"
            onClick={() => {
              go(
                task.state === "idle" && pending > 0
                  ? "approvals"
                  : task.target,
              );
              setOpen(false);
            }}
          >
            查看任务详情
            <ArrowUpRight size={14} />
          </button>
          <footer>
            <button onClick={() => setPaused(!paused)}>
              {paused ? <Play size={13} /> : <Pause size={13} />}{" "}
              {paused ? "恢复动画" : "暂停动画"}
            </button>
            <button
              onClick={() => {
                setCompact(!compact);
                setOpen(false);
              }}
            >
              <ChevronDown size={13} />
              {compact ? "展开状态" : "收起状态"}
            </button>
          </footer>
        </section>
      )}
      <button
        ref={trigger}
        className="pet-trigger"
        aria-label="查看 AI 工作伙伴"
        aria-expanded={open}
        aria-controls={open ? "pet-panel" : undefined}
        onClick={() => setOpen(!open)}
      >
        <Spirit state={state} />
        <span className="pet-caption">
          <span className="pet-name">
            小墨 <i /> AI 工作伙伴
          </span>
          <strong aria-live="polite">{title}</strong>
          <small>
            {state === "working"
              ? task.count > 1
                ? `${task.count} 项任务处理中`
                : "处理中 · 点击查看"
              : "点击查看工作状态"}
          </small>
        </span>
        {state === "working" && <span className="pet-progress" />}
      </button>
    </aside>
  );
}
