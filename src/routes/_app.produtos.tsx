import { createFileRoute } from "@tanstack/react-router";
import { EmBreve } from "@/components/em-breve";

export const Route = createFileRoute("/_app/produtos")({ component: PaginaProdutos });

function PaginaProdutos() {
  return <EmBreve titulo="Produtos e estoque" fase={1} itens={["Cadastro e importação de produtos", "Custo, estoque, lote de origem e localização", "Movimentações: entrada, venda, ajuste, perda"]} />;
}