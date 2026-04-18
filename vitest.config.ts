import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    css: false,
    projects: [
      {
        plugins: [react()],
        resolve: {
          alias: {
            "@": path.resolve(__dirname, "."),
          },
        },
        test: {
          name: "unit",
          environment: "jsdom",
          globals: true,
          setupFiles: ["./vitest.setup.ts"],
          include: [
            "app/**/__tests__/**/*.test.{ts,tsx}",
            "!app/**/__tests__/**/*.integration.test.{ts,tsx}",
          ],
          css: false,
        },
      },
      {
        plugins: [react()],
        resolve: {
          alias: {
            "@": path.resolve(__dirname, "."),
          },
        },
        test: {
          name: "integration",
          environment: "node",
          globals: true,
          globalSetup: ["./tests/setup/testcontainers.ts"],
          include: ["app/**/__tests__/**/*.integration.test.{ts,tsx}"],
          testTimeout: 60_000,
          hookTimeout: 180_000,
          css: false,
          pool: "forks",
          fileParallelism: false,
          sequence: { concurrent: false },
        },
      },
    ],
  },
});
