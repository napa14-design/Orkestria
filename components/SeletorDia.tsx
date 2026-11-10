"use client";

/**
 * Dia da tela, com setas para o anterior e o próximo. O campo de data do navegador obrigava a
 * abrir o calendário para cada troca de dia e não dizia o dia da semana, que importa quando
 * o sábado tem outro horário e outra rota (pedido do dono, 10/11/2026). Clicar no dia ainda
 * abre o calendário: o campo nativo continua lá, invisível, só para isso.
 */
import { useRef } from "react";
import { DIAS_SEMANA, diaDaSemana, formatarDataBR, hojeISO, somarDias } from "@/lib/dateUtils";

/** "Terça 10/11" — com o ano só quando não é o ano corrente. */
export function rotuloDoDia(iso: string, hoje = hojeISO()): { semana: string; data: string } {
  const nome = DIAS_SEMANA[diaDaSemana(iso)];
  const br = formatarDataBR(iso);
  return {
    semana: nome.charAt(0).toUpperCase() + nome.slice(1),
    data: iso.slice(0, 4) === hoje.slice(0, 4) ? br.slice(0, 5) : br,
  };
}

export default function SeletorDia({
  data,
  aoMudar,
  passo = 1,
  rotulo = "Dia",
  tour,
}: {
  data: string;
  aoMudar: (iso: string) => void;
  /** Quanto as setas andam: 7 na visão da semana. */
  passo?: number;
  rotulo?: string;
  tour?: string;
}) {
  const campo = useRef<HTMLInputElement>(null);
  const hoje = hojeISO();
  const { semana, data: dia } = rotuloDoDia(data, hoje);
  const [anterior, proximo] = passo === 7 ? ["Semana anterior", "Próxima semana"] : ["Dia anterior", "Próximo dia"];
  const abrirCalendario = () => {
    const c = campo.current;
    if (!c) return;
    try {
      c.showPicker();
    } catch {
      c.focus(); // navegador sem showPicker: o foco no campo ainda deixa digitar a data
    }
  };

  return (
    <div className="campo" data-tour={tour}>
      <span className="rotulo">{rotulo}</span>
      <div className="seletor-linha">
        <div className="seletor-dia">
          <button type="button" onClick={() => aoMudar(somarDias(data, -passo))} aria-label={anterior} title={anterior}>
            ‹
          </button>
          <button type="button" className="seletor-dia-atual" onClick={abrirCalendario} aria-label={`${semana}, ${formatarDataBR(data)}. Escolher no calendário`}>
            <span>{semana}</span>
            <span className="num">{dia}</span>
          </button>
          <button type="button" onClick={() => aoMudar(somarDias(data, passo))} aria-label={proximo} title={proximo}>
            ›
          </button>
          <input
            ref={campo}
            type="date"
            value={data}
            onChange={(e) => e.target.value && aoMudar(e.target.value)}
            tabIndex={-1}
            aria-hidden="true"
          />
        </div>
        {data !== hoje && (
          <button type="button" className="btn btn-mini" onClick={() => aoMudar(hoje)}>
            Hoje
          </button>
        )}
      </div>
    </div>
  );
}
