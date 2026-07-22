import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // firebase-admin (e suas deps, ex.: jwks-rsa/jose) não devem ser empacotadas
  // pelo bundler do servidor — carregam direto do node_modules em runtime.
  // Evita o ERR_REQUIRE_ESM em serverless (Vercel).
  serverExternalPackages: ["firebase-admin"],
  webpack(config) {
    // O DIARIO entra no bundle como texto durante o build. A página de evolução
    // não toca no filesystem nem relê o arquivo a cada request autenticado.
    config.module.rules.push({ test: /DIARIO\.md$/u, type: "asset/source" });
    return config;
  },
};

export default nextConfig;
