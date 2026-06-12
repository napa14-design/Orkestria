import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import { obterSessao } from "@/lib/session";

export default async function LayoutAutenticado({
  children,
}: {
  children: React.ReactNode;
}) {
  const sessao = await obterSessao();
  if (!sessao) redirect("/login");
  return <AppShell sessao={sessao}>{children}</AppShell>;
}
