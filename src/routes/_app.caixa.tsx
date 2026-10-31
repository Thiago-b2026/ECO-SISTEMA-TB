import { createFileRoute } from "@tanstack/react-router";
import { EmBreve } from "@/components/em-breve";

export const Route = createFileRoute("/_app/caixa")({ component: PaginaCaixa });

function PaginaCaixa() {
  return <EmBreve titulo="Caixa" fase={1} itens={["Abertura, sangria e suprimento", "Fechamento cego com diferença de caixa", "Somente dinheiro entra no saldo da gaveta"]} />;
}