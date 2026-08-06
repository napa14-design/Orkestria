"use client";

import { useState } from "react";
import useSWR from "swr";
import CrudManager from "@/components/CrudManager";
import Modal from "@/components/Modal";
import { apiPost, ErroApi, fetcher } from "@/lib/clientApi";
import type { Sede, UsuarioListado } from "@/types";

const PERFIS = [
  { valor: "administrador", rotulo: "Administrador" },
  { valor: "supervisor", rotulo: "Supervisor" },
  { valor: "visualizador", rotulo: "Visualizador/Gerência" },
];

const SELO_PERFIL: Record<string, string> = {
  administrador: "selo-vermelho",
  supervisor: "selo-azul",
  visualizador: "selo-cinza",
};

export default function PaginaUsuarios() {
  const { data: sedes } = useSWR<Sede[]>("/api/sedes", fetcher);
  const nomeSede = (id: string) =>
    id === "geral" ? "Geral (todas)" : (sedes?.find((s) => s.id === id)?.nome_sede ?? id);

  const [alvo, setAlvo] = useState<UsuarioListado | null>(null);
  const [estado, setEstado] = useState<"idle" | "enviando" | "ok" | "erro">("idle");
  const [msg, setMsg] = useState("");
  /** Código gerado, mostrado uma única vez. Depois de fechar, só gerando outro. */
  const [codigo, setCodigo] = useState("");

  function abrirCodigo(u: UsuarioListado, jaGerar: boolean) {
    setAlvo(u);
    setCodigo("");
    setMsg("");
    setEstado("idle");
    // Depois de cadastrar não faz sentido perguntar nada: a pessoa precisa do
    // código para conseguir entrar, então ele já sai gerado.
    if (jaGerar) void gerarCodigo(u);
  }

  async function gerarCodigo(u?: UsuarioListado) {
    const usuario = u ?? alvo;
    if (!usuario) return;
    setEstado("enviando");
    setMsg("");
    try {
      const r = await apiPost<{ codigo: string; expira_em: string }>(
        `/api/usuarios/${usuario.id}/codigo`,
        {},
      );
      setCodigo(r.codigo);
      setEstado("ok");
      setMsg(
        `Vale até ${new Date(r.expira_em).toLocaleDateString("pt-BR")}. Se ${usuario.nome.split(" ")[0]} tinha senha, ela foi apagada.`,
      );
    } catch (e) {
      setEstado("erro");
      setMsg(e instanceof ErroApi ? e.message : "Erro ao gerar o código.");
    }
  }

  return (
    <>
    <CrudManager<UsuarioListado>
      titulo="Usuários"
      subtitulo="Quem acessa o sistema. O perfil define as permissões; as sedes limitam o alcance dos supervisores — um coordenador pode operar mais de uma. Acesso restrito a administradores."
      endpoint="/api/usuarios"
      textoNovo="+ Novo usuário"
      campos={[
        { key: "nome", rotulo: "Nome", tipo: "texto", obrigatorio: true },
        {
          key: "email",
          rotulo: "E-mail",
          tipo: "texto",
          obrigatorio: true,
          ajuda: "Usado no login",
          dica: "O e-mail com que a pessoa entra no sistema. É também por ele que o histórico registra quem fez cada alteração.",
        },
        {
          key: "perfil",
          rotulo: "Perfil",
          tipo: "select",
          obrigatorio: true,
          opcoes: PERFIS,
          dica: "Define o que a pessoa pode fazer. • ADMINISTRADOR: acesso total, em todas as sedes (inclui cadastrar usuários). • SUPERVISOR: monta rotinas e cadastra, apenas nas sedes que opera (uma ou várias). • VISUALIZADOR/GERÊNCIA: só consulta dashboards e relatórios, não altera nada.",
        },
        {
          key: "sede_id",
          rotulo: "Sede",
          tipo: "select",
          obrigatorio: true,
          padrao: "geral",
          opcoes: [
            { valor: "geral", rotulo: "Geral (todas as sedes)" },
            ...(sedes ?? []).map((s) => ({ valor: s.id, rotulo: s.nome_sede })),
          ],
          dica: "A sede principal do usuário — é ela que abre por padrão nas telas. Para supervisor, define o alcance básico; se ele cobre mais de uma sede, acrescente as outras no campo abaixo. Administrador e gerência costumam usar \"Geral\" (todas as sedes).",
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
            "Para o coordenador que cobre mais de uma sede. Ele passa a enxergar e editar todas as marcadas aqui, além da principal, trocando de sede num seletor — a Central e a Agenda mostram uma sede por vez. A sede principal já está incluída, não precisa marcar.",
          // Aparece para TODO supervisor, mesmo antes de escolher a sede
          // principal: escondê-lo até a sede estar preenchida deixou o campo
          // invisível para quem estava cadastrando — o mesmo erro do botão de
          // modelos, que só existia na visão Semana.
          mostrarSe: (f) => f.perfil === "supervisor",
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
      acoesExtra={(u) => (
        <button
          className="btn btn-mini btn-fantasma"
          onClick={() => abrirCodigo(u, false)}
          title={
            u.senha_definida
              ? "Esqueceu a senha? Gera um código novo e apaga a senha atual"
              : "Gera o código para a pessoa fazer o primeiro acesso"
          }
        >
          {u.senha_definida ? "Novo código" : "Ver código"}
        </button>
      )}
    />

    <Modal
      titulo={`Código de primeiro acesso — ${alvo?.nome ?? ""}`}
      aberto={!!alvo}
      aoFechar={() => setAlvo(null)}
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
      ) : (
        <p style={{ fontSize: 13, color: "var(--tinta-2)", marginBottom: 14, lineHeight: 1.55 }}>
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
          className={`alerta ${estado === "erro" ? "alerta-erro" : "alerta-ok"}`}
          style={{ marginTop: 12, marginBottom: 4 }}
        >
          {msg}
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
        <button type="button" className="btn" onClick={() => setAlvo(null)}>
          {codigo ? "Já anotei, fechar" : "Cancelar"}
        </button>
        {!codigo && (
          <button
            type="button"
            className="btn btn-primario"
            onClick={() => void gerarCodigo()}
            disabled={estado === "enviando"}
          >
            {estado === "enviando" ? "Gerando…" : "Gerar código"}
          </button>
        )}
      </div>
    </Modal>
    </>
  );
}
