// Lançar venda retroativa: data e hora passadas (até 30 dias), fora do caixa, com motivo.
// Só para quem o admin liberou ("Lançar venda retroativa" em Pessoas → Login e permissões). O banco confere tudo de novo.
import { useEffect, useMemo, useState } from "react";
import { History, Loader2, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useLoja } from "@/lib/loja";
import { fetchAllRows } from "@/lib/fetch-all";
import { FORMAS } from "@/lib/caixa";
import { fmtBRL } from "@/lib/format";
import { lerNumero } from "@/lib/precificacao";
import { formatLocalDateInput, saleDateTimePartsToIso } from "@/lib/sale-datetime";
import { normalizarNome } from "@/lib/duplicados";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ProdutoVenda { id: string; sku: string; titulo: string; codigo_barras: string | null; preco_venda: number; estoque_atual: number }
interface Linha { produto: ProdutoVenda; qtd: string; preco: string }
interface Pagamento { forma: (typeof FORMAS)[number]["id"]; valor: string }

export const DIAS_RETROATIVA = 30;

export function VendaRetroativaDialog({ onClose, onFeito }: { onClose: () => void; onFeito: () => void }) {
  const { profile } = useAuth();
  const { lojas, filtroLoja } = useLoja();
  const [lojaId, setLojaId] = useState<string>(filtroLoja ?? lojas[0]?.id ?? "");
  const [produtos, setProdutos] = useState<ProdutoVenda[]>([]);
  const [busca, setBusca] = useState("");
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [desconto, setDesconto] = useState("");
  const [pagamentos, setPagamentos] = useState<Pagamento[]>([{ forma: "dinheiro", valor: "" }]);
  const hoje = formatLocalDateInput();
  const minimo = formatLocalDateInput(new Date(Date.now() - DIAS_RETROATIVA * 86400000));
  const [data, setData] = useState("");
  const [hora, setHora] = useState("12:00");
  const [vendedor, setVendedor] = useState(profile?.nome ?? "");
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!lojaId) return;
    setLinhas([]);
    fetchAllRows<ProdutoVenda>(() =>
      supabase.from("produtos").select("id, sku, titulo, codigo_barras, preco_venda, estoque_atual").eq("loja_id", lojaId).eq("ativo", true).gt("estoque_atual", 0).order("titulo"),
    ).then(setProdutos).catch((e) => toast.error((e as Error).message));
  }, [lojaId]);

  const achados = useMemo(() => {
    const t = normalizarNome(busca);
    const dig = busca.replace(/\D/g, "");
    if (!t && !dig) return [];
    return produtos
      .filter((p) => !linhas.some((l) => l.produto.id === p.id))
      .filter((p) => normalizarNome(p.titulo).includes(t) || p.sku.toLowerCase() === busca.trim().toLowerCase() || (dig.length >= 4 && (p.codigo_barras ?? "").includes(dig)))
      .slice(0, 12);
  }, [busca, produtos, linhas]);

  const subtotal = linhas.reduce((s, l) => s + (lerNumero(l.qtd) ?? 0) * (lerNumero(l.preco) ?? 0), 0);
  const desc = lerNumero(desconto) ?? 0;
  const total = Math.max(0, Math.round((subtotal - desc) * 100) / 100);
  const pago = pagamentos.reduce((s, p) => s + (lerNumero(p.valor) ?? 0), 0);
  const falta = Math.round((total - pago) * 100) / 100;

  function adicionar(p: ProdutoVenda) {
    setLinhas((xs) => [...xs, { produto: p, qtd: "1", preco: String(p.preco_venda) }]);
    setBusca("");
  }

  async function salvar() {
    if (!lojaId) return toast.error("Escolha a loja.");
    if (!data) return toast.error("Informe a data da venda.");
    if (data < minimo || data > hoje) return toast.error(`A data precisa estar entre ${minimo.split("-").reverse().join("/")} e hoje.`);
    if (linhas.length === 0) return toast.error("Adicione os produtos vendidos.");
    for (const l of linhas) {
      const q = lerNumero(l.qtd) ?? 0;
      if (!(q > 0)) return toast.error(`Quantidade inválida em "${l.produto.titulo}".`);
      if (q > l.produto.estoque_atual) return toast.error(`Estoque insuficiente em "${l.produto.titulo}" (tem ${l.produto.estoque_atual}).`);
    }
    if (falta > 0.009) return toast.error(`Faltam ${fmtBRL(falta)} nos pagamentos.`);
    if (!motivo.trim()) return toast.error("Informe o motivo (ex.: sistema fora do ar no sábado).");
    const quando = saleDateTimePartsToIso(data, hora || "12:00");
    if (new Date(quando) > new Date()) return toast.error("A data e a hora não podem ser no futuro.");
    if (!window.confirm(`Lançar venda retroativa de ${fmtBRL(total)} em ${data.split("-").reverse().join("/")} ${hora}? O estoque baixa agora; a venda não entra no caixa de hoje.`)) return;
    setSalvando(true);
    const { data: r, error } = await supabase.rpc("lancar_venda_retroativa", {
      _loja_id: lojaId,
      _data_venda: quando,
      _itens: linhas.map((l) => ({ produto_id: l.produto.id, quantidade: lerNumero(l.qtd), preco_unit: lerNumero(l.preco), desconto: 0 })),
      _pagamentos: pagamentos.filter((p) => (lerNumero(p.valor) ?? 0) > 0).map((p) => ({ forma: p.forma, valor: lerNumero(p.valor) })),
      _desconto: desc,
      _motivo: motivo.trim(),
      _vendedor_nome: vendedor.trim() || null,
      _observacao: null,
    });
    setSalvando(false);
    if (error) return toast.error(error.message);
    toast.success(`Venda retroativa nº ${(r as { numero: number }).numero} lançada.`);
    onFeito();
    onClose();
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[94vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><History className="size-5" /> Lançar venda retroativa</DialogTitle>
          <DialogDescription>Até {DIAS_RETROATIVA} dias para trás. Baixa o estoque, aparece nos relatórios e no financeiro no dia da venda e não entra no caixa de hoje.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-3">
            {lojas.length > 1 && (
              <div>
                <Label className="text-xs">Loja</Label>
                <select value={lojaId} onChange={(e) => setLojaId(e.target.value)} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
                  {lojas.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
                </select>
              </div>
            )}
            <div><Label className="text-xs">Data da venda</Label><Input type="date" value={data} min={minimo} max={hoje} onChange={(e) => setData(e.target.value)} /></div>
            <div><Label className="text-xs">Hora</Label><Input type="time" value={hora} onChange={(e) => setHora(e.target.value)} /></div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Produtos</Label>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 size-4 text-muted-foreground" />
              <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome, SKU ou código de barras (só com estoque)" className="pl-8" />
            </div>
            {achados.length > 0 && (
              <ul className="max-h-48 divide-y overflow-y-auto rounded-md border">
                {achados.map((p) => (
                  <li key={p.id}>
                    <button type="button" onClick={() => adicionar(p)} className="flex w-full items-center justify-between gap-2 p-2 text-left text-sm hover:bg-muted">
                      <span className="min-w-0"><span className="font-medium">{p.titulo}</span> <span className="text-xs text-muted-foreground">{p.sku} · estoque {Number(p.estoque_atual)}</span></span>
                      <span className="flex items-center gap-1 whitespace-nowrap font-semibold">{fmtBRL(Number(p.preco_venda))} <Plus className="size-4" /></span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {linhas.length > 0 && (
              <table className="w-full text-sm">
                <thead><tr className="text-left text-muted-foreground"><th className="py-1">Produto</th><th className="w-20 py-1">Qtd.</th><th className="w-28 py-1">Preço</th><th className="w-24 py-1 text-right">Total</th><th className="w-8" /></tr></thead>
                <tbody>
                  {linhas.map((l, i) => (
                    <tr key={l.produto.id} className="border-t">
                      <td className="py-1 pr-2">{l.produto.titulo}<div className="text-xs text-muted-foreground">{l.produto.sku} · estoque {Number(l.produto.estoque_atual)}</div></td>
                      <td className="py-1 pr-2"><Input value={l.qtd} inputMode="decimal" onChange={(e) => setLinhas((xs) => xs.map((x, j) => (j === i ? { ...x, qtd: e.target.value } : x)))} className="h-8" /></td>
                      <td className="py-1 pr-2"><Input value={l.preco} inputMode="decimal" onChange={(e) => setLinhas((xs) => xs.map((x, j) => (j === i ? { ...x, preco: e.target.value } : x)))} className="h-8" /></td>
                      <td className="py-1 text-right whitespace-nowrap">{fmtBRL((lerNumero(l.qtd) ?? 0) * (lerNumero(l.preco) ?? 0))}</td>
                      <td className="py-1 text-right"><button type="button" title="Tirar" onClick={() => setLinhas((xs) => xs.filter((_, j) => j !== i))}><Trash2 className="size-4 text-destructive" /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-xs">Pagamento</Label>
              {pagamentos.map((p, i) => (
                <div key={i} className="flex gap-2">
                  <select value={p.forma} onChange={(e) => setPagamentos((xs) => xs.map((x, j) => (j === i ? { ...x, forma: e.target.value as Pagamento["forma"] } : x)))} className="h-9 rounded-md border bg-background px-2 text-sm">
                    {FORMAS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                  </select>
                  <Input value={p.valor} inputMode="decimal" placeholder={i === 0 && !p.valor ? String(total || "") : "valor"} onChange={(e) => setPagamentos((xs) => xs.map((x, j) => (j === i ? { ...x, valor: e.target.value } : x)))} onFocus={() => { if (!p.valor && falta > 0) setPagamentos((xs) => xs.map((x, j) => (j === i ? { ...x, valor: String(falta) } : x))); }} />
                  {pagamentos.length > 1 && <button type="button" onClick={() => setPagamentos((xs) => xs.filter((_, j) => j !== i))}><Trash2 className="size-4 text-destructive" /></button>}
                </div>
              ))}
              <Button type="button" size="sm" variant="outline" onClick={() => setPagamentos((xs) => [...xs, { forma: "pix", valor: "" }])}><Plus /> Outra forma</Button>
            </div>
            <div className="space-y-2 rounded-md border bg-muted/30 p-3 text-sm">
              <div className="flex justify-between"><span>Subtotal</span><b>{fmtBRL(subtotal)}</b></div>
              <div className="flex items-center justify-between gap-2"><span>Desconto (R$)</span><Input value={desconto} inputMode="decimal" onChange={(e) => setDesconto(e.target.value)} className="h-8 w-28 text-right" /></div>
              <div className="flex justify-between text-base"><span>Total</span><b>{fmtBRL(total)}</b></div>
              <div className={`flex justify-between ${falta > 0.009 ? "text-destructive" : "text-success"}`}><span>{falta > 0.009 ? "Falta pagar" : falta < -0.009 ? "Troco" : "Pago"}</span><b>{fmtBRL(Math.abs(falta))}</b></div>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div><Label className="text-xs">Vendedor(a)</Label><Input value={vendedor} onChange={(e) => setVendedor(e.target.value)} /></div>
            <div><Label className="text-xs">Motivo (obrigatório)</Label><Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: sistema fora do ar no sábado" /></div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button onClick={salvar} disabled={salvando}>{salvando ? <Loader2 className="animate-spin" /> : <History />} Lançar venda retroativa</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
