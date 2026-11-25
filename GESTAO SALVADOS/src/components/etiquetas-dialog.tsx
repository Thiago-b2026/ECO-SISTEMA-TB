// "Pré-visualização da Etiqueta": escolhe a impressora (tamanho), mostra a etiqueta em tamanho real e imprime.
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Printer, Ruler } from "lucide-react";
import { toast } from "sonner";
import {
  carregarModelos, htmlEtiquetas, imprimirEtiquetas, imprimirTeste, larguraPagina, lerAjuste, modeloSalvo, registrarImpressao, salvarAjuste, salvarModelo,
  MODELOS_ETIQUETA, type DadosEtiqueta, type ModeloEtiqueta,
} from "@/lib/etiquetas";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** A prévia mostra no máximo estas etiquetas (a impressão sai completa). */
const MAX_PREVIA = 24;
const BLOQUEADO = "O navegador bloqueou a janela de impressão. Permita pop-ups para este site.";

export function EtiquetasDialog({ open, onOpenChange, itens, loja, onImpresso }: {
  open: boolean; onOpenChange: (v: boolean) => void; itens: DadosEtiqueta[]; loja?: string;
  /** Chamado com os produtos que tiveram etiqueta impressa (já registrada no banco). */
  onImpresso?: (produtoIds: string[]) => void;
}) {
  const [modelos, setModelos] = useState<ModeloEtiqueta[]>(MODELOS_ETIQUETA);
  const [modelo, setModelo] = useState(""); // "" = este computador ainda não escolheu
  const [copias, setCopias] = useState<"estoque" | "uma">("estoque");
  const [verAjuste, setVerAjuste] = useState(false);
  const [ajuste, setAjuste] = useState({ x: "0", y: "0" });
  useEffect(() => {
    if (!open) return;
    carregarModelos().then((ms) => {
      setModelos(ms);
      const salvo = modeloSalvo();
      setModelo(salvo && ms.some((m) => m.id === salvo) ? salvo : "");
    });
  }, [open]);
  useEffect(() => {
    const aj = lerAjuste(modelo);
    setAjuste({ x: String(aj.x), y: String(aj.y) });
  }, [open, modelo]);

  const m = modelos.find((x) => x.id === modelo) ?? MODELOS_ETIQUETA[0];

  function imprimir() {
    if (!modelo) return toast.error("Escolha a impressora (tamanho da etiqueta) antes de imprimir.");
    salvarModelo(modelo);
    const lista = itens.map((i) => ({ ...i, copias: copias === "uma" ? 1 : i.copias }));
    if (!imprimirEtiquetas(lista, m, loja)) return toast.error(BLOQUEADO);
    onOpenChange(false);
    // registra a impressão (etiqueta de produto do cadastro conta como movimento; a do lote soma em "x/y impressos")
    registrarImpressao(lista).then((erro) => {
      if (erro) return toast.warning("Etiquetas enviadas para impressão, mas o registro não foi gravado: " + erro);
      onImpresso?.(lista.map((i) => i.produto_id ?? i.lote_item_id).filter((x): x is string => !!x));
    });
  }

  function teste() {
    if (!modelo) return toast.error("Escolha a impressora (tamanho da etiqueta) antes do teste.");
    salvarModelo(modelo);
    if (!imprimirTeste(m)) toast.error(BLOQUEADO);
  }

  function mudarAjuste(k: "x" | "y", v: string) {
    const novo = { ...ajuste, [k]: v };
    setAjuste(novo);
    const n = (t: string) => Number(t.replace(",", ".")) || 0;
    if (modelo) salvarAjuste(modelo, { x: n(novo.x), y: n(novo.y) });
  }

  const total = itens.reduce((s, i) => s + (copias === "uma" ? 1 : Math.max(1, i.copias)), 0);
  const largura = larguraPagina(m);
  const naPrevia = Math.min(total, MAX_PREVIA);
  const linhas = Math.max(1, Math.ceil(naPrevia / m.porLinha));
  const html = useMemo(() => {
    if (!open || !modelo) return "";
    const lista: DadosEtiqueta[] = [];
    let falta = MAX_PREVIA;
    for (const i of itens) {
      if (falta <= 0) break;
      const n = Math.min(falta, copias === "uma" ? 1 : Math.max(1, i.copias));
      lista.push({ ...i, copias: n });
      falta -= n;
    }
    return htmlEtiquetas(lista, m, loja, { imprimir: false, previa: true });
  }, [open, itens, copias, m, modelo, loja]);

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
              <option value="" disabled>Escolha a impressora deste computador…</option>
              {modelos.map((x) => <option key={x.id} value={x.id}>{x.personalizado ? "★ " : ""}{x.nome}</option>)}
            </select>
          </label>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant={copias === "estoque" ? "default" : "outline"} onClick={() => setCopias("estoque")}>Uma por unidade</Button>
            <Button type="button" size="sm" variant={copias === "uma" ? "default" : "outline"} onClick={() => setCopias("uma")}>Uma por produto</Button>
          </div>
          {modelo ? (
            <>
              <div className="h-60 overflow-auto rounded-xl bg-neutral-800 p-2">
                <iframe title="Prévia da etiqueta" srcDoc={html} className="mx-auto block bg-white" style={{ width: `${largura}mm`, height: `${linhas * m.altura}mm`, border: 0, maxWidth: "none" }} />
              </div>
              <p className="text-center text-xs text-muted-foreground">
                Tamanho real: {m.largura}mm × {m.altura}mm{m.porLinha > 1 ? ` · ${m.porLinha} por linha` : ""}{total > naPrevia ? ` · prévia das ${naPrevia} primeiras` : ""}
                <br />Papel na impressora (Windows): <b className="text-foreground">{largura} × {m.altura} mm</b> (rolo inteiro)
              </p>
            </>
          ) : (
            <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              Escolha o tamanho da etiqueta que está na impressora deste computador. Rolo com 2 etiquetas lado a lado: use um modelo "2 por linha".
            </p>
          )}

          <div className="rounded-md border">
            <button type="button" onClick={() => setVerAjuste((v) => !v)} className="flex w-full items-center justify-between p-2 text-sm">
              <span className="flex items-center gap-2"><Ruler className="size-4" /> Saiu torta, cortada ou no meio? Teste e ajuste</span>
              {verAjuste ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
            </button>
            {verAjuste && (
              <div className="space-y-2 border-t p-2 text-xs">
                {m.porLinha > 1 && modelo && (
                  <p className="rounded bg-warning/15 p-2 text-foreground">
                    Saiu <b>pequena e no meio do rolo</b>? O papel da impressora está com a largura de <b>uma etiqueta só</b> ({m.largura} mm). Trocar o modelo aqui não resolve: crie no Windows
                    um papel com a linha inteira, <b>{largura} × {m.altura} mm</b> (passo 1).
                  </p>
                )}
                <ol className="list-decimal space-y-1 pl-4 text-muted-foreground">
                  <li>Windows → Painel de Controle → Dispositivos e Impressoras → botão direito na impressora → <b>Preferências de impressão</b>.</li>
                  <li>Aba <b>Configuração de página</b> → <b>Novo</b> (não apague o que já existe): largura <b className="text-foreground">{modelo ? `${largura} mm` : "da linha inteira do rolo"}</b>,
                    altura <b className="text-foreground">{modelo ? `${m.altura} mm` : "de uma etiqueta"}</b>. Deixe esse papel <b>selecionado</b> e clique em Aplicar: o Chrome usa o papel que estiver selecionado aqui.</li>
                  <li>Aba <b>Papel de etiquetas</b>: tipo de mídia com <b>intervalo (gap)</b> e altura do intervalo igual ao espaço entre as linhas (perto de 3 mm). Depois calibre: segure o botão Feed até a impressora avançar algumas etiquetas.</li>
                  <li>Feche o Chrome <b>inteiro</b>, abra de novo e clique em <b>Imprimir teste</b>. Na janela: essa impressora e, se aparecer, Tamanho do papel = o novo, Escala = Padrão. Cada moldura deve cair em cima de uma etiqueta.</li>
                  <li>Só se ficar 1 a 3 mm fora, use o ajuste abaixo (vale só para este modelo, neste computador).</li>
                </ol>
                <div className="grid grid-cols-2 gap-2">
                  <label>Direita (+) / esquerda (−), mm<Input value={ajuste.x} onChange={(e) => mudarAjuste("x", e.target.value)} inputMode="decimal" /></label>
                  <label>Baixo (+) / cima (−), mm<Input value={ajuste.y} onChange={(e) => mudarAjuste("y", e.target.value)} inputMode="decimal" /></label>
                </div>
                <Button type="button" size="sm" variant="outline" onClick={teste} disabled={!modelo}><Ruler /> Imprimir teste (3 linhas de molduras)</Button>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={imprimir} disabled={!modelo}><Printer /> Imprimir</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
