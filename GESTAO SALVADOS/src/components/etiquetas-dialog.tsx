// "Pré-visualização da Etiqueta": escolhe a impressora (tamanho), mostra a etiqueta em tamanho real e imprime.
import { useEffect, useMemo, useState } from "react";
import { Printer } from "lucide-react";
import { toast } from "sonner";
import { carregarModelos, htmlEtiquetas, imprimirEtiquetas, registrarImpressao, MODELOS_ETIQUETA, type DadosEtiqueta, type ModeloEtiqueta } from "@/lib/etiquetas";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/** A prévia mostra no máximo estas etiquetas (a impressão sai completa). */
const MAX_PREVIA = 24;
const CHAVE = "eco.modeloEtiqueta";

export function EtiquetasDialog({ open, onOpenChange, itens, loja, onImpresso }: {
  open: boolean; onOpenChange: (v: boolean) => void; itens: DadosEtiqueta[]; loja?: string;
  /** Chamado com os produtos que tiveram etiqueta impressa (já registrada no banco). */
  onImpresso?: (produtoIds: string[]) => void;
}) {
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
    if (!imprimirEtiquetas(lista, m, loja)) return toast.error("O navegador bloqueou a janela de impressão. Permita pop-ups para este site.");
    onOpenChange(false);
    // registra a impressão (etiqueta de produto do cadastro conta como movimento; a do lote soma em "x/y impressos")
    registrarImpressao(lista).then((erro) => {
      if (erro) return toast.warning("Etiquetas enviadas para impressão, mas o registro não foi gravado: " + erro);
      onImpresso?.(lista.map((i) => i.produto_id ?? i.lote_item_id).filter((x): x is string => !!x));
    });
  }

  const total = itens.reduce((s, i) => s + (copias === "uma" ? 1 : Math.max(1, i.copias)), 0);
  const m = modelos.find((x) => x.id === modelo) ?? modelos[0];
  const largura = m.largura * m.porLinha + m.espaco * (m.porLinha - 1);
  const naPrevia = Math.min(total, MAX_PREVIA);
  const linhas = Math.max(1, Math.ceil(naPrevia / m.porLinha));
  const html = useMemo(() => {
    if (!open) return "";
    const lista: DadosEtiqueta[] = [];
    let falta = MAX_PREVIA;
    for (const i of itens) {
      if (falta <= 0) break;
      const n = Math.min(falta, copias === "uma" ? 1 : Math.max(1, i.copias));
      lista.push({ ...i, copias: n });
      falta -= n;
    }
    return htmlEtiquetas(lista, m, loja, { imprimir: false, previa: true });
  }, [open, itens, copias, m, loja]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[95vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Pré-visualização da Etiqueta</DialogTitle>
          <DialogDescription>{itens.length} produto(s) · {total} etiqueta(s)</DialogDescription>
        </DialogHeader>
        <div className="min-w-0 space-y-3">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            Impressora:
            <select value={modelo} onChange={(e) => setModelo(e.target.value)} className="h-9 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm text-foreground">
              {modelos.map((x) => <option key={x.id} value={x.id}>{x.personalizado ? "★ " : ""}{x.nome}</option>)}
            </select>
          </label>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant={copias === "estoque" ? "default" : "outline"} onClick={() => setCopias("estoque")}>Uma por unidade</Button>
            <Button type="button" size="sm" variant={copias === "uma" ? "default" : "outline"} onClick={() => setCopias("uma")}>Uma por produto</Button>
          </div>
          <div className="h-60 overflow-auto rounded-xl bg-neutral-800 p-2">
            <iframe title="Prévia da etiqueta" srcDoc={html} className="mx-auto block bg-white" style={{ width: `${largura}mm`, height: `${linhas * m.altura}mm`, border: 0, maxWidth: "none" }} />
          </div>
          <p className="text-center text-xs text-muted-foreground">
            Tamanho real: {m.largura}mm × {m.altura}mm{total > naPrevia ? ` · prévia das ${naPrevia} primeiras` : ""}
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={imprimir}><Printer /> Imprimir</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
