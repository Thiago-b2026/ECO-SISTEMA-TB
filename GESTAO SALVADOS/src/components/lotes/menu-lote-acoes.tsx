// Ações do menu ⋮ da lista de lotes (como no PrecificaLote): Editar cadastro, Ajustar custos e Baixar/Exportar.
import { useState } from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { fetchAllRows } from "@/lib/fetch-all";
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

/**
 * Baixar/Exportar: planilha .xlsx no MESMO modelo da exportação do PrecificaLote ("PRODUTOS 127V.xlsx"):
 *  - Planilha1: título (nome do lote), Qnt. Pallet, Qnt. Categorias, totais (SUBTOTAL) e as colunas
 *    Pallet · Qtd · Condição (Grade) · Descrição do Item · Valor Unit · Valor Total · Custo Unit · Categoria · Link · Codigo;
 *  - Resumo por Pallet e Resumo por Categoria (qtd de itens e valor total).
 * Itens com ocorrência "não chegou"/"avaria total" ficam de fora.
 */
export async function exportarLote(lote: LoteResumo, verCusto: boolean) {
  const todos = await fetchAllRows<Item & { pallets: { codigo: string } | null }>(() =>
    supabase.from("lote_itens").select("*, pallets(codigo)").eq("lote_id", lote.id).order("created_at"),
  );
  const itens = todos.filter((i) => i.ocorrencia !== "nao_chegou" && i.ocorrencia !== "avaria_total");
  if (!itens.length) return toast.info("Lote sem itens para exportar.");
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const dinheiro = '#,##0.00';
  const negrito = { bold: true } as const;
  const palletDe = (i: (typeof itens)[number]) => i.pallets?.codigo ?? "Sem pallet";
  const categoriaDe = (i: Item) => (i.categoria?.trim() || "Outros");
  const pallets = [...new Set(itens.map(palletDe))];
  const categorias = [...new Set(itens.map(categoriaDe))];

  // ---------- Planilha1
  const ws = wb.addWorksheet("Planilha1");
  ws.mergeCells("A1:D1");
  ws.mergeCells("A2:B2");
  ws.mergeCells("C2:I4");
  ws.getCell("A2").value = { formula: "C2", result: lote.nome };
  ws.getCell("C2").value = lote.nome;
  ws.getCell("C2").font = { bold: true, size: 18 };
  ws.getCell("C2").alignment = { vertical: "middle", horizontal: "center" };
  ws.getCell("A3").value = "Qnt. Pallet:";
  ws.getCell("B3").value = pallets.length;
  ws.getCell("A4").value = "Qnt. Categorias:";
  ws.getCell("B4").value = categorias.length;
  ["A3", "A4"].forEach((c) => (ws.getCell(c).font = negrito));
  const ini = 8;
  const fim = Math.max(ini, ini + itens.length - 1);
  const totalQtd = itens.reduce((t, i) => t + i.quantidade, 0);
  const totalValor = itens.reduce((t, i) => t + (i.preco_venda ?? 0) * i.quantidade, 0);
  ws.getCell("B6").value = { formula: `SUBTOTAL(9,B${ini}:B${fim + 100})`, result: totalQtd };
  ws.getCell("F6").value = { formula: `SUBTOTAL(9,F${ini}:F${fim + 100})`, result: Math.round(totalValor * 100) / 100 };
  ws.getCell("F6").numFmt = dinheiro;
  ["B6", "F6"].forEach((c) => (ws.getCell(c).font = negrito));
  const cab = ["Pallet", "Qtd", "Condição\n(Grade)", "Descrição do Item", "Valor Unit", "Valor Total", "Custo Unit", "Categoria", "Link do Anúncio Encontrado", "Codigo"];
  const linhaCab = ws.getRow(7);
  cab.forEach((t, k) => {
    const c = linhaCab.getCell(k + 1);
    c.value = t;
    c.font = negrito;
    c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF7AC03" } };
    c.border = { bottom: { style: "thin" } };
  });
  linhaCab.height = 30;
  itens.forEach((i, k) => {
    const r = ws.getRow(ini + k);
    const unit = i.preco_venda ?? null;
    r.values = [
      palletDe(i), i.quantidade, i.grade, i.titulo,
      unit, unit != null ? Math.round(unit * i.quantidade * 100) / 100 : null,
      verCusto ? i.custo_unit : null, categoriaDe(i), i.ml_link ?? "", i.sku,
    ];
    [5, 6, 7].forEach((col) => (r.getCell(col).numFmt = dinheiro));
  });
  ws.columns = [{ width: 11 }, { width: 7 }, { width: 10 }, { width: 60 }, { width: 12 }, { width: 13 }, { width: 12 }, { width: 22 }, { width: 50 }, { width: 10 }];
  ws.views = [{ state: "frozen", ySplit: 7 }];
  ws.autoFilter = { from: "A7", to: `J${fim}` };

  // ---------- Resumos
  const resumo = (nome: string, rotulo: string, rotuloQtd: string, coluna: string, chave: (i: (typeof itens)[number]) => string, refQtd: string) => {
    const r = wb.addWorksheet(nome);
    r.mergeCells("A1:B1");
    r.mergeCells(nome === "Resumo por Pallet" ? "A2:B2" : "B2:C2");
    r.getCell("A2").value = rotulo;
    r.getCell(nome === "Resumo por Pallet" ? "C2" : "B2").value = { formula: "Planilha1!C2", result: lote.nome };
    r.getCell("A3").value = rotuloQtd;
    r.getCell("B3").value = { formula: `Planilha1!${refQtd}`, result: nome === "Resumo por Pallet" ? pallets.length : categorias.length };
    ["A2", "A3"].forEach((c) => (r.getCell(c).font = negrito));
    const grupos = new Map<string, { qtd: number; valor: number }>();
    for (const i of itens) {
      const g = grupos.get(chave(i)) ?? { qtd: 0, valor: 0 };
      g.qtd += i.quantidade;
      g.valor += (i.preco_venda ?? 0) * i.quantidade;
      grupos.set(chave(i), g);
    }
    const linhas = [...grupos.entries()];
    const ultima = 6 + Math.max(1, linhas.length);
    r.getCell("B5").value = { formula: `SUBTOTAL(9,B7:B${ultima + 100})`, result: linhas.reduce((t, [, g]) => t + g.qtd, 0) };
    r.getCell("C5").value = { formula: `SUBTOTAL(9,C7:C${ultima + 100})`, result: Math.round(linhas.reduce((t, [, g]) => t + g.valor, 0) * 100) / 100 };
    r.getCell("C5").numFmt = dinheiro;
    ["B5", "C5"].forEach((c) => (r.getCell(c).font = negrito));
    const h = r.getRow(6);
    [coluna, "Qtd de Itens", "Valor Total"].forEach((t, k) => {
      const c = h.getCell(k + 1);
      c.value = t;
      c.font = negrito;
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF7AC03" } };
    });
    linhas.forEach(([nomeGrupo, g], k) => {
      const row = r.getRow(7 + k);
      row.values = [nomeGrupo, g.qtd, Math.round(g.valor * 100) / 100];
      row.getCell(3).numFmt = dinheiro;
    });
    r.columns = [{ width: 28 }, { width: 14 }, { width: 16 }];
  };
  resumo("Resumo por Pallet", "Resumo por Pallet    : ", "Qnt. Pallet:", "Pallet", palletDe, "B3");
  resumo("Resumo por Categoria", "Resumo por Categoria   -", "Qnt. Categoria:", "Categoria", categoriaDe, "B4");

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${lote.nome.replace(/[\\/:*?"<>|]+/g, " ").trim() || "lote"}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  toast.success(`Planilha do lote "${lote.nome}" baixada (${itens.length} itens).`);
}
