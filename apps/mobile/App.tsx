import { useEffect, useState } from "react";
import { StatusBar } from "expo-status-bar";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import type { Product, Actor, Approval } from "../../packages/contracts/src";
const origin = process.env.EXPO_PUBLIC_API_URL || "http://127.0.0.1:4100";
let token = "";
async function api(
  path: string,
  method = "GET",
  body?: unknown,
  version?: number,
) {
  const r = await fetch(origin + "/api/v1" + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + token,
      "Idempotency-Key": Crypto.randomUUID(),
      ...(version ? { "If-Match": String(version) } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const v = await r.json();
  if (!r.ok) throw new Error(v.message || "网络请求失败");
  return v;
}
const labels: Record<string, string> = {
  draft: "草稿",
  pending: "待审批",
  approved: "已批准",
  exported: "已导出",
};
export default function App() {
  const [actor, setActor] = useState<Actor | null>(null),
    [products, setProducts] = useState<Product[]>([]),
    [approvals, setApprovals] = useState<(Approval & { title: string })[]>([]),
    [tab, setTab] = useState("products"),
    [busy, setBusy] = useState(false),
    [ready, setReady] = useState(false),
    [error, setError] = useState(""),
    [selected, setSelected] = useState<Product | null>(null),
    [search, setSearch] = useState("");
  async function refresh() {
    const [p, a] = await Promise.all([
      api("/products?limit=100"),
      api("/approvals"),
    ]);
    setProducts(p.data);
    setApprovals(a);
  }
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    (async () => {
      try {
        token = (await SecureStore.getItemAsync("commerce-session")) || "";
        if (token) {
          setActor(await api("/me"));
          await refresh();
        }
      } catch {
      } finally {
        setReady(true);
      }
    })();
  }, []);
  async function login(role: string) {
    await run(async () => {
      const r = await api("/auth/dev-login", "POST", {
        role,
        client: "native",
      });
      token = r.token;
      await SecureStore.setItemAsync("commerce-session", token);
      setActor(await api("/me"));
      await refresh();
    });
  }
  if (!ready)
    return (
      <View style={s.center}>
        <ActivityIndicator color="#277363" />
      </View>
    );
  return (
    <View style={s.root}>
      <StatusBar style="dark" />
      <View style={s.header}>
        <Text style={s.brand}>Commerce OS</Text>
        <Text style={s.tag}>内部体验</Text>
      </View>
      {error ? (
        <View accessibilityRole="alert" style={s.error}>
          <Text style={s.errorText}>{error}</Text>
        </View>
      ) : null}
      {!actor ? (
        <View style={s.login}>
          <Text style={s.eyebrow}>AI COMMERCE WORKSPACE</Text>
          <Text style={s.hero}>让每一次经营，{"\n"}更从容。</Text>
          <Text style={s.subtitle}>商品、审批与团队协作，随时掌握。</Text>
          <Text style={s.note}>
            仅本地开发环境。Android 需 adb reverse tcp:4100 tcp:4100；iOS
            模拟器需可访问同一后端。
          </Text>
          <Button
            title="以运营身份进入"
            busy={busy}
            onPress={() => login("ops")}
          />
          <Button
            title="以审批身份进入"
            secondary
            busy={busy}
            onPress={() => login("owner")}
          />
        </View>
      ) : (
        <>
          <View style={s.context}>
            <View>
              <Text style={s.contextName}>青禾商贸</Text>
              <Text style={s.subtitle}>默认工作区 · {actor.name}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                run(async () => {
                  await api("/auth/logout", "POST");
                  token = "";
                  await SecureStore.deleteItemAsync("commerce-session");
                  setActor(null);
                })
              }
            >
              <Text style={s.link}>退出</Text>
            </Pressable>
          </View>
          <View style={s.tabs}>
            {[
              ["products", "商品"],
              ["approvals", "审批"],
              ["settings", "设置"],
            ].map(([id, title]) => (
              <Pressable
                accessibilityRole="button"
                key={id}
                onPress={() => {
                  setTab(id);
                  setSelected(null);
                }}
                style={[s.tab, tab === id && s.tabActive]}
              >
                <Text style={tab === id ? s.tabTextActive : s.tabText}>
                  {title}
                </Text>
              </Pressable>
            ))}
          </View>
          <ScrollView
            contentContainerStyle={s.content}
            keyboardShouldPersistTaps="handled"
          >
            {tab === "products" && !selected && (
              <>
                <View style={s.section}>
                  <Text style={s.title}>商品中心</Text>
                  <Pressable
                    onPress={() => run(refresh)}
                    accessibilityRole="button"
                  >
                    <Text style={s.link}>刷新</Text>
                  </Pressable>
                </View>
                <TextInput
                  accessibilityLabel="搜索商品"
                  style={s.input}
                  placeholder="搜索商品名称或 SKU"
                  value={search}
                  onChangeText={setSearch}
                />
                {products
                  .filter((p) => (p.title + p.seller_sku).includes(search))
                  .map((p) => (
                    <Pressable
                      accessibilityRole="button"
                      key={p.id}
                      style={s.card}
                      onPress={() => setSelected(p)}
                    >
                      <View style={s.section}>
                        <Text style={s.cardTitle}>{p.title}</Text>
                        <Text style={s.badge}>{labels[p.state]}</Text>
                      </View>
                      <Text style={s.subtitle}>
                        {p.seller_sku} · {p.category}
                      </Text>
                      <Text style={s.price}>
                        {p.currency} {(p.amount_minor / 100).toFixed(2)}
                      </Text>
                    </Pressable>
                  ))}
                {products.length === 0 && (
                  <Text style={s.note}>暂无商品，请先在桌面端建档。</Text>
                )}
              </>
            )}
            {selected && tab === "products" && (
              <>
                <Pressable onPress={() => setSelected(null)}>
                  <Text style={s.link}>‹ 返回商品列表</Text>
                </Pressable>
                <View style={s.card}>
                  <Text style={s.title}>{selected.title}</Text>
                  <Text style={s.badge}>
                    {labels[selected.state]} · v{selected.version}
                  </Text>
                  <Text style={s.body}>{selected.description}</Text>
                  <Text style={s.eyebrow}>资料来源</Text>
                  <Text style={s.body}>
                    {selected.source_refs || "尚未填写"}
                  </Text>
                  <Text style={s.price}>
                    {selected.currency}{" "}
                    {(selected.amount_minor / 100).toFixed(2)}
                  </Text>
                </View>
                {selected.state === "draft" && (
                  <Button
                    title="提交审批"
                    busy={busy}
                    onPress={() =>
                      run(async () => {
                        await api(
                          "/approvals",
                          "POST",
                          { product_id: selected.id },
                          selected.version,
                        );
                        await refresh();
                        setSelected(null);
                        Alert.alert("已提交", "请由另一位审批人处理。");
                      })
                    }
                  />
                )}
                <Text style={s.note}>
                  编辑资料与下载发布包，请在 Web 或桌面端完成。
                </Text>
              </>
            )}
            {tab === "approvals" && (
              <>
                <Text style={s.title}>待处理审批</Text>
                {approvals
                  .filter((a) => a.state === "pending")
                  .map((a) => (
                    <View key={a.id} style={s.card}>
                      <Text style={s.cardTitle}>{a.title}</Text>
                      <Text style={s.subtitle}>
                        版本 v{a.product_version} · {a.digest.slice(0, 12)}…
                      </Text>
                      <Text style={s.body}>
                        {
                          products.find((p) => p.id === a.product_id)
                            ?.description
                        }
                      </Text>
                      <Text style={s.note}>
                        来源：
                        {
                          products.find((p) => p.id === a.product_id)
                            ?.source_refs
                        }
                      </Text>
                      {actor.role === "owner" && actor.id !== a.requested_by ? (
                        <>
                          <Button
                            title="批准发布包"
                            busy={busy}
                            onPress={() =>
                              Alert.alert(
                                "确认批准",
                                "批准当前版本的人工发布包，不会自动上架。",
                                [
                                  { text: "取消", style: "cancel" },
                                  {
                                    text: "批准",
                                    onPress: () =>
                                      run(async () => {
                                        await api(
                                          "/approvals/" + a.id + "/decisions",
                                          "POST",
                                          { decision: "approved" },
                                          a.version,
                                        );
                                        await refresh();
                                      }),
                                  },
                                ],
                              )
                            }
                          />
                          <Button
                            title="退回修改"
                            secondary
                            busy={busy}
                            onPress={() =>
                              run(async () => {
                                await api(
                                  "/approvals/" + a.id + "/decisions",
                                  "POST",
                                  { decision: "rejected" },
                                  a.version,
                                );
                                await refresh();
                              })
                            }
                          />
                        </>
                      ) : (
                        <Text style={s.note}>等待另一位审批人处理</Text>
                      )}
                    </View>
                  ))}
                {!approvals.some((a) => a.state === "pending") && (
                  <Text style={s.note}>所有审批已处理。</Text>
                )}
              </>
            )}
            {tab === "settings" && (
              <View style={s.card}>
                <Text style={s.title}>工作区设置</Text>
                <Text style={s.body}>
                  当前身份：{actor.name}
                  {"\n"}服务地址：{origin}
                  {"\n"}模式：本地开发{"\n"}平台连接：未授权{"\n"}AI
                  模型：未配置
                </Text>
                <Text style={s.note}>
                  移动端使用系统安全存储保存会话。正式版本还需接入 OIDC/PKCE
                  并完成设备验收。
                </Text>
              </View>
            )}
          </ScrollView>
        </>
      )}
      {busy && <ActivityIndicator style={s.loading} color="#277363" />}
    </View>
  );
}
function Button({
  title,
  onPress,
  busy,
  secondary = false,
}: {
  title: string;
  onPress: () => void;
  busy: boolean;
  secondary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={busy}
      style={[s.button, secondary && s.secondary, busy && { opacity: 0.5 }]}
      onPress={onPress}
    >
      <Text style={[s.buttonText, secondary && { color: "#277363" }]}>
        {title}
      </Text>
    </Pressable>
  );
}
const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#f6f7f9",
    paddingTop: Platform.OS === "ios" ? 54 : 30,
  },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: {
    paddingHorizontal: 24,
    paddingVertical: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#fff",
  },
  brand: { fontSize: 22, fontWeight: "600", color: "#245c4d" },
  tag: { fontSize: 11, color: "#87988a" },
  login: { padding: 30, flex: 1, justifyContent: "center" },
  eyebrow: {
    color: "#7b9989",
    fontSize: 10,
    letterSpacing: 1.5,
    marginBottom: 12,
  },
  hero: {
    fontSize: 34,
    fontWeight: "600",
    lineHeight: 54,
    color: "#253c2f",
    marginBottom: 18,
  },
  subtitle: { color: "#8a998e", fontSize: 12, lineHeight: 22 },
  note: { fontSize: 12, color: "#94a195", lineHeight: 23, marginVertical: 18 },
  button: {
    backgroundColor: "#277363",
    padding: 16,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 12,
  },
  buttonText: { color: "#fff", fontWeight: "500", fontSize: 14 },
  secondary: {
    backgroundColor: "#eef4ee",
    borderWidth: 1,
    borderColor: "#dce8dc",
  },
  context: {
    padding: 24,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  contextName: { fontSize: 17, fontWeight: "600", color: "#354f3c" },
  tabs: {
    flexDirection: "row",
    marginHorizontal: 24,
    borderBottomWidth: 1,
    borderColor: "#e0e8e1",
  },
  tab: { flex: 1, alignItems: "center", paddingVertical: 12 },
  tabActive: { borderBottomWidth: 2, borderColor: "#277363" },
  tabText: { color: "#92a094" },
  tabTextActive: { color: "#277363", fontWeight: "600" },
  content: { padding: 24, paddingBottom: 60 },
  section: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  title: {
    fontSize: 22,
    fontWeight: "600",
    color: "#314e3a",
    marginBottom: 12,
  },
  link: { color: "#277363", fontSize: 13, paddingVertical: 12 },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e1e8e2",
    borderRadius: 10,
    padding: 14,
    marginVertical: 12,
  },
  card: {
    padding: 20,
    borderRadius: 12,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e7ece7",
    marginTop: 14,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "500",
    color: "#35513e",
    flex: 1,
    lineHeight: 24,
  },
  badge: {
    fontSize: 10,
    color: "#749481",
    backgroundColor: "#eef5ed",
    padding: 5,
    borderRadius: 5,
  },
  price: { fontSize: 18, color: "#506c59", marginTop: 15, fontWeight: "500" },
  body: { fontSize: 14, lineHeight: 27, color: "#718578", marginVertical: 15 },
  error: { backgroundColor: "#fff0ec", padding: 14 },
  errorText: { color: "#a85346", fontSize: 12 },
  loading: { position: "absolute", top: 85, right: 20 },
});
