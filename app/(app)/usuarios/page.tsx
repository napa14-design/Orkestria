"use client";

import { useState } from "react";
import useSWR from "swr";
import CrudManager from "@/components/CrudManager";
import Modal from "@/components/Modal";
import { apiDelete, ErroApi, fetcher } from "@/lib/clientApi";
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

  async function resetarSenha() {
    if (!alvo) return;
    setEstado("enviando");
    setMsg("");
    try {
      await apiDelete(`/api/usuarios/${alvo.id}/senha`);
      setEstado("ok");
      setMsg(
        `Senha de ${alvo.nome} apagada. No próximo login ele entra com a senha de primeiro acesso e escolhe uma nova.`,
      );
    } catch (e) {
      setEstado("erro");
      setMsg(e instanceof ErroApi ? e.message : "Erro ao resetar a senha.");
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
          ajuda: "Deixe vazio se ele cuida só da sede principal",
          dica:
            "Para o coordenador que cobre mais de uma sede. Ele passa a enxergar e editar todas as marcadas aqui, além da principal, trocando de sede num seletor — a Central e a Agenda mostram uma sede por vez. A sede principal já está incluída, não precisa marcar. Só aparece para supervisor com sede específica: administrador e gerência já alcançam todas.",
          // Escopo por sede só existe para supervisor; com "Geral" a lista não
          // significaria nada, porque ele já alcança todas.
          mostrarSe: (f) => f.perfil === "supervisor" && f.sede_id !== "geral",
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
          rotulo: "Senha",
          // Serve para acompanhar a implantação: mostra quem ainda não entrou
          // pela primeira vez e portanto continua usando a senha compartilhada.
          render: (u) =>
            u.senha_definida ? (
              <span className="selo selo-verde" title="Tem senha própria">
                Própria
              </span>
            ) : (
              <span className="selo selo-laranja" title="Ainda entra com a senha de primeiro acesso">
                1º acesso
              </span>
            ),
        },
      ]}
      acoesExtra={(u) =>
        u.senha_definida ? (
          <button
            className="btn btn-mini btn-fantasma"
            onClick={() => {
              setAlvo(u);
              setEstado("idle");
              setMsg("");
            }}
            title="Apaga a senha para a pessoa criar outra no próximo login"
          >
            Resetar senha
          </button>
        ) : null
      }
    />

    <Modal titulo={`Resetar senha — ${alvo?.nome ?? ""}`} aberto={!!alvo} aoFechar={() => setAlvo(null)} larguraMax={440}>
      <p style={{ fontSize: 13, color: "var(--tinta-2)", marginBottom: 12, lineHeight: 1.55 }}>
        Use quando <strong>{alvo?.email}</strong> esquecer a senha. A senha atual é apagada e, no
        próximo login, o sistema pede que a pessoa <strong>crie uma nova</strong> — você não precisa
        saber qual será.
      </p>
      <p style={{ fontSize: 13, color: "var(--tinta-2)", marginBottom: 14, lineHeight: 1.55 }}>
        Para entrar dessa vez, ela vai precisar da <strong>senha de primeiro acesso</strong> (a mesma
        usada quando a conta foi criada). Passe essa senha para ela.
      </p>
      {msg && (
        <div className={`alerta ${estado === "erro" ? "alerta-erro" : "alerta-ok"}`} style={{ marginBottom: 12 }}>
          {msg}
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <button type="button" className="btn" onClick={() => setAlvo(null)}>
          {estado === "ok" ? "Fechar" : "Cancelar"}
        </button>
        {estado !== "ok" && (
          <button type="button" className="btn btn-primario" onClick={resetarSenha} disabled={estado === "enviando"}>
            {estado === "enviando" ? "Resetando…" : "Resetar senha"}
          </button>
        )}
      </div>
    </Modal>
    </>
  );
}
