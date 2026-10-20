import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    viewport: { width: 1600, height: 900 },
    launchOptions: {
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
    },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1600, height: 900 } } }],
  webServer: [
    {
      command: 'npm run preview -- --port 4173 --strictPort',
      url: 'http://localhost:4173',
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      // The PHP API (accounts, saves, leaderboard); vite preview proxies /api to it.
      // Its data lives in test-results/, which Playwright empties before every run. -q: no access log.
      command: 'php -q -S 127.0.0.1:8787 server/dev-router.php',
      url: 'http://127.0.0.1:8787/api/health',
      // EPD_MP: co-op rooms start on the game server below when it answers (mp.php).
      env: {
        EPD_DATA: './test-results/epd-data',
        EPD_TTS_UPSTREAM: 'off',
        EPD_MP: '1',
        EPD_MP_URL: 'http://127.0.0.1:8790',
      },
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      // The game server (server/mp, built by `npm run build` into dist-mp/); vite preview proxies /mp to it. It shares
      // the secret with the PHP API through the data folder.
      command: 'node dist-mp/mp.mjs',
      url: 'http://127.0.0.1:8790/mp/health',
      env: { EPD_MP_DIR: './test-results/epd-data/mp', EPD_MP_PORT: '8790' },
      reuseExistingServer: true,
      timeout: 30_000,
    },
  ],
});
