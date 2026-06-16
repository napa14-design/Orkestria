import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // firebase-admin (e suas deps, ex.: jwks-rsa/jose) não devem ser empacotadas
  // pelo bundler do servidor — carregam direto do node_modules em runtime.
  // Evita o ERR_REQUIRE_ESM em serverless (Vercel).
  serverExternalPackages: ["firebase-admin"],
};

export default nextConfig;
