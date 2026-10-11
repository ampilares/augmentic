import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appDir = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  // The database package lives outside the Next.js app directory. Include
  // its non-JavaScript migration assets in every server trace so cold-start
  // database boot can run on packaged/serverless deployments.
  outputFileTracingRoot: path.join(appDir, "../.."),
  outputFileTracingIncludes: {
    "/*": ["../../packages/db/migrations/**/*"],
  },
  transpilePackages: [
    "@augmentic/shared",
    "@augmentic/db",
    "@augmentic/policy",
    "@augmentic/connectors",
    "@augmentic/agent-runtime",
    "@augmentic/engine",
  ],
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
};

export default nextConfig;
