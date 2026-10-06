import { test, expect } from "@playwright/test";
import sharp from "sharp";
test("save materials, restore after reload, update and remove without generation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page.getByRole("button", { name: "以运营身份进入" }).click();
  await page.getByRole("button", { name: "商品中心", exact: true }).click();
  await page.route("**/api/v1/catalog-tasks", async (route) => {
    if (route.request().method() === "GET")
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ message: "测试列表暂时不可用" }),
      });
    else await route.continue();
  });
  const title = "素材恢复-" + Date.now();
  await page.getByLabel("商品名称", { exact: true }).fill(title);
  const buffer = await sharp({
    create: { width: 480, height: 360, channels: 3, background: "#bca475" },
  })
    .png()
    .toBuffer();
  await page
    .getByLabel("选择商品图片")
    .setInputFiles({ name: "实拍样图.png", mimeType: "image/png", buffer });
  await page
    .getByRole("button", { name: "保存素材与进度", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("素材与进度已保存");
  const id = await page.getByLabel("恢复制作草稿").inputValue();
  expect(id).toBeTruthy();
  await page
    .getByRole("button", { name: "保存素材与进度", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("素材与进度已保存");
  await expect(page.getByText("版本 v2", { exact: true })).toBeVisible();
  await expect(page.getByRole("alert")).toContainText(
    "保存成功，但列表刷新失败",
  );
  await page.unroute("**/api/v1/catalog-tasks");
  await page.reload();
  await page.getByRole("button", { name: "商品中心", exact: true }).click();
  await page.getByLabel("恢复制作草稿").selectOption(id);
  await expect(page.getByLabel("商品名称", { exact: true })).toHaveValue(title);
  await expect(
    page.getByAltText("实拍样图.png", { exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page
        .getByAltText("实拍样图.png", { exact: true })
        .evaluate((e: HTMLImageElement) => e.naturalWidth),
    )
    .toBeGreaterThan(0);
  await page.screenshot({
    path: "test-results/materials-restored.jpg",
    type: "jpeg",
    quality: 25,
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/materials-mobile.jpg",
    type: "jpeg",
    quality: 45,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByLabel("商品名称", { exact: true }).fill(title + "修订");
  await page
    .getByRole("button", { name: "保存素材与进度", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("素材与进度已保存");
  await expect(page.getByText("版本 v3", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "移除图片 实拍样图.png" }).click();
  await page
    .getByRole("button", { name: "保存素材与进度", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("素材与进度已保存");
  await page.getByRole("button", { name: "重新载入草稿" }).click();
  await expect(page.getByAltText("实拍样图.png", { exact: true })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "新建制作", exact: true }).click();
  await page.getByLabel("商品名称", { exact: true }).fill(title);
  await page
    .getByRole("button", { name: "保存素材与进度", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("素材与进度已保存");
  expect(await page.getByLabel("恢复制作草稿").inputValue()).not.toBe(id);
  await expect(
    page.getByRole("button", { name: "AI 图片生成待接入" }),
  ).toBeDisabled();
});
