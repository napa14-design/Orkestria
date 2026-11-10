"use client";

/**
 * "Feito automaticamente": as tarefas críticas de ausentes que o sistema passou
 * para outra pessoa sozinho (10/11/2026). Na Central e na Agenda. "Desfazer" volta
 * tudo como estava; "Entendi" some com o aviso neste navegador.
 */
import { useEffect, useState } from "react";
import { apiPost, ErroApi } from "@/lib/clientApi";
import type { AvisoRemanejo } from "@/lib/remanejoAuto";

const CHAVE = "orkestria:remanejos-vistos";

function lerVistos(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(CHAVE) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

export default function AvisosRemanejo({
  avisos,
  aoMudar,
  podeDesfazer,
}: {
  avisos: AvisoRemanejo[];
  aoMudar: () => void;
  podeDesfazer: boolean;
}) {
  // Lido depois de montar: o servidor não tem localStorage, e ler na renderização
  // daria um HTML diferente do navegador.
  const [vistos, setVistos] = useState<Set<string>>(new Set());
  useEffect(() => setVistos(lerVistos()), []);
  const [ocupado, setOcupado] = useState("");
  const [erro, setErro] = useState("");

  const visiveis = avisos.filter((a) => !vistos.has(`${a.rotina_id}|${a.em}`));
  if (visiveis.length === 0) return null;

  function marcarVisto(a: AvisoRemanejo) {
    const novos = new Set(vistos).add(`${a.rotina_id}|${a.em}`);
    setVistos(novos);
    try {
      // Só os últimos 200: o aviso é do dia, a lista não precisa crescer para sempre.
      localStorage.setItem(CHAVE, JSON.stringify([...novos].slice(-200)));
    } catch {
      // Sem storage o aviso volta na próxima vez; nada se perde.
    }
  }

  async function desfazer(a: AvisoRemanejo) {
    setOcupado(a.rotina_id);
    setErro("");
    try {
      await apiPost("/api/central-dia/desfazer-remanejo", { rotina_id: a.rotina_id });
      aoMudar();
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Não foi possível desfazer. Atualize a tela.");
    } finally {
      setOcupado("");
    }
  }

  return (
    <section className="alerta alerta-ok avisos-remanejo" role="status" aria-label="Remanejos automáticos">
      <strong className="rotulo">Feito automaticamente · tarefa crítica de quem faltou</strong>
      <ul>
        {visiveis.map((a) => (
          <li key={a.rotina_id}>
            <span>{a.texto}</span>
            <span className="avisos-remanejo-acoes">
              {podeDesfazer && (
                <button className="btn btn-mini" type="button" disabled={!!ocupado} onClick={() => void desfazer(a)}>
                  {ocupado === a.rotina_id ? "Desfazendo…" : "Desfazer"}
                </button>
              )}
              <button className="btn btn-mini btn-fantasma" type="button" onClick={() => marcarVisto(a)}>
                Entendi
              </button>
            </span>
          </li>
        ))}
      </ul>
      {erro && <p role="alert">{erro}</p>}
    </section>
  );
}
