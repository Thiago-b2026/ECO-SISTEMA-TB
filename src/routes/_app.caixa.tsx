import { createFileRoute, Link } from "@tanstack/react-router";
import { Fragment, useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useLoja } from "@/lib/loja";
import type { Caixa } from "@/lib/caixa";
import { fmtBRL, fmtDate } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/caixa")({ component: MovimentacoesCaixa });

interface CaixaLista extends Caixa {
  operador_nome?: string;
}
interface Mov {
  id: string;
  tipo: "sangria" | "suprimento";
  valor: number;
  motivo: string | null;
  created_at: string;
}

/** Histórico dos caixas (abrir, sangria, suprimento e fechar ficam no PDV). */
function MovimentacoesCaixa() {
  const { filtroLoja, lojas } = useLoja();
  const [lista, setLista] = useState<CaixaLista[] | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);
  const [movs, setMovs] = useState<Record<string, Mov[]>>({});
  const nomeLoja = (id: string) => lojas.find((l) => l.id === id)?.nome ?? "";

  async function carregar() {
    setLista(null);
    let q = supabase.from("caixas").select("*").order("aberto_em", { ascending: false }).limit(100);
    if (filtroLoja) q = q.eq("loja_id", filtroLoja);
    const { data, error } = await q;
    if (error) return toast.error(error.message);
    const ls = (data ?? []) as CaixaLista[];
    const ids = [...new Set(ls.map((c) => c.operador_id))];
    if (ids.length) {
      const { data: ps } = await supabase.from("profiles").select("id, nome").in("id", ids);
      const nomes = new Map((ps ?? []).map((p) => [p.id, p.nome]));
      ls.forEach((c) => (c.operador_nome = nomes.get(c.operador_id)));
    }
    setLista(ls);
  }
  useEffect(() => {
    carregar();
  }, [filtroLoja]);

  async function abrir(c: CaixaLista) {
    if (aberto === c.id) return setAberto(null);
    setAberto(c.id);
    if (!movs[c.id]) {
      const { data } = await supabase.from("caixa_movimentos").select("id, tipo, valor, motivo, created_at").eq("caixa_id", c.id).order("created_at");
      setMovs((m) => ({ ...m, [c.id]: (data ?? []) as Mov[] }));
    }
  }

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Movimentações de caixa</h1>
        <p className="text-sm text-muted-foreground">
          Abrir, sangria, suprimento e fechar ficam no <Link to="/pdv" className="text-primary hover:underline">PDV</Link>. Aqui você confere o histórico.
        </p>
      </div>
      <Card className="p-4">
        {!lista ? <Loader2 className="animate-spin text-muted-foreground" /> : lista.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum caixa ainda.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr className="border-b">
                  <th className="py-2 pr-2">Operador</th>{!filtroLoja && <th className="py-2 pr-2">Loja</th>}<th className="py-2 pr-2">Abertura</th><th className="py-2 pr-2">Fechamento</th>
                  <th className="py-2 pr-2 text-right">Troco inicial</th><th className="py-2 pr-2 text-right">Esperado</th><th className="py-2 pr-2 text-right">Contado</th><th className="py-2 pr-2 text-right">Diferença</th><th></th>
                </tr>
              </thead>
              <tbody>
                {lista.map((c) => (
                  <Fragment key={c.id}>
                    <tr className="border-b">
                      <td className="py-2 pr-2">{c.operador_nome ?? "—"}</td>
                      {!filtroLoja && <td className="py-2 pr-2 text-xs">{nomeLoja(c.loja_id)}</td>}
                      <td className="py-2 pr-2 whitespace-nowrap">{fmtDate(c.aberto_em)}</td>
                      <td className="py-2 pr-2 whitespace-nowrap">{c.fechado_em ? fmtDate(c.fechado_em) : <Badge variant="outline" className="text-success">Aberto</Badge>}</td>
                      <td className="py-2 pr-2 text-right">{fmtBRL(Number(c.valor_abertura))}</td>
                      <td className="py-2 pr-2 text-right">{c.valor_esperado != null ? fmtBRL(Number(c.valor_esperado)) : "—"}</td>
                      <td className="py-2 pr-2 text-right">{c.valor_informado != null ? fmtBRL(Number(c.valor_informado)) : "—"}</td>
                      <td className={cn("py-2 pr-2 text-right font-medium", c.diferenca != null && Number(c.diferenca) !== 0 && "text-destructive")}>{c.diferenca != null ? fmtBRL(Number(c.diferenca)) : "—"}</td>
                      <td className="py-2"><Button size="icon" variant="ghost" onClick={() => abrir(c)}>{aberto === c.id ? <ChevronUp /> : <ChevronDown />}</Button></td>
                    </tr>
                    {aberto === c.id && (
                      <tr className="border-b bg-muted/30">
                        <td colSpan={9} className="p-3 text-sm">
                          {(movs[c.id] ?? []).length === 0 ? <span className="text-muted-foreground">Sem sangrias ou suprimentos.</span> : (movs[c.id] ?? []).map((m) => (
                            <div key={m.id} className="flex justify-between gap-2">
                              <span>{fmtDate(m.created_at)} · {m.tipo === "sangria" ? "Sangria" : "Suprimento"}{m.motivo ? ` — ${m.motivo}` : ""}</span>
                              <span className={m.tipo === "sangria" ? "text-destructive" : "text-success"}>{m.tipo === "sangria" ? "−" : "+"}{fmtBRL(Number(m.valor))}</span>
                            </div>
                          ))}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
