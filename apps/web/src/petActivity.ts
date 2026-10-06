export type PetState = "idle" | "working" | "waiting" | "done" | "error";
export type PetActivity = {
  state: PetState;
  title: string;
  detail: string;
  target: "support" | "workflow";
  count: number;
};
const idle: PetActivity = {
  state: "idle",
  title: "小墨 · 随时待命",
  detail: "当前没有从本页发起的执行任务",
  target: "workflow",
  count: 0,
};
let snapshot = idle,
  generation = 0;
const listeners = new Set<() => void>(),
  active = new Map<symbol, PetActivity>();
function emit(value: PetActivity) {
  snapshot = value;
  listeners.forEach((fn) => fn());
}
export const subscribePet = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
export const getPetActivity = () => snapshot;
export function resetPet() {
  generation++;
  active.clear();
  emit(idle);
}
export function beginPetTask(path: string, body: unknown) {
  const catalogGeneration = /^\/catalog-tasks\/[^/]+\/agent-tasks$/.test(path);
  const imageGeneration =
    catalogGeneration &&
    Boolean(
      body &&
        typeof body === "object" &&
        "intent" in body &&
        (body as { intent?: string }).intent === "CATALOG_IMAGE_GENERATION",
    );
  const target = path.startsWith("/ai-runs") ? "support" : "workflow";
  const title =
    imageGeneration
      ? "正在生成商品主图与详情图"
      : catalogGeneration
      ? "正在整理商品资料"
      : target === "workflow"
      ? "正在执行商品工作流"
      : (body as { profile?: string })?.profile === "catalog"
        ? "正在整理商品资料"
        : "正在生成客服建议";
  const id = Symbol(),
    epoch = generation;
  active.set(id, {
    state: "working",
    title,
    detail: "正在等待执行结果，请稍候",
    target,
    count: 1,
  });
  emit({ ...active.get(id)!, count: active.size });
  return (result?: { state?: string }, failed = false) => {
    if (epoch !== generation) return;
    active.delete(id);
    if (active.size) {
      emit({ ...Array.from(active.values()).at(-1)!, count: active.size });
      return;
    }
    const state =
      failed || ["FAILED", "UNKNOWN"].includes(result?.state || "")
        ? "error"
        : result?.state === "WAITING_APPROVAL"
          ? "waiting"
          : result?.state === "SUCCEEDED"
            ? "done"
            : "waiting";
    emit({
      state,
      target,
      count: 0,
      title:
        state === "error"
          ? "任务需要关注"
          : state === "done"
            ? "这一步完成了"
            : result?.state === "WAITING_APPROVAL"
              ? "等你确认下一步"
              : "查看任务最新状态",
      detail:
        state === "error"
          ? "执行失败或结果未确认，请查看任务记录"
          : state === "done"
            ? imageGeneration
              ? "主图与详情图任务已建立，生成结果需逐张人工确认"
              : catalogGeneration
              ? "AI 建议已生成，等待你核对后应用到草稿"
              : target === "support"
              ? "建议已生成，等待人工核验；未发送"
              : "工作流已完成，请核对人工发布包"
            : result?.state === "WAITING_APPROVAL"
              ? "审批通过后，再继续执行"
              : "请求已返回，请进入任务页核对进度",
    });
  };
}
