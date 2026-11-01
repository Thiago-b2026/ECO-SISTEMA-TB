// Relatórios visuais: comparação com o período anterior, comparativo entre lojas e curva ABC.
// Gráficos de uma série só (uma cor), barras finas com rótulo de valor e dica ao passar o mouse.
import { useEffect, useState } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { fmtBRL } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Exportar } from "@/components/exportar";


interface Rel { faturamento: number; vendas: number; ticket_medio: number; custo: number }
interface PorLoja { loja_id: string; loja: string; faturamento: number; vendas: number; ticket: number; custo: number }
interface Abc { descricao: string; quantidade: number; receita: number; lucro: number; perc: number; perc_acumulado: number; classe: "A" | "B" | "C" }

/** Mesmo número de dias, imediatamente antes. */
function periodoAnterior(de: string, ate: string) {
  const d0 = new Date(de + "T12:00:00Z");
  const d1 = new Date(ate + "T12:00:00Z");
  const dias = Math.round((d1.getTime() - d0.getTime()) / 86400000) + 1;
  const fim = new Date(d0.getTime() - 86400000);
  const ini = new Date(fim.getTime() - (dias - 1) * 86400000);
  return { de: ini.toISOString().slice(0, 10), ate: fim.toISOString().slice(0, 10) };
}

function Variacao({ atual, anterior, moeda = true }: { atual: number; anterior: number; moeda?: boolean }) {
  if (!anterior) return <div className="text-xs text-muted-foreground">sem base no período anterior</div>;
  const p = ((atual - anterior) / anterior) * 100;
  const sobe = p >= 0;
  return (
    <div className="flex items-center gap-1 text-xs">
      {sobe ? <ArrowUpRight className="size-3.5 text-success" /> : <ArrowDownRight className="size-3.5 text-destructive" />}
      <span className={sobe ? "text-success" : "text-destructive"}>{sobe ? "+" : ""}{p.toFixed(1)}%</span>
      <span className="text-muted-foreground">vs {moeda ? fmtBRL(anterior) : anterior} antes</span>
    </div>
  );
}

/** Barras horizontais de uma série (rótulo à esquerda, valor à direita, dica no hover). */
export function Barras({ dados, titulo }: { dados: { nome: string; valor: number; dica?: string }[]; titulo: string }) {
  const max = Math.max(1, ...dados.map((d) => d.valor));
  return (
    <Card className="p-4 space-y-2">
      <h3 className="font-semibold text-sm">{titulo}</h3>
      {dados.length === 0 && <p className="text-xs text-muted-foreground">Sem dados.</p>}
      <div className="space-y-1.5">
        {dados.map((d) => (
          <div key={d.nome} className="group grid grid-cols-[minmax(80px,30%)_1fr_auto] items-center gap-2 text-xs" title={d.dica ?? `${d.nome}: ${fmtBRL(d.valor)}`}>
            <span className="truncate">{d.nome}</span>
            <div className="h-3 rounded-r bg-muted/50">
              <div className="h-3 rounded-r bg-primary transition-opacity group-hover:opacity-80" style={{ width: `${(d.valor / max) * 100}%`, minWidth: d.valor > 0 ? 2 : 0 }} />
            </div>
            <span className="tabular-nums font-medium">{fmtBRL(d.valor)}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function RelatoriosExtra({ lojaId, de, ate }: { lojaId: string | null; de: string; ate: string }) {
  const [atual, setAtual] = useState<Rel | null>(null);
  const [anterior, setAnterior] = useState<Rel | null>(null);
  const [porLoja, setPorLoja] = useState<PorLoja[]>([]);
  const [abc, setAbc] = useState<Abc[]>([]);
  const [classe, setClasse] = useState<"A" | "B" | "C" | "todas">("A");

  useEffect(() => {
    const ant = periodoAnterior(de, ate);
    Promise.all([
      supabase.rpc("relatorio_vendas", { _loja_id: lojaId, _de: de, _ate: ate }),
      supabase.rpc("relatorio_vendas", { _loja_id: lojaId, _de: ant.de, _ate: ant.ate }),
      supabase.rpc("relatorio_por_loja", { _de: de, _ate: ate }),
      supabase.rpc("relatorio_abc", { _loja_id: lojaId, _de: de, _ate: ate }),
    ]).then(([a, b, c, d]) => {
      setAtual(a.data as Rel);
      setAnterior(b.data as Rel);
      setPorLoja((c.data ?? []) as PorLoja[]);
      setAbc((d.data ?? []) as Abc[]);
    });
  }, [lojaId, de, ate]);

  const resumoAbc = (["A", "B", "C"] as const).map((k) => {
    const xs = abc.filter((x) => x.classe === k);
    return { k, itens: xs.length, receita: xs.reduce((s, x) => s + Number(x.receita), 0) };
  });
  const visiveisAbc = abc.filter((x) => classe === "todas" || x.classe === classe);

  return (
    <div className="space-y-4">
      {atual && anterior && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Card className="p-4"><div className="text-sm text-muted-foreground">Faturamento</div><div className="text-2xl font-bold">{fmtBRL(Number(atual.faturamento))}</div><Variacao atual={Number(atual.faturamento)} anterior={Number(anterior.faturamento)} /></Card>
          <Card className="p-4"><div className="text-sm text-muted-foreground">Nº de vendas</div><div className="text-2xl font-bold">{atual.vendas}</div><Variacao atual={Number(atual.vendas)} anterior={Number(anterior.vendas)} moeda={false} /></Card>
          <Card className="p-4"><div className="text-sm text-muted-foreground">Ticket médio</div><div className="text-2xl font-bold">{fmtBRL(Number(atual.ticket_medio))}</div><Variacao atual={Number(atual.ticket_medio)} anterior={Number(anterior.ticket_medio)} /></Card>
        </div>
      )}

      {porLoja.length > 1 && (
        <div className="flex justify-end">
          <Exportar titulo="Faturamento por loja" subtitulo={`${de} a ${ate}`} colunas={[{ titulo: "Loja" }, { titulo: "Vendas", numero: true }, { titulo: "Faturamento (R$)", numero: true }, { titulo: "Ticket (R$)", numero: true }, { titulo: "Custo (R$)", numero: true }]}
            linhas={() => porLoja.map((l) => [l.loja, Number(l.vendas), Number(l.faturamento), Number(l.ticket), Number(l.custo)])} />
        </div>
      )}
      {porLoja.length > 1 && (
        <Barras
          titulo="Faturamento por loja (comparativo)"
          dados={porLoja.map((l) => ({ nome: l.loja, valor: Number(l.faturamento), dica: `${l.loja}: ${fmtBRL(Number(l.faturamento))} · ${l.vendas} vendas · ticket ${fmtBRL(Number(l.ticket))}` }))}
        />
      )}

      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold text-sm mr-auto">Curva ABC de produtos (por receita)</h3>
          <Exportar titulo="Curva ABC de produtos" subtitulo={`${de} a ${ate}`} colunas={[{ titulo: "Produto" }, { titulo: "Qtd.", numero: true }, { titulo: "Receita (R$)", numero: true }, { titulo: "Lucro (R$)", numero: true }, { titulo: "% acumulado", numero: true }, { titulo: "Classe" }]}
            linhas={() => visiveisAbc.map((x) => [x.descricao, Number(x.quantidade), Number(x.receita), Number(x.lucro), Number(x.perc_acumulado), x.classe])} />
          {(["A", "B", "C", "todas"] as const).map((k) => <Button key={k} size="sm" variant={classe === k ? "default" : "outline"} onClick={() => setClasse(k)}>{k === "todas" ? "Todas" : `Classe ${k}`}</Button>)}
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          {resumoAbc.map((r) => (
            <div key={r.k} className="rounded-md border p-2 text-xs">
              <b>Classe {r.k}</b> · {r.itens} produtos · {fmtBRL(r.receita)}
              <div className="text-muted-foreground">{r.k === "A" ? "80% da receita: nunca pode faltar" : r.k === "B" ? "próximos 15%" : "últimos 5%: candidatos a liquidar"}</div>
            </div>
          ))}
        </div>
        <div className="overflow-x-auto max-h-96 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card text-left text-muted-foreground"><tr className="border-b"><th className="py-2 pr-2">Produto</th><th className="py-2 pr-2 text-right">Qtd.</th><th className="py-2 pr-2 text-right">Receita</th><th className="py-2 pr-2 text-right">Lucro</th><th className="py-2 pr-2 text-right">% acum.</th><th className="py-2">Classe</th></tr></thead>
            <tbody>
              {visiveisAbc.map((x) => (
                <tr key={x.descricao} className="border-b last:border-0">
                  <td className="py-1.5 pr-2">{x.descricao}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{Number(x.quantidade)}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{fmtBRL(Number(x.receita))}</td>
                  <td className={cn("py-1.5 pr-2 text-right tabular-nums", Number(x.lucro) < 0 && "text-destructive")}>{fmtBRL(Number(x.lucro))}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{Number(x.perc_acumulado).toFixed(1)}%</td>
                  <td className="py-1.5"><span className="rounded border px-1.5 text-xs font-bold">{x.classe}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          {visiveisAbc.length === 0 && <p className="py-4 text-sm text-muted-foreground">Sem vendas no período.</p>}
        </div>
      </Card>
    </div>
  );
}
