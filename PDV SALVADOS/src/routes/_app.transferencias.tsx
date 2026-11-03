import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, Loader2, Search, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useLoja } from "@/lib/loja";
import { fmtDate } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_app/transferencias")({ component: PaginaTransferencias });

interface Transf {
  id: string;
  numero: number;
  loja_origem: string;
  loja_destino: string;
  status: "em_transito" | "recebida" | "cancelada";
  observacao: string | null;
  enviado_em: string;
  recebido_em: string | null;
  transferencia_itens: { quantidade: number; produtos: { titulo: string; sku: string } | null }[];
}
interface ProdutoMin {
  id: string;
  sku: string;
  titulo: string;
  estoque_atual: number;
}

const STATUS = { em_transito: "Em trânsito", recebida: "Recebida", cancelada: "Cancelada" } as const;

function PaginaTransferencias() {
  const { filtroLoja, lojas } = useLoja();
  const nome = (id: string) => lojas.find((l) => l.id === id)?.nome ?? todasLojas.find((l) => l.id === id)?.nome ?? "outra loja";
  const [lista, setLista] = useState<Transf[] | null>(null);
  const [destino, setDestino] = useState("");
  const [busca, setBusca] = useState("");
  const [achados, setAchados] = useState<ProdutoMin[]>([]);
  const [itens, setItens] = useState<(ProdutoMin & { qtd: number })[]>([]);
  const [obs, setObs] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [todasLojas, setTodasLojas] = useState<{ id: string; nome: string }[]>([]);

  async function carregar() {
    const { data, error } = await supabase
      .from("transferencias")
      .select("*, transferencia_itens(quantidade, produtos!transferencia_itens_produto_id_fkey(titulo, sku))")
      .order("enviado_em", { ascending: false })
      .limit(100);
    if (error) return toast.error(error.message);
    setLista((data ?? []) as Transf[]);
  }
  useEffect(() => {
    carregar();
    // destino pode ser loja em que o usuário não trabalha: lista via função própria (só ativas)
    supabase.rpc("lojas_ativas").then(({ data }) => setTodasLojas((data ?? []) as { id: string; nome: string }[]));
  }, []);

  async function buscar(e: React.FormEvent) {
    e.preventDefault();
    if (!filtroLoja || !busca.trim()) return;
    const t = busca.trim().replace(/[%_,()]/g, "");
    const { data } = await supabase.from("produtos").select("id, sku, titulo, estoque_atual").eq("loja_id", filtroLoja).gt("estoque_atual", 0)
      .or(`titulo.ilike.%${t}%,sku.eq.${t.toUpperCase()}`).limit(15);
    setAchados((data ?? []) as ProdutoMin[]);
  }

  async function enviar() {
    if (!filtroLoja || !destino || itens.length === 0) return toast.error("Escolha o destino e os produtos.");
    setEnviando(true);
    const { data, error } = await supabase.rpc("enviar_transferencia", {
      _origem: filtroLoja, _destino: destino, _itens: itens.map((i) => ({ produto_id: i.id, quantidade: i.qtd })), _obs: obs,
    });
    setEnviando(false);
    if (error) return toast.error(error.message);
    toast.success(`Transferência nº ${data} enviada. O estoque saiu de ${nome(filtroLoja)}.`);
    setItens([]); setAchados([]); setBusca(""); setObs("");
    carregar();
  }

  async function receber(t: Transf) {
    const { error } = await supabase.rpc("receber_transferencia", { _transf_id: t.id });
    if (error) return toast.error(error.message);
    toast.success(`Transferência nº ${t.numero} recebida. Estoque lançado em ${nome(t.loja_destino)}.`);
    carregar();
  }
  async function cancelar(t: Transf) {
    if (!window.confirm(`Cancelar a transferência nº ${t.numero}? Os produtos voltam para ${nome(t.loja_origem)}.`)) return;
    const { error } = await supabase.rpc("cancelar_transferencia", { _transf_id: t.id });
    if (error) return toast.error(error.message);
    carregar();
  }

  const destinos = todasLojas.filter((l) => l.id !== filtroLoja);

  return (
    <div className="p-4 lg:p-6 space-y-4 max-w-5xl">
      <h1 className="text-2xl font-bold">Transferências entre lojas</h1>

      {!filtroLoja ? (
        <p className="text-sm text-muted-foreground">Escolha a loja de ORIGEM em "Loja atual" no menu para enviar produtos.</p>
      ) : destinos.length === 0 ? (
        <p className="text-sm text-muted-foreground">Cadastre outra loja em "Lojas" para poder transferir.</p>
      ) : (
        <Card className="p-4 space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="font-semibold">{nome(filtroLoja)}</div>
            <ArrowRight className="size-4" />
            <select value={destino} onChange={(e) => setDestino(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm">
              <option value="">Loja de destino…</option>
              {destinos.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
            </select>
          </div>
          <form onSubmit={buscar} className="flex gap-2">
            <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar produto por nome ou SKU" />
            <Button type="submit" variant="outline"><Search /></Button>
          </form>
          {achados.length > 0 && (
            <div className="divide-y rounded border text-sm">
              {achados.map((p) => (
                <button key={p.id} className="flex w-full justify-between p-2 text-left hover:bg-muted"
                  onClick={() => { if (!itens.some((i) => i.id === p.id)) setItens((x) => [...x, { ...p, qtd: Number(p.estoque_atual) }]); }}>
                  <span>{p.titulo} <span className="text-xs text-muted-foreground">{p.sku}</span></span>
                  <span>estoque {Number(p.estoque_atual)}</span>
                </button>
              ))}
            </div>
          )}
          {itens.length > 0 && (
            <div className="space-y-1">
              {itens.map((i) => (
                <div key={i.id} className="flex items-center gap-2 text-sm">
                  <span className="flex-1">{i.titulo} <span className="text-xs text-muted-foreground">{i.sku}</span></span>
                  <Input type="number" min={1} max={Number(i.estoque_atual)} value={i.qtd} className="h-8 w-20"
                    onChange={(e) => setItens((x) => x.map((y) => (y.id === i.id ? { ...y, qtd: Math.min(Number(i.estoque_atual), Math.max(1, Number(e.target.value) || 1)) } : y)))} />
                  <span className="text-xs text-muted-foreground">de {Number(i.estoque_atual)}</span>
                  <Button size="icon" variant="ghost" onClick={() => setItens((x) => x.filter((y) => y.id !== i.id))}><Trash2 className="text-destructive" /></Button>
                </div>
              ))}
              <div><Label className="text-xs">Observação</Label><Input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: levado no carro da loja" /></div>
              <Button onClick={enviar} disabled={enviando}>{enviando ? <Loader2 className="animate-spin" /> : <Send />} Enviar transferência</Button>
            </div>
          )}
        </Card>
      )}

      <Card className="p-4">
        {!lista ? <Loader2 className="animate-spin text-muted-foreground" /> : lista.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma transferência ainda.</p> : (
          <div className="divide-y">
            {lista.map((t) => (
              <div key={t.id} className="py-3 space-y-1 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <b>Nº {t.numero}</b> {nome(t.loja_origem)} <ArrowRight className="size-3.5" /> {nome(t.loja_destino)}
                  <Badge variant={t.status === "em_transito" ? "secondary" : t.status === "recebida" ? "outline" : "destructive"}>{STATUS[t.status]}</Badge>
                  <span className="text-xs text-muted-foreground">enviada {fmtDate(t.enviado_em)}{t.recebido_em ? ` · recebida ${fmtDate(t.recebido_em)}` : ""}</span>
                  <span className="ml-auto flex gap-1">
                    {t.status === "em_transito" && lojas.some((l) => l.id === t.loja_destino) && <Button size="sm" onClick={() => receber(t)}>Confirmar recebimento</Button>}
                    {t.status === "em_transito" && lojas.some((l) => l.id === t.loja_origem) && <Button size="sm" variant="ghost" className="text-destructive" onClick={() => cancelar(t)}>Cancelar</Button>}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {t.transferencia_itens.map((i) => `${Number(i.quantidade)}× ${i.produtos?.titulo ?? "?"}`).join(" · ")}
                  {t.observacao ? ` — ${t.observacao}` : ""}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
