/**
 * O que o ID token do Firebase precisa provar para o login com Google valer.
 *
 * A apiKey e o projectId são públicos (é assim que o Firebase funciona). Se o
 * provedor E-mail/senha estiver habilitado no projeto, qualquer pessoa cria uma
 * conta com o e-mail de um administrador e recebe um ID token válido, com
 * `email_verified: false`. Aceitar `decoded.email` sem olhar isso era entrar como
 * quem se quisesse (auditoria de segurança, 14/10/2026).
 */
export function emailDoTokenGoogle(decoded: {
  email?: string;
  email_verified?: boolean;
  firebase?: { sign_in_provider?: string };
}): { email: string } | { erro: string } {
  if (decoded.firebase?.sign_in_provider !== "google.com")
    return { erro: "O login precisa ser feito com uma conta Google." };
  if (decoded.email_verified !== true) return { erro: "O e-mail da conta Google não está verificado." };
  const email = decoded.email?.toLowerCase();
  if (!email) return { erro: "A conta Google não tem e-mail." };
  return { email };
}
