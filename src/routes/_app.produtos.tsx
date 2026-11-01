import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { History, Loader2, PackagePlus, Printer, Search, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useLoja } from "@/lib/loja";
import { fetchAllRows } from "@/lib/fetch-all";
import { fmtBRL, fmtDate } from "@/lib/format";
import { lerNumero } from "@/lib/precificacao";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EtiquetasDialog } from "@/components/etiquetas-dialog";
import { FiscalDialog } from "@/components/fiscal-dialog";
import { Exportar } from "@/components/exportar";

import { FileText, EyeOff } from "lucide-react";

export const Route = createFileRoute("/_app/produtos")({ component: PaginaProdutos });

export interface Produto {
  id: string;
  loja_id: string;
  sku: string;
  codigo_barras: string | null;
  titulo: string;
  categoria: string | null;
  grade: string;
  preco_venda: number;
  preco_de: number | null;
  custo_unit: number | null;
  estoque_atual: number;
  foto_url: string | null;
  ativo: boolean;
  ncm: string | null;
  cest: string | null;
  cfop: string;
  origem: number;
  unidade: string;
}

interface Movimento {
  id: string;
  tipo: string;
  quantidade: number;
  motivo: string | null;
  created_at: string;
}

const TIPO_MOV: Record<string, string> = {
  entrada: "Entrada", venda: "Venda", ajuste: "Ajuste", perda: "Perda", devolucao: "Devolução",
  cancelamento_venda: "Cancelamento de venda", transferencia_saida: "Transferência (saída)", transferencia_entrada: "Transferência (entrada)",
};

function PaginaProdutos() {
  const { role } = useAuth();
  const { filtroLoja, lojas } = useLoja();
  const podeEstoque = role === "admin" || role === "gerente" || role === "estoquista";
  const [produtos, setProdutos] = useState<Produto[] | null>(null);
  const [busca, setBusca] = useState("");
  const [soComEstoque, setSoComEstoque] = useState(true);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [etiquetas, setEtiquetas] = useState(false);
  const [mov, setMov] = useState<Produto | null>(null);
  const [historico, setHistorico] = useState<{ p: Produto; movs: Movimento[] } | null>(null);
  const [novo, setNovo] = useState(false);
  const [fiscal, setFiscal] = useState<Produto | null>(null);
  const gestor = role === "admin" || role === "gerente";

  async function desativar(p: Produto) {
    if (!window.confirm(`Desativar "${p.titulo}"? Ele some das listas e do PDV (o histórico continua).`)) return;
    const { error } = await supabase.from("produtos").update({ ativo: false }).eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success("Produto desativado.");
    carregar();
  }

  async function carregar() {
    setProdutos(null);
    try {
      const ps = await fetchAllRows<Produto>(() => {
        let q = supabase.from("produtos").select("*").eq("ativo", true).order("created_at", { ascending: false });
        if (filtroLoja) q = q.eq("loja_id", filtroLoja);
        return q;
      });
      setProdutos(ps);
    } catch (e) {
      toast.error("Não foi possível carregar: " + (e as Error).message);
      setProdutos([]);
    }
  }
  useEffect(() => {
    carregar();
    setSelecionados(new Set());
  }, [filtroLoja]);

  const visiveis = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return (produtos ?? []).filter(
      (p) => (!soComEstoque || p.estoque_atual > 0) && (!t || p.titulo.toLowerCase().includes(t) || p.sku.toLowerCase().includes(t) || (p.codigo_barras ?? "").includes(t)),
    );
  }, [produtos, busca, soComEstoque]);

  const totalUn = visiveis.reduce((s, p) => s + Number(p.estoque_atual), 0);
  const totalVenda = visiveis.reduce((s, p) => s + Number(p.estoque_atual) * Number(p.preco_venda), 0);
  const nomeLoja = (id: string) => lojas.find((l) => l.id === id)?.nome ?? "";

  async function verHistorico(p: Produto) {
    const { data, error } = await supabase.from("stock_movements").select("id, tipo, quantidade, motivo, created_at").eq("produto_id", p.id).order("created_at", { ascending: false }).limit(200);
    if (error) return toast.error(error.message);
    setHistorico({ p, movs: (data ?? []) as Movimento[] });
  }

  const paraEtiqueta = (produtos ?? [])
    .filter((p) => selecionados.has(p.id))
    .map((p) => ({ titulo: p.titulo, sku: p.sku, preco: Number(p.preco_venda), precoDe: p.preco_de, grade: p.grade, copias: Math.max(1, Math.round(Number(p.estoque_atual))) }));

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Produtos e estoque</h1>
          <p className="text-sm text-muted-foreground">{visiveis.length} produtos · {totalUn} unidades · {fmtBRL(totalVenda)} em venda</p>
        </div>
        <div className="flex gap-2">
          <Exportar titulo="Produtos e estoque" subtitulo={filtroLoja ? nomeLoja(filtroLoja) : "Todas as lojas"}
            colunas={[{ titulo: "SKU" }, { titulo: "Cód. barras" }, { titulo: "Produto" }, { titulo: "Loja" }, { titulo: "Grade" }, { titulo: "Estoque", numero: true }, { titulo: "Preço (R$)", numero: true }, { titulo: "Custo (R$)", numero: true }, { titulo: "NCM" }]}
            linhas={() => visiveis.map((p) => [p.sku, p.codigo_barras ?? "", p.titulo, nomeLoja(p.loja_id), p.grade, Number(p.estoque_atual), Number(p.preco_venda), p.custo_unit != null ? Number(p.custo_unit) : null, p.ncm ?? ""])} />
          <Button variant="outline" disabled={selecionados.size === 0} onClick={() => setEtiquetas(true)}><Printer /> Etiquetas ({selecionados.size})</Button>
          {podeEstoque && <Button onClick={() => setNovo(true)} disabled={!filtroLoja && lojas.length > 1}><PackagePlus /> Produto avulso</Button>}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Produtos de lote entram aqui pelo botão "Lançar no estoque" dentro do lote.</p>

      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-2 top-2.5 size-4 text-muted-foreground" />
            <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome, SKU ou código de barras…" className="pl-8" />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={soComEstoque} onChange={(e) => setSoComEstoque(e.target.checked)} className="size-4 accent-primary" /> Só com estoque
          </label>
        </div>
        {produtos == null ? (
          <Loader2 className="animate-spin text-muted-foreground" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr className="border-b">
                  <th className="py-2 pr-2 w-8">
                    <input type="checkbox" className="size-4 accent-primary" checked={visiveis.length > 0 && visiveis.every((p) => selecionados.has(p.id))}
                      onChange={(e) => setSelecionados(e.target.checked ? new Set(visiveis.map((p) => p.id)) : new Set())} />
                  </th>
                  <th className="py-2 pr-2">Produto</th>
                  {!filtroLoja && <th className="py-2 pr-2">Loja</th>}
                  <th className="py-2 pr-2 text-right">Estoque</th>
                  <th className="py-2 pr-2 text-right">Preço</th>
                  {podeEstoque && <th className="py-2 pr-2 text-right">Custo</th>}
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {visiveis.slice(0, 500).map((p) => (
                  <tr key={p.id} className="border-b last:border-0">
                    <td className="py-2 pr-2">
                      <input type="checkbox" className="size-4 accent-primary" checked={selecionados.has(p.id)}
                        onChange={() => setSelecionados((s) => { const n = new Set(s); n.has(p.id) ? n.delete(p.id) : n.add(p.id); return n; })} />
                    </td>
                    <td className="py-2 pr-2">
                      <div className="flex gap-2">
                        {p.foto_url ? <img src={p.foto_url} alt="" className="size-9 shrink-0 rounded bg-white object-contain" /> : <div className="size-9 shrink-0 rounded bg-muted" />}
                        <div>
                          <div className="font-medium leading-snug">{p.titulo}</div>
                          <div className="text-xs text-muted-foreground">{p.sku}{p.codigo_barras ? ` · ${p.codigo_barras}` : ""} · grade {p.grade}</div>
                        </div>
                      </div>
                    </td>
                    {!filtroLoja && <td className="py-2 pr-2 text-xs">{nomeLoja(p.loja_id)}</td>}
                    <td className="py-2 pr-2 text-right font-semibold">{Number(p.estoque_atual)}</td>
                    <td className="py-2 pr-2 text-right whitespace-nowrap">{fmtBRL(Number(p.preco_venda))}</td>
                    {podeEstoque && <td className="py-2 pr-2 text-right whitespace-nowrap text-muted-foreground">{p.custo_unit != null ? fmtBRL(Number(p.custo_unit)) : "—"}</td>}
                    <td className="py-2 whitespace-nowrap">
                      <Button size="icon" variant="ghost" title="Histórico" onClick={() => verHistorico(p)}><History /></Button>
                      {podeEstoque && <Button size="icon" variant="ghost" title="Movimentar estoque" onClick={() => setMov(p)}><SlidersHorizontal /></Button>}
                      {podeEstoque && <Button size="icon" variant="ghost" title={p.ncm ? `NCM ${p.ncm}` : "Dados fiscais (sem NCM)"} onClick={() => setFiscal(p)}><FileText className={p.ncm ? "" : "text-warning"} /></Button>}
                      {gestor && <Button size="icon" variant="ghost" title="Desativar produto" onClick={() => desativar(p)}><EyeOff /></Button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {visiveis.length > 500 && <p className="py-2 text-xs text-muted-foreground">Mostrando 500 de {visiveis.length}. Use a busca para filtrar.</p>}
            {visiveis.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Nenhum produto.</p>}
          </div>
        )}
      </Card>

      <EtiquetasDialog open={etiquetas} onOpenChange={setEtiquetas} itens={paraEtiqueta} loja={filtroLoja ? nomeLoja(filtroLoja) : undefined} />
      {fiscal && <FiscalDialog produto={fiscal} podeEmMassa={gestor} onClose={() => setFiscal(null)} onFeito={carregar} />}
      {mov && <MovimentarDialog produto={mov} onClose={() => setMov(null)} onFeito={carregar} />}
      {novo && filtroLoja !== undefined && <NovoProdutoDialog lojaId={filtroLoja ?? lojas[0]?.id} onClose={() => setNovo(false)} onFeito={carregar} />}
      <Dialog open={!!historico} onOpenChange={(v) => !v && setHistorico(null)}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Histórico de estoque</DialogTitle>
            <DialogDescription>{historico?.p.titulo}</DialogDescription>
          </DialogHeader>
          <ul className="divide-y text-sm">
            {historico?.movs.map((m) => (
              <li key={m.id} className="flex justify-between gap-2 py-2">
                <div>
                  <div className="font-medium">{TIPO_MOV[m.tipo] ?? m.tipo}</div>
                  <div className="text-xs text-muted-foreground">{fmtDate(m.created_at)}{m.motivo ? ` · ${m.motivo}` : ""}</div>
                </div>
                <div className={Number(m.quantidade) > 0 ? "font-semibold text-success" : "font-semibold text-destructive"}>
                  {Number(m.quantidade) > 0 ? "+" : ""}{Number(m.quantidade)}
                </div>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MovimentarDialog({ produto, onClose, onFeito }: { produto: Produto; onClose: () => void; onFeito: () => void }) {
  const [tipo, setTipo] = useState<"entrada" | "ajuste" | "perda" | "devolucao">("perda");
  const [qtd, setQtd] = useState("1");
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);
  async function salvar() {
    const q = lerNumero(qtd);
    if (!q) return toast.error("Informe a quantidade.");
    setSalvando(true);
    const { data, error } = await supabase.rpc("movimentar_estoque", { _produto_id: produto.id, _tipo: tipo, _quantidade: q, _motivo: motivo });
    setSalvando(false);
    if (error) return toast.error(error.message);
    toast.success(`Estoque agora: ${data}`);
    onFeito();
    onClose();
  }
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Movimentar estoque</DialogTitle>
          <DialogDescription>{produto.titulo} · estoque atual {Number(produto.estoque_atual)}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-4 gap-1">
            {(["entrada", "perda", "ajuste", "devolucao"] as const).map((t) => (
              <Button key={t} size="sm" variant={tipo === t ? "default" : "outline"} onClick={() => setTipo(t)}>{TIPO_MOV[t]}</Button>
            ))}
          </div>
          <div>
            <Label>Quantidade {tipo === "ajuste" ? "(use − para tirar, ex.: -2)" : ""}</Label>
            <Input value={qtd} onChange={(e) => setQtd(e.target.value)} />
          </div>
          <div>
            <Label>Motivo {tipo === "ajuste" || tipo === "perda" ? "(obrigatório)" : "(opcional)"}</Label>
            <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: avaria na prateleira" />
          </div>
          <Button onClick={salvar} disabled={salvando} className="w-full">{salvando ? <Loader2 className="animate-spin" /> : "Confirmar"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function NovoProdutoDialog({ lojaId, onClose, onFeito }: { lojaId?: string; onClose: () => void; onFeito: () => void }) {
  const [titulo, setTitulo] = useState("");
  const [preco, setPreco] = useState("");
  const [qtd, setQtd] = useState("1");
  const [ean, setEan] = useState("");
  const [custo, setCusto] = useState("");
  const [salvando, setSalvando] = useState(false);
  async function salvar() {
    if (!lojaId) return toast.error("Escolha uma loja no menu.");
    setSalvando(true);
    const { error } = await supabase.rpc("criar_produto", {
      _loja_id: lojaId, _titulo: titulo, _preco: lerNumero(preco), _quantidade: lerNumero(qtd) ?? 0,
      _codigo_barras: ean || null, _categoria: null, _custo: custo ? lerNumero(custo) : null,
    });
    setSalvando(false);
    if (error) return toast.error(error.message);
    toast.success("Produto cadastrado.");
    onFeito();
    onClose();
  }
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Produto avulso</DialogTitle>
          <DialogDescription>Item que não veio de lote (ex.: acessório comprado à parte).</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div><Label>Nome</Label><Input value={titulo} onChange={(e) => setTitulo(e.target.value)} /></div>
          <div className="grid grid-cols-3 gap-2">
            <div><Label>Preço (R$)</Label><Input value={preco} onChange={(e) => setPreco(e.target.value)} /></div>
            <div><Label>Quantidade</Label><Input value={qtd} onChange={(e) => setQtd(e.target.value)} /></div>
            <div><Label>Custo (R$)</Label><Input value={custo} onChange={(e) => setCusto(e.target.value)} placeholder="opcional" /></div>
          </div>
          <div><Label>Código de barras (opcional)</Label><Input value={ean} onChange={(e) => setEan(e.target.value.replace(/\D/g, ""))} /></div>
          <Button onClick={salvar} disabled={salvando} className="w-full">{salvando ? <Loader2 className="animate-spin" /> : "Cadastrar"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
