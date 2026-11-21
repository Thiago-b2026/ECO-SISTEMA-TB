// Aviso de versão nova: o sistema é uma página que fica carregada; sem F5 a pessoa continua com o código antigo
// (foi assim que um produto duplicado passou depois da trava publicada). A cada 5 minutos e ao voltar para a aba,
// compara o arquivo principal publicado com o carregado; se mudou, mostra um aviso com "Atualizar".
import { toast } from "sonner";

const scriptAtual = () =>
  (document.querySelector('script[type="module"][src*="/assets/index-"]') as HTMLScriptElement | null)?.getAttribute("src") ?? null;

export function vigiarVersaoNova(intervaloMs = 5 * 60 * 1000) {
  if (import.meta.env.DEV) return; // em desenvolvimento o Vite já recarrega
  const carregado = scriptAtual();
  if (!carregado) return;
  let avisado = false;
  async function conferir() {
    if (avisado || document.visibilityState !== "visible") return;
    try {
      const html = await fetch(`/?v=${Date.now()}`, { cache: "no-store" }).then((r) => r.text());
      const publicado = html.match(/\/assets\/index-[^"']+\.js/)?.[0];
      if (publicado && publicado !== carregado) {
        avisado = true;
        toast.info("Saiu uma versão nova do sistema.", {
          description: "Atualize para usar as correções mais recentes (o que está na tela não se perde se já foi salvo).",
          duration: Infinity,
          action: { label: "Atualizar", onClick: () => window.location.reload() },
        });
      }
    } catch {
      /* sem internet: tenta na próxima */
    }
  }
  setInterval(conferir, intervaloMs);
  document.addEventListener("visibilitychange", conferir);
  window.addEventListener("focus", conferir);
}
