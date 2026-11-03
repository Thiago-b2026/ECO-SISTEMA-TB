// Transferir itens deste lote para outro lote "Em criação".
import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import type { Item, Lote, Pallet } from "@/lib/lotes";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function TransferirLoteDialog({ lote, itens, pallets, onClose, onFeito }: { lote: Lote; itens: Item[]; pallets: Pallet[]; onClose: () => void; onFeito: () => void }) {
  const [destinos, setDestinos] = useState<{ id: string; nome: string }[]>([]);
  const [destino, setDestino] = useState("");
  const [palletsDest, setPalletsDest] = useState<Pallet[]>([]);
  const [palletDest, setPalletDest] = useState("");
  const [fPallet, setFPallet] = useState("");
  const [busca, setBusca] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    supabase.from("lotes").select("id, nome").eq("status", "em_criacao").neq("id", lote.id).order("created_at", { ascending: false })
      .then(({ data }) => setDestinos(data ?? []));
  }, [lote.id]);
  useEffect(() => {
    setPalletDest("");
    if (destino) supabase.from("pallets").select("*").eq("lote_id", destino).order("codigo").then(({ data }) => setPalletsDest((data ?? []) as Pallet[]));
  }, [destino]);

  const visiveis = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return itens.filter((i) => (!fPallet || i.pallet_id === fPallet) && (!t || i.titulo.toLowerCase().includes(t) || i.sku.toLowerCase().includes(t)));
  }, [itens, busca, fPallet]);

  async function transferir() {
    if (!destino || sel.size === 0) return toast.error("Escolha o lote de destino e os itens.");
    setSalvando(true);
    const { data, error } = await supabase.rpc("transferir_itens_lote", { _item_ids: [...sel], _lote_destino: destino, _pallet_destino: palletDest || null });
    setSalvando(false);
    if (error) return toast.error(error.message);
    toast.success(`${data} itens transferidos.`);
    onFeito();
    onClose();
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Transferir itens para outro lote</DialogTitle>
          <DialogDescription>Só lotes "Em criação" e itens que ainda não foram lançados no estoque.</DialogDescription>
        </DialogHeader>
        {lote.status !== "em_criacao" ? <p className="text-sm text-destructive">Este lote não está "Em criação".</p> : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <select value={destino} onChange={(e) => setDestino(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm">
                <option value="">Lote de destino…</option>
                {destinos.map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}
              </select>
              <select value={palletDest} onChange={(e) => setPalletDest(e.target.value)} disabled={!destino} className="h-9 rounded-md border bg-background px-2 text-sm">
                <option value="">Sem pallet no destino</option>
                {palletsDest.map((p) => <option key={p.id} value={p.id}>{p.codigo}</option>)}
              </select>
            </div>
            <div className="flex gap-2">
              <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Filtrar itens…" />
              <select value={fPallet} onChange={(e) => setFPallet(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm">
                <option value="">Todos os pallets</option>
                {pallets.map((p) => <option key={p.id} value={p.id}>{p.codigo}</option>)}
              </select>
              <Button variant="outline" onClick={() => setSel(new Set([...sel, ...visiveis.map((i) => i.id)]))}>Marcar filtrados</Button>
            </div>
            <div className="max-h-72 overflow-y-auto divide-y rounded border text-sm">
              {visiveis.map((i) => (
                <label key={i.id} className="flex items-center gap-2 p-2">
                  <input type="checkbox" className="size-4 accent-primary" checked={sel.has(i.id)} onChange={() => setSel((s) => { const n = new Set(s); n.has(i.id) ? n.delete(i.id) : n.add(i.id); return n; })} />
                  <span className="flex-1">{i.titulo}</span><span className="text-xs text-muted-foreground">{i.quantidade} un. · {i.sku}</span>
                </label>
              ))}
            </div>
            <Button onClick={transferir} disabled={salvando} className="w-full">{salvando ? <Loader2 className="animate-spin" /> : `Transferir ${sel.size} item(ns)`}</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
