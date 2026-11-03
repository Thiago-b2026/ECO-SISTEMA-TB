import { createFileRoute } from "@tanstack/react-router";
import { ExternalLink, MonitorSmartphone, ShoppingCart } from "lucide-react";
import { useLoja } from "@/lib/loja";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_app/pdv")({ component: AbrirFrente });

/** Abre a frente de loja numa janela própria (só caixa, sem o menu do sistema). */
export function abrirJanelaFrente() {
  const w = window.open("/frente", "eco-frente-de-loja", "popup=yes,width=1366,height=800");
  if (!w) window.location.href = "/frente";
  else w.focus();
}

function AbrirFrente() {
  const { lojas, filtroLoja } = useLoja();
  const loja = lojas.find((l) => l.id === filtroLoja);
  return (
    <div className="min-h-[calc(100vh-3.5rem)] lg:min-h-screen grid place-items-center p-4">
      <Card className="w-full max-w-lg p-8 space-y-5 text-center">
        <div className="mx-auto size-16 rounded-2xl bg-primary grid place-items-center"><ShoppingCart className="size-8 text-primary-foreground" /></div>
        <div>
          <h1 className="text-2xl font-bold">Frente de loja</h1>
          <p className="text-sm text-muted-foreground">{loja ? `Loja ${loja.nome}` : "Escolha uma loja em \"Loja atual\" no menu antes de abrir."}</p>
        </div>
        <Button className="w-full h-14 text-lg" disabled={!filtroLoja} onClick={abrirJanelaFrente}><ExternalLink /> Abrir frente de loja</Button>
        <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
          <MonitorSmartphone className="size-4" /> Abre numa janela só do caixa: abertura, vendas, sangria, suprimento e fechamento, com impressão dos comprovantes.
        </p>
      </Card>
    </div>
  );
}
