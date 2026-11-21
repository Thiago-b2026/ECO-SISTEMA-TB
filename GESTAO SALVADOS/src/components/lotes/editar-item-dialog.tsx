// Tela "Editar produto do lote": custo (valor ou %), preços, quantidade, grade, pallet e código de barras.
import { useState } from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import type { Item, Lote, Pallet } from "@/lib/lotes";
import { custoPercentual, lerNumero, margem } from "@/lib/precificacao";
import { fmtBRL } from "@/lib/format";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const txt = (v: number | null | undefined) => (v != null ? String(v) : "");

export function EditarItemDialog({ item, lote, pallets, onClose, onSalvo }: {
  item: Item; lote: Lote; pallets: Pallet[]; onClose: () => void; onSalvo: () => void;
}) {
  const [titulo, setTitulo] = useState(item.titulo);
  const [precoML, setPrecoML] = useState(txt(item.preco_ml));
  const [precoVenda, setPrecoVenda] = useState(txt(item.preco_venda));
  const [custo, setCusto] = useState(txt(item.custo_unit));
  const [perc, setPerc] = useState("");
  const [quantidade, setQuantidade] = useState(String(item.quantidade));
  const [grade, setGrade] = useState(item.grade);
  const [palletId, setPalletId] = useState(item.pallet_id ?? "");
  const [ean, setEan] = useState(item.codigo_barras ?? "");
  const [salvando, setSalvando] = useState(false);

  const pML = lerNumero(precoML);
  const pVenda = lerNumero(precoVenda);
  const pCusto = custo.trim() ? lerNumero(custo) : null;
  const base = item.valor_planilha ?? pML ?? pVenda; // mesma base do custo % do lote
  const percAtual = pCusto != null && base ? Math.round((pCusto / base) * 1000) / 10 : null;
  const m = margem(pVenda, pCusto);

  function aplicarPerc(v: string) {
    setPerc(v);
    const n = lerNumero(v);
    if (n != null) setCusto(txt(custoPercentual(base, n)));
  }

  async function salvar() {
    if (!titulo.trim()) return toast.error("Informe o título.");
    const q = Math.max(1, Math.round(lerNumero(quantidade) ?? 1));
    setSalvando(true);
    const { error } = await supabase.from("lote_itens").update({
      titulo: titulo.trim(),
      preco_ml: pML,
      preco_venda: pVenda,
      custo_unit: pCusto,
      quantidade: q,
      grade,
      pallet_id: palletId || null,
      codigo_barras: ean.replace(/\D/g, "") || null,
    }).eq("id", item.id);
    setSalvando(false);
    if (error) return toast.error("Não foi possível salvar: " + error.message);
    toast.success("Produto atualizado.");
    onSalvo();
    onClose();
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar produto</DialogTitle>
          <DialogDescription>{item.sku}{lote.rateio === "percentual" ? ` · custo do lote: ${lote.perc_custo}% do preço` : " · custo do lote: pelo valor pago"}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex gap-3">
            {item.foto_url ? <img src={item.foto_url} alt="" className="size-16 shrink-0 rounded bg-white object-contain" /> : null}
            <div className="flex-1">
              <Label>Título</Label>
              <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} />
            </div>
          </div>

          <div className="rounded-lg border p-3 space-y-2">
            <div className="text-xs font-semibold uppercase text-muted-foreground">Custo</div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-xs">Custo unit. (R$)</Label>
                <Input value={custo} onChange={(e) => { setCusto(e.target.value); setPerc(""); }} inputMode="decimal" className="font-semibold" autoFocus />
              </div>
              <div>
                <Label className="text-xs">ou % do preço</Label>
                <Input value={perc} onChange={(e) => aplicarPerc(e.target.value)} placeholder={percAtual != null ? `${percAtual}` : "%"} inputMode="decimal" />
              </div>
              <div>
                <Label className="text-xs">Margem</Label>
                <Input value={m != null ? `${m}%` : "—"} disabled className={cn(m != null && m < 0 && "text-destructive")} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Custo total deste item: {pCusto != null ? fmtBRL(pCusto * Math.max(1, lerNumero(quantidade) ?? 1)) : "—"}.
              {" "}"Reaplicar preços e custo %" e "Recalcular custo pelo valor pago" (em Parâmetros do lote) substituem custos editados aqui.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs">Preço ML (R$)</Label><Input value={precoML} onChange={(e) => setPrecoML(e.target.value)} inputMode="decimal" /></div>
            <div><Label className="text-xs">Preço de venda (R$)</Label><Input value={precoVenda} onChange={(e) => setPrecoVenda(e.target.value)} inputMode="decimal" className="font-semibold" /></div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div><Label className="text-xs">Quantidade</Label><Input value={quantidade} onChange={(e) => setQuantidade(e.target.value)} inputMode="numeric" /></div>
            <div>
              <Label className="text-xs">Grade</Label>
              <select value={grade} onChange={(e) => setGrade(e.target.value)} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
                {Array.from(new Set(["A", "B", "C", "D", item.grade])).map((g) => <option key={g}>{g}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Pallet</Label>
              <select value={palletId} onChange={(e) => setPalletId(e.target.value)} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
                <option value="">Sem pallet</option>
                {pallets.map((p) => <option key={p.id} value={p.id}>{p.codigo}</option>)}
              </select>
            </div>
          </div>
          <div><Label className="text-xs">Código de barras</Label><Input value={ean} onChange={(e) => setEan(e.target.value)} inputMode="numeric" /></div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button onClick={salvar} disabled={salvando}>{salvando ? <Loader2 className="animate-spin" /> : <Save />} Salvar</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
