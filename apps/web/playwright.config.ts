import { defineConfig, devices } from '@playwright/test';

const API_PORT = 8181;
const WEB_PORT = 3100;

/**
 * Browser tests against the real API and the real legacy DB. The API runs through
 * apps/api/test/e2e-server.mjs, which wraps everything in one SQL transaction that is rolled
 * back on exit, so the database is never changed. Tests share that transaction: run serially.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  timeout: 60_000,
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: `pnpm --filter @gglib/api build && node ../api/test/e2e-server.mjs`,
      url: `http://localhost:${API_PORT}/api/health`,
      env: {
        E2E_API_PORT: String(API_PORT),
        E2E_WEB_ORIGIN: `http://localhost:${WEB_PORT}`,
        E2E_VERBOSE: process.env.E2E_VERBOSE ?? '',
        SECURITY_PASSWORD: 'e2e-security-pw',
        GRAPHICS_LOCK_PASSWORD: 'e2e-graphics-lock-pw',
      },
      reuseExistingServer: false,
      timeout: 120_000,
      gracefulShutdown: { signal: 'SIGINT', timeout: 10_000 },
      stdout: 'pipe',
    },
    {
      command: `next build && node e2e/static-server.mjs`,
      url: `http://localhost:${WEB_PORT}/login/`,
      env: {
        NEXT_PUBLIC_API_URL: `http://localhost:${API_PORT}/api`,
        NEXT_TELEMETRY_DISABLED: '1',
        PORT: String(WEB_PORT),
      },
      reuseExistingServer: false,
      timeout: 300_000,
    },
  ],
});
