// Visão Global, igual ao Lovable: resultados SEPARADOS POR LOJA + a coluna GLOBAL da empresa.
// Escolha: por loja, empresa inteira (global) ou o grupo todo.
// Só entram as filiais MARCADAS no cadastro (flag "mostrar"); as desmarcadas somem daqui, mas o histórico fica guardado.
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "../lib/supabase";
import { useEmpresa } from "../contexts/EmpresaContext";
import { ITENS, MESES, brl, calcular, classificar, normalizar, pctFmt, somar, temValores, type DadosMes, type Resultado, type Status } from "../lib/calc";
import type { Aba, EmpresaComPapel, Loja, RhRow } from "../lib/types";
import { Card } from "../components/ui";

const TIP = { contentStyle: { background: "rgb(19 25 38)", border: "1px solid rgb(41 51 71)", borderRadius: 8 }, labelStyle: { color: "#e6eaf2" } };
const CORES = ["#38bdf8", "#f472b6", "#34d399", "#fbbf24", "#a78bfa", "#60a5fa", "#fb923c", "#22d3ee", "#f87171", "#a3e635", "#e879f9", "#94a3b8", "#facc15", "#2dd4bf"];
const FAIXA_PADRAO = { meta_otimo: 8, meta_alerta: 10 };
type Escopo = "loja" | "empresa" | "grupo";

interface Coluna { chave: string; nome: string; fat: number; custo: number; pct: number; st: Status; itens: number[]; extras: number; global?: boolean }

function Selo({ st }: { st: Status }) {
  return <span className={`inline-flex px-2 py-0.5 rounded ${st.fundo} ${st.texto} text-xs font-semibold`}>{st.label}</span>;
}

/** Colunas por loja + GLOBAL de uma empresa. */
function colunasDaEmpresa(e: EmpresaComPapel, lojas: Loja[], dados: DadosMes, res: Resultado): Coluna[] {
  const cols: Coluna[] = lojas.map((l) => ({
    chave: l.codigo,
    nome: l.nome,
    fat: dados.faturamento[l.codigo] ?? 0,
    custo: res.total[l.codigo] ?? 0,
    pct: res.pctLoja(l.codigo),
    st: classificar(res.pctLoja(l.codigo), e),
    itens: dados.items.map((it) => it[l.codigo] ?? 0),
    extras: res.extras[l.codigo] ?? 0,
  }));
  cols.push({
    chave: "__global",
    nome: "GLOBAL",
    fat: res.fatGlobal,
    custo: res.custoGlobal,
    pct: res.pct,
    st: classificar(res.pct, e),
    itens: dados.items.map((it) => lojas.reduce((s, l) => s + (it[l.codigo] ?? 0), 0)),
    extras: res.extrasGlobal,
    global: true,
  });
  return cols;
}

export default function Global() {
  const { empresas, empresa: atual, selecionar } = useEmpresa();
  const navigate = useNavigate();
  const hoje = new Date();
  const [escopo, setEscopo] = useState<Escopo>("empresa");
  const [empresaId, setEmpresaId] = useState<string>(atual?.id ?? "");
  const [lojaCodigo, setLojaCodigo] = useState<string>("");
  const [aba, setAba] = useState<Aba>("realizado");
  const [periodo, setPeriodo] = useState<"mes" | "ano">("mes");
  const [mes, setMes] = useState(hoje.getMonth());
  const [ano, setAno] = useState(hoje.getFullYear());
  const [rows, setRows] = useState<RhRow[]>([]);
  const [lojas, setLojas] = useState<Loja[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  const ids = useMemo(() => empresas.map((e) => e.id), [empresas]);
  useEffect(() => {
    if (!empresaId && empresas[0]) setEmpresaId(atual?.id ?? empresas[0].id);
  }, [empresas, atual, empresaId]);

  useEffect(() => {
    if (!ids.length) { setCarregando(false); return; }
    let ativo = true;
    setCarregando(true);
    setErro("");
    Promise.all([
      supabase.from("rh_entries").select("*").in("empresa_id", ids).eq("ano", ano),
      supabase.from("lojas").select("*").in("empresa_id", ids).order("ordem"),
    ]).then(([r, l]) => {
      if (!ativo) return;
      if (r.error || l.error) setErro((r.error || l.error)!.message);
      setRows((r.data as RhRow[]) ?? []);
      // só as filiais marcadas ("mostrar") entram nos resultados
      setLojas(((l.data as Loja[]) ?? []).filter((x) => x.mostrar !== false));
      setCarregando(false);
    });
    return () => { ativo = false; };
  }, [ids, ano]);

  /** Dados somados do período escolhido, por empresa. */
  const porEmpresa = useMemo(
    () =>
      empresas.map((e) => {
        const lj = lojas.filter((l) => l.empresa_id === e.id);
        const lista = rows.filter((r) => r.empresa_id === e.id && r.tab === aba && (periodo === "ano" || r.mes === mes)).map((r) => normalizar(r.data, lj));
        const dados = somar(lista, lj);
        const res = calcular(dados, lj, e);
        return { empresa: e, lojas: lj, dados, res, tem: lista.some((d) => temValores(d)) };
      }),
    [empresas, lojas, rows, aba, periodo, mes],
  );

  const sel = porEmpresa.find((x) => x.empresa.id === empresaId) ?? porEmpresa[0];
  const colunas: Coluna[] = useMemo(() => {
    if (!sel) return [];
    const todas = colunasDaEmpresa(sel.empresa, sel.lojas, sel.dados, sel.res);
    if (escopo === "loja") {
      const c = todas.find((x) => x.chave === (lojaCodigo || sel.lojas[0]?.codigo));
      return c ? [c] : [];
    }
    return todas;
  }, [sel, escopo, lojaCodigo]);

  // Grupo todo: uma linha por empresa + total
  const grupo = porEmpresa.map((x) => ({ nome: x.empresa.nome, empresa: x.empresa, fat: x.res.fatGlobal, custo: x.res.custoGlobal, pct: x.res.pct, st: classificar(x.res.pct, x.empresa), lojas: x.lojas.length, tem: x.tem }));
  const fatTotal = grupo.reduce((s, g) => s + g.fat, 0);
  const custoTotal = grupo.reduce((s, g) => s + g.custo, 0);
  const pctTotal = fatTotal > 0 ? (custoTotal / fatTotal) * 100 : 0;
  const stTotal = classificar(pctTotal, FAIXA_PADRAO);

  const temDados = escopo === "grupo" ? grupo.some((g) => g.tem) : !!sel?.tem && (escopo !== "loja" || (!!colunas[0] && (colunas[0].fat !== 0 || colunas[0].custo !== 0)));
  const titPeriodo = periodo === "ano" ? `Acumulado ${ano}` : `${MESES[mes]} ${ano}`;
  const anos = Array.from({ length: hoje.getFullYear() + 1 - 2023 + 1 }, (_, i) => 2023 + i);
  const pctExtras = sel ? Number(sel.empresa.pct_extras) : 5;

  function exportarCsv() {
    const n = (v: number) => v.toFixed(2).replace(".", ",");
    let out: string[];
    if (escopo === "grupo") {
      out = [["Empresa", "Lojas", "Faturamento", "Custo com pessoal", "% Custo/Fat.", "Indicador"].join(";")];
      grupo.forEach((g) => out.push([g.nome, g.lojas, n(g.fat), n(g.custo), n(g.pct), g.st.label].join(";")));
      out.push(["GRUPO TODO", grupo.reduce((s, g) => s + g.lojas, 0), n(fatTotal), n(custoTotal), n(pctTotal), stTotal.label].join(";"));
    } else {
      out = [["", ...colunas.map((c) => c.nome)].join(";")];
      out.push(["Faturamento", ...colunas.map((c) => n(c.fat))].join(";"));
      out.push(["Custo com pessoal", ...colunas.map((c) => n(c.custo))].join(";"));
      out.push(["% Custo/Fat.", ...colunas.map((c) => n(c.pct))].join(";"));
      out.push(["Indicador", ...colunas.map((c) => c.st.label)].join(";"));
      ITENS.forEach((it, i) => out.push([`${i + 1}. ${it}`, ...colunas.map((c) => n(c.itens[i]))].join(";")));
      out.push([`Gastos Extras (${pctExtras}%)`, ...colunas.map((c) => n(c.extras))].join(";"));
    }
    const blob = new Blob(["﻿" + out.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `rh-visao-global-${escopo}-${aba}-${periodo === "ano" ? ano : `${ano}-${String(mes + 1).padStart(2, "0")}`}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const botao = (ativo: boolean) => `px-3 py-2 font-semibold uppercase tracking-wide ${ativo ? "bg-muted text-foreground" : "text-muted-foreground"}`;
  const colLojas = colunas.filter((c) => !c.global);
  const pizzaBase = escopo === "loja" ? colunas[0] : colunas.find((c) => c.global);
  const pizza = pizzaBase ? [...ITENS.map((nome, i) => ({ name: nome, value: pizzaBase.itens[i] })), { name: `Gastos Extras (${pctExtras}%)`, value: pizzaBase.extras }].filter((x) => x.value > 0) : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold uppercase tracking-wide">Visão Global</h1>
        <p className="text-sm text-muted-foreground">
          {escopo === "grupo" ? "Grupo todo" : escopo === "empresa" ? `${sel?.empresa.nome ?? ""} – por loja e global` : `${sel?.empresa.nome ?? ""} – ${colunas[0]?.nome ?? ""}`} • {aba === "realizado" ? "Realizado" : "Provisão"} • {titPeriodo}
        </p>
      </div>

      {/* Escolhas */}
      <div className="no-print flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-md border border-border overflow-hidden text-xs">
          <button onClick={() => setEscopo("loja")} className={botao(escopo === "loja")}>Por loja</button>
          <button onClick={() => setEscopo("empresa")} className={botao(escopo === "empresa")}>Empresa inteira</button>
          <button onClick={() => setEscopo("grupo")} className={botao(escopo === "grupo")}>Grupo todo</button>
        </div>
        {escopo !== "grupo" && empresas.length > 1 && (
          <select value={sel?.empresa.id ?? ""} onChange={(e) => { setEmpresaId(e.target.value); setLojaCodigo(""); }} className="rounded-md bg-card border border-border px-3 py-2 text-sm">
            {empresas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
          </select>
        )}
        {escopo === "loja" && sel && (
          <select value={lojaCodigo || sel.lojas[0]?.codigo || ""} onChange={(e) => setLojaCodigo(e.target.value)} className="rounded-md bg-card border border-border px-3 py-2 text-sm">
            {sel.lojas.map((l) => <option key={l.codigo} value={l.codigo}>{l.nome}</option>)}
          </select>
        )}
        <div className="inline-flex rounded-md border border-border overflow-hidden text-xs">
          <button onClick={() => setAba("provisao")} className={botao(aba === "provisao")}>Provisão</button>
          <button onClick={() => setAba("realizado")} className={botao(aba === "realizado")}>Realizado</button>
        </div>
        <div className="inline-flex rounded-md border border-border overflow-hidden text-xs">
          <button onClick={() => setPeriodo("mes")} className={botao(periodo === "mes")}>Mês</button>
          <button onClick={() => setPeriodo("ano")} className={botao(periodo === "ano")}>Acumulado do ano</button>
        </div>
        {periodo === "mes" && (
          <select value={mes} onChange={(e) => setMes(Number(e.target.value))} className="rounded-md bg-card border border-border px-3 py-2 text-sm">
            {MESES.map((m, i) => <option key={m} value={i}>{m}</option>)}
          </select>
        )}
        <select value={ano} onChange={(e) => setAno(Number(e.target.value))} className="rounded-md bg-card border border-border px-3 py-2 text-sm">
          {anos.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <span className={`text-xs ${erro ? "text-danger" : "text-muted-foreground"}`}>{carregando ? "Carregando dados..." : erro ? `Erro: ${erro}` : ""}</span>
        <div className="flex flex-wrap gap-2 ml-auto">
          <button onClick={exportarCsv} className="btn-secundario uppercase font-semibold" disabled={!temDados}>Exportar Excel</button>
          <button onClick={() => window.print()} className="btn-secundario uppercase font-semibold">Imprimir</button>
        </div>
      </div>

      {!carregando && !temDados ? (
        <Card>
          <div className="py-10 text-center">
            <div className="text-lg font-bold uppercase tracking-wide">{periodo === "ano" ? "Sem lançamentos neste ano" : "Sem lançamentos neste mês"}</div>
            <p className="mt-1 text-sm text-muted-foreground">{aba === "realizado" ? "Realizado" : "Provisão"} • {titPeriodo}. Lance os valores no Painel ou escolha outro período.</p>
          </div>
        </Card>
      ) : escopo === "grupo" ? (
        <>
          <Card titulo={`Grupo todo — ${titPeriodo}`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground border-b border-border">
                    <th className="py-2 pr-3">Empresa</th>
                    <th className="py-2 px-3 text-right">Lojas</th>
                    <th className="py-2 px-3 text-right">Faturamento</th>
                    <th className="py-2 px-3 text-right">Custo com pessoal</th>
                    <th className="py-2 px-3 text-right">% Custo/Fat.</th>
                    <th className="py-2 pl-3">Indicador</th>
                  </tr>
                </thead>
                <tbody>
                  {grupo.map((g) => (
                    <tr key={g.empresa.id} className="border-b border-border/60">
                      <td className="py-2 pr-3">
                        <button onClick={() => { selecionar(g.empresa.id); navigate("/"); }} className="hover:text-primary text-left" title="Abrir esta empresa no Painel">{g.nome}</button>
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums">{g.lojas}</td>
                      <td className="py-2 px-3 text-right tabular-nums">{g.tem ? brl(g.fat) : "—"}</td>
                      <td className="py-2 px-3 text-right tabular-nums">{g.tem ? brl(g.custo) : "—"}</td>
                      <td className="py-2 px-3 text-right tabular-nums">{g.tem ? pctFmt(g.pct) : "—"}</td>
                      <td className="py-2 pl-3">{g.tem ? <Selo st={g.st} /> : <span className="text-xs text-muted-foreground">sem lançamentos</span>}</td>
                    </tr>
                  ))}
                  <tr className="font-semibold">
                    <td className="py-2 pr-3 uppercase">Grupo todo</td>
                    <td className="py-2 px-3 text-right tabular-nums">{grupo.reduce((s, g) => s + g.lojas, 0)}</td>
                    <td className="py-2 px-3 text-right tabular-nums">{brl(fatTotal)}</td>
                    <td className="py-2 px-3 text-right tabular-nums">{brl(custoTotal)}</td>
                    <td className="py-2 px-3 text-right tabular-nums">{pctFmt(pctTotal)}</td>
                    <td className="py-2 pl-3"><Selo st={stTotal} /></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>
          <Card titulo="Faturamento vs Custo (por empresa)">
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={grupo.map((g) => ({ name: g.nome, Faturamento: g.fat, Custo: g.custo }))}>
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
        </>
      ) : (
        <>
          {/* Resultado por loja + GLOBAL (igual ao Lovable) */}
          <Card titulo={`Resultado ${escopo === "loja" ? "da loja" : "por loja"} — ${titPeriodo}`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground border-b border-border">
                    <th className="py-2 pr-3 text-left"></th>
                    {colunas.map((c) => (
                      <th key={c.chave} className={`py-2 px-3 text-right whitespace-nowrap ${c.global ? "text-primary" : ""}`}>{c.nome}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-border/60">
                    <td className="py-2 pr-3">Faturamento</td>
                    {colunas.map((c) => <td key={c.chave} className={`py-2 px-3 text-right tabular-nums ${c.global ? "font-semibold" : ""}`}>{brl(c.fat)}</td>)}
                  </tr>
                  <tr className="border-b border-border/60">
                    <td className="py-2 pr-3">Custo com pessoal</td>
                    {colunas.map((c) => <td key={c.chave} className={`py-2 px-3 text-right tabular-nums ${c.global ? "font-semibold" : ""}`}>{brl(c.custo)}</td>)}
                  </tr>
                  <tr className="border-b border-border/60">
                    <td className="py-2 pr-3">% Custo/Fat.</td>
                    {colunas.map((c) => <td key={c.chave} className={`py-2 px-3 text-right tabular-nums ${c.global ? "font-semibold" : ""}`}>{c.fat > 0 ? pctFmt(c.pct) : "—"}</td>)}
                  </tr>
                  <tr>
                    <td className="py-2 pr-3">Indicador</td>
                    {colunas.map((c) => (
                      <td key={c.chave} className="py-2 px-3 text-right">
                        {c.fat > 0 || c.custo > 0 ? <Selo st={c.st} /> : <span className="text-xs text-muted-foreground">sem lançamentos</span>}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>

          {/* Composição dos custos por loja */}
          <Card titulo="Composição dos custos">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground border-b border-border">
                    <th className="py-2 pr-3 text-left">Item</th>
                    {colunas.map((c) => <th key={c.chave} className={`py-2 px-3 text-right whitespace-nowrap ${c.global ? "text-primary" : ""}`}>{c.nome}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {ITENS.map((nome, i) => (
                    <tr key={nome} className="border-b border-border/60">
                      <td className="py-1.5 pr-3">{i + 1}. {nome}</td>
                      {colunas.map((c) => <td key={c.chave} className={`py-1.5 px-3 text-right tabular-nums ${c.global ? "font-semibold" : ""}`}>{brl(c.itens[i])}</td>)}
                    </tr>
                  ))}
                  <tr className="border-b border-border/60">
                    <td className="py-1.5 pr-3">Gastos Extras ({pctExtras}%)</td>
                    {colunas.map((c) => <td key={c.chave} className="py-1.5 px-3 text-right tabular-nums">{brl(c.extras)}</td>)}
                  </tr>
                  <tr className="font-semibold">
                    <td className="py-2 pr-3 uppercase">Total</td>
                    {colunas.map((c) => <td key={c.chave} className="py-2 px-3 text-right tabular-nums">{brl(c.custo)}</td>)}
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>

          {/* Gráficos por loja */}
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {escopo === "empresa" && (
              <Card titulo="Faturamento vs Custo (por loja)">
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={colLojas.map((c) => ({ name: c.nome, Faturamento: c.fat, Custo: c.custo }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgb(41 51 71)" />
                      <XAxis dataKey="name" stroke="#94a0b6" fontSize={11} />
                      <YAxis stroke="#94a0b6" fontSize={11} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                      <Tooltip {...TIP} formatter={(v: number) => brl(v)} />
                      <Legend />
                      <Bar dataKey="Faturamento" fill={CORES[0]} radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Custo" fill={CORES[1]} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            )}
            {escopo === "empresa" && (
              <Card titulo="% Custo / Faturamento (por loja)">
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={colunas.map((c) => ({ name: c.nome, pct: Number(c.pct.toFixed(2)) }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgb(41 51 71)" />
                      <XAxis dataKey="name" stroke="#94a0b6" fontSize={11} />
                      <YAxis stroke="#94a0b6" fontSize={11} tickFormatter={(v) => `${v}%`} />
                      <Tooltip {...TIP} formatter={(v: number) => pctFmt(v)} />
                      <Bar dataKey="pct" name="% Custo/Fat." radius={[4, 4, 0, 0]}>
                        {colunas.map((c) => <Cell key={c.chave} fill={c.st.cor} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            )}
            <Card titulo={`Composição dos custos — ${pizzaBase?.nome ?? ""}`}>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pizza} dataKey="value" nameKey="name" outerRadius={95} innerRadius={50}>
                      {pizza.map((_, i) => <Cell key={i} fill={CORES[i % CORES.length]} />)}
                    </Pie>
                    <Tooltip {...TIP} formatter={(v: number) => brl(v)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </section>
        </>
      )}
    </div>
  );
}
