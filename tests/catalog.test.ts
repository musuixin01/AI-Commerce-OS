import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createApp } from "../services/api/src/app";
import { pool } from "../services/api/src/db";
let app: any, base: string;
type Client = { cookie: string; csrf: string };
let ops: Client, owner: Client, other: Client;
async function call(
  client: Client | undefined,
  path: string,
  method = "GET",
  body?: unknown,
  version?: number,
  key = randomUUID(),
) {
  const r = await fetch(base + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(client ? { Cookie: client.cookie, "X-CSRF-Token": client.csrf } : {}),
      "Idempotency-Key": key,
      ...(version ? { "If-Match": String(version) } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, body: await r.json(), headers: r.headers };
}
async function login(role: string, tenant = "1") {
  const r = await call(undefined, "/auth/dev-login", "POST", { role, tenant });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return {
    cookie: r.headers.get("set-cookie")!.split(";")[0],
    csrf: r.body.csrf,
  };
}
const input = () => ({
  title: "测试商品",
  category: "测试分类",
  description: "已核验测试规格",
  source_refs: "自动化测试资料 v1",
  seller_sku: "TEST-" + randomUUID(),
  amount_minor: 12900,
  currency: "CNY",
});
before(async () => {
  app = await createApp();
  await app.listen(0, "127.0.0.1");
  base = (await app.getUrl()) + "/api/v1";
  ops = await login("ops");
  owner = await login("owner");
  other = await login("ops", "2");
});
after(async () => {
  await app?.close();
  await pool.end();
});
test("unauthenticated requests cannot read products", async () => {
  assert.equal((await call(undefined, "/products")).status, 401);
});
test("create, idempotency, isolation, approval and export transaction", async () => {
  const data = input(),
    key = randomUUID();
  const r = await call(ops, "/products", "POST", data, undefined, key);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const id = r.body.id;
  assert.equal(
    (await call(ops, "/products", "POST", data, undefined, key)).body.id,
    id,
  );
  assert.equal(
    (
      await call(
        ops,
        "/products",
        "POST",
        { ...data, title: "冲突" },
        undefined,
        key,
      )
    ).status,
    409,
  );
  assert.equal((await call(other, "/products/" + id)).status, 404);
  assert.equal(
    (await call(other, "/products/" + id, "PATCH", data, 1)).status,
    404,
  );
  assert.equal(
    (await call(ops, "/products/" + id + "/export", "POST", {}, 1)).status,
    409,
  );
  const a = await call(ops, "/approvals", "POST", { product_id: id }, 1);
  assert.equal(a.status, 201, JSON.stringify(a.body));
  assert.equal(
    (
      await call(
        ops,
        "/approvals/" + a.body.id + "/decisions",
        "POST",
        { decision: "approved" },
        1,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await call(
        owner,
        "/approvals/" + a.body.id + "/decisions",
        "POST",
        { decision: "approved" },
        1,
      )
    ).status,
    201,
  );
  const p = (await call(ops, "/products/" + id)).body;
  const expKey = randomUUID();
  const ex = await call(
    ops,
    "/products/" + id + "/export",
    "POST",
    {},
    p.version,
    expKey,
  );
  assert.equal(ex.status, 201, JSON.stringify(ex.body));
  assert.equal(ex.body.payload.mode, "manual_export");
  assert.equal(
    (
      await call(
        ops,
        "/products/" + id + "/export",
        "POST",
        {},
        p.version,
        expKey,
      )
    ).body.id,
    ex.body.id,
  );
  assert.equal(
    (await call(ops, "/products/" + id + "/export", "POST", {}, p.version))
      .status,
    409,
  );
  const audit = await call(owner, "/audit-entries");
  assert.ok(
    audit.body.some(
      (x: any) => x.resource_id === id && x.action === "package.exported",
    ),
  );
});
test("self approval blocked even for owner", async () => {
  const p = (await call(owner, "/products", "POST", input())).body;
  const a = (
    await call(owner, "/approvals", "POST", { product_id: p.id }, p.version)
  ).body;
  assert.equal(
    (
      await call(
        owner,
        "/approvals/" + a.id + "/decisions",
        "POST",
        { decision: "approved" },
        a.version,
      )
    ).status,
    403,
  );
});
test("editing invalidates approval; stale edit rejected", async () => {
  const data = input();
  let p = (await call(ops, "/products", "POST", data)).body;
  const a = (
    await call(ops, "/approvals", "POST", { product_id: p.id }, p.version)
  ).body;
  p = (await call(ops, "/products/" + p.id)).body;
  assert.equal(
    (
      await call(
        ops,
        "/products/" + p.id,
        "PATCH",
        { ...data, title: "更新" },
        p.version,
      )
    ).status,
    200,
  );
  assert.equal(
    (await call(ops, "/products/" + p.id, "PATCH", data, p.version)).status,
    409,
  );
  assert.equal(
    (
      await call(
        owner,
        "/approvals/" + a.id + "/decisions",
        "POST",
        { decision: "approved" },
        a.version,
      )
    ).status,
    409,
  );
});
test("CSRF rejects mutation and revoked membership denies existing session", async () => {
  assert.equal(
    (await call({ ...ops, csrf: "invalid" }, "/products", "POST", input()))
      .status,
    403,
  );
  const uid = "30000000-0000-4000-8000-000000000021";
  try {
    await pool.query("UPDATE memberships SET active=false WHERE user_id=$1", [
      uid,
    ]);
    assert.equal((await call(other, "/products")).status, 401);
  } finally {
    await pool.query("UPDATE memberships SET active=true WHERE user_id=$1", [
      uid,
    ]);
  }
});
test("concurrent requests with same key create only one product", async () => {
  const key = randomUUID(),
    data = input();
  const [a, b] = await Promise.all([
    call(ops, "/products", "POST", data, undefined, key),
    call(ops, "/products", "POST", data, undefined, key),
  ]);
  assert.equal(a.status, 201);
  assert.equal(b.status, 201);
  assert.equal(a.body.id, b.body.id);
});
test("native bearer session uses same scopes and logout revokes it", async () => {
  const r = await call(undefined, "/auth/dev-login", "POST", {
    role: "ops",
    client: "native",
  });
  assert.equal(r.status, 201);
  assert.ok(r.body.token);
  const headers = { Authorization: "Bearer " + r.body.token };
  assert.equal((await fetch(base + "/products", { headers })).status, 200);
  assert.equal((await fetch(base + "/audit-entries", { headers })).status, 403);
  assert.equal(
    (await fetch(base + "/auth/logout", { method: "POST", headers })).status,
    201,
  );
  assert.equal((await fetch(base + "/products", { headers })).status, 401);
});
test("knowledge publication and tenant isolation",async()=>{const d=await call(ops,"/knowledge-documents","POST",{title:"轴承参数",body:"6205 轴承内径为 25 毫米。",source_ref:"测试说明书 v1"});assert.equal(d.status,201);assert.equal((await call(other,"/knowledge-documents/"+d.body.id)).status,404);assert.equal((await call(ops,"/knowledge-documents/"+d.body.id+"/publish","POST",{},1)).status,403);const pub=await call(owner,"/knowledge-documents/"+d.body.id+"/publish","POST",{},1);assert.equal(pub.status,201);assert.equal(pub.body.state,"published");assert.equal((await call(owner,"/knowledge-documents/"+d.body.id+"/publish","POST",{},1)).status,409);
const {AiService}=await import("../services/api/src/ai.service");let calls=0;const service=new AiService({generate:async(_p,_q,s)=>{calls++;return{output:{draft:"该资料记载内径为 25 毫米。",citations:[{source_id:s[0].id,quote:"内径为 25 毫米"}],unknowns:["实际适配机型"],requires_human_review:true},usage:{test:true}};}},()=>true);const actor=(await call(ops,"/me")).body;const key=randomUUID();const input={profile:"catalog",prompt:"整理参数",source_ids:[d.body.id]};const result=await service.generate(actor,key,input);assert.equal(result.state,"SUCCEEDED");assert.equal((await service.generate(actor,key,input)).id,result.id);assert.equal(calls,1);const foreign=(await call(other,"/me")).body;await assert.rejects(()=>service.generate(foreign,randomUUID(),input),/资料未发布或无权访问/);});
test("AI rejects invented citation and disabled provider",async()=>{const {validateSuggestion}=await import("../services/api/src/provider");assert.throws(()=>validateSuggestion({draft:"不存在",citations:[{source_id:"foreign",quote:"原文"}],unknowns:[],requires_human_review:true},[]));const {AiService}=await import("../services/api/src/ai.service");const service=new AiService({generate:async()=>{throw new Error("must not call")}},()=>false);await assert.rejects(()=>service.generate(({} as any),randomUUID(),{profile:"support",prompt:"请回复",source_ids:[randomUUID()]}),/模型未配置/);});

test("workflow pause and resume exports once",async()=>{const p=(await call(ops,"/products","POST",input())).body;let run=(await call(ops,"/workflow-runs","POST",{product_id:p.id},p.version)).body;assert.equal(run.state,"WAITING_APPROVAL");assert.equal((await call(other,"/workflow-runs/"+run.id)).status,404);assert.equal((await call(ops,"/workflow-runs/"+run.id+"/resume","POST",{})).body.state,"WAITING_APPROVAL");const approvals=(await call(owner,"/approvals")).body;const a=approvals.find((x:any)=>x.id===run.approval_id);assert.equal((await call(owner,"/approvals/"+a.id+"/decisions","POST",{decision:"approved"},a.version)).status,201);run=(await call(ops,"/workflow-runs/"+run.id+"/resume","POST",{})).body;assert.equal(run.state,"SUCCEEDED");assert.ok(run.package_id);const repeated=(await call(ops,"/workflow-runs/"+run.id+"/resume","POST",{})).body;assert.equal(repeated.package_id,run.package_id);});
test("MCP credential scope, revocation and stdio protocol",async()=>{const created=await call(owner,"/mcp-tokens","POST",{label:"protocol test"});assert.equal(created.status,201);const token=created.body.token;assert.ok(token);const headers={Authorization:"Bearer "+token,"Content-Type":"application/json"};assert.equal((await fetch(base+"/products",{headers})).status,200);assert.equal((await fetch(base+"/products",{method:"POST",headers,body:JSON.stringify(input())})).status,403);assert.equal((await fetch(base+"/knowledge-documents",{headers})).status,403);
const {Client}=await import("@modelcontextprotocol/sdk/client/index.js");const {StdioClientTransport}=await import("@modelcontextprotocol/sdk/client/stdio.js");const client=new Client({name:"commerce-test",version:"0.1.0"});const env=Object.fromEntries(Object.entries(process.env).filter((x):x is [string,string]=>typeof x[1]==="string"));const transport=new StdioClientTransport({command:process.execPath,args:["node_modules/tsx/dist/cli.mjs","services/mcp-server/server.ts"],env:{...env,COMMERCE_API_URL:base.replace("/api/v1",""),COMMERCE_MCP_TOKEN:token},stderr:"pipe"});try{await client.connect(transport);const list=await client.listTools();assert.equal(list.tools.length,3);const response=await client.callTool({name:"commerce.products.list",arguments:{limit:10}});assert.equal(response.isError,false);assert.equal((await call(owner,"/mcp-tokens/"+created.body.id+"/revoke","POST",{})).status,201);const denied=await client.callTool({name:"commerce.products.list",arguments:{limit:10}});assert.equal(denied.isError,true);}finally{await client.close();}});

