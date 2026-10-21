import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // firebase-admin (e suas deps, ex.: jwks-rsa/jose) não devem ser empacotadas
  // pelo bundler do servidor — carregam direto do node_modules em runtime.
  // Evita o ERR_REQUIRE_ESM em serverless (Vercel).
  serverExternalPackages: ["firebase-admin"],
  /**
   * Versão do build, gravada no código do navegador E no do servidor. A aba
   * aberta compara a sua com a de `/api/versao` (servida pelo deploy novo) e,
   * se mudou, avisa para recarregar — quem passou o dia com a aba aberta
   * continuava esbarrando em defeito já consertado (21/10/2026). Na Vercel é o
   * commit; fora dela, o instante do build.
   */
  env: {
    NEXT_PUBLIC_VERSAO: process.env.VERCEL_GIT_COMMIT_SHA ?? `local-${Date.now()}`,
  },
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
  /**
   * Headers de segurança (auditoria, 14/10/2026). O principal é o DENY: sem
   * ele, uma página externa embutia o sistema num iframe e induzia o supervisor
   * logado a clicar em "Limpar dia". Sem CSP por ora: o login com Google usa
   * popup e scripts do Firebase, e uma CSP errada derruba o login de todos —
   * só entra testada contra o Google de verdade.
   */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
