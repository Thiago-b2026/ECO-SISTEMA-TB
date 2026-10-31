import { createFileRoute } from "@tanstack/react-router";
import { EmBreve } from "@/components/em-breve";

export const Route = createFileRoute("/_app/financeiro")({ component: PaginaFinanceiro });

function PaginaFinanceiro() {
  return <EmBreve titulo="Financeiro" fase={2} itens={["Contas a pagar e a receber", "Fluxo de caixa", "DRE simples do mês"]} />;
}