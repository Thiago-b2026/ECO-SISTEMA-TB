// Instruções da extensão do Chrome e lista de anúncios recebidos pelo navegador.
import { useEffect, useState } from "react";
import { ChevronDown, Copy, Download, Puzzle, X } from "lucide-react";
import { toast } from "sonner";
import { listarCapturas, ouvirCapturas, removerCaptura, type CapturaML } from "@/lib/captura-ml";
import { fmtBRL } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Como instalar a extensão do Chrome (uma vez por computador). */
export function InstalarExtensao({ aberto: abertoInicial = false }: { aberto?: boolean }) {
  const [aberto, setAberto] = useState(abertoInicial);
  async function copiar() {
    try {
      await navigator.clipboard.writeText("chrome://extensions");
      toast.success("Copiado. Cole na barra de endereço do Chrome.");
    } catch {
      toast.error("Não foi possível copiar. Digite chrome://extensions na barra de endereço.");
    }
  }
  return (
    <div className="rounded-md border bg-muted/30 text-sm">
      <button type="button" onClick={() => setAberto((v) => !v)} className="flex w-full items-center gap-2 p-2 text-left font-medium">
        <Puzzle className="size-4 text-primary" /> Instale a extensão para o link trazer o anúncio exato (uma vez por computador)
        <ChevronDown className={cn("ml-auto size-4 transition-transform", aberto && "rotate-180")} />
      </button>
      {aberto && (
        <div className="space-y-2 border-t p-3">
          <ol className="list-decimal space-y-1.5 pl-5 text-xs">
            <li>
              <a href="/extensao-salvados-lp.zip" download className="inline-flex items-center gap-1 font-semibold text-primary underline"><Download className="size-3.5" /> Baixe a extensão</a>{" "}
              e descompacte (botão direito no arquivo → Extrair tudo).
            </li>
            <li>
              No Chrome, abra <code className="rounded bg-muted px-1">chrome://extensions</code>{" "}
              <Button type="button" size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={copiar}><Copy className="size-3" /> copiar</Button>
            </li>
            <li>Ligue o <b>Modo do desenvolvedor</b> (canto de cima, à direita).</li>
            <li>Clique em <b>Carregar sem compactação</b> e escolha a pasta descompactada.</li>
            <li>Volte aqui e aperte F5. Pronto: é só colar o link e buscar.</li>
          </ol>
          <p className="text-xs text-muted-foreground">
            Ao buscar um link, o PDV abre o anúncio numa aba por 2 ou 3 segundos, lê nome, preço, preço "de" e foto, e fecha a aba.
            Se o navegador avisar de pop-up bloqueado, clique em "Sempre permitir" para este site. Funciona no Chrome e no Edge do computador.
          </p>
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
      <div className="text-xs font-medium text-muted-foreground">RECEBIDOS DO MERCADO LIVRE PELO NAVEGADOR</div>
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
