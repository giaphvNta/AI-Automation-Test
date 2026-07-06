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
  // Normal: 1 worker — các spec file chạy tuần tự, tránh contamination app state
  // (rate limit, DB seed, blacklist IP container) giữa các file chạy song song.
  // Project có tests hoàn toàn độc lập → override bằng TEST_WORKERS trong projects/<name>/.env.
  workers: Number(process.env.TEST_WORKERS || (isFast ? 4 : 1)),
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
  // Visual baseline (vd export từ Figma) lưu tại projects/<proj>/baselines/<name>.png,
  // không kèm hậu tố platform → ảnh design dùng trực tiếp, độc lập OS.
  // Chỉ áp dụng cho assertion toHaveScreenshot/toMatchSnapshot (hiện chỉ figma-poc dùng).
  snapshotPathTemplate: 'projects/{testFileDir}/../baselines/{arg}{ext}',
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
