import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
