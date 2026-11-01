// Dados fiscais do produto (NCM, CEST, CFOP, origem, unidade) — preparação para NFC-e/NF-e.
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface ProdutoFiscal {
  id: string;
  loja_id: string;
  titulo: string;
  categoria: string | null;
  ncm: string | null;
  cest: string | null;
  cfop: string;
  origem: number;
  unidade: string;
}

const ORIGENS = [
  "0 – Nacional",
  "1 – Estrangeira (importação direta)",
  "2 – Estrangeira (adquirida no mercado interno)",
  "3 – Nacional, conteúdo importado > 40%",
  "4 – Nacional, processos básicos",
  "5 – Nacional, conteúdo importado ≤ 40%",
  "6 – Estrangeira sem similar (importação direta)",
  "7 – Estrangeira sem similar (mercado interno)",
  "8 – Nacional, conteúdo importado > 70%",
];

export function FiscalDialog({ produto, podeEmMassa, onClose, onFeito }: { produto: ProdutoFiscal; podeEmMassa: boolean; onClose: () => void; onFeito: () => void }) {
  const [ncm, setNcm] = useState(produto.ncm ?? "");
  const [cest, setCest] = useState(produto.cest ?? "");
  const [cfop, setCfop] = useState(produto.cfop ?? "5102");
  const [origem, setOrigem] = useState(produto.origem ?? 0);
  const [unidade, setUnidade] = useState(produto.unidade ?? "UN");
  const [categoria, setCategoria] = useState(false);
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    if (ncm && !/^\d{8}$/.test(ncm)) return toast.error("NCM tem 8 dígitos.");
    if (cest && !/^\d{7}$/.test(cest)) return toast.error("CEST tem 7 dígitos.");
    if (!/^\d{4}$/.test(cfop)) return toast.error("CFOP tem 4 dígitos.");
    setSalvando(true);
    if (categoria) {
      const { data, error } = await supabase.rpc("aplicar_fiscal_categoria", {
        _categoria: produto.categoria ?? "", _loja_id: null, _ncm: ncm, _cest: cest, _cfop: cfop, _origem: origem,
      });
      setSalvando(false);
      if (error) return toast.error(error.message);
      toast.success(`Dados fiscais aplicados a ${data} produtos da categoria.`);
    } else {
      const { error } = await supabase.from("produtos").update({ ncm: ncm || null, cest: cest || null, cfop, origem, unidade: unidade.toUpperCase() || "UN" }).eq("id", produto.id);
      setSalvando(false);
      if (error) return toast.error(error.message);
      toast.success("Dados fiscais salvos.");
    }
    onFeito();
    onClose();
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Dados fiscais</DialogTitle>
          <DialogDescription>{produto.titulo}. Confirme os códigos com o seu contador.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs">NCM (8 dígitos)</Label><Input value={ncm} onChange={(e) => setNcm(e.target.value.replace(/\D/g, "").slice(0, 8))} inputMode="numeric" /></div>
            <div><Label className="text-xs">CEST (opcional)</Label><Input value={cest} onChange={(e) => setCest(e.target.value.replace(/\D/g, "").slice(0, 7))} inputMode="numeric" /></div>
            <div><Label className="text-xs">CFOP</Label><Input value={cfop} onChange={(e) => setCfop(e.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" /></div>
            <div><Label className="text-xs">Unidade</Label><Input value={unidade} onChange={(e) => setUnidade(e.target.value.slice(0, 6))} disabled={categoria} /></div>
          </div>
          <div>
            <Label className="text-xs">Origem da mercadoria</Label>
            <select value={origem} onChange={(e) => setOrigem(Number(e.target.value))} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
              {ORIGENS.map((o, i) => <option key={i} value={i}>{o}</option>)}
            </select>
          </div>
          {podeEmMassa && (
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-0.5 size-4 accent-primary" checked={categoria} onChange={(e) => setCategoria(e.target.checked)} />
              <span>Aplicar a <b>todos os produtos da categoria</b> "{produto.categoria || "sem categoria"}" (em todas as lojas)</span>
            </label>
          )}
          <Button onClick={salvar} disabled={salvando} className="w-full">{salvando ? <Loader2 className="animate-spin" /> : "Salvar"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
