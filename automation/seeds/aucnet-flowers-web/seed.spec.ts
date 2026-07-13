// Login helper: saves authenticated storage state to .auth/user.json
// Used by other tests via: test.use({ storageState: path.join(__dirname, '../.auth/user.json') })

import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

export const AUTH_FILE = path.join(__dirname, '../.auth/user.json');
export const AUTH_FILE_2 = path.join(__dirname, '../.auth/user2.json');

export async function doLoginWithCreds(page: any, username: string, password: string) {
  const baseUrl = process.env.TEST_BASE_URL || 'http://host.docker.internal:8090';

  await page.goto(`${baseUrl}/top`);
  await expect(page.locator('input[name="username"]')).toBeVisible({ timeout: 15000 });

  // SSO form uses framework-controlled inputs — set via CDP input events
  await page.locator('input[name="username"]').fill(username);
  await page.locator('input[name="password"]').fill(password);

  // div.button-primary triggers doLogin() JS → form.submit()
  await page.locator('.button-primary').click();
  await page.waitForURL((url: URL) => !url.toString().includes('auth.dev.aucnet-flowers.com'), { timeout: 60000 });
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
}

export async function doLogin(page: any) {
  await doLoginWithCreds(page, process.env.TEST_PFID || '', process.env.TEST_PASS || '');
}

test.describe('Seed — Save SSO auth state', () => {
  test('Login account 1 and save storage state', async ({ page }) => {
    await doLoginWithCreds(page, process.env.TEST_PFID || '', process.env.TEST_PASS || '');
    const dir = path.dirname(AUTH_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    await page.context().storageState({ path: AUTH_FILE });
  });

  test('Login account 2 and save storage state', async ({ page }) => {
    await doLoginWithCreds(page, process.env.TEST_PFID_2 || '', process.env.TEST_PASS_2 || '');
    const dir = path.dirname(AUTH_FILE_2);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    await page.context().storageState({ path: AUTH_FILE_2 });
  });
});
