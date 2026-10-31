import { createFileRoute } from "@tanstack/react-router";
import { EmBreve } from "@/components/em-breve";

export const Route = createFileRoute("/_app/pdv")({ component: PaginaPdv });

function PaginaPdv() {
  return <EmBreve titulo="PDV" fase={1} itens={["Busca e leitor de código de barras", "Carrinho com desconto e pagamento misto", "Baixa automática de estoque", "Cupom em PDF 80 mm"]} />;
}