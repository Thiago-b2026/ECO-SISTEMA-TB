import { useEffect, useState } from "react";
import { Printer } from "lucide-react";
import { toast } from "sonner";
import { carregarModelos, imprimirEtiquetas, MODELOS_ETIQUETA, type DadosEtiqueta, type ModeloEtiqueta } from "@/lib/etiquetas";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

const CHAVE = "eco.modeloEtiqueta";

export function EtiquetasDialog({ open, onOpenChange, itens, loja }: { open: boolean; onOpenChange: (v: boolean) => void; itens: DadosEtiqueta[]; loja?: string }) {
  const [modelos, setModelos] = useState<ModeloEtiqueta[]>(MODELOS_ETIQUETA);
  const [modelo, setModelo] = useState(MODELOS_ETIQUETA[0].id);
  const [copias, setCopias] = useState<"estoque" | "uma">("estoque");
  useEffect(() => {
    if (!open) return;
    carregarModelos().then((ms) => {
      setModelos(ms);
      let salvo: string | null = null;
      try { salvo = localStorage.getItem(CHAVE); } catch { /* sem storage */ }
      setModelo(salvo && ms.some((m) => m.id === salvo) ? salvo : ms[0].id);
    });
  }, [open]);

  function imprimir() {
    const m = modelos.find((x) => x.id === modelo)!;
    try { localStorage.setItem(CHAVE, modelo); } catch { /* sem storage */ }
    const lista = itens.map((i) => ({ ...i, copias: copias === "uma" ? 1 : i.copias }));
    if (!imprimirEtiquetas(lista, m, loja)) toast.error("O navegador bloqueou a janela de impressão. Permita pop-ups para este site.");
    else onOpenChange(false);
  }

  const total = itens.reduce((s, i) => s + (copias === "uma" ? 1 : Math.max(1, i.copias)), 0);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Imprimir etiquetas</DialogTitle>
          <DialogDescription>{itens.length} produto(s) · {total} etiqueta(s)</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Modelo</Label>
            <select value={modelo} onChange={(e) => setModelo(e.target.value)} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
              {modelos.map((m) => <option key={m.id} value={m.id}>{m.personalizado ? "★ " : ""}{m.nome}</option>)}
            </select>
          </div>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant={copias === "estoque" ? "default" : "outline"} onClick={() => setCopias("estoque")}>Uma por unidade</Button>
            <Button type="button" size="sm" variant={copias === "uma" ? "default" : "outline"} onClick={() => setCopias("uma")}>Uma por produto</Button>
          </div>
          <Button onClick={imprimir} className="w-full h-11"><Printer /> Imprimir</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
