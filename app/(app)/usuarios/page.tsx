"use client";

import { useRef, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import CrudManager from "@/components/CrudManager";
import Modal from "@/components/Modal";
import { useSessao } from "@/components/SessaoContexto";
import { apiPost, ErroApi, fetcher } from "@/lib/clientApi";
import { podeGerirCoordenador, podeGerirSupervisor } from "@/lib/permissions";
import type { Sede, UsuarioListado } from "@/types";

const PERFIS = [
  { valor: "administrador", rotulo: "Administrador" },
  { valor: "coordenador", rotulo: "Coordenador" },
  { valor: "supervisor", rotulo: "Supervisor" },
  { valor: "visualizador", rotulo: "Visualizador/Gerência" },
];

/** O perfil como está gravado: decide por ele, e não pelo que já foi escolhido no formulário. */
const perfilGravado = (form: Record<string, unknown>) => (form.__antes as UsuarioListado | undefined)?.perfil;

const SELO_PERFIL: Record<string, string> = {
  administrador: "selo-vermelho",
  coordenador: "selo-azul",
  supervisor: "selo-roxo",
  visualizador: "selo-cinza",
};

export default function PaginaUsuarios() {
  // O coordenador cadastra e edita supervisores e coordenadores inteiramente nas sedes
  // dele, e só vê os que também operam outras. O servidor garante, e a tela não oferece o
  // que ele recusaria.
  const sessao = useSessao();
  const coordenador = sessao?.perfil === "coordenador";
  const alcanca = (u: UsuarioListado) => !coordenador || podeGerirSupervisor(sessao, u) || podeGerirCoordenador(sessao, u);
  /** O código de coordenador pedido por um colega vai só para o e-mail dele. */
  const soPorEmail = (u: UsuarioListado | null) => coordenador && u?.perfil === "coordenador";
  const { data: sedes } = useSWR<Sede[]>("/api/sedes", fetcher);
  const nomeSede = (id: string) =>
    id === "geral" ? "Geral (todas)" : (sedes?.find((s) => s.id === id)?.nome_sede ?? (coordenador ? "Outra sede" : id));

  const [alvo, setAlvo] = useState<UsuarioListado | null>(null);
  const [estado, setEstado] = useState<"idle" | "enviando" | "ok" | "erro">("idle");
  const [msg, setMsg] = useState("");
  /** Código gerado, mostrado uma única vez. Depois de fechar, só gerando outro. */
  const [codigo, setCodigo] = useState("");
  /** Envio do e-mail deu certo? Muda o alerta de verde para vermelho. */
  const [emailOk, setEmailOk] = useState(false);
  const { mutate } = useSWRConfig();
  /** O pedido em curso: a resposta de um anterior não cai no modal de outra pessoa. */
  const pedidoAtual = useRef(0);

  function abrirCodigo(u: UsuarioListado, jaGerar: boolean) {
    pedidoAtual.current += 1;
    setAlvo(u);
    setCodigo("");
    setMsg("");
    setEstado("idle");
    setEmailOk(false);
    // Depois de cadastrar não faz sentido perguntar nada: a pessoa precisa do
    // código para conseguir entrar, então ele já sai gerado.
    if (jaGerar) void gerarCodigo(u);
  }

  async function gerarCodigo(u?: UsuarioListado) {
    const usuario = u ?? alvo;
    if (!usuario) return;
    const pedido = ++pedidoAtual.current;
    setEstado("enviando");
    setMsg("");
    try {
      const r = await apiPost<{
        codigo?: string;
        expira_em?: string;
        email: { enviado: boolean; motivo?: string; destino: string };
      }>(`/api/usuarios/${usuario.id}/codigo`, {});
      if (pedido !== pedidoAtual.current) return;
      setCodigo(r.codigo ?? "");
      setEstado("ok");
      const motivo = r.email.motivo ? ` (${r.email.motivo})` : "";
      const validade = r.expira_em ? `Vale até ${new Date(r.expira_em).toLocaleDateString("pt-BR")}.` : "";
      // O resultado do envio é dito sempre. Se ele falhou e ninguém avisar, quem pediu
      // acha que a pessoa recebeu — e ela fica sem acesso.
      setMsg(
        r.email.enviado
          ? `${validade} E-mail enviado para ${r.email.destino}.`
          : r.codigo
            ? `${validade} E-mail NÃO enviado${motivo} — passe o código por outro caminho.`
            : `E-mail NÃO enviado${motivo}. Nenhum código foi gerado${usuario.senha_definida ? "; a senha dela segue valendo" : ", e ela não entra até receber um"}. Tente de novo ou peça a um administrador.`,
      );
      setEmailOk(r.email.enviado);
    } catch (e) {
      if (pedido !== pedidoAtual.current) return;
      setEstado("erro");
      setMsg(e instanceof ErroApi ? e.message : "Erro ao gerar o código.");
    } finally {
      // O selo de acesso da linha mudou (ou não): a lista diz o que está gravado.
      void mutate("/api/usuarios");
    }
  }

  return (
    <>
    <CrudManager<UsuarioListado>
      titulo="Usuários"
      subtitulo={
        coordenador
          ? "Os supervisores e coordenadores das sedes que você opera. Coordenador que também opera outra sede aparece só para consulta. Trocar o e-mail ou tirar o perfil de um coordenador, reativar e excluir é com um administrador."
          : "Quem acessa o sistema. O perfil define as permissões; as sedes limitam o alcance de coordenadores e supervisores — cada um pode operar mais de uma. Acesso restrito a administradores."
      }
      endpoint="/api/usuarios"
      textoNovo="+ Novo usuário"
      permissao={{
        excluir: !coordenador,
        alterar: alcanca,
        semAcao: { texto: "só consulta", dica: "Também opera uma sede fora das suas: só um administrador altera." },
      }}
      campos={[
        { key: "nome", rotulo: "Nome", tipo: "texto", obrigatorio: true },
        {
          key: "email",
          rotulo: "E-mail",
          tipo: "texto",
          obrigatorio: true,
          ajuda: (f) =>
            coordenador && perfilGravado(f) === "coordenador"
              ? "Usado no login. Só um administrador troca o e-mail de um coordenador"
              : "Usado no login",
          dica: "O e-mail com que a pessoa entra no sistema. É também por ele que o histórico registra quem fez cada alteração.",
        },
        {
          key: "perfil",
          rotulo: "Perfil",
          tipo: "select",
          obrigatorio: true,
          // Sem padrão: com "Supervisor" pré-selecionado, quem queria um coordenador salvava
          // supervisor sem perceber. Ao editar um coordenador, rebaixar nem aparece.
          opcoes: (form) =>
            coordenador
              ? PERFIS.filter((p) => p.valor === "coordenador" || (p.valor === "supervisor" && perfilGravado(form) !== "coordenador"))
              : PERFIS,
          ajuda: (f) =>
            perfilGravado(f) === "supervisor" && f.perfil && f.perfil !== "supervisor"
              ? "Ao salvar, a senha dela deixa de valer e ela entra de novo pelo código"
              : "",
          dica: "Define o que a pessoa pode fazer. • ADMINISTRADOR: acesso total, em todas as sedes (inclui cadastrar usuários). • COORDENADOR: monta as rotas e faz os cadastros, apenas nas sedes que opera (uma ou várias). • SUPERVISOR: vê a rota e marca as tarefas como feitas ou não, só nas sedes dele — não pode ter \"Geral\" (todas as sedes). • VISUALIZADOR/GERÊNCIA: só consulta dashboards e relatórios, não altera nada.",
        },
        {
          key: "sede_id",
          rotulo: "Sede",
          tipo: "select",
          obrigatorio: true,
          // SEM padrão de propósito: com "Geral" pré-selecionado, salvar um
          // coordenador sem olhar este campo dava a ele escrita em TODAS as
          // sedes. Escolha aberta obriga uma decisão consciente — um clique a
          // mais no cadastro (raro) para não distribuir acesso por descuido.
          // O supervisor nunca alcança todas as sedes (o servidor recusa
          // "Geral" para ele), então a opção nem aparece.
          opcoes: (form) => [
            ...(form.perfil === "supervisor" || coordenador
              ? []
              : [
                  {
                    valor: "geral",
                    rotulo:
                      form.perfil === "coordenador"
                        ? "Geral — TODAS as sedes (incomum para coordenador)"
                        : "Geral (todas as sedes)",
                  },
                ]),
            ...(sedes ?? []).map((s) => ({ valor: s.id, rotulo: s.nome_sede })),
          ],
          dica: "A sede principal do usuário — é ela que abre por padrão nas telas. Para coordenador e supervisor, define o alcance básico; se ele cobre mais de uma sede, acrescente as outras no campo abaixo. Supervisor não pode ter \"Geral\". Administrador e gerência costumam usar \"Geral\" (todas as sedes).",
        },
        {
          key: "sedes_extra",
          rotulo: "Outras sedes que ele opera",
          tipo: "multiselect",
          inteira: true,
          opcoes: (sedes ?? []).map((s) => ({ valor: s.id, rotulo: s.nome_sede })),
          ajuda:
            "Marque as sedes extras. Deixe vazio se ele cuida só da principal (com sede \"Geral\" este campo é ignorado)",
          dica:
            "Para o coordenador ou supervisor que cobre mais de uma sede. Ele passa a enxergar todas as marcadas aqui, além da principal, trocando de sede num seletor — as telas mostram uma sede por vez. O coordenador edita nelas; o supervisor marca o realizado. A sede principal já está incluída, não precisa marcar.",
          // Aparece para TODO coordenador e supervisor, mesmo antes de escolher a sede
          // principal: escondê-lo até a sede estar preenchida deixou o campo
          // invisível para quem estava cadastrando — o mesmo erro do botão de
          // modelos, que só existia na visão Semana.
          mostrarSe: (f) => f.perfil === "coordenador" || f.perfil === "supervisor",
        },
        { key: "ativo", rotulo: "Ativo", tipo: "checkbox", padrao: true },
      ]}
      colunas={[
        { key: "nome", rotulo: "Nome" },
        { key: "email", rotulo: "E-mail", render: (u) => <code className="num">{u.email}</code> },
        {
          key: "perfil",
          rotulo: "Perfil",
          render: (u) => (
            <span className={`selo ${SELO_PERFIL[u.perfil] ?? "selo-cinza"}`}>
              {PERFIS.find((p) => p.valor === u.perfil)?.rotulo ?? u.perfil}
            </span>
          ),
        },
        {
          key: "sede_id",
          rotulo: "Sede",
          render: (u) => {
            const extras = (u.sedes_extra ?? "").split(",").filter(Boolean);
            return (
              <>
                {nomeSede(u.sede_id)}
                {extras.length > 0 && (
                  <span
                    className="selo selo-azul"
                    style={{ marginLeft: 6 }}
                    title={`Também opera: ${extras.map(nomeSede).join(", ")}`}
                  >
                    +{extras.length}
                  </span>
                )}
              </>
            );
          },
        },
        {
          key: "ativo",
          rotulo: "Status",
          render: (u) => (
            <span className={`selo ${u.ativo ? "selo-verde" : "selo-cinza"}`}>
              {u.ativo ? "Ativo" : "Inativo"}
            </span>
          ),
        },
        {
          key: "senha_definida",
          rotulo: "Acesso",
          // Acompanha a implantação: quem já entrou, quem tem código na mão e
          // quem está travado porque o código venceu.
          render: (u) =>
            u.senha_definida ? (
              <span className="selo selo-verde" title="Já fez o primeiro acesso e tem senha própria">
                Senha própria
              </span>
            ) : u.convite_valido ? (
              <span className="selo selo-azul" title="Código gerado, aguardando o primeiro acesso">
                Código enviado
              </span>
            ) : u.convite_expirado ? (
              <span className="selo selo-vermelho" title="O código venceu — gere outro">
                Código vencido
              </span>
            ) : (
              <span className="selo selo-laranja" title="Ainda não tem como entrar — gere um código">
                Sem acesso
              </span>
            ),
        },
      ]}
      aoCriar={(criado) => abrirCodigo(criado, true)}
      // Saiu de supervisor, a senha caiu: sem um código novo, a pessoa não entra.
      aoEditar={(salvo, antes) => {
        if (antes.perfil === "supervisor" && salvo.perfil !== "supervisor" && salvo.ativo) abrirCodigo(salvo, true);
      }}
      acoesExtra={(u) => !u.ativo || !alcanca(u) ? null : (
        <button
          className="btn btn-mini btn-fantasma"
          onClick={() => abrirCodigo(u, false)}
          title={
            u.senha_definida
              ? "Esqueceu a senha? Gera um código novo e apaga a senha atual"
              : "Gera o código para a pessoa fazer o primeiro acesso"
          }
        >
          {soPorEmail(u) ? "Enviar código" : u.senha_definida ? "Novo código" : "Ver código"}
        </button>
      )}
    />

    <Modal
      titulo={`Código de primeiro acesso — ${alvo?.nome ?? ""}`}
      aberto={!!alvo}
      aoFechar={() => {
        if (estado !== "enviando") setAlvo(null);
      }}
      larguraMax={460}
    >
      {codigo ? (
        <>
          <p style={{ fontSize: 13, color: "var(--tinta-2)", marginBottom: 14, lineHeight: 1.55 }}>
            Passe este código para <strong>{alvo?.email}</strong>. Ela entra com o e-mail e o código,
            e o sistema pede que crie a senha dela — que você não vai conhecer.
          </p>
          <div className="codigo-acesso" role="group" aria-label="Código de primeiro acesso">
            <code>{codigo}</code>
            <button
              type="button"
              className="btn btn-mini"
              onClick={() => void navigator.clipboard?.writeText(codigo)}
            >
              Copiar
            </button>
          </div>
          <p style={{ fontSize: 12.5, color: "var(--acento)", marginTop: 12, lineHeight: 1.55, fontWeight: 600 }}>
            Anote agora. Ao fechar esta janela o código não é mostrado de novo — se perder, gere
            outro.
          </p>
        </>
      ) : estado === "ok" ? null : (
        <p style={{ fontSize: 13, color: "var(--tinta-2)", marginBottom: 14, lineHeight: 1.55 }}>
          {soPorEmail(alvo) && (
            <>
              O código vai só para o e-mail <strong>{alvo?.email}</strong>: você não o vê.{" "}
            </>
          )}
          {alvo?.senha_definida ? (
            <>
              <strong>{alvo?.nome.split(" ")[0]}</strong> já tem senha própria. Gerar um código novo{" "}
              <strong>apaga a senha atual</strong> — use quando ela esqueceu e precisa entrar de novo.
            </>
          ) : (
            <>
              Gera o código que <strong>{alvo?.email}</strong> usa para entrar pela primeira vez e
              criar a senha dela.
            </>
          )}
        </p>
      )}
      {msg && (
        <div
          className={`alerta ${estado === "erro" || (estado === "ok" && !emailOk) ? "alerta-erro" : "alerta-ok"}`}
          style={{ marginTop: 12, marginBottom: 4 }}
        >
          {msg}
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
        {/* Durante o envio não há como cancelar: o e-mail sai de qualquer jeito. */}
        <button type="button" className="btn" onClick={() => setAlvo(null)} disabled={estado === "enviando"}>
          {codigo ? "Já anotei, fechar" : estado === "ok" ? "Fechar" : "Cancelar"}
        </button>
        {!codigo && estado !== "ok" && (
          <button
            type="button"
            className="btn btn-primario"
            onClick={() => void gerarCodigo()}
            disabled={estado === "enviando"}
          >
            {estado === "enviando" ? "Gerando…" : soPorEmail(alvo) ? "Enviar código" : "Gerar código"}
          </button>
        )}
      </div>
    </Modal>
    </>
  );
}
