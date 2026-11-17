/**
 * Envio do resumo diário das rotas (ver `lib/resumoDiario.ts`). Chamado pelo Vercel Cron às
 * 10h de Fortaleza, de segunda a sábado, numa rota SEM chave (decisão do dono, 16/11/2026:
 * nenhum segredo novo). Qualquer um pode chamar a rota — e o pior que consegue é o e-mail do
 * dia sair alguns minutos antes, dentro da janela (risco aceito). As travas, por isso,
 * moram aqui, na ordem em que custam (casos de ataque do `seguranca`, 17/11/2026):
 *  1. fora da janela (seg–sáb, 10:00–10:59 de Fortaleza) ou sem SMTP: nada é lido;
 *  2. a trava do dia é um `create` (falha se já existe) ANTES de qualquer leitura de dado —
 *     uma chamada repetida custa uma leitura, não uma varredura do banco;
 *  3. a trava NUNCA é solta: envio que falhou deixa o dia sem e-mail, em vez de deixar quem
 *     chama em laço refazer a varredura e o SMTP a cada chamada;
 *  4. só recebe quem está no parâmetro E é usuário ativo coordenador/administrador, no
 *     endereço normalizado do parâmetro; as sedes saem do cadastro dessa pessoa;
 *  5. quem chama a rota só vê "ok" ou "fora da janela" — o status fino fica no log.
 */
import { feriadoDoDia } from "@/lib/calculations";
import { executarComUsuario } from "@/lib/contextoUsuario";
import { agoraISO, getDataSource } from "@/lib/datasource";
import { diaDaSemana } from "@/lib/dateUtils";
import { emailConfigurado, enviarEmail } from "@/lib/email";
import { sedesPermitidas, sessaoDoCadastro } from "@/lib/permissions";
import {
  janelaDoResumo,
  lerDestinatarios,
  montarEmailDoResumo,
  PARAMETRO_DESTINATARIOS,
  situacaoDaSede,
} from "@/lib/resumoDiario";

export type StatusResumo = "fora da janela" | "sem destinatário" | "já enviado" | "enviado" | "falhou";

/** Id da trava do dia em `cache_resumo` (dado derivado, fora do histórico). */
export const idDaTrava = (data: string) => `resumo_diario_${data}`;

const USUARIO_DO_AGENDAMENTO = "agendado:resumo-diario";

/**
 * Endereço do sistema para o botão do e-mail. Nunca do pedido: a rota é pública, e o
 * cabeçalho Host é de quem chama. `APP_URL` (o mesmo do convite) ou o domínio de produção
 * que a própria Vercel informa; sem nenhum, o e-mail sai sem botão.
 */
function urlDaAgenda(): string {
  const base = process.env.APP_URL?.trim() || (process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL.trim()}` : "");
  return /^https:\/\/[a-z0-9.-]+(:\d+)?\/?$/i.test(base) ? `${base.replace(/\/$/, "")}/rotinas` : "";
}

export async function enviarResumoDiario(agora: Date = new Date()): Promise<StatusResumo> {
  const { data, dentro } = janelaDoResumo(agora);
  if (!dentro || !emailConfigurado()) return "fora da janela";
  const ds = await getDataSource();
  const trava = idDaTrava(data);
  const anotar = (corpo: string) =>
    executarComUsuario(USUARIO_DO_AGENDAMENTO, () => ds.atualizar("cache_resumo", trava, { corpo })).catch((e) =>
      console.error("[resumo-diario] não anotou a trava", e),
    );

  // 2. A trava ANTES de ler qualquer dado: duas chamadas ao mesmo tempo não mandam dois
  // e-mails, e a segunda chamada do dia não custa nada além disto.
  try {
    await executarComUsuario(USUARIO_DO_AGENDAMENTO, () =>
      ds.gravarLote([
        {
          tipo: "criar",
          tabela: "cache_resumo",
          exigirNovo: true,
          registro: { id: trava, corpo: "enviando", expira_em: `${data}T23:59:59.999Z`, criado_em: agoraISO() },
        },
      ]),
    );
  } catch {
    return "já enviado";
  }

  try {
    const parametros = await ds.consultar("parametros", [{ campo: "chave", op: "==", valor: PARAMETRO_DESTINATARIOS }]);
    // Só o parâmetro GERAL e ativo vale: um por sede não amplia nada.
    const emails = lerDestinatarios(parametros.find((p) => p.ativo === true && p.sede_id === "geral")?.valor);
    const usuarios = emails.length ? await ds.listar("usuarios") : [];
    const destinatarios = emails.flatMap((email) => {
      const achados = usuarios.filter((u) => String(u.email ?? "").trim().toLowerCase() === email);
      // E-mail repetido no cadastro é ambíguo: não envia para nenhum dos dois.
      const s = achados.length === 1 ? sessaoDoCadastro(achados[0]) : null;
      return s && (s.perfil === "coordenador" || s.perfil === "administrador") ? [{ email, sessao: s }] : [];
    });
    if (!destinatarios.length) {
      await anotar("sem destinatário");
      return "sem destinatário";
    }

    const sedes = (await ds.listar("sedes")).filter((s) => s.ativo === true);
    const doDestinatario = (s: (typeof destinatarios)[number]["sessao"]) => {
      const permitidas = sedesPermitidas(s);
      return permitidas === null ? sedes : sedes.filter((x) => permitidas.includes(x.id));
    };
    const precisa = [...new Set(destinatarios.flatMap((d) => doDestinatario(d.sessao).map((x) => x.id)))];
    const dow = diaDaSemana(data);
    const feriados = await ds.listar("feriados");
    // Contar em vez de ler; a rota padrão só é lida para a sede que ficou sem nada.
    const dados = new Map(
      await Promise.all(
        precisa.map(async (id) => {
          const doDia = [{ campo: "sede_id", op: "==" as const, valor: id }, { campo: "data", op: "==" as const, valor: data }];
          const blocos =
            (await ds.contar("rotinas_planejadas", doDia)) -
            (await ds.contar("rotinas_planejadas", [...doDia, { campo: "status", op: "==", valor: "cancelada" }]));
          const semNada = blocos === 0 && !feriadoDoDia(feriados, id, data);
          const itens = semNada
            ? (await ds.consultar("modelos_rotina", [{ campo: "sede_id", op: "==", valor: id }])).filter((i) => i.padrao && !i.evento)
            : [];
          return [id, { blocos, itens }] as const;
        }),
      ),
    );

    let enviados = 0;
    for (const d of destinatarios) {
      const linhas = doDestinatario(d.sessao).map((sede) =>
        situacaoDaSede({ sede, data, dow, blocos: dados.get(sede.id)!.blocos, itensPadrao: dados.get(sede.id)!.itens, feriados }),
      );
      if (!linhas.length) continue;
      const r = await enviarEmail({ para: d.email, ...montarEmailDoResumo(data, linhas, urlDaAgenda()) });
      if (r.enviado) enviados++;
      else console.error("[resumo-diario] envio falhou", r.motivo);
    }
    await anotar(enviados ? `enviado a ${enviados} de ${destinatarios.length}` : "falhou");
    return enviados ? "enviado" : "falhou";
  } catch (e) {
    // 3. A trava fica: o dia sai sem e-mail, mas ninguém refaz a varredura em laço.
    console.error("[resumo-diario]", e);
    await anotar("falhou");
    return "falhou";
  }
}
