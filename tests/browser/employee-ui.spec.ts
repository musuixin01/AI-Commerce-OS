import { test, expect } from "@playwright/test";
test("AI workspace previews local material without executing and exposes six centers", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page.getByRole("button", { name: "以审批身份进入" }).click();
  await expect(page.getByRole("heading", { name: "经营总览" })).toBeVisible();
  await page.screenshot({
    path: "test-results/employee-desktop.png",
    fullPage: true,
  });
  let calls = 0;
  page.on("request", (r) => {
    if (r.method() === "POST" && !r.url().includes("/auth/")) calls++;
  });
  await expect(page.getByLabel("选择商品图片")).toHaveCount(0);
  await page.getByRole("button", { name: "商品中心", exact: true }).click();
  const left = await page.locator(".catalog-data").boundingBox();
  const right = await page.locator(".catalog-preview").boundingBox();
  expect(left!.x + left!.width).toBeLessThan(right!.x);
  await expect(
    page.getByRole("heading", { name: "商品发布资料" }),
  ).toBeVisible();
  await page.getByLabel("选择商品图片").setInputFiles({
    name: "sample.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2FZkAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await expect(page.getByAltText("sample.png")).toBeVisible();
  await page.getByRole("tab", { name: "商品主图", exact: true }).click();
  await expect(page.getByRole("region", { name: "图片预览" })).toContainText(
    "暂未生成图片",
  );
  await expect(page.getByAltText("sample.png")).toHaveCount(0);
  await page.getByRole("tab", { name: "详情图片", exact: true }).click();
  await expect(page.getByRole("region", { name: "图片预览" })).toContainText(
    "暂未生成图片",
  );
  await page.getByRole("tab", { name: "原始图片", exact: true }).click();
  await page.screenshot({
    path: "test-results/catalog-desktop.png",
    fullPage: true,
  });
  expect(calls).toBe(0);
  await page.getByRole("button", { name: "移除图片 sample.png" }).click();
  await expect(page.getByAltText("sample.png")).toHaveCount(0);
  for (const name of [
    "商品中心",
    "客服中心",
    "市场中心",
    "数据中心",
    "店铺中心",
  ]) {
    await page.getByRole("button", { name, exact: true }).click();
    await expect(
      page.getByRole("heading", { name, exact: true }),
    ).toBeVisible();
  }
  await page.getByRole("button", { name: "客服中心", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "AI 接待，全程看得见" }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/employee-support.png",
    fullPage: true,
  });
  await page.getByRole("tab", { name: "知识建议" }).click();
  await expect(
    page.getByRole("heading", { name: "AI 业务建议" }),
  ).toBeVisible();
});
test("mobile workspace and all business pages fit, navigation can close", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "以运营身份进入" }).click();
  await expect(page.getByRole("heading", { name: "经营总览" })).toBeVisible();
  await page.screenshot({
    path: "test-results/employee-mobile.png",
    fullPage: true,
  });
  for (const name of [
    "商品中心",
    "客服中心",
    "市场中心",
    "数据中心",
    "店铺中心",
    "工作台",
  ]) {
    await page.getByRole("button", { name: "打开导航", exact: true }).click();
    await page.getByRole("button", { name, exact: true }).click();
    await expect(
      page.getByRole("button", { name: "打开导航", exact: true }),
    ).toHaveAttribute("aria-expanded", "false");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.getByRole("button", { name: "打开导航", exact: true }).click();
  await page
    .getByRole("button", { name: "关闭导航", exact: true })
    .click({ position: { x: 370, y: 300 } });
  await expect(
    page.getByRole("button", { name: "打开导航", exact: true }),
  ).toHaveAttribute("aria-expanded", "false");
});
