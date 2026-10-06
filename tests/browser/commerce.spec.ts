import { test, expect } from "@playwright/test";
test("operator creates product, separate approver approves, operator exports", async ({
  browser,
}) => {
  const ops = await browser.newContext(),
    owner = await browser.newContext();
  const a = await ops.newPage(),
    b = await owner.newPage();
  await a.goto("/");
  await a.getByRole("button", { name: "以运营身份进入" }).click();
  await expect(a.getByRole("heading", { name: "经营总览" })).toBeVisible();
  await a.screenshot({
    path: "test-results/dashboard-desktop.png",
    fullPage: true,
  });
  await a.getByRole("button", { name: "商品中心", exact: true }).click();
  await a.getByRole("tab", { name: /商品列表/ }).click();
  await a.getByRole("button", { name: "新建商品" }).click();
  const title = "浏览器测试 " + Date.now();
  await a.getByRole("dialog").getByLabel("商品名称").fill(title);
  await a.getByRole("dialog").getByLabel("商品分类").fill("农机配件");
  await a.getByRole("dialog").getByLabel("商家 SKU").fill("E2E-" + Date.now());
  await a.getByRole("dialog").getByLabel("销售价格").fill("88.50");
  await a.getByRole("dialog").getByLabel("商品说明").fill("已核验的演示商品");
  await a.getByRole("dialog").getByLabel("资料来源").fill("E2E 资料 v1");
  await a.getByRole("button", { name: "保存商品" }).click();
  await a.getByRole("button", { name: "商品中心", exact: true }).click();
  await a.getByRole("tab", { name: /商品列表/ }).click();
  await a.getByLabel("搜索商品").fill(title);
  await a
    .getByRole("row")
    .filter({ hasText: title })
    .getByRole("button", { name: "提交审批" })
    .click();
  await expect(a.getByRole("status")).toContainText("审批已提交");
  await b.goto("/");
  await b.getByRole("button", { name: "以审批身份进入" }).click();
  await b.getByRole("button", { name: /^审批中心/ }).click();
  await b
    .locator(".approval-card")
    .filter({ hasText: title })
    .getByRole("button", { name: "批准发布包" })
    .click();
  await expect(b.getByRole("status")).toContainText("已批准");
  await a.reload();
  await a.getByRole("button", { name: "商品中心", exact: true }).click();
  await a.getByRole("tab", { name: /商品列表/ }).click();
  await a.getByLabel("搜索商品").fill(title);
  const download = a.waitForEvent("download");
  await a
    .getByRole("row")
    .filter({ hasText: title })
    .getByRole("button", { name: "导出发布包" })
    .click();
  expect((await download).suggestedFilename()).toContain("发布包");
  await expect(a.getByRole("status")).toContainText("尚未自动发布");
  await ops.close();
  await owner.close();
});
test("mobile viewport navigation and product form", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "以运营身份进入" }).click();
  await expect(page.getByRole("heading", { name: "经营总览" })).toBeVisible();
  await page.screenshot({
    path: "test-results/dashboard-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "打开导航", exact: true }).click();
  await page.getByRole("button", { name: "商品中心", exact: true }).click();
  await page.getByRole("tab", { name: /商品列表/ }).click();
  await page.getByRole("button", { name: "新建商品" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "关闭商品资料" }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test("knowledge publishing and operational pages", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "以审批身份进入" }).click();
  await page.getByRole("button", { name: "知识库", exact: true }).click();
  await page.getByRole("button", { name: "录入资料", exact: true }).click();
  const title = "知识 UI " + Date.now();
  await page.getByLabel("资料标题").fill(title);
  await page.getByLabel("来源与版本").fill("内部样例 v1");
  await page
    .getByLabel("资料内容")
    .fill("演示轴承内径为 25 毫米，仅用于测试。");
  await page.getByRole("button", { name: "保存资料", exact: true }).click();
  const row = page.locator(".package-row").filter({ hasText: title });
  await row.getByRole("button", { name: "发布", exact: true }).click();
  await expect(row).toContainText("已发布");
  await page.getByRole("button", { name: "客服中心", exact: true }).click();
  await page.getByRole("tab", { name: "知识建议", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "AI 业务建议" }),
  ).toBeVisible();
  await expect(
    page.getByRole("checkbox", { name: new RegExp(title) }),
  ).toBeVisible();
  await page.getByRole("button", { name: "工作流", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "商品审批发布 · v1" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "MCP 管理", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "只读 MCP · 本机预览" }),
  ).toBeVisible();
});
