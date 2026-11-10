import { useEffect, useRef, useState } from "react";
import { Camera, Loader2 } from "lucide-react";
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const FORMATOS = [
  BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.ITF,
];

function mensagemErro(e: unknown): string {
  const nome = (e as { name?: string })?.name;
  if (nome === "NotAllowedError") return "A câmera foi bloqueada. Libere o acesso à câmera no navegador (ícone do cadeado ao lado do endereço) e tente de novo.";
  if (nome === "NotFoundError" || nome === "OverconstrainedError") return "Nenhuma câmera encontrada neste aparelho.";
  if (nome === "NotReadableError") return "A câmera está sendo usada por outro programa. Feche-o e tente de novo.";
  if (!window.isSecureContext) return "A câmera só funciona com o sistema aberto em https.";
  return "Não foi possível abrir a câmera: " + ((e as Error)?.message ?? "erro desconhecido");
}

/** Janela que abre a câmera (traseira, no celular) e devolve o código de barras lido. */
export function LeitorCameraDialog({ open, onClose, onLido }: { open: boolean; onClose: () => void; onLido: (codigo: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [abrindo, setAbrindo] = useState(true);

  useEffect(() => {
    if (!open) return;
    let controles: IScannerControls | null = null;
    let encerrado = false;
    setErro(null);
    setAbrindo(true);

    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, FORMATOS);
    const leitor = new BrowserMultiFormatReader(hints);

    // espera o <video> do diálogo existir
    const t = setTimeout(async () => {
      if (!video.current) return;
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("Este navegador não permite usar a câmera.");
        const c = await leitor.decodeFromConstraints(
          { video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } } },
          video.current,
          (resultado) => {
            if (!resultado || encerrado) return;
            encerrado = true;
            controles?.stop();
            navigator.vibrate?.(80);
            onLido(resultado.getText().trim());
            onClose();
          },
        );
        if (encerrado) c.stop();
        else controles = c;
      } catch (e) {
        setErro(mensagemErro(e));
      } finally {
        setAbrindo(false);
      }
    }, 50);

    return () => {
      encerrado = true;
      clearTimeout(t);
      controles?.stop();
    };
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ler código pela câmera</DialogTitle>
          <DialogDescription>Aponte a câmera para o código de barras do produto, bem iluminado.</DialogDescription>
        </DialogHeader>
        {erro ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{erro}</div>
        ) : (
          <div className="relative overflow-hidden rounded-md bg-black">
            <video ref={video} className="aspect-video w-full object-cover" muted playsInline />
            <div className="pointer-events-none absolute inset-x-6 top-1/2 h-0.5 -translate-y-1/2 bg-red-500/80" />
            {abrindo && (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-white">
                <Loader2 className="mr-2 size-4 animate-spin" /> Abrindo câmera…
              </div>
            )}
          </div>
        )}
        <Button variant="outline" onClick={onClose}>Fechar</Button>
      </DialogContent>
    </Dialog>
  );
}

/** Botão com ícone de câmera que abre o leitor. */
export function BotaoCamera({ onLido, className, rotulo }: { onLido: (codigo: string) => void; className?: string; rotulo?: string }) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <Button type="button" variant="outline" className={className} onClick={() => setAberto(true)} title="Ler código pela câmera">
        <Camera />{rotulo && <span>{rotulo}</span>}
      </Button>
      <LeitorCameraDialog open={aberto} onClose={() => setAberto(false)} onLido={onLido} />
    </>
  );
}
