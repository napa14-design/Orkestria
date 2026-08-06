/**
 * O e-mail de boas-vindas com o código de primeiro acesso.
 *
 * O texto mora aqui, separado do transporte (`lib/email.ts`), porque é o que a
 * gente vai querer ajustar depois de ver a reação das pessoas.
 *
 * **HTML de e-mail é conservador de propósito:** tabela, estilo inline e nenhuma
 * fonte externa. Cliente de e-mail descarta `<style>`, `flex` e webfont sem
 * avisar — o que sobra tem que continuar legível. O texto puro não é enfeite: é
 * o que muita gente lê, e é o que aparece na prévia da caixa de entrada.
 */

export interface ConviteAcesso {
  nome: string;
  codigo: string;
  /** Data-hora ISO em que o código perde a validade. */
  expiraEm: string;
  /** Endereço do sistema, para a pessoa saber onde entrar. */
  url: string;
}

const TINTA = "#223127";
const PAPEL = "#f5f1e6";
const ACENTO = "#9c0d38";

function dataBR(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
}

export function conviteAcesso(dados: ConviteAcesso): {
  assunto: string;
  texto: string;
  html: string;
} {
  const primeiroNome = dados.nome.split(" ")[0];
  const validade = dataBR(dados.expiraEm);

  const texto = [
    `${primeiroNome}, seu acesso ao Orkestria está pronto.`,
    "",
    "O Orkestria é onde a rotina da sua equipe passa a ser montada — o que hoje",
    "você faz na planilha. Para entrar pela primeira vez, use o código abaixo:",
    "",
    `    ${dados.codigo}`,
    "",
    `Endereço: ${dados.url}`,
    "",
    "Como funciona:",
    "1. Abra o endereço acima e informe o seu e-mail.",
    "2. No campo de senha, digite este código.",
    "3. O sistema vai pedir que você crie a SUA senha — só sua, e ninguém no",
    "   sistema consegue vê-la, nem quem administra.",
    "",
    `Este código vale uma única vez${validade ? `, até ${validade}` : ""}. Depois de criar a senha,`,
    "ele deixa de funcionar.",
    "",
    "Se você perder o código ou esquecer a senha depois, peça um código novo a",
    "quem administra o sistema.",
    "",
    "Não precisa se preparar para nada: ao entrar, o sistema oferece um passo a",
    "passo dentro das próprias telas, e você faz no seu ritmo.",
  ].join("\n");

  const html = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAPEL};padding:28px 12px;font-family:Georgia,'Times New Roman',serif;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:540px;background:#fcfaf3;border:2px solid ${TINTA};">
      <tr><td style="background:${TINTA};padding:18px 24px;">
        <div style="color:${PAPEL};font-size:24px;font-weight:bold;letter-spacing:-0.5px;">Orkestr<span style="color:#e8a0b4;">ia</span></div>
        <div style="color:#b9c4bb;font-size:11px;letter-spacing:2px;text-transform:uppercase;font-family:Consolas,monospace;padding-top:4px;">Seu acesso está pronto</div>
      </td></tr>

      <tr><td style="padding:24px 24px 8px;">
        <!-- "Boas-vindas" e não "bem-vindo/bem-vinda": não presume o gênero de
             quem recebe, e a maioria das coordenações de sede é de mulheres. -->
        <div style="font-size:21px;color:${TINTA};font-weight:bold;padding-bottom:12px;">Boas-vindas, ${primeiroNome}.</div>
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#4a584e;">
          É aqui que a rotina da sua equipe passa a ser montada — o que hoje você faz
          na planilha. Para entrar pela primeira vez, use o código abaixo.
        </div>
      </td></tr>

      <tr><td style="padding:16px 24px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:2px dashed ${TINTA};background:#ece6d4;">
          <tr><td align="center" style="padding:16px;">
            <div style="font-family:Consolas,'Courier New',monospace;font-size:28px;font-weight:bold;letter-spacing:3px;color:${TINTA};">${dados.codigo}</div>
            ${validade ? `<div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#4a584e;padding-top:8px;">Vale uma única vez, até ${validade}</div>` : ""}
          </td></tr>
        </table>
      </td></tr>

      <tr><td style="padding:8px 24px 4px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.7;color:#4a584e;">
        <strong style="color:${TINTA};">Como entrar</strong><br>
        1. Abra <a href="${dados.url}" style="color:${ACENTO};">${dados.url}</a> e informe o seu e-mail.<br>
        2. No campo de senha, digite o código acima.<br>
        3. O sistema vai pedir que você crie a <strong>sua</strong> senha — só sua, e ninguém
        no sistema consegue vê-la, nem quem administra.
      </td></tr>

      <tr><td style="padding:16px 24px 24px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-left:3px solid #2e7d52;background:#ece6d4;">
          <tr><td style="padding:12px 14px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.6;color:#4a584e;">
            Não precisa se preparar para nada. Ao entrar, o sistema oferece um passo a
            passo dentro das próprias telas — você faz no seu ritmo, e pode parar e
            voltar depois.
          </td></tr>
        </table>
      </td></tr>

      <tr><td style="padding:0 24px 22px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#8a958c;border-top:1px solid #d9d2bc;padding-top:14px;">
        Perdeu o código ou esqueceu a senha depois? Peça um código novo a quem
        administra o sistema. Este e-mail foi enviado porque o seu acesso foi criado.
      </td></tr>
    </table>
  </td></tr>
</table>`;

  return {
    assunto: `${primeiroNome}, seu acesso ao Orkestria (código de primeiro acesso)`,
    texto,
    html,
  };
}
