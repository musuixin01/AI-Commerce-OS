import { test, expect } from "@playwright/test";
test("companion follows AI request lifecycle without treating normal page reads as work", async ({
  page,
}) => {
  await page.route("**/api/v1/approvals", (r) => r.fulfill({ json: [] }));
  await page.route("**/api/v1/capabilities", (r) =>
    r.fulfill({ json: { ai_configured: true } }),
  );
  await page.route("**/api/v1/knowledge-documents", (r) =>
    r.fulfill({
      json: [
        {
          id: "pet-source",
          title: "宠物状态测试资料",
          state: "published",
          version: 1,
        },
      ],
    }),
  );
  let release: () => void = () => {};
  let response = { state: "SUCCEEDED" },
    status = 200;
  await page.route("**/api/v1/ai-runs", async (r) => {
    if (r.request().method() === "POST") {
      await new Promise<void>((resolve) => (release = resolve));
      await r.fulfill({ status, json: response });
    } else await r.fulfill({ json: [] });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "以运营身份进入" }).click();
  const pet = page.getByRole("complementary", { name: "AI 工作伙伴" });
  await expect(pet).toHaveAttribute("data-state", "idle");
  await expect(page.locator(".pet-body")).toHaveCSS(
    "animation-name",
    "spirit-curious",
  );
  await expect(page.locator(".spirit-orbit-trail")).toHaveCSS(
    "animation-name",
    "spirit-flow",
  );
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    "rgb(20, 19, 28)",
  );
  await page.getByRole("button", { name: "查看 AI 工作伙伴" }).click();
  await page.getByRole("button", { name: "暂停动画" }).click();
  const idleAnimations = await pet.evaluate((el) =>
    el.getAnimations({ subtree: true }).map((a) => a.playState),
  );
  expect(idleAnimations.length).toBeGreaterThan(0);
  expect(idleAnimations.every((s) => s === "paused")).toBe(true);
  await page.getByRole("button", { name: "恢复动画" }).click();
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "客服中心", exact: true }).click();
  await page.getByRole("tab", { name: "知识建议" }).click();
  await page.getByLabel("任务", { exact: true }).fill("根据已发布资料生成建议");
  await page.getByRole("checkbox").check();
  for (const [state, code, expected] of [
    ["SUCCEEDED", 200, "done"],
    ["WAITING_APPROVAL", 200, "waiting"],
    ["UNKNOWN", 200, "error"],
    ["FAILED", 500, "error"],
  ] as const) {
    response = { state };
    status = code;
    await page.getByRole("button", { name: "生成待审核建议" }).click();
    await expect(pet).toHaveAttribute("data-state", "working");
    await expect(pet).toContainText("正在生成客服建议");
    await expect
      .poll(() =>
        page
          .locator(".spirit-orbit-trail")
          .first()
          .evaluate((e) => getComputedStyle(e).animationName),
      )
      .toBe("spirit-flow");
    release();
    await expect(pet).toHaveAttribute("data-state", expected);
  }
  await page.getByRole("button", { name: "查看 AI 工作伙伴" }).click();
  await page.getByRole("button", { name: "暂停动画" }).click();
  await expect(page.locator(".pet-body")).toHaveCSS(
    "animation-play-state",
    "paused",
  );
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "查看 AI 工作伙伴" }),
  ).toBeFocused();
  await page.getByRole("button", { name: "退出登录" }).click();
  await expect(pet).toHaveCount(0);
  await page.getByRole("button", { name: "以运营身份进入" }).click();
  await expect(pet).toHaveAttribute("data-state", "idle");
});
test("companion fits mobile and respects reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "以审批身份进入" }).click();
  await expect(page.locator(".pet-body")).toHaveCSS("animation-name", "none");
  await expect(page.locator(".spirit-orbit-trail")).toHaveCSS(
    "animation-name",
    "none",
  );
  expect(
    await page
      .locator(".work-pet")
      .evaluate((el) => el.getAnimations({ subtree: true }).length),
  ).toBe(0);

  await page.getByRole("button", { name: "查看 AI 工作伙伴" }).click();
  await expect(
    page.getByRole("region", { name: "工作伙伴详情" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "收起状态" }).click();
  await expect(
    page.getByRole("button", { name: "查看 AI 工作伙伴" }),
  ).toHaveAttribute("aria-expanded", "false");
});
