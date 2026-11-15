import { Save, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { useApp } from "../app/contexto";
import { useMesAtual } from "../app/mes";
import { servidor } from "../data/conexao";
import { fmtBRL, fmtPct, lerNumero, mesLongo } from "../lib/formato";
import { Aviso, Botao, Carregando, Cartao, classeEntrada, Selo, Titulo, Vazio } from "../ui/base";
import { SeloFaixa, SeloFechado } from "../ui/resultado";

type Linha = { fat: string; cli: string };
const paraTexto = (n: number) => (n ? String(n).replace(".", ",") : "");

export default function Lancamentos() {
  const { mes, pode, recarregar } = useApp();
  const { dadosMes: d, vendedores, erro, carregando } = useMesAtual();
  const [edicao, setEdicao] = useState<Record<string, Linha>>({});
  const [msg, setMsg] = useState<{ tom: "ok" | "erro"; texto: string } | null>(null);
  const [salvando, setSalvando] = useState(false);

  const porVendedor = useMemo(() => new Map((d?.lancamentos ?? []).map((l) => [l.vendedor_id, l])), [d]);
  // ativos + inativos que já têm lançamento neste mês
  const linhas = vendedores.filter((v) => v.ativo || porVendedor.has(v.id));

  useEffect(() => {
    setEdicao(Object.fromEntries(vendedores.map((v) => {
      const l = porVendedor.get(v.id);
      return [v.id, { fat: paraTexto(l?.faturamento_realizado ?? 0), cli: l ? String(l.clientes_engajados) : "" }];
    })));
  }, [vendedores, porVendedor]);

  if (erro) return <Aviso tom="erro">{erro}</Aviso>;
  if (carregando || !d) return <Carregando />;

  const podeIncluir = pode("metas.lancamentos", "inserir");
  const podeEditar = pode("metas.lancamentos", "editar");
  const podeExcluir = pode("metas.lancamentos", "excluir");
  const original = (id: string): Linha => {
    const l = porVendedor.get(id);
    return { fat: paraTexto(l?.faturamento_realizado ?? 0), cli: l ? String(l.clientes_engajados) : "" };
  };
  const alterados = linhas.filter((v) => {
    const e = edicao[v.id];
    const o = original(v.id);
    return e && (lerNumero(e.fat) !== lerNumero(o.fat) || Number(e.cli || 0) !== Number(o.cli || 0));
  });
  const travadoLinha = (id: string) => d.fechado || !(porVendedor.has(id) ? podeEditar : podeIncluir);

  async function salvarTudo() {
    setMsg(null);
    const invalidos = alterados.filter((v) => !(lerNumero(edicao[v.id].fat) >= 0) || !/^\d*$/.test(edicao[v.id].cli.trim()));
    if (invalidos.length) {
      setMsg({ tom: "erro", texto: `Confira os números de: ${invalidos.map((v) => v.nome).join(", ")}. Faturamento em reais e clientes como número inteiro.` });
      return;
    }
    setSalvando(true);
    const falhas: string[] = [];
    for (const v of alterados) {
      try {
        await servidor.salvarLancamento({ vendedor_id: v.id, mes_referencia: mes, faturamento_realizado: lerNumero(edicao[v.id].fat), clientes_engajados: Number(edicao[v.id].cli || 0) });
      } catch (x) {
        falhas.push(`${v.nome}: ${(x as Error).message}`);
      }
    }
    setSalvando(false);
    setMsg(falhas.length ? { tom: "erro", texto: `Não salvou — ${falhas.join(" · ")}` } : { tom: "ok", texto: `${alterados.length} lançamento(s) salvo(s).` });
    recarregar();
  }

  async function excluir(id: string, nome: string) {
    const l = porVendedor.get(id);
    if (!l || !window.confirm(`Excluir o lançamento de ${nome} em ${mesLongo(mes)}?`)) return;
    try {
      await servidor.excluirLancamento(l.id);
      setMsg({ tom: "ok", texto: `Lançamento de ${nome} excluído.` });
      recarregar();
    } catch (x) {
      setMsg({ tom: "erro", texto: (x as Error).message });
    }
  }

  return (
    <>
      <Titulo acao={!d.fechado && (podeIncluir || podeEditar) ? (
        <Botao onClick={() => void salvarTudo()} carregando={salvando} disabled={!alterados.length}>
          <Save className="size-4" aria-hidden /> Salvar {alterados.length ? `(${alterados.length})` : ""}
        </Botao>
      ) : undefined}>
        Lançamentos — {mesLongo(mes)} <SeloFechado fechado={d.fechado} />
      </Titulo>
      {d.fechado && <Aviso tom="info" titulo="Mês fechado">Para corrigir algum valor, reabra o mês na tela Meta e fechamento do mês.</Aviso>}
      {msg && <Aviso tom={msg.tom}>{msg.texto}</Aviso>}
      <Cartao className="flex flex-wrap items-center gap-3">
        <span>Total da loja: <b>{fmtBRL(d.resultado.faturamento_loja)}</b> · {fmtPct(d.resultado.percentual_atingido)} da meta</span>
        <SeloFaixa faixa={d.resultado.faixa} minimo={d.meta?.percentual_minimo ?? 0.9} />
      </Cartao>
      {!linhas.length ? (
        <Vazio>Nenhum vendedor ativo nesta unidade. {pode("metas.vendedores", "inserir") && <Link className="font-semibold underline" to="/vendedores">Cadastrar vendedores</Link>}</Vazio>
      ) : (
        <Cartao className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-sm">
            <thead>
              <tr className="border-b border-gray-300 text-left text-gray-700">
                <th className="py-2 pr-2">Vendedor</th>
                <th className="py-2 pr-2">Faturamento (R$)</th>
                <th className="py-2 pr-2">Clientes engajados</th>
                <th className="py-2 pr-2">Situação</th>
                {podeExcluir && <th className="py-2"><span className="sr-only">Excluir</span></th>}
              </tr>
            </thead>
            <tbody>
              {linhas.map((v) => {
                const e = edicao[v.id] ?? { fat: "", cli: "" };
                const travado = travadoLinha(v.id);
                const mudou = alterados.includes(v);
                return (
                  <tr key={v.id} className="border-b border-gray-100">
                    <td className="py-2 pr-2 font-semibold">{v.nome}{!v.ativo && <span className="ml-1 text-xs font-normal text-gray-600">(inativo)</span>}</td>
                    <td className="py-2 pr-2">
                      <input aria-label={`Faturamento de ${v.nome}`} className={classeEntrada} inputMode="decimal" disabled={travado} placeholder="0,00"
                        value={e.fat} onChange={(x) => setEdicao({ ...edicao, [v.id]: { ...e, fat: x.target.value } })} />
                    </td>
                    <td className="py-2 pr-2">
                      <input aria-label={`Clientes engajados de ${v.nome}`} className={classeEntrada} inputMode="numeric" disabled={travado} placeholder="0"
                        value={e.cli} onChange={(x) => setEdicao({ ...edicao, [v.id]: { ...e, cli: x.target.value } })} />
                    </td>
                    <td className="py-2 pr-2">
                      {mudou ? <Selo tom="alerta">Alterado, falta salvar</Selo> : porVendedor.has(v.id) ? <Selo tom="ok">Lançado</Selo> : <Selo tom="neutro">Sem lançamento</Selo>}
                    </td>
                    {podeExcluir && (
                      <td className="py-2">
                        {porVendedor.has(v.id) && !d.fechado && (
                          <Botao variante="fantasma" aria-label={`Excluir lançamento de ${v.nome}`} onClick={() => void excluir(v.id, v.nome)}><Trash2 className="size-4" aria-hidden /></Botao>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Cartao>
      )}
    </>
  );
}
