import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { carregarNomes, supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { useEmpresa } from "../contexts/EmpresaContext";
import {
  ITENS, MESES, brl, calcular, classificar, normalizar, pctFmt, soma, somar, temValores, vazio,
  type DadosMes,
} from "../lib/calc";
import type { Aba, Loja, RhRow } from "../lib/types";
import { Card, CampoDinheiro, Valor } from "../components/ui";

const CORES = ["#38bdf8", "#f472b6", "#34d399", "#fbbf24", "#a78bfa", "#60a5fa", "#fb923c", "#22d3ee", "#f87171", "#a3e635", "#e879f9", "#94a3b8", "#facc15", "#2dd4bf"];
const TIP = { contentStyle: { background: "rgb(19 25 38)", border: "1px solid rgb(41 51 71)", borderRadius: 8 }, labelStyle: { color: "#e6eaf2" } };
const ABA_LABEL: Record<Aba, string> = { provisao: "Provisão", realizado: "Realizado" };
const chave = (tab: string, ano: number, mes: number) => `${tab}|${ano}|${mes}`;

export default function Dashboard() {
  const { user } = useAuth();
  const { empresa, lojas } = useEmpresa();
  const hoje = new Date();
  const [aba, setAba] = useState<Aba>("realizado");
  const [periodo, setPeriodo] = useState<"mes" | "ano">("mes");
  const [mes, setMes] = useState(hoje.getMonth());
  const [ano, setAno] = useState(hoje.getFullYear());
  const [rows, setRows] = useState<RhRow[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "erro">("idle");
  const [nomes, setNomes] = useState<Record<string, string>>({});
  const timers = useRef<Record<string, number>>({});

  const empresaId = empresa?.id;

  // ---------- Carregar ano + tempo real ----------
  useEffect(() => {
    if (!empresaId) return;
    let ativo = true;
    setCarregando(true);
    supabase
      .from("rh_entries")
      .select("empresa_id,tab,ano,mes,data,updated_by,updated_at")
      .eq("empresa_id", empresaId)
      .eq("ano", ano)
      .then(({ data, error }) => {
        if (!ativo) return;
        if (error) console.error(error);
        setRows((data as RhRow[]) ?? []);
        setCarregando(false);
      });

    const canal = supabase
      .channel(`rh_${empresaId}_${ano}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "rh", table: "rh_entries", filter: `empresa_id=eq.${empresaId}` },
        (p) => {
          const n = p.new as RhRow;
          if (!n || n.ano !== ano) return;
          if (timers.current[chave(n.tab, n.ano, n.mes)]) return; // edição local pendente tem prioridade
          setRows((atual) => [...atual.filter((r) => !(r.tab === n.tab && r.mes === n.mes)), n]);
        },
      )
      .subscribe();
    return () => {
      ativo = false;
      supabase.removeChannel(canal);
    };
  }, [empresaId, ano]);

  // Nomes de quem alterou
  useEffect(() => {
    if (!empresaId) return;
    carregarNomes().then(setNomes);
  }, [empresaId]);

  const dadosDe = useCallback(
    (tab: Aba, m: number): DadosMes => {
      const r = rows.find((x) => x.tab === tab && x.mes === m);
      return r ? normalizar(r.data, lojas) : vazio(lojas);
    },
    [rows, lojas],
  );

  const dadosAno = useCallback(
    (tab: Aba) => somar(MESES.map((_, i) => dadosDe(tab, i)), lojas),
    [dadosDe, lojas],
  );

  const atual: DadosMes = periodo === "mes" ? dadosDe(aba, mes) : dadosAno(aba);
  const editavel = periodo === "mes";

  // ---------- Salvar (com atraso de 600 ms, igual ao original) ----------
  function salvar(novo: DadosMes, tab: Aba = aba, a: number = ano, m: number = mes) {
    if (!empresaId || !user) return;
    const k = chave(tab, a, m);
    const existente = rows.find((r) => r.tab === tab && r.mes === m && r.ano === a);
    const base = existente && typeof existente.data === "object" && existente.data ? (existente.data as object) : {};
    const data = { ...base, faturamento: novo.faturamento, items: novo.items };
    const linha: RhRow = { empresa_id: empresaId, tab, ano: a, mes: m, data, updated_by: user.id, updated_at: new Date().toISOString() };
    if (a === ano) setRows((rs) => [...rs.filter((r) => !(r.tab === tab && r.mes === m)), linha]);
    setStatus("saving");
    window.clearTimeout(timers.current[k]);
    timers.current[k] = window.setTimeout(async () => {
      const { error } = await supabase
        .from("rh_entries")
        .upsert({ empresa_id: empresaId, tab, ano: a, mes: m, data, updated_by: user.id }, { onConflict: "empresa_id,tab,ano,mes" });
      delete timers.current[k];
      if (error) {
        console.error(error);
        setStatus("erro");
      } else {
        setStatus("saved");
        window.setTimeout(() => setStatus((s) => (s === "saved" ? "idle" : s)), 1200);
      }
    }, 600);
  }

  const alterarFat = (codigo: string, v: number) =>
    salvar({ ...atual, faturamento: { ...atual.faturamento, [codigo]: v } });
  const alterarItem = (i: number, codigo: string, v: number) =>
    salvar({ ...atual, items: atual.items.map((it, j) => (j === i ? { ...it, [codigo]: v } : it)) });

  async function copiarMesAnterior() {
    let origem: DadosMes;
    if (mes > 0) origem = dadosDe(aba, mes - 1);
    else {
      const { data } = await supabase
        .from("rh_entries")
        .select("data")
        .eq("empresa_id", empresaId!)
        .eq("tab", aba)
        .eq("ano", ano - 1)
        .eq("mes", 11)
        .maybeSingle();
      origem = normalizar(data?.data, lojas);
    }
    const nomeOrigem = mes > 0 ? MESES[mes - 1] : `Dezembro/${ano - 1}`;
    if (!temValores(origem)) return alert(`${nomeOrigem} (${ABA_LABEL[aba]}) não tem valores para copiar.`);
    if (temValores(atual) && !confirm(`${MESES[mes]} já tem valores. Substituir pelos de ${nomeOrigem}? (o valor atual fica guardado no Histórico)`)) return;
    salvar(origem);
  }

  function copiarDaOutraAba() {
    const outra: Aba = aba === "realizado" ? "provisao" : "realizado";
    const origem = dadosDe(outra, mes);
    if (!temValores(origem)) return alert(`${ABA_LABEL[outra]} de ${MESES[mes]} está vazio.`);
    if (temValores(atual) && !confirm(`Substituir ${ABA_LABEL[aba]} de ${MESES[mes]} pelos valores de ${ABA_LABEL[outra]}?`)) return;
    salvar(origem);
  }

  // ---------- Cálculos ----------
  const res = useMemo(() => calcular(atual, lojas, empresa!), [atual, lojas, empresa]);
  const st = classificar(res.pct, empresa!);
  const anos = useMemo(() => {
    const fim = Math.max(hoje.getFullYear() + 1, ano);
    return Array.from({ length: fim - 2023 + 1 }, (_, i) => 2023 + i);
  }, [ano]);

  const graficoLojas = lojas.map((l) => ({ name: l.nome, Faturamento: atual.faturamento[l.codigo] ?? 0, Custo: res.total[l.codigo] ?? 0 }));
  const composicao = [
    ...ITENS.map((nome, i) => ({ name: nome, value: soma(atual.items[i], lojas) })),
    { name: `Gastos Extras (${empresa!.pct_extras}%)`, value: res.extrasGlobal },
  ].filter((x) => x.value > 0);
  const evolucao = MESES.map((m, i) => {
    const p = calcular(dadosDe("provisao", i), lojas, empresa!);
    const r = calcular(dadosDe("realizado", i), lojas, empresa!);
    return { mes: m.slice(0, 3), Provisão: +p.pct.toFixed(2) || null, Realizado: +r.pct.toFixed(2) || null };
  });

  // Provisão x Realizado
  const dProv = periodo === "mes" ? dadosDe("provisao", mes) : dadosAno("provisao");
  const dReal = periodo === "mes" ? dadosDe("realizado", mes) : dadosAno("realizado");
  const rProv = calcular(dProv, lojas, empresa!);
  const rReal = calcular(dReal, lojas, empresa!);
  const comparativo = [
    { nome: "Faturamento", p: rProv.fatGlobal, r: rReal.fatGlobal, receita: true },
    ...ITENS.map((nome, i) => ({ nome, p: soma(dProv.items[i], lojas), r: soma(dReal.items[i], lojas), receita: false })),
    { nome: `Gastos Extras (${empresa!.pct_extras}%)`, p: rProv.extrasGlobal, r: rReal.extrasGlobal, receita: false },
    { nome: "Total de Custo", p: rProv.custoGlobal, r: rReal.custoGlobal, receita: false, total: true },
  ];

  const ultima = periodo === "mes" ? rows.find((r) => r.tab === aba && r.mes === mes) : undefined;
  const titPeriodo = periodo === "mes" ? `${MESES[mes]} / ${ano}` : `Acumulado ${ano}`;

  function exportarCsv() {
    const n = (v: number) => v.toFixed(2).replace(".", ",");
    const cab = ["Item", ...lojas.map((l) => l.nome), "Global", "% Fat. Global"];
    const linha = (nome: string, vals: Record<string, number>) => {
      const g = soma(vals, lojas);
      return [nome, ...lojas.map((l) => n(vals[l.codigo] ?? 0)), n(g), res.fatGlobal > 0 ? n((g / res.fatGlobal) * 100) : "0,00"];
    };
    const linhas = [
      [`${empresa!.nome} - ${ABA_LABEL[aba]} - ${titPeriodo}`],
      cab,
      linha("Faturamento", atual.faturamento),
      ...ITENS.map((nome, i) => linha(`${i + 1}. ${nome}`, atual.items[i])),
      linha(`Gastos Extras (${empresa!.pct_extras}%)`, res.extras),
      linha("Total de Custo com Pessoal", res.total),
    ];
    const csv = "﻿" + linhas.map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `RH_${empresa!.nome.replace(/\W+/g, "_")}_${aba}_${periodo === "mes" ? `${ano}-${String(mes + 1).padStart(2, "0")}` : ano}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  if (lojas.length === 0)
    return <div className="text-sm text-muted-foreground">Carregando lojas...</div>;

  const grid = { gridTemplateColumns: `minmax(220px,2fr) repeat(${lojas.length + 1}, minmax(110px,1fr))` };

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{empresa!.nome}</h1>
          <p className="text-sm text-muted-foreground">Gestão de RH e Custos de Pessoal • {lojas.length} {lojas.length === 1 ? "loja" : "lojas"}</p>
        </div>
        <div className="flex items-center gap-2 rounded-lg bg-card p-1 border border-border no-print">
          {(["provisao", "realizado"] as Aba[]).map((t) => (
            <button
              key={t}
              onClick={() => setAba(t)}
              className={`px-4 py-2 text-sm rounded-md font-medium transition ${aba === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {ABA_LABEL[t]}
            </button>
          ))}
        </div>
      </div>

      {/* Filtros e ações */}
      <div className="flex flex-wrap gap-3 items-center no-print">
        <div className="flex rounded-md border border-border overflow-hidden text-sm">
          <button onClick={() => setPeriodo("mes")} className={`px-3 py-2 ${periodo === "mes" ? "bg-muted text-foreground" : "text-muted-foreground"}`}>Mês</button>
          <button onClick={() => setPeriodo("ano")} className={`px-3 py-2 ${periodo === "ano" ? "bg-muted text-foreground" : "text-muted-foreground"}`}>Acumulado do ano</button>
        </div>
        {periodo === "mes" && (
          <select value={mes} onChange={(e) => setMes(Number(e.target.value))} className="rounded-md bg-card border border-border px-3 py-2 text-sm">
            {MESES.map((m, i) => <option key={m} value={i}>{m}</option>)}
          </select>
        )}
        <select value={ano} onChange={(e) => setAno(Number(e.target.value))} className="rounded-md bg-card border border-border px-3 py-2 text-sm">
          {anos.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <span className={`text-xs ${status === "erro" ? "text-danger" : "text-muted-foreground"}`}>
          {carregando ? "Carregando dados..." : status === "saving" ? "Salvando..." : status === "saved" ? "Salvo ✓" : status === "erro" ? "Erro ao salvar – verifique a conexão" : "Sincronizado"}
        </span>
        <div className="flex flex-wrap gap-2 ml-auto">
          {editavel && <button onClick={copiarMesAnterior} className="btn-secundario">Copiar mês anterior</button>}
          {editavel && <button onClick={copiarDaOutraAba} className="btn-secundario">Copiar de {aba === "realizado" ? "Provisão" : "Realizado"}</button>}
          <button onClick={exportarCsv} className="btn-secundario">Exportar Excel</button>
          <button onClick={() => window.print()} className="btn-secundario">Imprimir</button>
        </div>
      </div>

      {/* Indicadores */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card titulo="Faturamento Global">
          <div className="text-2xl font-bold tabular-nums">{brl(res.fatGlobal)}</div>
          <div className="text-xs text-muted-foreground mt-1">{ABA_LABEL[aba]} • {titPeriodo}</div>
        </Card>
        <Card titulo="Custo Total com Pessoal">
          <div className="text-2xl font-bold tabular-nums">{brl(res.custoGlobal)}</div>
          <div className="text-xs text-muted-foreground mt-1">{pctFmt(res.pct)} do faturamento</div>
        </Card>
        <Card titulo="Indicador">
          <div className={`inline-flex items-center gap-2 px-3 py-2 rounded-md ${st.fundo} ${st.texto} font-semibold`}>
            <span className="w-2 h-2 rounded-full" style={{ background: st.cor }} />
            {st.label} • {pctFmt(res.pct)}
          </div>
          <div className="text-xs text-muted-foreground mt-2">
            ÓTIMO &lt; {empresa!.meta_otimo}% • BOM {empresa!.meta_otimo}–{Number(empresa!.meta_alerta) - 0.1}% • ALERTA ≥ {empresa!.meta_alerta}%
          </div>
        </Card>
      </section>

      {/* Gráficos */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card titulo="Faturamento vs Custo (por loja)">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={graficoLojas}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(41 51 71)" />
                <XAxis dataKey="name" stroke="#94a0b6" fontSize={12} />
                <YAxis stroke="#94a0b6" fontSize={11} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                <Tooltip {...TIP} formatter={(v: number) => brl(v)} />
                <Legend />
                <Bar dataKey="Faturamento" fill={CORES[0]} radius={[4, 4, 0, 0]} />
                <Bar dataKey="Custo" fill={CORES[1]} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card titulo="Composição dos Custos">
          <div className="h-64">
            {composicao.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Insira valores para visualizar</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={composicao} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90} paddingAngle={2}>
                    {composicao.map((_, i) => <Cell key={i} fill={CORES[i % CORES.length]} />)}
                  </Pie>
                  <Tooltip {...TIP} formatter={(v: number) => brl(v)} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
        <Card titulo={`Evolução % Custo / Faturamento — ${ano}`}>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={evolucao}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(41 51 71)" />
                <XAxis dataKey="mes" stroke="#94a0b6" fontSize={12} />
                <YAxis stroke="#94a0b6" fontSize={12} unit="%" />
                <Tooltip {...TIP} formatter={(v: number) => `${v}%`} />
                <Legend />
                <Line type="monotone" dataKey="Provisão" stroke={CORES[3]} strokeWidth={2} dot={{ r: 3 }} connectNulls />
                <Line type="monotone" dataKey="Realizado" stroke={CORES[1]} strokeWidth={2} dot={{ r: 3 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </section>

      {/* Lançamentos */}
      <Card
        titulo={`Lançamentos — ${ABA_LABEL[aba]} • ${titPeriodo}`}
        acoes={!editavel && <span className="text-xs text-muted-foreground">Soma dos 12 meses (somente leitura). Para lançar, escolha "Mês".</span>}
      >
        <div className="overflow-x-auto">
          <div className="min-w-[640px] space-y-3">
            <div className="grid gap-3 text-xs uppercase tracking-wider text-muted-foreground font-medium px-1" style={grid}>
              <div>Item</div>
              {lojas.map((l) => <div key={l.id} className="text-center">{l.nome}</div>)}
              <div className="text-center text-primary">Global</div>
            </div>
            <LinhaEditavel nome="Faturamento" destaqueNome lojas={lojas} vals={atual.faturamento} grid={grid} disabled={!editavel} onChange={alterarFat} />
            <div className="border-t border-border pt-3 text-xs uppercase tracking-wider text-muted-foreground">Itens da Folha de Custo</div>
            {ITENS.map((nome, i) => (
              <LinhaEditavel key={nome} nome={`${i + 1}. ${nome}`} lojas={lojas} vals={atual.items[i]} grid={grid} disabled={!editavel} onChange={(c, v) => alterarItem(i, c, v)} />
            ))}
            <LinhaFixa nome={`${ITENS.length + 1}. Gastos Extras (${empresa!.pct_extras}% sobre itens 1–${ITENS.length})`} lojas={lojas} vals={res.extras} grid={grid} />
            <div className="border-t border-border pt-3">
              <LinhaFixa nome="Total de Custo com Pessoal" lojas={lojas} vals={res.total} grid={grid} />
            </div>
          </div>
        </div>
      </Card>

      {/* Resumo */}
      <Card titulo="Resumo por Item">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="text-left text-muted-foreground border-b border-border">
                <th className="py-2 pr-4 font-medium">Item</th>
                {lojas.map((l) => <th key={l.id} className="py-2 px-2 font-medium text-right">{l.nome}</th>)}
                <th className="py-2 px-2 font-medium text-right">Global</th>
                <th className="py-2 pl-4 font-medium text-right">% Fat. Global</th>
              </tr>
            </thead>
            <tbody>
              {[...ITENS.map((nome, i) => ({ nome, v: atual.items[i], cls: "" })), { nome: `Gastos Extras (${empresa!.pct_extras}%)`, v: res.extras, cls: "text-primary" }].map(({ nome, v, cls }) => {
                const g = soma(v, lojas);
                return (
                  <tr key={nome} className="border-b border-border/60">
                    <td className={`py-2 pr-4 ${cls}`}>{nome}</td>
                    {lojas.map((l) => <td key={l.id} className="py-2 px-2 text-right tabular-nums">{brl(v[l.codigo] ?? 0)}</td>)}
                    <td className="py-2 px-2 text-right tabular-nums font-semibold">{brl(g)}</td>
                    <td className="py-2 pl-4 text-right tabular-nums text-muted-foreground">{pctFmt(res.fatGlobal > 0 ? (g / res.fatGlobal) * 100 : 0)}</td>
                  </tr>
                );
              })}
              <tr className="bg-muted/30 font-semibold">
                <td className="py-3 pr-4">Total de Custo</td>
                {lojas.map((l) => {
                  const p = res.pctLoja(l.codigo);
                  const s = classificar(p, empresa!);
                  return (
                    <td key={l.id} className="py-3 px-2 text-right tabular-nums">
                      {brl(res.total[l.codigo] ?? 0)}
                      <div className={`text-xs ${s.texto} font-medium`}>{pctFmt(p)} • {s.label}</div>
                    </td>
                  );
                })}
                <td className="py-3 px-2 text-right tabular-nums">
                  {brl(res.custoGlobal)}
                  <div className={`text-xs ${st.texto} font-medium`}>{pctFmt(res.pct)} • {st.label}</div>
                </td>
                <td className="py-3 pl-4 text-right tabular-nums">{pctFmt(res.pct)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      {/* Provisão x Realizado */}
      <Card titulo={`Provisão x Realizado — ${titPeriodo}`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead>
              <tr className="text-left text-muted-foreground border-b border-border">
                <th className="py-2 pr-4 font-medium">Item</th>
                <th className="py-2 px-2 font-medium text-right">Provisão</th>
                <th className="py-2 px-2 font-medium text-right">Realizado</th>
                <th className="py-2 px-2 font-medium text-right">Diferença</th>
                <th className="py-2 pl-2 font-medium text-right">Var. %</th>
              </tr>
            </thead>
            <tbody>
              {comparativo.map((c) => {
                const dif = c.r - c.p;
                // custo acima do previsto = ruim; faturamento acima = bom
                const ruim = c.receita ? dif < 0 : dif > 0;
                const cor = dif === 0 ? "text-muted-foreground" : ruim ? "text-danger" : "text-success";
                return (
                  <tr key={c.nome} className={`border-b border-border/60 ${"total" in c && c.total ? "bg-muted/30 font-semibold" : ""}`}>
                    <td className="py-2 pr-4">{c.nome}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{brl(c.p)}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{brl(c.r)}</td>
                    <td className={`py-2 px-2 text-right tabular-nums ${cor}`}>{dif > 0 ? "+" : ""}{brl(dif)}</td>
                    <td className={`py-2 pl-2 text-right tabular-nums ${cor}`}>{c.p > 0 ? pctFmt((dif / c.p) * 100) : "—"}</td>
                  </tr>
                );
              })}
              <tr>
                <td className="py-2 pr-4 text-muted-foreground">% Custo / Faturamento</td>
                <td className="py-2 px-2 text-right tabular-nums">{pctFmt(rProv.pct)}</td>
                <td className="py-2 px-2 text-right tabular-nums">{pctFmt(rReal.pct)}</td>
                <td className="py-2 px-2 text-right tabular-nums text-muted-foreground" colSpan={2}>{(rReal.pct - rProv.pct >= 0 ? "+" : "") + (rReal.pct - rProv.pct).toFixed(2).replace(".", ",")} p.p.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      <footer className="text-center text-xs text-muted-foreground pt-2 pb-8">
        Dados compartilhados com os usuários da empresa • Aba: <span className="text-foreground font-medium">{ABA_LABEL[aba]}</span>
        {ultima?.updated_at && (
          <> • Última alteração: {nomes[ultima.updated_by ?? ""] ?? "—"} em {new Date(ultima.updated_at).toLocaleString("pt-BR")}</>
        )}
      </footer>
    </div>
  );
}

function LinhaEditavel({ nome, lojas, vals, grid, disabled, onChange, destaqueNome }: {
  nome: string; lojas: Loja[]; vals: Record<string, number>; grid: React.CSSProperties; disabled: boolean;
  onChange: (codigo: string, v: number) => void; destaqueNome?: boolean;
}) {
  return (
    <div className="grid gap-3 items-center" style={grid}>
      <div className={`text-sm ${destaqueNome ? "font-semibold" : ""}`}>{nome}</div>
      {lojas.map((l) => (
        <CampoDinheiro key={l.id} valor={vals[l.codigo] ?? 0} disabled={disabled} onChange={(v) => onChange(l.codigo, v)} />
      ))}
      <Valor v={soma(vals, lojas)} destaque />
    </div>
  );
}

function LinhaFixa({ nome, lojas, vals, grid }: { nome: string; lojas: Loja[]; vals: Record<string, number>; grid: React.CSSProperties }) {
  return (
    <div className="grid gap-3 items-center" style={grid}>
      <div className="text-sm text-primary font-medium">{nome}</div>
      {lojas.map((l) => <Valor key={l.id} v={vals[l.codigo] ?? 0} destaque />)}
      <Valor v={soma(vals, lojas)} destaque />
    </div>
  );
}
