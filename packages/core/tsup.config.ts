import { defineConfig, type Options } from "tsup";
import babel from "esbuild-plugin-babel";

const sharedOptions: Options = {
  treeshake: true,
  splitting: false,
  clean: true,
  dts: true,
  sourcemap: true,
  esbuildPlugins: [
    babel({
      filter: /\.[jt]sx$/,
      config: {
        presets: ["babel-preset-solid", "@babel/preset-typescript"],
      },
    }),
  ],
  loader: { ".css": "text" },
};

// Browser build (IIFE for content script injection)
const browserBuild: Options = {
  ...sharedOptions,
  entry: { index: "./src/index.ts" },
  format: ["iife"],
  globalName: "globalThis.__UI_TO_CODE__",
  platform: "browser",
  minify: true,
  outDir: "dist",
};

// Library build (ESM + CJS for imports)
const libraryBuild: Options = {
  ...sharedOptions,
  entry: {
    index: "./src/index.ts",
    "core/index": "./src/core/index.tsx",
  },
  format: ["esm", "cjs"],
  platform: "neutral",
  splitting: true,
  outDir: "dist",
};

export default defineConfig([browserBuild, libraryBuild]);
