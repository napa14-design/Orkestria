import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // firebase-admin (e suas deps, ex.: jwks-rsa/jose) não devem ser empacotadas
  // pelo bundler do servidor — carregam direto do node_modules em runtime.
  // Evita o ERR_REQUIRE_ESM em serverless (Vercel).
  serverExternalPackages: ["firebase-admin"],
  /**
   * O DIARIO entra no bundle como texto durante o build. A página de evolução
   * não toca no filesystem nem relê o arquivo a cada request autenticado — e
   * `fs` não serviria: na Vercel o arquivo da raiz não vai para a função
   * serverless.
   *
   * **Por isso `--webpack` nos scripts.** O Next 16 usa Turbopack por padrão, e
   * Turbopack ignora esta regra (não tem equivalente nativo para importar texto;
   * exigiria o `raw-loader`, sem manutenção desde 2020). Para migrar para
   * Turbopack no futuro, é este import que precisa de outra solução.
   */
  webpack(config) {
    config.module.rules.push({ test: /DIARIO\.md$/u, type: "asset/source" });
    return config;
  },
};

export default nextConfig;
