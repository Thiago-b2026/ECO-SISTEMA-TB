import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useLoja } from "@/lib/loja";
import { FORMA_LABEL } from "@/lib/caixa";
import { fmtBRL, fmtDateOnly } from "@/lib/format";
import { formatLocalDateInput } from "@/lib/sale-datetime";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Barras, RelatoriosExtra } from "@/components/relatorios-extra";

export const Route = createFileRoute("/_app/relatorios")({ component: PaginaRelatorios });

interface RelVendas {
  faturamento: number;
  vendas: number;
  ticket_medio: number;
  custo: number;
  por_forma: { forma: string; valor: number; vendas: number }[];
  por_dia: { dia: string; valor: number; vendas: number }[];
  por_vendedor: { vendedor: string; valor: number; vendas: number }[];
}
interface RelLote {
  lote_id: string; lote: string; itens_entrada: number; itens_vendidos: number; custo_total: number;
  receita: number; custo_vendido: number; lucro: number; estoque_restante: number;
}
interface Parado {
  produto_id: string; sku: string; titulo: string; estoque: number; preco_venda: number; dias_parado: number;
}

function PaginaRelatorios() {
  const { filtroLoja, lojas } = useLoja();
  const hoje = formatLocalDateInput();
  const [de, setDe] = useState(hoje.slice(0, 8) + "01");
  const [ate, setAte] = useState(hoje);
  const [dias, setDias] = useState(30);
  const [rel, setRel] = useState<RelVendas | null>(null);
  const [lotes, setLotes] = useState<RelLote[]>([]);
  const [parados, setParados] = useState<Parado[]>([]);
  const [carregando, setCarregando] = useState(true);

  async function carregar() {
    setCarregando(true);
    const [a, b, c] = await Promise.all([
      supabase.rpc("relatorio_vendas", { _loja_id: filtroLoja, _de: de, _ate: ate }),
      supabase.rpc("relatorio_lotes", { _loja_id: filtroLoja }),
      supabase.rpc("relatorio_parados", { _loja_id: filtroLoja, _dias: dias }),
    ]);
    setCarregando(false);
    if (a.error) return toast.error(a.error.message);
    setRel(a.data as RelVendas);
    setLotes((b.data ?? []) as RelLote[]);
    setParados((c.data ?? []) as Parado[]);
  }
  useEffect(() => {
    carregar();
  }, [filtroLoja, de, ate, dias]);

  const lucroBruto = rel ? Number(rel.faturamento) - Number(rel.custo) : 0;
  const maxDia = Math.max(1, ...(rel?.por_dia ?? []).map((d) => Number(d.valor)));

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Relatórios</h1>
        <p className="text-sm text-muted-foreground">{filtroLoja ? lojas.find((l) => l.id === filtroLoja)?.nome : "Todas as lojas"} · pela data da venda</p>
      </div>
      <Card className="p-4 flex flex-wrap items-end gap-2">
        <div><label className="text-xs">De</label><Input type="date" value={de} onChange={(e) => setDe(e.target.value)} /></div>
        <div><label className="text-xs">Até</label><Input type="date" value={ate} onChange={(e) => setAte(e.target.value)} /></div>
        <Button size="sm" variant="outline" onClick={() => { setDe(hoje); setAte(hoje); }}>Hoje</Button>
        <Button size="sm" variant="outline" onClick={() => { setDe(hoje.slice(0, 8) + "01"); setAte(hoje); }}>Este mês</Button>
        <Button size="sm" variant="outline" onClick={() => { setDe(hoje.slice(0, 5) + "01-01"); setAte(hoje); }}>Este ano</Button>
        {carregando && <Loader2 className="animate-spin text-muted-foreground" />}
      </Card>

      {rel && (
        <>
          <RelatoriosExtra lojaId={filtroLoja} de={de} ate={ate} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Kpi titulo="Lucro bruto (vendas com custo)" valor={fmtBRL(lucroBruto)} sub="vendas do sistema antigo não têm custo" />
            <Kpi titulo="Margem bruta" valor={Number(rel.faturamento) > 0 ? `${((lucroBruto / Number(rel.faturamento)) * 100).toFixed(1)}%` : "—"} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-4 space-y-2">
              <h2 className="font-semibold">Formas de pagamento</h2>
              <Barras titulo="" dados={rel.por_forma.map((f) => ({ nome: FORMA_LABEL[f.forma] ?? f.forma, valor: Number(f.valor), dica: `${FORMA_LABEL[f.forma] ?? f.forma}: ${fmtBRL(Number(f.valor))} em ${f.vendas} vendas` }))} />
              {rel.por_forma.length === 0 && <p className="text-sm text-muted-foreground">Sem vendas.</p>}
            </Card>
            <Card className="p-4 space-y-2">
              <h2 className="font-semibold">Por vendedor</h2>
              <Barras titulo="" dados={rel.por_vendedor.map((v) => ({ nome: v.vendedor, valor: Number(v.valor), dica: `${v.vendedor}: ${fmtBRL(Number(v.valor))} em ${v.vendas} vendas` }))} />
            </Card>
          </div>

          <Card className="p-4 space-y-2">
            <h2 className="font-semibold">Faturamento por dia</h2>
            <div className="space-y-1">
              {rel.por_dia.map((d) => (
                <div key={d.dia} className="flex items-center gap-2 text-xs" title={`${fmtDateOnly(d.dia + "T12:00:00")}: ${fmtBRL(Number(d.valor))} em ${d.vendas} vendas`}>
                  <span className="w-20 shrink-0">{fmtDateOnly(d.dia + "T12:00:00")}</span>
                  <div className="h-4 rounded bg-primary/70" style={{ width: `${(Number(d.valor) / maxDia) * 70}%` }} />
                  <span className="whitespace-nowrap">{fmtBRL(Number(d.valor))} · {d.vendas}</span>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}

      <Card className="p-4 space-y-2">
        <h2 className="font-semibold">Resultado por lote</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground"><tr className="border-b"><th className="py-2 pr-2">Lote</th><th className="py-2 pr-2 text-right">Entraram</th><th className="py-2 pr-2 text-right">Vendidos</th><th className="py-2 pr-2 text-right">Custo do lote</th><th className="py-2 pr-2 text-right">Receita</th><th className="py-2 pr-2 text-right">Lucro</th><th className="py-2 pr-2 text-right">Retorno</th></tr></thead>
            <tbody>
              {lotes.map((l) => (
                <tr key={l.lote_id} className="border-b last:border-0">
                  <td className="py-2 pr-2 font-medium">{l.lote}</td>
                  <td className="py-2 pr-2 text-right">{Number(l.itens_entrada)}</td>
                  <td className="py-2 pr-2 text-right">{Number(l.itens_vendidos)}</td>
                  <td className="py-2 pr-2 text-right">{fmtBRL(Number(l.custo_total))}</td>
                  <td className="py-2 pr-2 text-right">{fmtBRL(Number(l.receita))}</td>
                  <td className="py-2 pr-2 text-right font-semibold">{fmtBRL(Number(l.lucro))}</td>
                  <td className="py-2 pr-2 text-right">{Number(l.custo_total) > 0 ? `${Math.round((Number(l.receita) / Number(l.custo_total)) * 100)}%` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {lotes.length === 0 && <p className="text-sm text-muted-foreground">Nenhum lote lançado no estoque ainda.</p>}
        </div>
      </Card>

      <Card className="p-4 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-semibold">Itens parados há mais de</h2>
          {[30, 60, 90].map((d) => <Button key={d} size="sm" variant={dias === d ? "default" : "outline"} onClick={() => setDias(d)}>{d} dias</Button>)}
        </div>
        <table className="w-full text-sm">
          <tbody>
            {parados.map((p) => (
              <tr key={p.produto_id} className="border-b last:border-0">
                <td className="py-1.5 pr-2">{p.titulo} <span className="text-xs text-muted-foreground">{p.sku}</span></td>
                <td className="py-1.5 pr-2 text-right">{Number(p.estoque)} un.</td>
                <td className="py-1.5 pr-2 text-right">{fmtBRL(Number(p.preco_venda))}</td>
                <td className="py-1.5 text-right text-warning font-medium">{p.dias_parado} dias</td>
              </tr>
            ))}
          </tbody>
        </table>
        {parados.length === 0 && <p className="text-sm text-muted-foreground">Nenhum item parado nesse prazo.</p>}
      </Card>
    </div>
  );
}

function Kpi({ titulo, valor, sub }: { titulo: string; valor: string; sub?: string }) {
  return (
    <Card className="p-4">
      <div className="text-sm text-muted-foreground">{titulo}</div>
      <div className="text-2xl font-bold">{valor}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </Card>
  );
}
