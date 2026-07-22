import CentralDoDia from "@/components/CentralDoDia";
import RetomarAgenda from "@/components/agenda/RetomarAgenda";
import { obterSessao } from "@/lib/session";

export default async function PaginaInicio() {
  const sessao = await obterSessao();
  if (!sessao) return null;

  return (
    <div className="central-pagina">
      <RetomarAgenda />
      <CentralDoDia nome={sessao.nome} perfil={sessao.perfil} />
    </div>
  );
}
