import CentralDoDia from "@/components/CentralDoDia";
import { obterSessao } from "@/lib/session";

export default async function PaginaInicio() {
  const sessao = await obterSessao();
  if (!sessao) return null;

  return (
    <div className="central-pagina">
      <CentralDoDia nome={sessao.nome} />
    </div>
  );
}
