// Ações do menu ⋮ da lista de lotes (como no PrecificaLote): Editar cadastro, Ajustar custos e Baixar/Exportar.
import { useState } from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { fetchAllRows } from "@/lib/fetch-all";
import { exportarExcel } from "@/lib/exportar";
import { custoPercentual, lerNumero } from "@/lib/precificacao";
import { fmtBRL } from "@/lib/format";
import { STATUS_ITEM_LABEL, type Item, type LoteResumo } from "@/lib/lotes";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Editar cadastro do lote: nome, observação e parâmetros de preço/busca. */
export function EditarLoteDialog({ lote, onClose, onFeito }: { lote: LoteResumo; onClose: () => void; onFeito: () => void }) {
  const [nome, setNome] = useState(lote.nome);
  const [obs, setObs] = useState(lote.observacao ?? "");
  const [desc, setDesc] = useState(String(lote.perc_desconto));
  const [sim, setSim] = useState(String(lote.similaridade_min));
  const [salvando, setSalvando] = useState(false);
  async function salvar() {
    if (!nome.trim()) return toast.error("Informe o nome do lote.");
    const d = lerNumero(desc);
    const s = Math.round(lerNumero(sim) ?? NaN);
    if (d == null || d < 0 || d >= 100) return toast.error("Desconto entre 0 e 99%.");
    if (!(s >= 0 && s <= 100)) return toast.error("Similaridade entre 0 e 100%.");
    setSalvando(true);
    const { error } = await supabase.from("lotes").update({ nome: nome.trim(), observacao: obs.trim() || null, perc_desconto: d, similaridade_min: s }).eq("id", lote.id);
    setSalvando(false);
    if (error) return toast.error("Não foi possível salvar: " + error.message);
    toast.success("Cadastro do lote atualizado.");
    onFeito();
    onClose();
  }
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar cadastro do lote</DialogTitle>
          <DialogDescription>Os preços já calculados não mudam; para refazer use "Reaplicar preços" dentro do lote.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div><Label>Nome do lote</Label><Input value={nome} onChange={(e) => setNome(e.target.value)} autoFocus /></div>
          <div><Label>Observação</Label><Input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="opcional" /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs">% de desconto sobre o ML</Label><Input value={desc} onChange={(e) => setDesc(e.target.value)} inputMode="decimal" /></div>
            <div><Label className="text-xs">Similaridade mínima %</Label><Input value={sim} onChange={(e) => setSim(e.target.value)} inputMode="numeric" /></div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button onClick={salvar} disabled={salvando}>{salvando ? <Loader2 className="animate-spin" /> : <Save />} Salvar</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Ajustar custos do lote: % sobre o preço (recalcula cada item) ou valor pago no lote (rateio). */
export function AjustarCustosDialog({ lote, onClose, onFeito }: { lote: LoteResumo; onClose: () => void; onFeito: () => void }) {
  const [modo, setModo] = useState<"percentual" | "valor_pago">(lote.rateio);
  const [perc, setPerc] = useState(String(lote.perc_custo));
  const [valor, setValor] = useState(lote.valor_pago != null ? String(lote.valor_pago) : "");
  const [salvando, setSalvando] = useState(false);
  async function aplicar() {
    setSalvando(true);
    try {
      if (modo === "percentual") {
        const p = lerNumero(perc);
        if (p == null || p < 0 || p > 100) throw new Error("% de custo entre 0 e 100.");
        if (!window.confirm(`Recalcular o custo de TODOS os itens do lote "${lote.nome}" para ${p}% do preço (planilha ou ML)? Custos editados à mão serão substituídos.`)) return;
        const { error } = await supabase.from("lotes").update({ rateio: "percentual", perc_custo: p }).eq("id", lote.id);
        if (error) throw new Error(error.message);
        const itens = await fetchAllRows<Item>(() => supabase.from("lote_itens").select("id, valor_planilha, preco_ml, preco_venda").eq("lote_id", lote.id).order("id"));
        let n = 0;
        for (const i of itens) {
          const c = custoPercentual(i.valor_planilha ?? i.preco_ml ?? i.preco_venda, p);
          const { error: e } = await supabase.from("lote_itens").update({ custo_unit: c }).eq("id", i.id);
          if (!e) n++;
        }
        toast.success(`Custo de ${n} itens recalculado para ${p}% do preço.`);
      } else {
        const v = lerNumero(valor);
        if (v == null || v <= 0) throw new Error("Informe o valor pago no lote.");
        if (!window.confirm(`Ratear ${fmtBRL(v)} entre os itens do lote "${lote.nome}" (proporcional ao preço)? Custos editados à mão serão substituídos.`)) return;
        const { error } = await supabase.from("lotes").update({ rateio: "valor_pago", valor_pago: v }).eq("id", lote.id);
        if (error) throw new Error(error.message);
        const { data, error: e2 } = await supabase.rpc("recalcular_custo_lote", { _lote_id: lote.id });
        if (e2) throw new Error(e2.message);
        toast.success(`Custo de ${data} itens recalculado pelo valor pago.`);
      }
      onFeito();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ajustar custos</DialogTitle>
          <DialogDescription>{lote.nome} · {lote.total_itens} itens</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex gap-2">
            <Button type="button" size="sm" variant={modo === "percentual" ? "default" : "outline"} onClick={() => setModo("percentual")}>% sobre o preço</Button>
            <Button type="button" size="sm" variant={modo === "valor_pago" ? "default" : "outline"} onClick={() => setModo("valor_pago")}>Valor pago no lote</Button>
          </div>
          {modo === "percentual" ? (
            <div>
              <Label>% de custo</Label>
              <Input value={perc} onChange={(e) => setPerc(e.target.value)} inputMode="decimal" autoFocus />
              <p className="mt-1 text-xs text-muted-foreground">Custo de cada item = esse % do valor da planilha (ou do preço do ML, se não houver planilha).</p>
            </div>
          ) : (
            <div>
              <Label>Valor pago no lote (R$)</Label>
              <Input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" autoFocus />
              <p className="mt-1 text-xs text-muted-foreground">O valor é dividido entre os itens, proporcional ao preço de cada um.</p>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button onClick={aplicar} disabled={salvando}>{salvando ? <Loader2 className="animate-spin" /> : null} Aplicar</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Baixar/Exportar: planilha Excel com todos os itens do lote. */
export async function exportarLote(lote: LoteResumo, verCusto: boolean) {
  const itens = await fetchAllRows<Item & { pallets: { codigo: string } | null }>(() =>
    supabase.from("lote_itens").select("*, pallets(codigo)").eq("lote_id", lote.id).order("created_at"),
  );
  if (!itens.length) return toast.info("Lote sem itens para exportar.");
  const colunas = [
    { titulo: "SKU" }, { titulo: "Produto" }, { titulo: "Termo da planilha" }, { titulo: "Código de barras" },
    { titulo: "Qtd.", numero: true }, { titulo: "Pallet" }, { titulo: "Grade" }, { titulo: "Categoria" },
    { titulo: "Valor planilha (R$)", numero: true }, { titulo: "Preço ML (R$)", numero: true }, { titulo: "Preço de venda (R$)", numero: true },
    ...(verCusto ? [{ titulo: "Custo unit. (R$)", numero: true }] : []),
    { titulo: "Situação" }, { titulo: "Semelhança %", numero: true }, { titulo: "Link ML" },
  ];
  const linhas = itens.map((i) => [
    i.sku, i.titulo, i.termo ?? "", i.codigo_barras ?? "", i.quantidade, i.pallets?.codigo ?? "", i.grade, i.categoria ?? "",
    i.valor_planilha, i.preco_ml, i.preco_venda,
    ...(verCusto ? [i.custo_unit] : []),
    STATUS_ITEM_LABEL[i.status] ?? i.status, i.similaridade, i.ml_link ?? "",
  ]);
  exportarExcel(`Lote ${lote.nome}`, colunas, linhas);
}
