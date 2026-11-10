// Assinatura com o dedo (ou mouse). Gera um PNG.
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Eraser } from "lucide-react";
import { Botao } from "./base";

export interface AssinaturaRef {
  vazia: () => boolean;
  png: () => Promise<Blob | null>;
  limpar: () => void;
}

export const Assinatura = forwardRef<AssinaturaRef, { rotulo?: string }>(function Assinatura({ rotulo = "Assine aqui" }, ref) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const desenhando = useRef(false);
  const [vazia, setVazia] = useState(true);

  useEffect(() => {
    const c = canvas.current!;
    const ajustar = () => {
      const r = c.getBoundingClientRect();
      c.width = Math.round(r.width * devicePixelRatio);
      c.height = Math.round(r.height * devicePixelRatio);
      const ctx = c.getContext("2d");
      if (!ctx) return; // navegador sem canvas
      ctx.scale(devicePixelRatio, devicePixelRatio);
      ctx.lineWidth = 2.5;
      ctx.lineCap = "round";
      ctx.strokeStyle = "#111";
      setVazia(true);
    };
    ajustar();
  }, []);

  const ponto = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  useImperativeHandle(ref, () => ({
    vazia: () => vazia,
    limpar: () => {
      const c = canvas.current!;
      c.getContext("2d")?.clearRect(0, 0, c.width, c.height);
      setVazia(true);
    },
    png: () => new Promise((res) => (vazia ? res(null) : canvas.current!.toBlob((b) => res(b), "image/png"))),
  }), [vazia]);

  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm font-semibold">
        <span>{rotulo}</span>
        <Botao type="button" variante="fantasma" onClick={() => { const c = canvas.current!; c.getContext("2d")?.clearRect(0, 0, c.width, c.height); setVazia(true); }}>
          <Eraser className="size-5" aria-hidden /> Limpar
        </Botao>
      </div>
      <canvas
        ref={canvas}
        aria-label={rotulo}
        role="img"
        className="h-40 w-full touch-none rounded-lg border-2 border-dashed border-gray-400 bg-white"
        onPointerDown={(e) => {
          desenhando.current = true;
          (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
          const ctx = canvas.current!.getContext("2d");
          if (!ctx) return;
          const p = ponto(e);
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
        }}
        onPointerMove={(e) => {
          if (!desenhando.current) return;
          const ctx = canvas.current!.getContext("2d");
          if (!ctx) return;
          const p = ponto(e);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
          if (vazia) setVazia(false);
        }}
        onPointerUp={() => { desenhando.current = false; }}
        onPointerCancel={() => { desenhando.current = false; }}
      />
      <p className="mt-1 text-xs text-gray-600">{vazia ? "Ainda não assinado." : "Assinatura feita."}</p>
    </div>
  );
});
