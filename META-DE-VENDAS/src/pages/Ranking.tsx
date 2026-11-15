import { Medal, Trophy } from "lucide-react";
import { useApp, useDados } from "../app/contexto";
import { useMesAtual } from "../app/mes";
import { servidor } from "../data/conexao";
import { ordenarRanking } from "../domain/premiacao";
import { fmtBRL, fmtInt, fmtPct, mesLongo } from "../lib/formato";
import { Aviso, Carregando, Cartao, cx, Titulo, Vazio } from "../ui/base";
import { SeloFaixa, SeloFechado } from "../ui/resultado";

const COR = ["text-amber-500", "text-gray-400", "text-amber-700"];

export default function Ranking() {
  const { mes } = useApp();
  const { dadosMes: d, erro, carregando } = useMesAtual();
  const eu = useDados(() => servidor.meuVendedor(), []);
  if (erro) return <Aviso tom="erro">{erro}</Aviso>;
  if (carregando || !d) return <Carregando />;
  const linhas = ordenarRanking(d.resultado.vendedores);
  return (
    <>
      <Titulo>
        <span className="flex items-center gap-2"><Trophy className="size-6 text-marca" aria-hidden /> Ranking — {mesLongo(mes)} <SeloFechado fechado={d.fechado} /></span>
      </Titulo>
      <Cartao className="flex flex-wrap items-center gap-3">
        <span>Loja: <b>{fmtBRL(d.resultado.faturamento_loja)}</b> ({fmtPct(d.resultado.percentual_atingido)} da meta)</span>
        <SeloFaixa faixa={d.resultado.faixa} minimo={d.meta?.percentual_minimo ?? 0.9} />
      </Cartao>
      {!linhas.length ? <Vazio>Nenhum lançamento neste mês.</Vazio> : (
        <ol className="space-y-2">
          {linhas.map((v, i) => (
            <li key={v.vendedor_id}>
              <Cartao className={cx("flex flex-wrap items-center gap-3", eu.dados?.id === v.vendedor_id && "border-2 border-marca")}>
                <span className="flex w-12 items-center gap-1 text-lg font-bold">
                  {i < 3 ? <Medal className={cx("size-6", COR[i])} aria-hidden /> : null}{i + 1}º
                </span>
                <span className="min-w-32 flex-1 font-semibold">{v.nome}{eu.dados?.id === v.vendedor_id && " (você)"}</span>
                <span className="text-sm text-gray-700">{fmtInt(v.clientes_engajados)} clientes engajados</span>
                <span className="w-24 text-sm text-gray-700 num">{fmtPct(v.participacao)}</span>
                <span className="w-36 text-lg font-bold num">{fmtBRL(v.faturamento_realizado)}</span>
                <span className="w-full text-sm text-gray-700 sm:w-auto">Prêmio: <b>{fmtBRL(v.premio_total)}</b></span>
              </Cartao>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
