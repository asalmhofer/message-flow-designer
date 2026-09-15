import { defineConfig } from '@playwright/test';

const baseURL = `http://127.0.0.1:${process.env.PORT || 8080}`;

export default defineConfig({
  testDir:'./tests/browser',
  testMatch:'**/*.spec.js',
  fullyParallel:true,
  workers:2,
  forbidOnly:!!process.env.CI,
  retries:0,
  use:{ baseURL, viewport:{width:1280,height:720},
    channel:process.env.PLAYWRIGHT_CHANNEL || undefined, trace:'off', screenshot:'only-on-failure' },
  webServer:{ command:'node scripts/serve.js', url:baseURL, reuseExistingServer:!process.env.CI },
});
