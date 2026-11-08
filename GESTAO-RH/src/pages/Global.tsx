// Visão Global: todas as empresas do usuário lado a lado + total consolidado.
// Cada empresa usa as próprias lojas, % de Gastos Extras e faixas do indicador.
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "../lib/supabase";
import { useEmpresa } from "../contexts/EmpresaContext";
import { MESES, brl, calcular, classificar, normalizar, pctFmt, somar } from "../lib/calc";
import type { Aba, Loja, RhRow } from "../lib/types";
import { Card } from "../components/ui";

const TIP = { contentStyle: { background: "rgb(19 25 38)", border: "1px solid rgb(41 51 71)", borderRadius: 8 }, labelStyle: { color: "#e6eaf2" } };
// Faixas usadas só para o TOTAL consolidado (cada empresa usa as suas).
const FAIXA_TOTAL = { meta_otimo: 8, meta_alerta: 10 };

export default function Global() {
  const { empresas, selecionar } = useEmpresa();
  const navigate = useNavigate();
  const hoje = new Date();
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
    if (!ids.length) {
      setCarregando(false);
      return;
    }
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
      setLojas((l.data as Loja[]) ?? []);
      setCarregando(false);
    });
    return () => {
      ativo = false;
    };
  }, [ids, ano]);

  const linhas = useMemo(
    () =>
      empresas.map((e) => {
        const lj = lojas.filter((l) => l.empresa_id === e.id);
        const meses = rows
          .filter((r) => r.empresa_id === e.id && r.tab === aba && (periodo === "ano" || r.mes === mes))
          .map((r) => normalizar(r.data, lj));
        const res = calcular(somar(meses, lj), lj, e);
        return { empresa: e, lojas: lj.length, fat: res.fatGlobal, custo: res.custoGlobal, pct: res.pct, st: classificar(res.pct, e) };
      }),
    [empresas, lojas, rows, aba, periodo, mes],
  );

  const fatTotal = linhas.reduce((s, l) => s + l.fat, 0);
  const custoTotal = linhas.reduce((s, l) => s + l.custo, 0);
  const pctTotal = fatTotal > 0 ? (custoTotal / fatTotal) * 100 : 0;
  const stTotal = classificar(pctTotal, FAIXA_TOTAL);
  const titPeriodo = periodo === "ano" ? `Acumulado ${ano}` : `${MESES[mes]} ${ano}`;
  const anos = Array.from({ length: hoje.getFullYear() + 1 - 2023 + 1 }, (_, i) => 2023 + i);
  const grafico = linhas.map((l) => ({ name: l.empresa.nome, Faturamento: l.fat, Custo: l.custo }));

  const exportarCsv = () => {
    const n = (v: number) => v.toFixed(2).replace(".", ",");
    const out = [["Empresa", "Lojas", "Faturamento", "Custo com pessoal", "% Custo/Fat.", "Indicador"].join(";")];
    linhas.forEach((l) => out.push([l.empresa.nome, l.lojas, n(l.fat), n(l.custo), n(l.pct), l.st.label].join(";")));
    out.push(["TODAS AS EMPRESAS", linhas.reduce((s, l) => s + l.lojas, 0), n(fatTotal), n(custoTotal), n(pctTotal), stTotal.label].join(";"));
    const blob = new Blob(["﻿" + out.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `rh-global-${aba}-${periodo === "ano" ? ano : `${ano}-${String(mes + 1).padStart(2, "0")}`}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Visão Global</h1>
        <p className="text-sm text-muted-foreground">Todas as suas empresas juntas • {aba === "realizado" ? "Realizado" : "Provisão"} • {titPeriodo}</p>
      </div>

      <div className="no-print flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-md border border-border overflow-hidden text-sm">
          <button onClick={() => setAba("provisao")} className={`px-3 py-2 ${aba === "provisao" ? "bg-muted text-foreground" : "text-muted-foreground"}`}>Provisão</button>
          <button onClick={() => setAba("realizado")} className={`px-3 py-2 ${aba === "realizado" ? "bg-muted text-foreground" : "text-muted-foreground"}`}>Realizado</button>
        </div>
        <div className="inline-flex rounded-md border border-border overflow-hidden text-sm">
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
        <span className={`text-xs ${erro ? "text-danger" : "text-muted-foreground"}`}>{carregando ? "Carregando dados..." : erro ? `Erro: ${erro}` : ""}</span>
        <div className="flex flex-wrap gap-2 ml-auto">
          <button onClick={exportarCsv} className="btn-secundario">Exportar Excel</button>
          <button onClick={() => window.print()} className="btn-secundario">Imprimir</button>
        </div>
      </div>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card titulo="Faturamento (todas)">
          <div className="text-2xl font-bold tabular-nums">{brl(fatTotal)}</div>
          <div className="text-xs text-muted-foreground mt-1">{empresas.length} empresa(s)</div>
        </Card>
        <Card titulo="Custo com Pessoal (todas)">
          <div className="text-2xl font-bold tabular-nums">{brl(custoTotal)}</div>
          <div className="text-xs text-muted-foreground mt-1">{pctFmt(pctTotal)} do faturamento</div>
        </Card>
        <Card titulo="Indicador Global">
          <div className={`inline-flex items-center gap-2 px-3 py-2 rounded-md ${stTotal.fundo} ${stTotal.texto} font-semibold`}>
            <span className="w-2 h-2 rounded-full" style={{ background: stTotal.cor }} />
            {stTotal.label} • {pctFmt(pctTotal)}
          </div>
          <div className="text-xs text-muted-foreground mt-2">Faixas padrão: ÓTIMO &lt; 8% • ALERTA ≥ 10%</div>
        </Card>
      </section>

      <Card titulo={`Por empresa — ${titPeriodo}`}>
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
              {linhas.map((l) => (
                <tr key={l.empresa.id} className="border-b border-border/60">
                  <td className="py-2 pr-3">
                    <button onClick={() => { selecionar(l.empresa.id); navigate("/"); }} className="hover:text-primary text-left" title="Abrir esta empresa no Painel">
                      {l.empresa.nome}
                    </button>
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums">{l.lojas}</td>
                  <td className="py-2 px-3 text-right tabular-nums">{brl(l.fat)}</td>
                  <td className="py-2 px-3 text-right tabular-nums">{brl(l.custo)}</td>
                  <td className="py-2 px-3 text-right tabular-nums">{pctFmt(l.pct)}</td>
                  <td className="py-2 pl-3">
                    <span className={`inline-flex px-2 py-0.5 rounded ${l.st.fundo} ${l.st.texto} text-xs font-semibold`}>{l.st.label}</span>
                  </td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td className="py-2 pr-3">TODAS AS EMPRESAS</td>
                <td className="py-2 px-3 text-right tabular-nums">{linhas.reduce((s, l) => s + l.lojas, 0)}</td>
                <td className="py-2 px-3 text-right tabular-nums">{brl(fatTotal)}</td>
                <td className="py-2 px-3 text-right tabular-nums">{brl(custoTotal)}</td>
                <td className="py-2 px-3 text-right tabular-nums">{pctFmt(pctTotal)}</td>
                <td className="py-2 pl-3">
                  <span className={`inline-flex px-2 py-0.5 rounded ${stTotal.fundo} ${stTotal.texto} text-xs font-semibold`}>{stTotal.label}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      {linhas.length > 0 && (
        <Card titulo="Faturamento vs Custo (por empresa)">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={grafico}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(41 51 71)" />
                <XAxis dataKey="name" stroke="#94a0b6" fontSize={12} />
                <YAxis stroke="#94a0b6" fontSize={11} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                <Tooltip {...TIP} formatter={(v: number) => brl(v)} />
                <Legend />
                <Bar dataKey="Faturamento" fill="#38bdf8" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Custo" fill="#f472b6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}
    </div>
  );
}
