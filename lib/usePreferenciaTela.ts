"use client";

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useSessao } from "@/components/SessaoContext";

/**
 * Lembra filtros simples de uma tela por usuário neste navegador.
 * Falha de armazenamento nunca impede o uso normal da página.
 */
export function usePreferenciaTela(
  tela: string,
  campo: string,
  valorInicial: string,
): [string, Dispatch<SetStateAction<string>>] {
  const sessao = useSessao();
  const inicialRef = useRef(valorInicial);
  const [valor, setValor] = useState(valorInicial);
  const [carregado, setCarregado] = useState(false);
  const chave = `orkestria:tela:v1:${encodeURIComponent(sessao.id)}:${tela}:${campo}`;

  useEffect(() => {
    setCarregado(false);
    try {
      const salvo = window.localStorage.getItem(chave);
      setValor(salvo ?? inicialRef.current);
    } catch {
      setValor(inicialRef.current);
    }
    setCarregado(true);
  }, [chave]);

  useEffect(() => {
    if (!carregado) return;
    try {
      window.localStorage.setItem(chave, valor);
    } catch {
      // Navegador sem armazenamento: mantém o estado apenas nesta visita.
    }
  }, [carregado, chave, valor]);

  return [valor, setValor];
}
