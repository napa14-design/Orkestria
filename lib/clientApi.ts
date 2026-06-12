/** Helpers de fetch do lado do cliente (SWR + mutações). */
import type { AlertaValidacao } from "@/types";

export class ErroApi extends Error {
  status: number;
  alertas: AlertaValidacao[];

  constructor(mensagem: string, status: number, alertas: AlertaValidacao[] = []) {
    super(mensagem);
    this.status = status;
    this.alertas = alertas;
  }
}

async function tratar<T>(res: Response): Promise<T> {
  if (res.status === 401 && typeof window !== "undefined") {
    window.location.href = "/login";
  }
  const corpo = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ErroApi(
      (corpo as { erro?: string }).erro ?? `Erro ${res.status}`,
      res.status,
      (corpo as { alertas?: AlertaValidacao[] }).alertas ?? [],
    );
  }
  return corpo as T;
}

/** Fetcher padrão do SWR. */
export const fetcher = async <T = unknown>(url: string): Promise<T> =>
  tratar<T>(await fetch(url));

export const apiPost = async <T = unknown>(url: string, corpo: unknown): Promise<T> =>
  tratar<T>(
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    }),
  );

export const apiPut = async <T = unknown>(url: string, corpo: unknown): Promise<T> =>
  tratar<T>(
    await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    }),
  );

export const apiDelete = async <T = unknown>(url: string): Promise<T> =>
  tratar<T>(await fetch(url, { method: "DELETE" }));
