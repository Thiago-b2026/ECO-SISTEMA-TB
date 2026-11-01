import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { BarChart3, Building2, CalendarDays, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useLoja } from "@/lib/loja";
import { useAuth } from "@/lib/auth";
import { FORMA_LABEL } from "@/lib/caixa";
import { fmtBRL } from "@/lib/format";
import { formatLocalDateInput } from "@/lib/sale-datetime";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Exportar } from "@/components/exportar";
import { AuditoriaRelatorio } from "@/components/auditoria-relatorio";
import { Barras, Colunas, RelatoriosExtra, Secao } from "@/components/relatorios-extra";
import { cn } from "@/lib/utils";

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

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function atalhos(hoje: string) {
  const h = new Date(hoje + "T12:00:00");
  const menos = (dias: number) => { const d = new Date(h); d.setDate(d.getDate() - dias); return iso(d); };
  const mesPassadoIni = new Date(h.getFullYear(), h.getMonth() - 1, 1);
  const mesPassadoFim = new Date(h.getFullYear(), h.getMonth(), 0);
  const ano12 = new Date(h.getFullYear(), h.getMonth() - 11, 1);
  return [
    { nome: "Hoje", de: hoje, ate: hoje },
    { nome: "7 dias", de: menos(6), ate: hoje },
    { nome: "30 dias", de: menos(29), ate: hoje },
    { nome: "Este mês", de: hoje.slice(0, 8) + "01", ate: hoje },
    { nome: "Mês passado", de: iso(mesPassadoIni), ate: iso(mesPassadoFim) },
    { nome: "Este ano", de: hoje.slice(0, 5) + "01-01", ate: hoje },
    { nome: "12 meses", de: iso(ano12), ate: hoje },
  ];
}

function PaginaRelatorios() {
  const { filtroLoja: lojaMenu, lojas } = useLoja();
  const { role } = useAuth();
  const admin = role === "admin";
  const [lojaSel, setLojaSel] = useState<string>(lojaMenu ?? "");
  // não-admin só vê a própria empresa
  const filtroLoja = admin ? lojaSel || null : lojaMenu;
  const [aba, setAba] = useState<"resultados" | "auditoria">("resultados");
  const hoje = formatLocalDateInput();
  const ATALHOS = atalhos(hoje);
  const [de, setDe] = useState(ATALHOS[2].de); // padrão: últimos 30 dias (nunca abre zerado no dia 1º)
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
    if (aba === "resultados") carregar();
  }, [filtroLoja, de, ate, dias, aba]);

  const nomeLoja = filtroLoja ? lojas.find((l) => l.id === filtroLoja)?.nome ?? "" : "Todas as lojas";
  const fmtD = (s: string) => s.split("-").reverse().join("/");
  const periodo = `${fmtD(de)} a ${fmtD(ate)}`;
  const lucroBruto = rel ? Number(rel.faturamento) - Number(rel.custo) : 0;

  // muitos dias → agrupa por mês
  const porDia = rel?.por_dia ?? [];
  const agruparMes = porDia.length > 62;
  const serie = agruparMes
    ? Object.values(porDia.reduce<Record<string, { nome: string; valor: number; vendas: number }>>((acc, d) => {
        const k = d.dia.slice(0, 7);
        acc[k] ??= { nome: `${MESES[Number(k.slice(5)) - 1]}/${k.slice(2, 4)}`, valor: 0, vendas: 0 };
        acc[k].valor += Number(d.valor);
        acc[k].vendas += Number(d.vendas);
        return acc;
      }, {}))
    : porDia.map((d) => ({ nome: fmtD(d.dia).slice(0, 5), valor: Number(d.valor), vendas: Number(d.vendas) }));

  const totLotes = lotes.reduce((s, l) => ({ custo: s.custo + Number(l.custo_total), receita: s.receita + Number(l.receita), lucro: s.lucro + Number(l.lucro) }), { custo: 0, receita: 0, lucro: 0 });

  return (
    <div className="p-4 lg:p-6 space-y-4 max-w-[1400px] mx-auto">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><BarChart3 className="size-6 text-primary" /> Relatórios</h1>
          <p className="text-sm text-muted-foreground">{aba === "resultados" ? <>{nomeLoja} · {periodo} · pela data da venda</> : "Quem inseriu, alterou ou excluiu dados no sistema"}</p>
        </div>
        {admin && (
          <div className="inline-flex rounded-lg border bg-card p-1">
            {([["resultados", "Resultados", BarChart3], ["auditoria", "Auditoria", ShieldCheck]] as const).map(([id, nome, Icone]) => (
              <button key={id} onClick={() => setAba(id)} className={cn("flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm", aba === id ? "bg-primary text-primary-foreground font-semibold shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                <Icone className="size-4" /> {nome}
              </button>
            ))}
          </div>
        )}
      </div>

      {aba === "auditoria" && admin ? <AuditoriaRelatorio lojaId={filtroLoja} /> : (
        <>
          {/* Filtros: fixos no topo ao rolar */}
          <Card className="sticky top-12 z-20 p-3 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <CalendarDays className="size-4 text-muted-foreground" />
              {ATALHOS.map((a) => (
                <button key={a.nome} onClick={() => { setDe(a.de); setAte(a.ate); }}
                  className={cn("rounded-full border px-3 py-1 text-xs transition-colors", de === a.de && ate === a.ate ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}>
                  {a.nome}
                </button>
              ))}
              <div className="flex items-center gap-1">
                <Input type="date" value={de} onChange={(e) => setDe(e.target.value)} className="h-8 w-36 text-xs" aria-label="De" />
                <span className="text-xs text-muted-foreground">até</span>
                <Input type="date" value={ate} onChange={(e) => setAte(e.target.value)} className="h-8 w-36 text-xs" aria-label="Até" />
              </div>
              {admin ? (
                <label className="flex items-center gap-1">
                  <Building2 className="size-4 text-muted-foreground" />
                  <select value={lojaSel} onChange={(e) => setLojaSel(e.target.value)} className="h-8 rounded-md border bg-background px-2 text-xs">
                    <option value="">Todas as lojas</option>
                    {lojas.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
                  </select>
                </label>
              ) : (
                <span className="flex items-center gap-1 text-xs"><Building2 className="size-4 text-muted-foreground" /> {nomeLoja}</span>
              )}
              {carregando && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
            </div>
          </Card>

          {rel && (
            <>
              <RelatoriosExtra lojaId={filtroLoja} de={de} ate={ate} todas={!filtroLoja}
                extras={[
                  { titulo: "Lucro bruto", valor: fmtBRL(lucroBruto), sub: "só vendas com custo (PDV novo)" },
                  { titulo: "Margem bruta", valor: Number(rel.faturamento) > 0 ? `${((lucroBruto / Number(rel.faturamento)) * 100).toFixed(1)}%` : "—", sub: "lucro ÷ faturamento" },
                ]}>
                <Secao titulo={agruparMes ? "Faturamento por mês" : "Faturamento por dia"} desc="passe o mouse nas colunas para ver o valor"
                  acoes={<Exportar titulo={agruparMes ? "Faturamento por mês" : "Faturamento por dia"} subtitulo={`${nomeLoja} · ${periodo}`}
                    colunas={[{ titulo: agruparMes ? "Mês" : "Dia" }, { titulo: "Vendas", numero: true }, { titulo: "Faturamento (R$)", numero: true }]}
                    linhas={() => (agruparMes ? serie.map((s) => [s.nome, s.vendas, s.valor]) : porDia.map((d) => [fmtD(d.dia), Number(d.vendas), Number(d.valor)]))} />}>
                  <Colunas dados={serie.map((s) => ({ nome: s.nome, valor: s.valor, dica: `${s.nome}: ${fmtBRL(s.valor)} em ${s.vendas} vendas` }))} />
                </Secao>

                <div className="grid gap-4 lg:grid-cols-2">
                  <Secao titulo="Formas de pagamento" acoes={<Exportar titulo="Formas de pagamento" subtitulo={`${nomeLoja} · ${periodo}`} colunas={[{ titulo: "Forma" }, { titulo: "Vendas", numero: true }, { titulo: "Valor (R$)", numero: true }]} linhas={() => rel.por_forma.map((f) => [FORMA_LABEL[f.forma] ?? f.forma, f.vendas, Number(f.valor)])} />}>
                    <Barras dados={rel.por_forma.map((f) => ({ nome: FORMA_LABEL[f.forma] ?? f.forma, valor: Number(f.valor), dica: `${FORMA_LABEL[f.forma] ?? f.forma}: ${fmtBRL(Number(f.valor))} em ${f.vendas} vendas` }))} total={Number(rel.faturamento)} />
                  </Secao>
                  <Secao titulo="Por vendedor" acoes={<Exportar titulo="Vendas por vendedor" subtitulo={`${nomeLoja} · ${periodo}`} colunas={[{ titulo: "Vendedor" }, { titulo: "Vendas", numero: true }, { titulo: "Valor (R$)", numero: true }]} linhas={() => rel.por_vendedor.map((v) => [v.vendedor, v.vendas, Number(v.valor)])} />}>
                    <Barras dados={rel.por_vendedor.map((v) => ({ nome: v.vendedor, valor: Number(v.valor), dica: `${v.vendedor}: ${fmtBRL(Number(v.valor))} em ${v.vendas} vendas` }))} total={Number(rel.faturamento)} />
                  </Secao>
                </div>
              </RelatoriosExtra>
            </>
          )}

          <Secao titulo="Resultado por lote" desc="quanto cada lote já devolveu do que custou (todo o período)"
            acoes={<Exportar titulo="Resultado por lote" subtitulo={nomeLoja} colunas={[{ titulo: "Lote" }, { titulo: "Entraram", numero: true }, { titulo: "Vendidos", numero: true }, { titulo: "Custo (R$)", numero: true }, { titulo: "Receita (R$)", numero: true }, { titulo: "Lucro (R$)", numero: true }, { titulo: "Estoque restante", numero: true }]}
              linhas={() => lotes.map((l) => [l.lote, Number(l.itens_entrada), Number(l.itens_vendidos), Number(l.custo_total), Number(l.receita), Number(l.lucro), Number(l.estoque_restante)])} />}>
            {lotes.length === 0 ? <Vazio>Nenhum lote lançado no estoque ainda.</Vazio> : (
              <div className="overflow-x-auto max-h-[28rem]">
                <table className="w-full text-sm">
                  <thead><tr><th>Lote</th><th className="text-right">Entraram</th><th className="text-right">Vendidos</th><th className="text-right">Custo</th><th className="text-right">Receita</th><th className="text-right">Lucro</th><th className="w-40">Retorno</th></tr></thead>
                  <tbody>
                    {lotes.map((l) => {
                      const ret = Number(l.custo_total) > 0 ? (Number(l.receita) / Number(l.custo_total)) * 100 : 0;
                      return (
                        <tr key={l.lote_id}>
                          <td className="font-medium">{l.lote}</td>
                          <td className="text-right">{Number(l.itens_entrada)}</td>
                          <td className="text-right">{Number(l.itens_vendidos)}</td>
                          <td className="text-right">{fmtBRL(Number(l.custo_total))}</td>
                          <td className="text-right">{fmtBRL(Number(l.receita))}</td>
                          <td className={cn("text-right font-semibold", Number(l.lucro) < 0 && "text-destructive")}>{fmtBRL(Number(l.lucro))}</td>
                          <td>
                            {Number(l.custo_total) > 0 ? (
                              <div className="flex items-center gap-2" title={`Já voltou ${Math.round(ret)}% do custo`}>
                                <div className="h-2 flex-1 rounded-full bg-muted"><div className={cn("h-2 rounded-full", ret >= 100 ? "bg-success" : "bg-primary")} style={{ width: `${Math.min(100, ret)}%` }} /></div>
                                <span className="w-11 text-right text-xs">{Math.round(ret)}%</span>
                              </div>
                            ) : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot><tr><td>Total</td><td /><td /><td className="text-right">{fmtBRL(totLotes.custo)}</td><td className="text-right">{fmtBRL(totLotes.receita)}</td><td className="text-right">{fmtBRL(totLotes.lucro)}</td><td /></tr></tfoot>
                </table>
              </div>
            )}
          </Secao>

          <Secao titulo="Itens parados" desc="produtos com estoque que não vendem há muito tempo"
            acoes={<>
              <div className="inline-flex rounded-md border p-0.5">
                {[30, 60, 90].map((d) => <button key={d} onClick={() => setDias(d)} className={cn("rounded px-2.5 py-1 text-xs", dias === d ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>+{d} dias</button>)}
              </div>
              <Exportar titulo={`Itens parados há mais de ${dias} dias`} subtitulo={nomeLoja} colunas={[{ titulo: "SKU" }, { titulo: "Produto" }, { titulo: "Estoque", numero: true }, { titulo: "Preço (R$)", numero: true }, { titulo: "Dias parado", numero: true }]}
                linhas={() => parados.map((p) => [p.sku, p.titulo, Number(p.estoque), Number(p.preco_venda), p.dias_parado])} />
            </>}>
            {parados.length === 0 ? <Vazio>Nenhum item parado nesse prazo.</Vazio> : (
              <div className="overflow-x-auto max-h-[28rem]">
                <table className="w-full text-sm">
                  <thead><tr><th>Produto</th><th className="text-right">Estoque</th><th className="text-right">Preço</th><th className="text-right">Valor parado</th><th className="text-right">Parado há</th></tr></thead>
                  <tbody>
                    {parados.map((p) => (
                      <tr key={p.produto_id}>
                        <td>{p.titulo} <span className="text-xs text-muted-foreground">{p.sku}</span></td>
                        <td className="text-right">{Number(p.estoque)} un.</td>
                        <td className="text-right">{fmtBRL(Number(p.preco_venda))}</td>
                        <td className="text-right">{fmtBRL(Number(p.estoque) * Number(p.preco_venda))}</td>
                        <td className="text-right"><span className={cn("rounded px-1.5 py-0.5 text-xs font-medium", p.dias_parado >= 90 ? "bg-destructive/15 text-destructive" : "bg-warning/20")}>{p.dias_parado} dias</span></td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot><tr><td>{parados.length} produto(s)</td><td className="text-right">{parados.reduce((s, p) => s + Number(p.estoque), 0)} un.</td><td /><td className="text-right">{fmtBRL(parados.reduce((s, p) => s + Number(p.estoque) * Number(p.preco_venda), 0))}</td><td /></tr></tfoot>
                </table>
              </div>
            )}
          </Secao>
        </>
      )}
    </div>
  );
}

function Vazio({ children }: { children: ReactNode }) {
  return <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">{children}</p>;
}

