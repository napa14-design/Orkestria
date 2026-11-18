import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import AvisoNovidade from "@/components/AvisoNovidade";
import Tutorial from "@/components/tutorial/Tutorial";
import { podeEscrever } from "@/lib/permissions";
import { obterSessao } from "@/lib/session";

export default async function LayoutAutenticado({
  children,
}: {
  children: React.ReactNode;
}) {
  const sessao = await obterSessao();
  if (!sessao) redirect("/login");
  return (
    <AppShell sessao={sessao}>
      {children}
      {/* Fora do conteúdo: o holofote acompanha qualquer tela do sistema. */}
      <Tutorial />
      {/* Quem lança a atividade adicional e lê o déficit: coordenador e administrador. */}
      {podeEscrever(sessao) && <AvisoNovidade />}
    </AppShell>
  );
}
