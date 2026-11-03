import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Boxes, Clock, FileSpreadsheet, Loader2, Plus, RefreshCw, ScanBarcode, Settings2, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { useLoja } from "@/lib/loja";
import { listarLotes, STATUS_LOTE_LABEL, type LoteResumo } from "@/lib/lotes";
import { fmtBRL, fmtDateOnly } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { NovoLoteDialog } from "@/components/lotes/novo-lote-dialog";
import { ConfigPrecoDialog } from "@/components/lotes/config-preco-dialog";
import { cn } from "@/lib/utils";
import { MercadoLivreConfig } from "@/components/mercado-livre-config";
import { Exportar } from "@/components/exportar";


export const Route = createFileRoute("/_app/lotes/")({ component: PaginaLotes });

type Filtro = "todos" | "manual" | "planilha";

function PaginaLotes() {
  const { role } = useAuth();
  const gestor = role === "admin" || role === "gerente";
  const { filtroLoja, lojas } = useLoja();
  const [lotes, setLotes] = useState<LoteResumo[] | null>(null);
  const [novo, setNovo] = useState(false);
  const [config, setConfig] = useState(false);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [aba, setAba] = useState<"lotes" | "ml">("lotes");

  async function carregar() {
    setLotes(null);
    try {
      setLotes(await listarLotes(filtroLoja));
    } catch (e) {
      toast.error("Não foi possível carregar os lotes: " + (e as Error).message);
      setLotes([]);
    }
  }
  useEffect(() => {
    carregar();
  }, [filtroLoja]);

  const visiveis = useMemo(() => (lotes ?? []).filter((l) => filtro === "todos" || l.tipo === filtro), [lotes, filtro]);
  const kpi = (status: LoteResumo["status"]) => {
    const ls = (lotes ?? []).filter((l) => l.status === status);
    return { qtd: ls.length, valor: ls.reduce((s, l) => s + Number(l.valor_venda), 0) };
  };
  const kpis = [
    { titulo: "Em criação", icon: Clock, ...kpi("em_criacao") },
    { titulo: "Disponíveis", icon: Boxes, ...kpi("disponivel") },
    { titulo: "Vendidos", icon: TrendingUp, ...kpi("vendido") },
  ];

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Lotes</h1>
          <p className="text-sm text-muted-foreground">
            Precificação dos lotes com busca no Mercado Livre · {filtroLoja ? lojas.find((l) => l.id === filtroLoja)?.nome : "todas as lojas"}
          </p>
        </div>
        <div className="flex gap-2">
          {gestor && (
            <Button variant="outline" onClick={() => setConfig(true)}>
              <Settings2 /> Arredondamento
            </Button>
          )}
          <Button onClick={() => setNovo(true)}>
            <Plus /> Novo lote
          </Button>
        </div>
      </div>

      <div className="flex gap-2 border-b pb-2">
        <Button size="sm" variant={aba === "lotes" ? "default" : "ghost"} onClick={() => setAba("lotes")}>Lotes</Button>
        <Button size="sm" variant={aba === "ml" ? "default" : "ghost"} onClick={() => setAba("ml")}>Configuração Mercado Livre</Button>
      </div>

      {aba === "ml" ? <MercadoLivreConfig /> : <>
      <div className="grid gap-3 sm:grid-cols-3">
        {kpis.map((k) => (
          <Card key={k.titulo} className="p-4">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              {k.titulo}
              <k.icon className="size-4" />
            </div>
            <div className="text-2xl font-bold">{k.qtd}</div>
            <div className="text-xs text-muted-foreground">{fmtBRL(k.valor)} em venda</div>
          </Card>
        ))}
      </div>

      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-1">
            {(["todos", "manual", "planilha"] as const).map((f) => (
              <Button key={f} size="sm" variant={filtro === f ? "default" : "outline"} onClick={() => setFiltro(f)}>
                {f === "todos" ? "Todos" : f === "manual" ? "Sem planilha" : "Com planilha"}
              </Button>
            ))}
          </div>
          <div className="flex gap-2">
            <Exportar titulo="Lotes" colunas={[{ titulo: "Lote" }, { titulo: "Loja" }, { titulo: "Tipo" }, { titulo: "Criado em" }, { titulo: "Itens", numero: true }, { titulo: "Variedade", numero: true }, { titulo: "Pallets", numero: true }, { titulo: "Valor de venda (R$)", numero: true }, { titulo: "Situação" }]}
              linhas={() => visiveis.map((l) => [l.nome, l.loja_nome, l.tipo === "planilha" ? "Com planilha" : "Sem planilha", fmtDateOnly(l.created_at), l.total_itens, l.produtos_unicos, l.qtd_pallets, Number(l.valor_venda), STATUS_LOTE_LABEL[l.status]])} />
            <Button size="sm" variant="ghost" onClick={carregar}>
              <RefreshCw /> Atualizar
            </Button>
          </div>
        </div>

        {lotes == null ? (
          <Loader2 className="animate-spin text-muted-foreground" />
        ) : visiveis.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Nenhum lote ainda. Clique em "Novo lote".</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr className="border-b">
                  <th className="py-2 pr-2">Lote</th>
                  {!filtroLoja && <th className="py-2 pr-2">Loja</th>}
                  <th className="py-2 pr-2">Criado em</th>
                  <th className="py-2 pr-2 text-right">Itens</th>
                  <th className="py-2 pr-2 text-right">Variedade</th>
                  <th className="py-2 pr-2 text-right">Pallets</th>
                  <th className="py-2 pr-2 text-right">Valor do lote / ticket</th>
                  <th className="py-2 pr-2">Situação</th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map((l) => {
                  const ticket = l.total_itens > 0 ? Number(l.valor_venda) / l.total_itens : null;
                  const naFila = l.tipo === "planilha" && l.qtd_pendente > 0;
                  const revisar = l.tipo === "planilha" ? l.qtd_similar + l.qtd_nao_encontrado : 0;
                  return (
                    <tr key={l.id} className="border-b last:border-0 hover:bg-muted/40">
                      <td className="py-2 pr-2">
                        <Link to="/lotes/$id" params={{ id: l.id }} className="flex items-center gap-2 font-medium hover:underline">
                          {l.tipo === "planilha" ? <FileSpreadsheet className="size-4 text-muted-foreground" /> : <ScanBarcode className="size-4 text-muted-foreground" />}
                          {l.nome}
                        </Link>
                      </td>
                      {!filtroLoja && <td className="py-2 pr-2 whitespace-nowrap">{l.loja_nome}</td>}
                      <td className="py-2 pr-2 whitespace-nowrap">{fmtDateOnly(l.created_at)}</td>
                      <td className="py-2 pr-2 text-right">{l.total_itens}</td>
                      <td className="py-2 pr-2 text-right">{l.produtos_unicos}</td>
                      <td className="py-2 pr-2 text-right">{l.qtd_pallets}</td>
                      <td className="py-2 pr-2 text-right whitespace-nowrap">
                        <div className="font-medium text-success">{fmtBRL(Number(l.valor_venda))}</div>
                        <div className="text-xs text-muted-foreground">{ticket != null ? fmtBRL(ticket) : "—"}</div>
                      </td>
                      <td className="py-2 pr-2">
                        <div className="flex flex-wrap gap-1">
                          <Badge variant="outline">{STATUS_LOTE_LABEL[l.status]}</Badge>
                          {naFila && <Badge variant="secondary">{l.qtd_pendente} na fila</Badge>}
                          {revisar > 0 && <Badge className={cn("bg-warning text-warning-foreground")}>{revisar} p/ revisar</Badge>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      </>}

      <NovoLoteDialog open={novo} onOpenChange={setNovo} />
      {gestor && <ConfigPrecoDialog open={config} onOpenChange={setConfig} />}
    </div>
  );
}
