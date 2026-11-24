// Tela "Editar produto do lote": custo (valor ou %), preços, quantidade, grade, pallet e código de barras.
import { useState } from "react";
import { Loader2, RefreshCw, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { buscarItem, criarBuscador, limpar, STATUS_ITEM_LABEL, type Item, type Lote, type Pallet } from "@/lib/lotes";
import type { ConfigArredondamento } from "@/lib/precificacao";
import { abrirAbaRobo, extensaoBuscaSite } from "@/lib/captura-ml";
import { custoPercentual, lerNumero, margem, precoSugerido } from "@/lib/precificacao";
import { fmtBRL } from "@/lib/format";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { acharDuplicado, TEXTO_MOTIVO } from "@/lib/duplicados";

const txt = (v: number | null | undefined) => (v != null ? String(v) : "");

export function EditarItemDialog({ item, lote, pallets, itens = [], cfg, onClose, onSalvo }: {
  item: Item; lote: Lote; pallets: Pallet[]; itens?: Item[]; cfg?: ConfigArredondamento; onClose: () => void; onSalvo: () => void;
}) {
  const [titulo, setTitulo] = useState(item.titulo);
  const [precoML, setPrecoML] = useState(txt(item.preco_ml));
  const [precoVenda, setPrecoVenda] = useState(txt(item.preco_venda));
  const [custo, setCusto] = useState(txt(item.custo_unit));
  const base0 = item.valor_planilha ?? item.preco_ml ?? item.preco_venda;
  const [perc, setPerc] = useState(item.custo_unit != null && base0 ? String(Math.round((item.custo_unit / base0) * 1000) / 10) : "");
  const [desc, setDesc] = useState(item.preco_ml && item.preco_venda != null ? String(Math.round((1 - item.preco_venda / item.preco_ml) * 1000) / 10) : "");
  const [quantidade, setQuantidade] = useState(String(item.quantidade));
  const [grade, setGrade] = useState(item.grade);
  const [palletId, setPalletId] = useState(item.pallet_id ?? "");
  const [ean, setEan] = useState(item.codigo_barras ?? "");
  const [salvando, setSalvando] = useState(false);
  const [buscando, setBuscando] = useState(false);

  const pML = lerNumero(precoML);
  const pVenda = lerNumero(precoVenda);
  const pCusto = custo.trim() ? lerNumero(custo) : null;
  const base = item.valor_planilha ?? pML ?? pVenda; // mesma base do custo % do lote
  const m = margem(pVenda, pCusto);
  const achado = acharDuplicado(itens, { titulo, codigo_barras: ean }, (x) => x.id === item.id);

  const pct = (a: number | null, b: number | null | undefined) => (a != null && b ? String(Math.round((a / b) * 1000) / 10) : "");

  /** % do custo: custo = % × valor da planilha (ou preço ML / preço de venda, se não tiver). */
  function aplicarPerc(v: string) {
    setPerc(v);
    const n = lerNumero(v);
    if (n != null) setCusto(txt(custoPercentual(base, n)));
  }

  /** % de desconto sobre o preço ML: preço de venda = preço ML − %, com o arredondamento do lote. */
  function aplicarDesc(v: string) {
    setDesc(v);
    const n = lerNumero(v);
    if (n != null && pML) setPrecoVenda(txt(precoSugerido(pML, n, cfg)));
  }

  /**
   * Salva o que foi editado e busca de novo no Mercado Livre com o nome editado (ou o código de barras, se tiver),
   * com a mesma regra do robô. A aba do robô (busca do site) abre aqui, ainda dentro do clique.
   */
  async function salvarEBuscar() {
    if (!titulo.trim()) return toast.error("Informe o nome para buscar.");
    if (achado) return toast.error(`Já existe no lote (${achado.item.sku}) com ${TEXTO_MOTIVO[achado.motivo]}. Mude o nome ou o código de barras.`);
    if (!cfg) return toast.error("Configuração de preço não carregada. Feche e abra de novo.");
    const aba = extensaoBuscaSite() ? abrirAbaRobo() : null;
    setBuscando(true);
    try {
      const termo = titulo.trim();
      const codigo = ean.replace(/\D/g, "") || null;
      const { error: e1 } = await supabase.from("lote_itens").update({
        termo, titulo: termo, codigo_barras: codigo, quantidade: Math.max(1, Math.round(lerNumero(quantidade) ?? 1)),
        grade, pallet_id: palletId || null,
      }).eq("id", item.id);
      if (e1) throw new Error(e1.message);
      const { buscar } = criarBuscador(aba);
      const patch = await buscarItem({ termo, titulo: termo, codigo_barras: codigo, valor_planilha: item.valor_planilha }, lote, cfg, buscar);
      const { error: e2 } = await supabase.from("lote_itens").update(limpar(patch)).eq("id", item.id);
      if (e2) throw new Error(e2.message);
      const st = String(patch.status) as keyof typeof STATUS_ITEM_LABEL;
      toast.success(`Busca refeita: ${STATUS_ITEM_LABEL[st] ?? st}${patch.similaridade != null ? ` (${patch.similaridade}%)` : ""} · ${String(patch.titulo ?? termo).slice(0, 60)}`);
      onSalvo();
      onClose();
    } catch (e) {
      toast.error("Não foi possível buscar de novo: " + (e as Error).message);
    } finally {
      aba?.close();
      setBuscando(false);
    }
  }

  async function salvar() {
    if (!titulo.trim()) return toast.error("Informe o título.");
    if (achado) return toast.error(`Já existe no lote (${achado.item.sku}) com ${TEXTO_MOTIVO[achado.motivo]}. Mude o nome ou o código de barras.`);
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

          {achado && (
            <div className="rounded-md border border-destructive bg-destructive/10 p-2 text-sm text-destructive">
              ⛔ Já existe no lote com {TEXTO_MOTIVO[achado.motivo]}: {achado.item.sku} · {achado.item.titulo}. Mude o nome ou o código de barras.
            </div>
          )}
          <div className="rounded-lg border p-3 space-y-2">
            <div className="text-xs font-semibold uppercase text-muted-foreground">Custo</div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-xs">Custo unit. (R$)</Label>
                <Input value={custo} onChange={(e) => { setCusto(e.target.value); setPerc(pct(lerNumero(e.target.value), base)); }} inputMode="decimal" className="font-semibold" autoFocus />
              </div>
              <div>
                <Label className="text-xs">Custo % {item.valor_planilha != null ? "(da planilha)" : "(do preço)"}</Label>
                <Input value={perc} onChange={(e) => aplicarPerc(e.target.value)} placeholder="%" inputMode="decimal" />
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

          <div className="grid grid-cols-3 gap-2">
            <div><Label className="text-xs">Preço ML (R$)</Label><Input value={precoML} onChange={(e) => { setPrecoML(e.target.value); const n = lerNumero(desc); const ml = lerNumero(e.target.value); if (n != null && ml) setPrecoVenda(txt(precoSugerido(ml, n, cfg))); }} inputMode="decimal" /></div>
            <div><Label className="text-xs">Desconto %</Label><Input value={desc} onChange={(e) => aplicarDesc(e.target.value)} placeholder={`${lote.perc_desconto}`} inputMode="decimal" title="Desconto sobre o preço ML; calcula o preço de venda" /></div>
            <div><Label className="text-xs">Preço de venda (R$)</Label><Input value={precoVenda} onChange={(e) => { setPrecoVenda(e.target.value); const v = lerNumero(e.target.value); setDesc(v != null && pML ? String(Math.round((1 - v / pML) * 1000) / 10) : ""); }} inputMode="decimal" className="font-semibold" /></div>
          </div>

          {item.preco_ml_original != null && item.preco_ml_original > (pML ?? 0) && (
            <p className="text-xs text-muted-foreground">Preço cheio no ML (sem promoção): {fmtBRL(item.preco_ml_original)}. O desconto e o "De" da etiqueta usam o preço ML atual.</p>
          )}
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
            <Button variant="outline" onClick={salvarEBuscar} disabled={salvando || buscando || !!achado} title="Salva e busca de novo no Mercado Livre com o nome/código editado">
              {buscando ? <Loader2 className="animate-spin" /> : <RefreshCw />} Salvar e buscar de novo
            </Button>
            <Button onClick={salvar} disabled={salvando || buscando || !!achado}>{salvando ? <Loader2 className="animate-spin" /> : <Save />} Salvar</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
