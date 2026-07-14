import { config } from "@resfolio/eslint-config/base";

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...config,
  {
    // This package is the single sanctioned reader of process.env
    // (@t3-oss/env-nextjs reads it inside createEnv).
    rules: {
      "no-restricted-properties": "off",
    },
  },
];
