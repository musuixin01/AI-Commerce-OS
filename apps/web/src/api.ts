import { beginPetTask, resetPet } from "./petActivity";
let csrf = "";
async function request<T = any>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    version?: number;
    key?: string;
  } = {},
): Promise<T> {
  const r = await fetch("/api/v1" + path, {
    method: options.method || "GET",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(csrf ? { "X-CSRF-Token": csrf } : {}),
      ...(options.method
        ? { "Idempotency-Key": options.key || crypto.randomUUID() }
        : {}),
      ...(options.version !== undefined
        ? { "If-Match": String(options.version) }
        : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const b = await r.json();
  if (!r.ok) throw new Error(b.message || "连接失败，请重试");
  if (b.csrf) csrf = b.csrf;
  return b;
}
export async function uploadMaterial<T>(
  taskId: string,
  file: File,
  version: number,
  key: string,
): Promise<T> {
  const body = new FormData();
  body.append("file", file);
  const r = await fetch("/api/v1/catalog-tasks/" + taskId + "/assets", {
    method: "POST",
    credentials: "include",
    headers: {
      "X-CSRF-Token": csrf,
      "Idempotency-Key": key,
      "If-Match": String(version),
    },
    body,
  });
  const result = await r.json();
  if (!r.ok) throw new Error(result.message || "图片上传失败，请重试");
  return result;
}
export function download(value: unknown, name: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function api<T = any>(
  path: string,
  options: Parameters<typeof request>[1] = {},
): Promise<T> {
  const tracked =
    options.method === "POST" &&
    (path === "/ai-runs" ||
      path === "/workflow-runs" ||
      /^\/catalog-tasks\/[^/]+\/agent-tasks$/.test(path) ||
      /^\/workflow-runs\/[^/]+\/resume$/.test(path));
  const finish = tracked ? beginPetTask(path, options.body) : undefined;
  try {
    const result = await request<T>(path, options);
    finish?.(result as { state?: string });
    if (path === "/auth/logout" || path === "/auth/dev-login") resetPet();
    return result;
  } catch (e) {
    finish?.(undefined, true);
    throw e;
  }
}
