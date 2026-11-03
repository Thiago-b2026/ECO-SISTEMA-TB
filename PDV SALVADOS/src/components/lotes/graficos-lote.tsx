// Produção por operador, por categoria e por dia (a partir dos itens do lote).
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Item } from "@/lib/lotes";
import { fmtDateOnly } from "@/lib/format";
import { getSaleDateKey } from "@/lib/sale-datetime";
import { Card } from "@/components/ui/card";

function Barras({ titulo, dados }: { titulo: string; dados: { nome: string; unicos: number; unidades: number }[] }) {
  const max = Math.max(1, ...dados.map((d) => d.unidades));
  return (
    <Card className="p-4 space-y-2">
      <h3 className="font-semibold text-sm">{titulo}</h3>
      {dados.length === 0 && <p className="text-xs text-muted-foreground">Sem dados.</p>}
      {dados.map((d) => (
        <div key={d.nome} className="text-xs">
          <div className="flex justify-between"><span className="truncate pr-2">{d.nome}</span><span className="whitespace-nowrap">{d.unicos} produtos · {d.unidades} un.</span></div>
          <div className="mt-0.5 h-2 rounded bg-muted"><div className="h-2 rounded bg-primary" style={{ width: `${(d.unidades / max) * 100}%` }} /></div>
        </div>
      ))}
    </Card>
  );
}

function agrupar(itens: Item[], chave: (i: Item) => string, limite = 10) {
  const m = new Map<string, { nome: string; unicos: number; unidades: number }>();
  for (const i of itens) {
    const k = chave(i);
    const x = m.get(k) ?? { nome: k, unicos: 0, unidades: 0 };
    x.unicos += 1;
    x.unidades += i.quantidade;
    m.set(k, x);
  }
  return [...m.values()].sort((a, b) => b.unidades - a.unidades).slice(0, limite);
}

export function GraficosLote({ itens }: { itens: Item[] }) {
  const [nomes, setNomes] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    const ids = [...new Set(itens.map((i) => i.operador_id).filter(Boolean))] as string[];
    if (ids.length) supabase.from("profiles").select("id, nome").in("id", ids).then(({ data }) => setNomes(new Map((data ?? []).map((p) => [p.id, p.nome]))));
  }, [itens]);

  const porOperador = useMemo(() => agrupar(itens, (i) => (i.operador_id ? nomes.get(i.operador_id) ?? "…" : "—"), 20), [itens, nomes]);
  const porCategoria = useMemo(() => agrupar(itens, (i) => i.categoria || "Sem categoria"), [itens]);
  const porDia = useMemo(
    () => agrupar(itens, (i) => getSaleDateKey(i.created_at), 31).sort((a, b) => a.nome.split("/").reverse().join("").localeCompare(b.nome.split("/").reverse().join(""))),
    [itens],
  );

  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <Barras titulo="Por operador" dados={porOperador} />
      <Barras titulo="Por categoria (top 10)" dados={porCategoria} />
      <Barras titulo="Por dia de cadastro" dados={porDia.map((d) => ({ ...d, nome: d.nome || fmtDateOnly(new Date()) }))} />
    </div>
  );
}
