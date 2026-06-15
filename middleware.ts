import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_SESSAO } from "./lib/sessionConstants";

/**
 * Bloqueia o acesso às páginas sem cookie de sessão. A verificação
 * criptográfica do token acontece no servidor (lib/session.ts) — aqui é
 * apenas o portão de entrada.
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const publico =
    pathname === "/login" ||
    pathname.startsWith("/api/auth/") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico";

  if (publico) return NextResponse.next();

  const temCookie = Boolean(req.cookies.get(COOKIE_SESSAO)?.value);
  if (!temCookie) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Exclui assets do Next E arquivos estáticos da pasta public/ (logos,
  // favicon, fontes) — senão o redirect de login engole as imagens quando
  // o usuário está deslogado (ex.: a própria tela de login).
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|gif|webp|ico|woff|woff2)$).*)",
  ],
};
