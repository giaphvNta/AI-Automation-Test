import { defineConfig, devices } from '@playwright/test';

// Env vars được load:
// - Native mode: từ `.env` qua dotenv (nếu cài) hoặc shell export
// - Docker mode: từ env_file của docker-compose
const testProject = process.env.TEST_PROJECT || 'default';
const testRunId =
  process.env.TEST_RUN_ID ||
  new Date().toISOString().replace(/[:.]/g, '-');
const testRunDir = `projects/${testProject}/test-results/runs/${testRunId}`;
const isFast = !!process.env.TEST_FAST;
const isLive = !!process.env.TEST_LIVE;

export default defineConfig({
  testDir: './projects',
  testMatch: '**/tests/**/*.spec.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: isFast ? 4 : 2,
  reporter: isFast
    ? [
        ['dot'],
        ['json', { outputFile: `${testRunDir}/results.json` }],
      ]
    : [
        ['html', { outputFolder: `${testRunDir}/playwright-report`, open: 'never' }],
        ['line'],
        ['json', { outputFile: `${testRunDir}/results.json` }],
      ],
  outputDir: `${testRunDir}/artifacts`,
  timeout: 30_000,
  expect: { timeout: 5_000 },

  use: {
    baseURL: process.env.TEST_BASE_URL,
    headless: !isLive,           // live mode: hiện browser trên VNC
    slowMo: isLive ? 600 : 0,   // live mode: chậm lại để dễ quan sát
    // fast: tắt hết; normal/live: ghi đầy đủ
    video: isFast ? 'off' : 'on',
    trace: isFast ? 'off' : 'on',
    screenshot: isFast ? 'off' : 'on',
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          // Prevent navigator.webdriver detection — SSO overrides input setter when webdriver=true
          args: ['--disable-blink-features=AutomationControlled'],
        },
      },
    },
  ],
});
