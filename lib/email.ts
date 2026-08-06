/**
 * Envio de e-mail por SMTP.
 *
 * SMTP de propósito, e não a API de um fornecedor: a mesma implementação atende
 * o Google Workspace do cliente, um servidor próprio e serviços como
 * Resend/SendGrid/Mailgun (todos oferecem SMTP). Trocar de caminho é trocar
 * variáveis de ambiente, não código.
 *
 * **Nunca lança.** E-mail é melhor esforço: se a entrega falhar, o fluxo que
 * chamou (criar usuário, gerar código) tem que continuar e mostrar o dado na
 * tela. Um envio quebrado não pode virar uma pessoa sem acesso.
 */
import nodemailer, { type Transporter } from "nodemailer";

export interface ResultadoEnvio {
  enviado: boolean;
  /** Por que não foi — mostrado a quem operou, não engolido. */
  motivo?: string;
}

function config() {
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
  const c = config();
  return !!(c.host && c.usuario && c.senha);
}

let transporte: Transporter | null = null;

function obterTransporte(): Transporter {
  if (transporte) return transporte;
  const c = config();
  transporte = nodemailer.createTransport({
    host: c.host,
    port: c.porta,
    // 465 é TLS direto; 587 sobe para TLS com STARTTLS.
    secure: c.porta === 465,
    auth: { user: c.usuario, pass: c.senha },
    // Sem limite, host errado ou porta bloqueada deixariam o administrador
    // olhando uma tela travada. 10s é mais que suficiente e falha rápido.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
  return transporte;
}

export async function enviarEmail(args: {
  para: string;
  assunto: string;
  texto: string;
  html: string;
}): Promise<ResultadoEnvio> {
  if (!emailConfigurado()) {
    console.warn("[email] SMTP não configurado — envio ignorado.", { para: args.para });
    return { enviado: false, motivo: "O envio de e-mail ainda não foi configurado no sistema." };
  }
  try {
    const c = config();
    await obterTransporte().sendMail({
      from: c.de,
      to: args.para,
      subject: args.assunto,
      text: args.texto,
      html: args.html,
    });
    return { enviado: true };
  } catch (e) {
    // Log completo para o servidor; mensagem curta para a tela.
    console.error("[email] falha ao enviar:", e);
    const detalhe = e instanceof Error ? e.message : String(e);
    return { enviado: false, motivo: `O servidor de e-mail recusou o envio: ${detalhe}` };
  }
}
