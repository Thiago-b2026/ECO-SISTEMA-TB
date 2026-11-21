import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { guardarCaptura, lerCapturaDoHash, type CapturaML } from "@/lib/captura-ml";
import { fmtBRL } from "@/lib/format";
import logoSimbolo from "@/assets/logo-simbolo.png";

// Recebe o anúncio enviado pelo botão "Enviar para o PDV" (favorito do navegador) e guarda neste navegador.
// Fica fora do layout logado de propósito: só guarda no próprio navegador; quem usa os dados é o "Inserir produto" (logado).
export const Route = createFileRoute("/capturar")({ component: Capturar });

function Capturar() {
  // lê o "#" já na primeira renderização (o efeito limpa o endereço e pode rodar duas vezes)
  const [captura, setCaptura] = useState<CapturaML | "erro">(() => lerCapturaDoHash(window.location.hash) ?? "erro");

  useEffect(() => {
    let fechar: ReturnType<typeof setTimeout> | undefined;
    const processar = (c: CapturaML | null) => {
      // tira os dados do endereço (não ficam no histórico)
      if (window.location.hash) history.replaceState(null, "", window.location.pathname);
      if (!c) return;
      guardarCaptura(c);
      setCaptura(c);
      // aba aberta pelo botão: fecha sozinha e o usuário volta para o anúncio
      clearTimeout(fechar);
      fechar = setTimeout(() => window.close(), 2500);
    };
    processar(captura === "erro" ? null : captura);
    // aba ainda aberta e novo envio: o botão só troca o "#" (a página não recarrega)
    const aoMudar = () => { const c = lerCapturaDoHash(window.location.hash); if (c) processar(c); };
    window.addEventListener("hashchange", aoMudar);
    return () => { clearTimeout(fechar); window.removeEventListener("hashchange", aoMudar); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="grid min-h-screen place-items-center bg-[radial-gradient(ellipse_at_top,_oklch(0.3_0.06_78),_oklch(0.1_0_0)_65%)] p-4">
      <div className="w-full max-w-md space-y-4 rounded-2xl bg-card p-6 shadow-2xl">
        <div className="flex items-center gap-2 font-semibold">
          <img src={logoSimbolo} alt="" className="size-8 rounded" /> Salvados LP · Enviar para o PDV
        </div>
        {captura === "erro" ? (
          <div className="flex gap-2 text-sm">
            <XCircle className="size-5 shrink-0 text-destructive" />
            <p>Não recebi um anúncio válido. Abra a página do anúncio no Mercado Livre e clique no favorito "Enviar para o PDV".</p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 font-medium text-success">
              <CheckCircle2 className="size-5" /> Anúncio enviado para o PDV
            </div>
            <div className="flex gap-3 rounded-lg border p-3">
              {captura.foto && <img src={captura.foto} alt="" className="size-16 shrink-0 rounded bg-white object-contain" />}
              <div className="min-w-0 text-sm">
                <div className="font-medium leading-snug">{captura.titulo}</div>
                <div className="mt-1">
                  {captura.preco_original != null && <span className="mr-2 text-xs text-muted-foreground line-through">{fmtBRL(captura.preco_original)}</span>}
                  <b>{captura.preco != null ? fmtBRL(captura.preco) : "sem preço"}</b>
                </div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Ele já aparece no "Inserir produto" do lote (se estiver aberto, entra sozinho). Esta aba fecha em instantes; se não fechar, pode fechar.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
