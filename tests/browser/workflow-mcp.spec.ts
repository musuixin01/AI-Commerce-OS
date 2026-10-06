import { test, expect } from "@playwright/test";

test("workflow waits for separate approval and resumes to one downloadable package", async ({
  browser,
}) => {
  const ops = await browser.newContext();
  const owner = await browser.newContext();
  try {
    const page = await ops.newPage();
    const reviewer = await owner.newPage();
    const title = "工作流回归 " + Date.now();
    await page.goto("/");
    await page.getByRole("button", { name: "以运营身份进入" }).click();
    await page.getByRole("button", { name: "商品中心", exact: true }).click();
    await page.getByRole("tab", { name: /商品列表/ }).click();
    await page.getByRole("button", { name: "新建商品" }).click();
    await page.getByRole("dialog").getByLabel("商品名称").fill(title);
    await page.getByRole("dialog").getByLabel("商品分类").fill("农机配件");
    await page.getByRole("dialog").getByLabel("商家 SKU").fill("WF-E2E-" + Date.now());
    await page.getByRole("dialog").getByLabel("销售价格").fill("35.00");
    await page.getByRole("dialog").getByLabel("商品说明").fill("仅用于本地验证的演示规格");
    await page.getByRole("dialog").getByLabel("资料来源").fill("内部样例 v1");
    await page.getByRole("button", { name: "保存商品" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("button", { name: "工作流", exact: true }).click();
    await page.getByLabel("选择草稿").selectOption({ label: title });
    await page.getByRole("button", { name: "启动工作流" }).click();
    const run = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: title, exact: true }) });
    await expect(run).toContainText("等待审批");
    await reviewer.goto("/");
    await reviewer.getByRole("button", { name: "以审批身份进入" }).click();
    await reviewer.getByRole("button", { name: /^审批中心/ }).click();
    await reviewer
      .locator(".approval-card")
      .filter({ hasText: title })
      .getByRole("button", { name: "批准发布包" })
      .click();
    await expect(reviewer.getByRole("status")).toContainText("已批准");
    await page.reload();
    await page.getByRole("button", { name: "工作流", exact: true }).click();
    await run.getByRole("button", { name: "继续执行" }).click();
    await expect(run).toContainText("已生成发布包");
    await expect(run.getByRole("button", { name: "继续执行" })).toHaveCount(0);
    await page.getByRole("button", { name: "发布记录", exact: true }).click();
    const pack = page.locator(".package-row").filter({ hasText: title });
    await expect(pack).toHaveCount(1);
    const pendingDownload = page.waitForEvent("download");
    await pack.getByRole("button", { name: "下载", exact: true }).click();
    expect((await pendingDownload).suggestedFilename()).toMatch(/\.json$/);
  } finally {
    await ops.close();
    await owner.close();
  }
});

test("MCP credential is shown once, can be revoked, and operators cannot manage it", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "以审批身份进入" }).click();
  await page.getByRole("button", { name: "MCP 管理", exact: true }).click();
  const label = "浏览器凭据回归 " + Date.now();
  await page.getByLabel("凭据名称").fill(label);
  await page.getByRole("button", { name: "创建只读凭据" }).click();
  const credential = page.getByRole("textbox", {
    name: "MCP 凭据",
    exact: true,
  });
  await expect(credential).toHaveAttribute("type", "password");
  await expect(credential).not.toHaveValue("");
  await page.getByRole("button", { name: "隐藏并清除" }).click();
  await expect(credential).toHaveCount(0);
  const row = page.locator(".package-row").filter({ hasText: label });
  await row.getByRole("button", { name: "撤销", exact: true }).click();
  await expect(row).toContainText("已撤销");
  await expect(
    row.getByRole("button", { name: "撤销", exact: true }),
  ).toBeDisabled();
  await page.reload();
  await page.getByRole("button", { name: "MCP 管理", exact: true }).click();
  await expect(credential).toHaveCount(0);
  await page.getByRole("button", { name: "退出登录" }).click();
  await page.getByRole("button", { name: "以运营身份进入" }).click();
  await page.getByRole("button", { name: "MCP 管理", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "需要负责人权限" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "创建只读凭据" })).toHaveCount(
    0,
  );
});
