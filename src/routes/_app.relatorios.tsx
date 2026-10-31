import { createFileRoute } from "@tanstack/react-router";
import { EmBreve } from "@/components/em-breve";

export const Route = createFileRoute("/_app/relatorios")({ component: PaginaRelatorios });

function PaginaRelatorios() {
  return <EmBreve titulo="Relatórios" fase={1} itens={["Faturamento, ticket, formas de pagamento", "Lucro e margem por lote e categoria", "Curva ABC e itens parados"]} />;
}