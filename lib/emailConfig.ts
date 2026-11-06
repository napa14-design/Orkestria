/**
 * Configuração do envio, separada de `lib/email.ts`: o cadastro de usuários precisa saber
 * se há envio, e ele está no caminho do login, que não deve carregar o `nodemailer`.
 */
export function configDoEmail() {
  return {
    host: process.env.SMTP_HOST?.trim(),
    porta: Number(process.env.SMTP_PORT ?? 587),
    usuario: process.env.SMTP_USER?.trim(),
    senha: process.env.SMTP_PASS,
    de: process.env.SMTP_FROM?.trim() || process.env.SMTP_USER?.trim(),
  };
}

/** Há credenciais para enviar? A interface usa isto para não prometer o que não vai cumprir. */
export function emailConfigurado(): boolean {
  const c = configDoEmail();
  return !!(c.host && c.usuario && c.senha);
}
