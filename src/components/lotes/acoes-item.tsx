// Desmembrar (caixa/kit → unidades) e avaria parcial (vira item separado).
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import type { Item } from "@/lib/lotes";
import { fmtBRL } from "@/lib/format";
import { lerNumero } from "@/lib/precificacao";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function DesmembrarDialog({ item, onClose, onFeito }: { item: Item; onClose: () => void; onFeito: () => void }) {
  const [caixas, setCaixas] = useState(String(item.quantidade));
  const [porCaixa, setPorCaixa] = useState("6");
  const [avariadas, setAvariadas] = useState("0");
  const [titulo, setTitulo] = useState(`${item.titulo} (unidade)`);
  const [preco, setPreco] = useState("");
  const [salvando, setSalvando] = useState(false);
  const c = Math.max(1, Number(caixas) || 1);
  const n = Math.max(2, Number(porCaixa) || 2);
  const av = Math.max(0, Number(avariadas) || 0);
  const unidades = c * n - av;
  const precoSug = item.preco_venda ? Math.round((item.preco_venda / n) * 100) / 100 : null;

  async function salvar() {
    setSalvando(true);
    const { error } = await supabase.rpc("desmembrar_item", {
      _item_id: item.id, _qtd_caixas: c, _unidades_por_caixa: n, _avariadas: av, _titulo: titulo, _preco_unit: preco ? lerNumero(preco) : null,
    });
    setSalvando(false);
    if (error) return toast.error(error.message);
    toast.success(`${unidades} unidades criadas.`);
    onFeito();
    onClose();
  }
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Desmembrar</DialogTitle>
          <DialogDescription>{item.titulo} · {item.quantidade} no lote</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <div><Label className="text-xs">Caixas/kits</Label><Input value={caixas} onChange={(e) => setCaixas(e.target.value)} /></div>
            <div><Label className="text-xs">Unidades por caixa</Label><Input value={porCaixa} onChange={(e) => setPorCaixa(e.target.value)} /></div>
            <div><Label className="text-xs">Quebradas/faltando</Label><Input value={avariadas} onChange={(e) => setAvariadas(e.target.value)} /></div>
          </div>
          <div><Label className="text-xs">Nome da unidade</Label><Input value={titulo} onChange={(e) => setTitulo(e.target.value)} /></div>
          <div>
            <Label className="text-xs">Preço por unidade (R$)</Label>
            <Input value={preco} onChange={(e) => setPreco(e.target.value)} placeholder={precoSug ? `sugerido ${fmtBRL(precoSug)}` : ""} />
          </div>
          <p className="text-sm">Resultado: <b>{unidades > 0 ? unidades : 0} unidades</b>. O custo das caixas é dividido só entre as unidades boas.</p>
          <Button onClick={salvar} disabled={salvando || unidades < 1 || c > item.quantidade} className="w-full">{salvando ? <Loader2 className="animate-spin" /> : "Desmembrar"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function AvariaDialog({ item, onClose, onFeito }: { item: Item; onClose: () => void; onFeito: () => void }) {
  const [qtd, setQtd] = useState("1");
  const [preco, setPreco] = useState(item.preco_venda ? String(Math.round(item.preco_venda * 0.6 * 100) / 100).replace(".", ",") : "");
  const [obs, setObs] = useState("");
  const [salvando, setSalvando] = useState(false);
  async function salvar() {
    setSalvando(true);
    const { error } = await supabase.rpc("avaria_parcial_item", { _item_id: item.id, _qtd: Number(qtd) || 0, _preco: lerNumero(preco), _obs: obs });
    setSalvando(false);
    if (error) return toast.error(error.message);
    toast.success("Avariado separado, com SKU e etiqueta próprios.");
    onFeito();
    onClose();
  }
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Avaria parcial</DialogTitle>
          <DialogDescription>Unidades que ainda vendem, mas por menos. Viram um item separado (grade AV).</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs">Quantas (de {item.quantidade})</Label><Input value={qtd} onChange={(e) => setQtd(e.target.value)} /></div>
            <div><Label className="text-xs">Preço do avariado (R$)</Label><Input value={preco} onChange={(e) => setPreco(e.target.value)} /></div>
          </div>
          <div><Label className="text-xs">O que tem de avaria (opcional)</Label><Input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: caixa amassada, risco na lateral" /></div>
          <p className="text-xs text-muted-foreground">Preço normal: {item.preco_venda ? fmtBRL(item.preco_venda) : "—"}. O avariado precisa custar menos.</p>
          <Button onClick={salvar} disabled={salvando} className="w-full">{salvando ? <Loader2 className="animate-spin" /> : "Separar avariado"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
