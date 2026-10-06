import { Pool } from "pg";
import { configure } from "./local-config";
configure();
async function main() {
  if (process.env.APP_MODE !== "development")
    throw new Error("Seed is development only");
  const p = new Pool({ connectionString: process.env.DATABASE_URL });
  const c = await p.connect();
  try {
    await c.query("BEGIN");
    for (const n of [1, 2]) {
      const org = "10000000-0000-4000-8000-00000000000" + n,
        ws = "20000000-0000-4000-8000-00000000000" + n;
      await c.query(
        "INSERT INTO organizations VALUES($1,$2)ON CONFLICT DO NOTHING",
        [org, n === 1 ? "青禾商贸 · 演示组织" : "隔离测试组织"],
      );
      await c.query(
        "INSERT INTO workspaces VALUES($1,$2,$3)ON CONFLICT DO NOTHING",
        [ws, org, "默认工作区"],
      );
      for (const r of [1, 2]) {
        const id = "30000000-0000-4000-8000-0000000000" + n + r;
        await c.query("INSERT INTO users VALUES($1,$2)ON CONFLICT DO NOTHING", [
          id,
          r === 1 ? "林运营" : "陈审批",
        ]);
        await c.query(
          "INSERT INTO memberships(user_id,organization_id,workspace_id,role)VALUES($1,$2,$3,$4)ON CONFLICT DO NOTHING",
          [id, org, ws, r === 1 ? "ops" : "owner"],
        );
      }
    }
    for (const [i, title, cat, price, sku] of [
      [1, "精密轴承 · 6205 系列", "农机配件", 4800, "QH-6205"],
      [2, "多功能园艺手套", "园艺工具", 2900, "QH-GLOVE"],
      [3, "可调式灌溉喷头", "灌溉设备", 6800, "QH-SPRAY"],
    ] as const) {
      const id = "40000000-0000-4000-8000-00000000000" + i;
      await c.query(
        "INSERT INTO products(id,organization_id,workspace_id,title,category,description,source_refs)VALUES($1,'10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',$2,$3,$4,$5)ON CONFLICT DO NOTHING",
        [
          id,
          title,
          cat,
          "内部样例商品，请核验规格后使用。",
          "演示资料 · 非真实经营数据",
        ],
      );
      await c.query(
        "INSERT INTO skus(organization_id,product_id,seller_sku,amount_minor,currency)VALUES('10000000-0000-4000-8000-000000000001',$1,$2,$3,'CNY')ON CONFLICT DO NOTHING",
        [id, sku, price],
      );
    }
    await c.query("COMMIT");
    console.log("Development seed complete");
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
    await p.end();
  }
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
