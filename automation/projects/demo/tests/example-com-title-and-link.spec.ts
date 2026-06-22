import { test, expect } from '@playwright/test';

test.describe('example.com — title và link', () => {
  test('TC001: page title chứa "Example Domain"', async ({ page }) => {
    const response = await page.goto('https://example.com');
    expect(response?.status()).toBe(200);
    await expect(page).toHaveTitle(/Example Domain/);
  });

  test('TC002: link "Learn more" visible và có href', async ({ page }) => {
    await page.goto('https://example.com');
    const link = page.getByRole('link', { name: /Learn more/i });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', /.+/);
  });
});
