import { test, expect } from '@playwright/test';

test.describe('Smoke test — example.com', () => {
  test('TC001: trang chủ load thành công', async ({ page }) => {
    const response = await page.goto('https://example.com');
    expect(response?.status()).toBe(200);
    await expect(page).toHaveTitle(/Example Domain/);
  });

  test('TC002: h1 hiển thị nội dung đúng', async ({ page }) => {
    await page.goto('https://example.com');
    const h1 = page.locator('h1');
    await expect(h1).toBeVisible();
    await expect(h1).toHaveText('Example Domain');
  });

  test('TC003: link Learn more tồn tại', async ({ page }) => {
    // [HEALED 2026-05-28] example.com đổi text "More information" → "Learn more"
    await page.goto('https://example.com');
    const link = page.getByRole('link', { name: /Learn more/i });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', /.+/);
  });
});
