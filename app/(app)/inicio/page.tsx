import CentralDoDia from "@/components/CentralDoDia";
import BoasVindas from "@/components/tutorial/BoasVindas";
import TrilhaProgresso from "@/components/tutorial/TrilhaProgresso";
import { obterSessao } from "@/lib/session";

export default async function PaginaInicio() {
  const sessao = await obterSessao();
  if (!sessao) return null;

  return (
    <div className="central-pagina">
      <CentralDoDia nome={sessao.nome} />
      {/* Depois da exceção do dia, nunca antes: a Central existe para resolver
          o que está travando agora. O aprendizado é o segundo assunto. */}
      <TrilhaProgresso />
      {/* O convite do primeiro acesso — some assim que ela responde. */}
      <BoasVindas />
    </div>
  );
}
