import { createFileRoute } from "@tanstack/react-router";
import { EmBreve } from "@/components/em-breve";

export const Route = createFileRoute("/_app/vendas")({ component: PaginaVendas });

function PaginaVendas() {
  return <EmBreve titulo="Vendas" fase={1} itens={["Lista por período (data_venda)", "Detalhes e cancelamento com motivo", "Troca e devolução com retorno ao estoque"]} />;
}