import { createFileRoute } from "@tanstack/react-router";
import { MercadoLivreConfig } from "@/components/mercado-livre-config";

// Endereço de retorno da conexão com o ML (?ml=ok). A tela também aparece como aba em Lotes.
export const Route = createFileRoute("/_app/mercado-livre")({ component: () => (
  <div className="p-4 lg:p-6 space-y-4">
    <h1 className="text-2xl font-bold">Lotes · Configuração Mercado Livre</h1>
    <MercadoLivreConfig />
  </div>
) });
