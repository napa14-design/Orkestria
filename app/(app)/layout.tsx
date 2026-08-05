import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import Tutorial from "@/components/tutorial/Tutorial";
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
    </AppShell>
  );
}
