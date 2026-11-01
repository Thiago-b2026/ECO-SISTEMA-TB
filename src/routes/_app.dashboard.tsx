import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, ShoppingCart } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useLoja } from "@/lib/loja";
import { fetchAllRows } from "@/lib/fetch-all";
import { fmtBRL, fmtDateOnly } from "@/lib/format";
import { formatLocalDateInput } from "@/lib/sale-datetime";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Barras } from "@/components/relatorios-extra";
import { abrirJanelaFrente } from "@/routes/_app.pdv";

export const Route = createFileRoute("/_app/dashboard")({ component: Dashboard });

interface Rel { faturamento: number; vendas: number; ticket_medio: number; por_dia: { dia: string; valor: number; vendas: number }[] }

const diasAtras = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return formatLocalDateInput(d);
};

function Kpi({ titulo, valor, sub, alerta }: { titulo: string; valor: string; sub?: string; alerta?: boolean }) {
  return (
    <Card className={alerta ? "p-4 border-destructive/40" : "p-4"}>
      <div className="text-sm text-muted-foreground">{titulo}</div>
      <div className={alerta ? "text-2xl font-bold text-destructive" : "text-2xl font-bold"}>{valor}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </Card>
  );
}

function Dashboard() {
  const { role } = useAuth();
  const gestor = role === "admin" || role === "gerente";
  const { filtroLoja, lojas } = useLoja();
  const hoje = formatLocalDateInput();
  const [hj, setHj] = useState<Rel | null>(null);
  const [ontem, setOntem] = useState<Rel | null>(null);
  const [quinze, setQuinze] = useState<Rel | null>(null);
  const [top, setTop] = useState<{ descricao: string; receita: number; quantidade: number }[]>([]);
  const [caixas, setCaixas] = useState(0);
  const [estoque, setEstoque] = useState({ un: 0, valor: 0, produtos: 0 });
  const [fin, setFin] = useState({ pagarHoje: 0, vencidos: 0, receber7: 0 });

  useEffect(() => {
    const ont = diasAtras(1);
    Promise.all([
      supabase.rpc("relatorio_vendas", { _loja_id: filtroLoja, _de: hoje, _ate: hoje }),
      supabase.rpc("relatorio_vendas", { _loja_id: filtroLoja, _de: ont, _ate: ont }),
      supabase.rpc("relatorio_vendas", { _loja_id: filtroLoja, _de: diasAtras(13), _ate: hoje }),
      supabase.rpc("relatorio_abc", { _loja_id: filtroLoja, _de: diasAtras(29), _ate: hoje }),
    ]).then(([a, b, c, d]) => {
      setHj(a.data as Rel);
      setOntem(b.data as Rel);
      setQuinze(c.data as Rel);
      setTop(((d.data ?? []) as { descricao: string; receita: number; quantidade: number }[]).slice(0, 8));
    });
    let qc = supabase.from("caixas").select("id", { count: "exact", head: true }).eq("status", "aberto");
    if (filtroLoja) qc = qc.eq("loja_id", filtroLoja);
    qc.then(({ count }) => setCaixas(count ?? 0));
    fetchAllRows<{ estoque_atual: number; preco_venda: number }>(() => {
      let q = supabase.from("produtos").select("estoque_atual, preco_venda").eq("ativo", true).gt("estoque_atual", 0);
      if (filtroLoja) q = q.eq("loja_id", filtroLoja);
      return q;
    }).then((ps) => setEstoque({ produtos: ps.length, un: ps.reduce((s, p) => s + Number(p.estoque_atual), 0), valor: ps.reduce((s, p) => s + Number(p.estoque_atual) * Number(p.preco_venda), 0) }));
    if (gestor) {
      let ql = supabase.from("lancamentos").select("tipo, valor, vencimento").eq("status", "aberto").lte("vencimento", diasAtras(-7));
      if (filtroLoja) ql = ql.eq("loja_id", filtroLoja);
      ql.then(({ data }) => {
        const ls = (data ?? []) as { tipo: string; valor: number; vencimento: string }[];
        setFin({
          pagarHoje: ls.filter((l) => l.tipo === "pagar" && l.vencimento === hoje).reduce((s, l) => s + Number(l.valor), 0),
          vencidos: ls.filter((l) => l.tipo === "pagar" && l.vencimento < hoje).reduce((s, l) => s + Number(l.valor), 0),
          receber7: ls.filter((l) => l.tipo === "receber" && l.vencimento >= hoje).reduce((s, l) => s + Number(l.valor), 0),
        });
      });
    }
  }, [filtroLoja]);

  const variacao = hj && ontem && Number(ontem.faturamento) > 0 ? ((Number(hj.faturamento) - Number(ontem.faturamento)) / Number(ontem.faturamento)) * 100 : null;
  const dias14 = Array.from({ length: 14 }, (_, i) => diasAtras(13 - i)).map((d) => {
    const x = quinze?.por_dia?.find((p) => p.dia === d);
    return { nome: fmtDateOnly(d + "T12:00:00").slice(0, 5), valor: Number(x?.valor ?? 0), dica: `${fmtDateOnly(d + "T12:00:00")}: ${fmtBRL(Number(x?.valor ?? 0))} em ${x?.vendas ?? 0} vendas` };
  });

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">{filtroLoja ? lojas.find((l) => l.id === filtroLoja)?.nome : "Todas as lojas"} · hoje, {fmtDateOnly(hoje + "T12:00:00")}</p>
        </div>
        {role !== "estoquista" && <Button onClick={abrirJanelaFrente} disabled={!filtroLoja}><ShoppingCart /> Abrir frente de loja</Button>}
      </div>

      {!hj ? <Loader2 className="animate-spin text-muted-foreground" /> : (
        <>
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            <Kpi titulo="Vendas hoje" valor={fmtBRL(Number(hj.faturamento))} sub={variacao == null ? "sem vendas ontem para comparar" : `${variacao >= 0 ? "+" : ""}${variacao.toFixed(1)}% vs ontem`} />
            <Kpi titulo="Nº de vendas hoje" valor={String(hj.vendas)} sub={`ticket ${fmtBRL(Number(hj.ticket_medio))}`} />
            <Kpi titulo="Caixas abertos agora" valor={String(caixas)} />
            <Kpi titulo="Estoque" valor={fmtBRL(estoque.valor)} sub={`${estoque.un} unidades · ${estoque.produtos} produtos`} />
          </div>
          {gestor && (
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
              <Kpi titulo="A pagar hoje" valor={fmtBRL(fin.pagarHoje)} />
              <Kpi titulo="Contas vencidas" valor={fmtBRL(fin.vencidos)} alerta={fin.vencidos > 0} sub={fin.vencidos > 0 ? "veja em Financeiro" : "nada vencido"} />
              <Kpi titulo="A receber (7 dias)" valor={fmtBRL(fin.receber7)} />
            </div>
          )}
          <div className="grid gap-3 lg:grid-cols-2">
            <Barras titulo="Vendas nos últimos 14 dias" dados={dias14} />
            <Barras titulo="Mais vendidos (30 dias)" dados={top.map((t) => ({ nome: t.descricao, valor: Number(t.receita), dica: `${t.descricao}: ${fmtBRL(Number(t.receita))} · ${Number(t.quantidade)} un.` }))} />
          </div>
          {fin.vencidos > 0 && gestor && (
            <Card className="p-3 flex items-center gap-2 text-sm border-destructive/40">
              <AlertTriangle className="size-4 text-destructive" /> Existem contas a pagar vencidas. <Link to="/financeiro" className="text-primary hover:underline">Abrir financeiro</Link>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
