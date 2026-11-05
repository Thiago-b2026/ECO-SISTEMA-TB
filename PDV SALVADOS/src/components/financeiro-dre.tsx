// Aba "DRE gerencial" do Financeiro (veio do projeto marketwise-margin-map do Lovable).
// Despesas = contas a pagar do Financeiro, agrupadas pela categoria do DRE ligada ao Plano de contas.
// Faturamento = vendas da empresa no mês (automático) ou o valor digitado. Tudo separado por empresa.
import { useEffect, useMemo, useState } from "react";
import { Loader2, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { fmtBRL } from "@/lib/format";
import { lerNumero } from "@/lib/precificacao";
import { MESES, MESES_CURTOS, STATUS_DRE, faturamentoEfetivo, fmtPct, pctDe, statusBenchmark } from "@/lib/dre";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Exportar } from "@/components/exportar";
import { cn } from "@/lib/utils";

interface Cat { id: string; nome: string; benchmark_pct: number; cor: string; ordem: number; ativo: boolean }
interface LinhaDesp { loja_id: string; mes: number; categoria_id: string | null; valor: number }
interface LinhaFat { loja_id: string; mes: number; automatico: number; manual: number | null }
type Regime = "competencia" | "caixa";

const SEM = "sem";

export function DreGerencial({ lojaId, lojaNome }: { lojaId: string | null; lojaNome: string }) {
  const agora = new Date();
  const [ano, setAno] = useState(agora.getFullYear());
  const [mes, setMes] = useState(agora.getMonth() + 1);
  const [regime, setRegime] = useState<Regime>("competencia");
  const [cats, setCats] = useState<Cat[]>([]);
  const [benchLoja, setBenchLoja] = useState<Record<string, number>>({});
  const [desp, setDesp] = useState<LinhaDesp[] | null>(null);
  const [fat, setFat] = useState<LinhaFat[]>([]);
  const [config, setConfig] = useState(false);
  const [aberta, setAberta] = useState<string | null>(null);

  async function carregar() {
    setDesp(null);
    const [c, b, d, f] = await Promise.all([
      supabase.from("dre_categorias").select("*").order("ordem"),
      lojaId ? supabase.from("dre_benchmark_loja").select("categoria_id, benchmark_pct").eq("loja_id", lojaId) : Promise.resolve({ data: [], error: null }),
      supabase.rpc("dre_despesas_ano", { _loja_id: lojaId, _ano: ano, _regime: regime }),
      supabase.rpc("dre_faturamento_ano", { _loja_id: lojaId, _ano: ano }),
    ]);
    const erro = c.error ?? b.error ?? d.error ?? f.error;
    if (erro) {
      toast.error(erro.message.includes("does not exist") || erro.message.includes("Could not find")
        ? "O DRE ainda não foi instalado no banco: aplique a migration 0016."
        : erro.message);
      setDesp([]);
      return;
    }
    setCats((c.data ?? []) as Cat[]);
    setBenchLoja(Object.fromEntries(((b.data ?? []) as { categoria_id: string; benchmark_pct: number }[]).map((x) => [x.categoria_id, Number(x.benchmark_pct)])));
    setDesp(((d.data ?? []) as LinhaDesp[]).map((x) => ({ ...x, valor: Number(x.valor) })));
    setFat(((f.data ?? []) as LinhaFat[]).map((x) => ({ ...x, automatico: Number(x.automatico), manual: x.manual == null ? null : Number(x.manual) })));
  }
  useEffect(() => {
    carregar();
  }, [lojaId, ano, regime]);

  const ativas = cats.filter((c) => c.ativo);
  const bench = (c: Cat) => benchLoja[c.id] ?? Number(c.benchmark_pct);

  // Totais por mês
  const fatMes = useMemo(() => {
    const r = Array(13).fill(0) as number[];
    for (const f of fat) r[f.mes] += faturamentoEfetivo(f.automatico, f.manual);
    return r;
  }, [fat]);
  const despCat = useMemo(() => {
    const m = new Map<string, number[]>();
    for (const d of desp ?? []) {
      const k = d.categoria_id ?? SEM;
      if (!m.has(k)) m.set(k, Array(13).fill(0));
      m.get(k)![d.mes] += d.valor;
    }
    return m;
  }, [desp]);
  const val = (k: string, m: number) => despCat.get(k)?.[m] ?? 0;
  const despMes = (m: number) => [...despCat.values()].reduce((s, a) => s + a[m], 0);

  const faturamento = fatMes[mes];
  const totalDesp = despMes(mes);
  const lucro = faturamento - totalDesp;
  const rent = pctDe(lucro, faturamento);
  const semCat = val(SEM, mes);
  const fatLoja = lojaId ? fat.find((f) => f.loja_id === lojaId && f.mes === mes) : undefined;

  const linhasAno = () => {
    const tot = (fn: (m: number) => number) => Array.from({ length: 12 }, (_, i) => fn(i + 1));
    const soma = (a: number[]) => a.reduce((s, v) => s + v, 0);
    const out: (string | number)[][] = [];
    const add = (nome: string, a: number[]) => out.push([nome, ...a, soma(a)]);
    add("Faturamento", tot((m) => fatMes[m]));
    for (const c of ativas) add(c.nome, tot((m) => val(c.id, m)));
    if (despCat.has(SEM)) add("Sem categoria", tot((m) => val(SEM, m)));
    add("Total despesas", tot(despMes));
    add("Lucro operacional", tot((m) => fatMes[m] - despMes(m)));
    return out;
  };

  return (
    <div className="space-y-4">
      <Card className="p-4 flex flex-wrap items-end gap-3">
        <div>
          <Label className="text-xs">Mês</Label>
          <select value={mes} onChange={(e) => setMes(Number(e.target.value))} className="h-9 rounded-md border bg-background px-2 text-sm">
            {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
        </div>
        <div>
          <Label className="text-xs">Ano</Label>
          <Input type="number" value={ano} onChange={(e) => setAno(Number(e.target.value) || agora.getFullYear())} className="w-24" />
        </div>
        <div>
          <Label className="text-xs">Regime</Label>
          <div className="flex gap-1">
            <Button size="sm" variant={regime === "competencia" ? "default" : "outline"} onClick={() => setRegime("competencia")} title="Pelo mês de competência de cada conta (pagas e em aberto)">Competência</Button>
            <Button size="sm" variant={regime === "caixa" ? "default" : "outline"} onClick={() => setRegime("caixa")} title="Só o que foi pago, pelo mês do pagamento">Caixa</Button>
          </div>
        </div>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setConfig(true)}><Settings2 /> Categorias e benchmarks</Button>
        </div>
      </Card>

      {!desp ? <Loader2 className="animate-spin text-muted-foreground" /> : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="p-4">
              <div className="text-sm text-muted-foreground">Faturamento · {MESES[mes - 1]}</div>
              <div className="text-2xl font-bold">{fmtBRL(faturamento)}</div>
              <div className="text-xs text-muted-foreground">{lojaId ? (fatLoja?.manual != null ? "valor digitado" : "vendas do sistema") : `soma de ${lojaNome.toLowerCase()}`}</div>
            </Card>
            <Card className="p-4">
              <div className="text-sm text-muted-foreground">Total de despesas</div>
              <div className="text-2xl font-bold">{fmtBRL(totalDesp)}</div>
              <div className="text-xs text-muted-foreground">{fmtPct(pctDe(totalDesp, faturamento))} do faturamento</div>
            </Card>
            <Card className={cn("p-4", lucro < 0 && "border-destructive/40")}>
              <div className="text-sm text-muted-foreground">Lucro operacional</div>
              <div className={cn("text-2xl font-bold", lucro < 0 ? "text-destructive" : "text-success")}>{fmtBRL(lucro)}</div>
            </Card>
            <Card className="p-4">
              <div className="text-sm text-muted-foreground">Rentabilidade</div>
              <div className={cn("text-2xl font-bold", rent < 0 ? "text-destructive" : rent >= 10 ? "text-success" : "text-amber-600")}>{fmtPct(rent)}</div>
              <div className="text-xs text-muted-foreground">lucro ÷ faturamento</div>
            </Card>
          </div>

          {lojaId && <EditorFaturamento lojaId={lojaId} ano={ano} mes={mes} automatico={fatLoja?.automatico ?? 0} manual={fatLoja?.manual ?? null} onFeito={carregar} />}

          <Card className="p-4 space-y-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-semibold">Despesas por categoria × benchmark</h3>
              <span className="text-xs text-muted-foreground">Barra = % do faturamento · traço = benchmark{lojaId ? " desta empresa" : " padrão"}</span>
            </div>
            {ativas.map((c) => {
              const v = val(c.id, mes);
              const atual = pctDe(v, faturamento);
              const b = bench(c);
              const st = STATUS_DRE[statusBenchmark(atual, b)];
              const escala = Math.max(b * 2, atual, 1);
              const difValor = v - (faturamento * b) / 100;
              return (
                <div key={c.id} className="rounded-md border">
                  <button type="button" className="w-full flex flex-wrap items-center gap-3 px-3 py-2 text-left hover:bg-muted/40" onClick={() => setAberta(aberta === c.id ? null : c.id)}>
                    <span className="size-3 rounded-full shrink-0" style={{ background: c.cor }} />
                    <span className="w-28 font-medium truncate">{c.nome}</span>
                    <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold", st.classe)}>{st.label}</span>
                    <span className="relative h-2.5 flex-1 min-w-24 rounded-full bg-muted">
                      <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.min(100, (atual / escala) * 100)}%`, background: c.cor }} />
                      <span className="absolute -inset-y-1 w-0.5 bg-foreground/70" style={{ left: `${(b / escala) * 100}%` }} title={`Benchmark ${fmtPct(b)}`} />
                    </span>
                    <span className="w-44 text-right text-sm">
                      <b>{fmtBRL(v)}</b> <span className="text-xs text-muted-foreground">{fmtPct(atual)} / {fmtPct(b)}</span>
                    </span>
                  </button>
                  {aberta === c.id && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 border-t px-3 py-2 text-sm">
                      <div><div className="text-xs text-muted-foreground">Benchmark</div>{fmtPct(b)} · {fmtBRL((faturamento * b) / 100)}</div>
                      <div><div className="text-xs text-muted-foreground">Atual</div>{fmtPct(atual)}</div>
                      <div><div className="text-xs text-muted-foreground">Diferença %</div><span className={atual > b ? "text-destructive" : "text-success"}>{atual > b ? "+" : ""}{fmtPct(atual - b)}</span></div>
                      <div><div className="text-xs text-muted-foreground">Diferença R$</div><span className={difValor > 0 ? "text-destructive" : "text-success"}>{difValor > 0 ? "+" : ""}{fmtBRL(difValor)}</span></div>
                    </div>
                  )}
                </div>
              );
            })}
            {semCat !== 0 && (
              <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
                <b>Sem categoria: {fmtBRL(semCat)}</b> · contas a pagar cuja conta do plano não está ligada a uma categoria do DRE.
                Ligue em Cadastros → Plano de contas (coluna "DRE").
              </div>
            )}
          </Card>

          <Card className="p-4 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold">Comparativo mensal · {ano}</h3>
              <Exportar titulo={`DRE gerencial ${ano}`} subtitulo={`${lojaNome} · regime ${regime === "caixa" ? "de caixa" : "de competência"}`}
                colunas={[{ titulo: "Linha" }, ...MESES_CURTOS.map((m) => ({ titulo: `${m} (R$)`, numero: true })), { titulo: "Ano (R$)", numero: true }]}
                linhas={linhasAno} />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-left text-muted-foreground">
                  <tr className="border-b"><th className="py-2 pr-2">Linha</th>{MESES_CURTOS.map((m, i) => <th key={m} className={cn("py-2 px-1 text-right", i + 1 === mes && "text-foreground")}>{m}</th>)}<th className="py-2 pl-2 text-right">Ano</th></tr>
                </thead>
                <tbody>
                  {linhasAno().map((l, idx, todas) => {
                    const destaque = idx === 0 || idx >= todas.length - 2;
                    return (
                      <tr key={String(l[0])} className={cn("border-b last:border-0", destaque && "font-semibold")}>
                        <td className="py-1.5 pr-2 whitespace-nowrap">{l[0]}</td>
                        {l.slice(1).map((v, i) => {
                          const n = Number(v);
                          const base = i < 12 ? fatMes[i + 1] : fatMes.reduce((s, x) => s + x, 0);
                          return (
                            <td key={i} className={cn("py-1.5 px-1 text-right whitespace-nowrap", i + 1 === mes && "bg-muted/50", n < 0 && "text-destructive", i === 12 && "pl-2")}>
                              {n ? fmtBRL(n).replace("R$", "").trim() : "—"}
                              {n !== 0 && idx > 0 && base > 0 && <div className="text-[10px] font-normal text-muted-foreground">{fmtPct(pctDe(n, base))}</div>}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {config && <ConfigCategorias cats={cats} lojaId={lojaId} lojaNome={lojaNome} benchLoja={benchLoja} onClose={() => setConfig(false)} onFeito={carregar} />}
    </div>
  );
}

function EditorFaturamento({ lojaId, ano, mes, automatico, manual, onFeito }: { lojaId: string; ano: number; mes: number; automatico: number; manual: number | null; onFeito: () => void }) {
  const [valor, setValor] = useState(manual != null ? String(manual).replace(".", ",") : "");
  const [salvando, setSalvando] = useState(false);
  useEffect(() => setValor(manual != null ? String(manual).replace(".", ",") : ""), [lojaId, ano, mes, manual]);

  async function salvar() {
    const v = lerNumero(valor);
    if (v == null || v < 0) return toast.error("Digite um valor válido.");
    setSalvando(true);
    const { error } = await supabase.from("dre_faturamento").upsert({ loja_id: lojaId, ano, mes, valor: v });
    setSalvando(false);
    if (error) return toast.error(error.message);
    toast.success("Faturamento do mês salvo.");
    onFeito();
  }
  async function usarAutomatico() {
    setSalvando(true);
    const { error } = await supabase.from("dre_faturamento").delete().eq("loja_id", lojaId).eq("ano", ano).eq("mes", mes);
    setSalvando(false);
    if (error) return toast.error(error.message);
    toast.success("Voltou a usar as vendas do sistema.");
    onFeito();
  }

  return (
    <Card className="p-4 flex flex-wrap items-end gap-3">
      <div className="text-sm">
        <div className="text-xs text-muted-foreground">Vendas no sistema em {MESES[mes - 1]}</div>
        <div className="font-semibold">{fmtBRL(automatico)}</div>
      </div>
      <div>
        <Label className="text-xs">Faturamento digitado (opcional)</Label>
        <Input value={valor} onChange={(e) => setValor(e.target.value)} onKeyDown={(e) => e.key === "Enter" && salvar()} inputMode="decimal" placeholder="em branco = usa as vendas" className="w-48" />
      </div>
      <Button size="sm" onClick={salvar} disabled={salvando || !valor.trim()}>Salvar</Button>
      {manual != null && <Button size="sm" variant="ghost" onClick={usarAutomatico} disabled={salvando}>Usar as vendas do sistema</Button>}
      <p className="text-xs text-muted-foreground basis-full">O valor digitado vale no lugar das vendas (para meses antigos ou vendas feitas fora do PDV).</p>
    </Card>
  );
}

function ConfigCategorias({ cats, lojaId, lojaNome, benchLoja, onClose, onFeito }: {
  cats: Cat[]; lojaId: string | null; lojaNome: string; benchLoja: Record<string, number>; onClose: () => void; onFeito: () => void;
}) {
  const [nova, setNova] = useState("");

  async function salvarCat(c: Cat, campo: Partial<Cat>) {
    const { error } = await supabase.from("dre_categorias").update(campo).eq("id", c.id);
    if (error) return toast.error(error.message);
    onFeito();
  }
  async function salvarBenchLoja(c: Cat, texto: string) {
    if (!lojaId) return;
    const atual = benchLoja[c.id];
    if (!texto.trim()) {
      if (atual == null) return;
      const { error } = await supabase.from("dre_benchmark_loja").delete().eq("loja_id", lojaId).eq("categoria_id", c.id);
      if (error) return toast.error(error.message);
      return onFeito();
    }
    const v = lerNumero(texto);
    if (v == null || v < 0 || v === atual) return;
    const { error } = await supabase.from("dre_benchmark_loja").upsert({ loja_id: lojaId, categoria_id: c.id, benchmark_pct: v });
    if (error) return toast.error(error.message);
    onFeito();
  }
  async function criar() {
    if (!nova.trim()) return;
    const ordem = Math.max(0, ...cats.map((c) => c.ordem)) + 1;
    const { error } = await supabase.from("dre_categorias").insert({ nome: nova.trim(), ordem });
    if (error) return toast.error(error.message.includes("duplicate") ? "Já existe uma categoria com esse nome." : error.message);
    setNova("");
    onFeito();
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Categorias do DRE e benchmarks</DialogTitle>
          <DialogDescription>
            Benchmark = quanto do faturamento cada categoria pode consumir. O padrão vale para todas as empresas;
            {lojaId ? ` a coluna "${lojaNome}" vale só para esta empresa (em branco = usa o padrão).` : " escolha uma empresa no menu para definir um benchmark só dela."}
            {" "}Salva ao sair do campo.
          </DialogDescription>
        </DialogHeader>
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr className="border-b"><th className="py-1 pr-2">Cor</th><th className="py-1 pr-2">Nome</th><th className="py-1 pr-2">Padrão %</th>{lojaId && <th className="py-1 pr-2">{lojaNome} %</th>}<th className="py-1">Ativa</th></tr>
          </thead>
          <tbody>
            {cats.map((c) => (
              <tr key={c.id} className={cn("border-b last:border-0", !c.ativo && "opacity-50")}>
                <td className="py-1 pr-2"><input type="color" defaultValue={c.cor} onBlur={(e) => e.target.value !== c.cor && salvarCat(c, { cor: e.target.value })} className="h-8 w-10 cursor-pointer rounded border bg-background" /></td>
                <td className="py-1 pr-2"><Input defaultValue={c.nome} onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== c.nome && salvarCat(c, { nome: e.target.value.trim() })} className="h-8" /></td>
                <td className="py-1 pr-2"><Input defaultValue={String(c.benchmark_pct).replace(".", ",")} inputMode="decimal" className="h-8 w-20"
                  onBlur={(e) => { const v = lerNumero(e.target.value); if (v != null && v >= 0 && v !== Number(c.benchmark_pct)) salvarCat(c, { benchmark_pct: v }); }} /></td>
                {lojaId && <td className="py-1 pr-2"><Input defaultValue={benchLoja[c.id] != null ? String(benchLoja[c.id]).replace(".", ",") : ""} placeholder="padrão" inputMode="decimal" className="h-8 w-20" onBlur={(e) => salvarBenchLoja(c, e.target.value)} /></td>}
                <td className="py-1"><input type="checkbox" className="size-4 accent-primary" checked={c.ativo} onChange={() => salvarCat(c, { ativo: !c.ativo })} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex gap-2">
          <Input value={nova} onChange={(e) => setNova(e.target.value)} onKeyDown={(e) => e.key === "Enter" && criar()} placeholder="Nova categoria (ex.: Fretes)" />
          <Button onClick={criar}>Criar</Button>
        </div>
        <p className="text-xs text-muted-foreground">Para uma despesa cair numa categoria, ligue a conta em Cadastros → Plano de contas (coluna "DRE"). Subcontas herdam da conta-pai.</p>
      </DialogContent>
    </Dialog>
  );
}
