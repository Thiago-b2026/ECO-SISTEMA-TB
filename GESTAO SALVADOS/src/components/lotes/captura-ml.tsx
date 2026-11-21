// Botão "Enviar para o PDV" (favorito do navegador) e lista de anúncios capturados.
import { useEffect, useRef, useState } from "react";
import { Bookmark, ChevronDown, Copy, MousePointerClick, X } from "lucide-react";
import { toast } from "sonner";
import { codigoDoBotao, listarCapturas, ouvirCapturas, removerCaptura, type CapturaML } from "@/lib/captura-ml";
import { fmtBRL } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Link arrastável para a barra de favoritos + instruções. */
export function InstalarBotaoCaptura({ aberto: abertoInicial = false }: { aberto?: boolean }) {
  const [aberto, setAberto] = useState(abertoInicial);
  const ref = useRef<HTMLAnchorElement>(null);
  const codigo = codigoDoBotao(window.location.origin);
  // O React bloqueia "javascript:" no href; o favorito precisa dele, então vai direto no elemento.
  useEffect(() => {
    ref.current?.setAttribute("href", codigo);
  }, [codigo, aberto]);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(codigo);
      toast.success("Código copiado. Crie um favorito e cole no campo URL.");
    } catch {
      toast.error("Não foi possível copiar.");
    }
  }

  return (
    <div className="rounded-md border bg-muted/30 text-sm">
      <button type="button" onClick={() => setAberto((v) => !v)} className="flex w-full items-center gap-2 p-2 text-left font-medium">
        <Bookmark className="size-4 text-primary" /> Botão "Enviar para o PDV" (pega o anúncio exato, mesmo quando o ML bloqueia)
        <ChevronDown className={cn("ml-auto size-4 transition-transform", aberto && "rotate-180")} />
      </button>
      {aberto && (
        <div className="space-y-2 border-t p-3">
          <ol className="list-decimal space-y-1 pl-5 text-xs">
            <li>Mostre a barra de favoritos do navegador (Ctrl + Shift + B).</li>
            <li>
              <b>Arraste</b> este botão para a barra de favoritos:{" "}
              <a
                ref={ref}
                onClick={(e) => { e.preventDefault(); toast.info("Arraste o botão para a barra de favoritos. Clicar aqui não faz nada."); }}
                className="mx-1 inline-flex cursor-grab items-center gap-1 rounded-md bg-primary px-2 py-1 font-semibold text-primary-foreground shadow"
              >
                <MousePointerClick className="size-3.5" /> Enviar para o PDV
              </a>
            </li>
            <li>Abra o anúncio no Mercado Livre (no computador) e clique no favorito <b>Enviar para o PDV</b>.</li>
            <li>O produto entra aqui sozinho, com nome, preço, preço "de" e foto exatos.</li>
          </ol>
          <p className="text-xs text-muted-foreground">
            Não deu para arrastar? Crie um favorito qualquer, edite e cole no campo URL o código:{" "}
            <Button type="button" size="sm" variant="outline" className="h-7" onClick={copiar}><Copy /> Copiar código</Button>
          </p>
          <p className="text-xs text-muted-foreground">Funciona no Chrome e no Edge do computador. Os dados vêm da página que você está vendo; nada é enviado para fora do sistema.</p>
        </div>
      )}
    </div>
  );
}

/** Anúncios capturados neste navegador, para usar no lote. */
export function CapturasRecentes({ onUsar }: { onUsar: (c: CapturaML) => void }) {
  const [lista, setLista] = useState<CapturaML[]>(() => listarCapturas());
  useEffect(() => ouvirCapturas(() => setLista(listarCapturas())), []);
  if (lista.length === 0) return null;
  return (
    <div className="space-y-1">
      <div className="text-xs font-medium text-muted-foreground">ENVIADOS DO MERCADO LIVRE (botão "Enviar para o PDV")</div>
      <ul className="max-h-56 divide-y overflow-y-auto rounded-md border">
        {lista.map((c) => (
          <li key={c.link} className="flex items-center gap-2 p-2">
            {c.foto ? <img src={c.foto} alt="" className="size-10 shrink-0 rounded bg-white object-contain" /> : <div className="size-10 shrink-0 rounded bg-muted" />}
            <div className="min-w-0 flex-1 text-xs">
              <div className="line-clamp-2 font-medium">{c.titulo}</div>
              <div>
                {c.preco_original != null && <span className="mr-1 text-muted-foreground line-through">{fmtBRL(c.preco_original)}</span>}
                <b>{c.preco != null ? fmtBRL(c.preco) : "sem preço"}</b>
              </div>
            </div>
            <Button type="button" size="sm" onClick={() => onUsar(c)}>Usar</Button>
            <button type="button" title="Tirar da lista" className="text-muted-foreground hover:text-foreground" onClick={() => { removerCaptura(c.link); setLista(listarCapturas()); }}>
              <X className="size-4" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
