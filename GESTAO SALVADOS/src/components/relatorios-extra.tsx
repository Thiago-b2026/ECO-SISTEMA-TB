// Peças visuais dos relatórios: cartões de indicador, seções, gráficos de uma série
// (uma cor, barras finas, dica ao passar o mouse), comparativo por loja e curva ABC.
import { useEffect, useState, type ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { fmtBRL } from "@/lib/format";
import { Card } from "@/components/ui/card";
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

/** Bloco com título, descrição e ações (exportar etc.) no canto. */
export function Secao({ titulo, desc, acoes, children }: { titulo: string; desc?: string; acoes?: ReactNode; children: ReactNode }) {
  return (
    <Card className="p-0 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/30 px-4 py-2.5">
        <div>
          <h2 className="font-semibold text-sm">{titulo}</h2>
          {desc && <p className="text-xs text-muted-foreground">{desc}</p>}
        </div>
        {acoes && <div className="flex flex-wrap items-center gap-2">{acoes}</div>}
      </div>
      <div className="p-4">{children}</div>
    </Card>
  );
}

/** Cartão de indicador (número grande + variação). */
export function Kpi({ titulo, valor, sub, children }: { titulo: string; valor: string; sub?: string; children?: ReactNode }) {
  return (
    <Card className="p-4 border-l-4 border-l-primary">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{titulo}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{valor}</div>
      {children}
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </Card>
  );
}

function Variacao({ atual, anterior, moeda = true }: { atual: number; anterior: number; moeda?: boolean }) {
  if (!anterior) return <div className="text-xs text-muted-foreground">sem base no período anterior</div>;
  const p = ((atual - anterior) / anterior) * 100;
  const sobe = p >= 0;
  return (
    <div className="flex flex-wrap items-center gap-1 text-xs">
      <span className={cn("inline-flex items-center rounded px-1 font-medium", sobe ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive")}>
        {sobe ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}{sobe ? "+" : ""}{p.toFixed(1)}%
      </span>
      <span className="text-muted-foreground">vs {moeda ? fmtBRL(anterior) : anterior} no período anterior</span>
    </div>
  );
}

/** Barras horizontais de uma série (rótulo, barra, valor e % do total). */
export function Barras({ dados, titulo, total }: { dados: { nome: string; valor: number; dica?: string }[]; titulo?: string; total?: number }) {
  const max = Math.max(1, ...dados.map((d) => d.valor));
  const soma = total || dados.reduce((s, d) => s + d.valor, 0);
  const corpo = (
    <div className="space-y-2">
      {dados.length === 0 && <p className="text-xs text-muted-foreground">Sem dados no período.</p>}
      {dados.map((d) => (
        <div key={d.nome} className="group grid grid-cols-[minmax(90px,32%)_1fr_auto] items-center gap-3 text-sm" title={d.dica ?? `${d.nome}: ${fmtBRL(d.valor)}`}>
          <span className="truncate">{d.nome}</span>
          <div className="h-2.5 rounded-full bg-muted">
            <div className="h-2.5 rounded-full bg-primary transition-opacity group-hover:opacity-75" style={{ width: `${(d.valor / max) * 100}%`, minWidth: d.valor > 0 ? 4 : 0 }} />
          </div>
          <span className="text-right tabular-nums">
            <span className="font-medium">{fmtBRL(d.valor)}</span>
            {soma > 0 && <span className="ml-1.5 inline-block w-11 text-xs text-muted-foreground">{((d.valor / soma) * 100).toFixed(1)}%</span>}
          </span>
        </div>
      ))}
    </div>
  );
  if (!titulo) return corpo;
  return <Secao titulo={titulo}>{corpo}</Secao>;
}

/** Colunas verticais (série no tempo). Dica ao passar o mouse; rótulos espaçados. */
export function Colunas({ dados }: { dados: { nome: string; valor: number; dica?: string }[] }) {
  const [foco, setFoco] = useState<number | null>(null);
  if (!dados.length) return <p className="text-xs text-muted-foreground">Sem vendas no período.</p>;
  const max = Math.max(1, ...dados.map((d) => d.valor));
  const passo = Math.max(1, Math.ceil(dados.length / 12));
  const media = dados.reduce((s, d) => s + d.valor, 0) / dados.length;
  const f = foco != null ? dados[foco] : null;
  return (
    <div>
      <div className="mb-2 flex h-5 items-center justify-between text-xs">
        <span className="font-medium">{f ? f.dica ?? `${f.nome}: ${fmtBRL(f.valor)}` : <span className="text-muted-foreground">Linha tracejada = média ({fmtBRL(media)})</span>}</span>
        <span className="text-muted-foreground">máx. {fmtBRL(max)}</span>
      </div>
      <div className="relative h-48 border-b border-l" onMouseLeave={() => setFoco(null)}>
        <div className="absolute inset-x-0 border-t border-dashed border-muted-foreground/40" style={{ bottom: `${(media / max) * 100}%` }} />
        <div className="absolute inset-0 flex items-end gap-[2px] px-1">
          {dados.map((d, i) => (
            <div key={d.nome + i} className="flex h-full flex-1 items-end" onMouseEnter={() => setFoco(i)} title={d.dica}>
              <div className={cn("w-full rounded-t bg-primary transition-opacity", foco != null && foco !== i && "opacity-50")} style={{ height: `${(d.valor / max) * 100}%`, minHeight: d.valor > 0 ? 2 : 0 }} />
            </div>
          ))}
        </div>
      </div>
      <div className="flex gap-[2px] px-1 pt-1 text-[10px] text-muted-foreground">
        {dados.map((d, i) => <div key={d.nome + i} className="flex-1 overflow-visible whitespace-nowrap text-center">{i % passo === 0 ? d.nome : ""}</div>)}
      </div>
    </div>
  );
}

export function RelatoriosExtra({ lojaId, de, ate, todas, extras = [], children }: {
  lojaId: string | null; de: string; ate: string; todas?: boolean;
  extras?: { titulo: string; valor: string; sub?: string }[]; children?: ReactNode;
}) {
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
  const totalLojas = porLoja.reduce((s, l) => s + Number(l.faturamento), 0);
  const fmtD = (s: string) => s.split("-").reverse().join("/");

  return (
    <div className="space-y-4">
      {atual && anterior && (
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
          <Kpi titulo="Faturamento" valor={fmtBRL(Number(atual.faturamento))}><Variacao atual={Number(atual.faturamento)} anterior={Number(anterior.faturamento)} /></Kpi>
          <Kpi titulo="Nº de vendas" valor={String(atual.vendas)}><Variacao atual={Number(atual.vendas)} anterior={Number(anterior.vendas)} moeda={false} /></Kpi>
          <Kpi titulo="Ticket médio" valor={fmtBRL(Number(atual.ticket_medio))}><Variacao atual={Number(atual.ticket_medio)} anterior={Number(anterior.ticket_medio)} /></Kpi>
          {extras.map((e) => <Kpi key={e.titulo} titulo={e.titulo} valor={e.valor} sub={e.sub} />)}
        </div>
      )}

      {children}

      {todas && porLoja.length > 1 && (
        <Secao titulo="Comparativo entre lojas" desc={`${fmtD(de)} a ${fmtD(ate)}`}
          acoes={<Exportar titulo="Faturamento por loja" subtitulo={`${fmtD(de)} a ${fmtD(ate)}`} colunas={[{ titulo: "Loja" }, { titulo: "Vendas", numero: true }, { titulo: "Faturamento (R$)", numero: true }, { titulo: "Ticket (R$)", numero: true }, { titulo: "Custo (R$)", numero: true }]}
            linhas={() => porLoja.map((l) => [l.loja, Number(l.vendas), Number(l.faturamento), Number(l.ticket), Number(l.custo)])} />}>
          <div className="grid gap-3 md:grid-cols-2">
            {porLoja.map((l) => {
              const p = totalLojas > 0 ? (Number(l.faturamento) / totalLojas) * 100 : 0;
              return (
                <div key={l.loja_id} className="rounded-lg border p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-semibold">{l.loja}</span>
                    <span className="text-xs text-muted-foreground">{p.toFixed(1)}% do total</span>
                  </div>
                  <div className="mt-1 text-xl font-bold tabular-nums">{fmtBRL(Number(l.faturamento))}</div>
                  <div className="my-2 h-2 rounded-full bg-muted"><div className="h-2 rounded-full bg-primary" style={{ width: `${p}%` }} /></div>
                  <div className="flex gap-4 text-xs text-muted-foreground">
                    <span><b className="text-foreground">{l.vendas}</b> vendas</span>
                    <span>ticket <b className="text-foreground">{fmtBRL(Number(l.ticket))}</b></span>
                  </div>
                </div>
              );
            })}
          </div>
        </Secao>
      )}

      <Secao titulo="Curva ABC de produtos" desc="quais produtos trazem a maior parte da receita"
        acoes={<>
          <div className="inline-flex rounded-md border p-0.5">
            {(["A", "B", "C", "todas"] as const).map((k) => (
              <button key={k} onClick={() => setClasse(k)} className={cn("rounded px-2.5 py-1 text-xs", classe === k ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>{k === "todas" ? "Todas" : `Classe ${k}`}</button>
            ))}
          </div>
          <Exportar titulo="Curva ABC de produtos" subtitulo={`${fmtD(de)} a ${fmtD(ate)}`} colunas={[{ titulo: "Produto" }, { titulo: "Qtd.", numero: true }, { titulo: "Receita (R$)", numero: true }, { titulo: "Lucro (R$)", numero: true }, { titulo: "% acumulado", numero: true }, { titulo: "Classe" }]}
            linhas={() => visiveisAbc.map((x) => [x.descricao, Number(x.quantidade), Number(x.receita), Number(x.lucro), Number(x.perc_acumulado), x.classe])} />
        </>}>
        <div className="mb-3 grid gap-2 sm:grid-cols-3">
          {resumoAbc.map((r) => (
            <button key={r.k} onClick={() => setClasse(r.k)} className={cn("rounded-lg border p-3 text-left text-xs transition-colors hover:bg-muted/50", classe === r.k && "border-primary ring-1 ring-primary")}>
              <div className="flex items-center gap-2"><span className="grid size-6 place-items-center rounded bg-primary/10 font-bold text-primary">{r.k}</span><b className="text-sm">{r.itens} produtos</b></div>
              <div className="mt-1 text-base font-semibold tabular-nums">{fmtBRL(r.receita)}</div>
              <div className="text-muted-foreground">{r.k === "A" ? "80% da receita: nunca pode faltar" : r.k === "B" ? "próximos 15% da receita" : "últimos 5%: candidatos a liquidar"}</div>
            </button>
          ))}
        </div>
        {visiveisAbc.length === 0 ? <p className="py-4 text-center text-sm text-muted-foreground">Sem vendas no período.</p> : (
          <div className="overflow-x-auto max-h-96">
            <table className="w-full text-sm">
              <thead><tr><th>Produto</th><th className="text-right">Qtd.</th><th className="text-right">Receita</th><th className="text-right">Lucro</th><th className="text-right">% acum.</th><th className="text-center">Classe</th></tr></thead>
              <tbody>
                {visiveisAbc.map((x) => (
                  <tr key={x.descricao}>
                    <td>{x.descricao}</td>
                    <td className="text-right">{Number(x.quantidade)}</td>
                    <td className="text-right">{fmtBRL(Number(x.receita))}</td>
                    <td className={cn("text-right", Number(x.lucro) < 0 && "text-destructive")}>{fmtBRL(Number(x.lucro))}</td>
                    <td className="text-right">{Number(x.perc_acumulado).toFixed(1)}%</td>
                    <td className="text-center"><span className="rounded bg-primary/10 px-1.5 text-xs font-bold text-primary">{x.classe}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Secao>
    </div>
  );
}
