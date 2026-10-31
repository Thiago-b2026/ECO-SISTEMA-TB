import { createFileRoute } from "@tanstack/react-router";
import { EmBreve } from "@/components/em-breve";

export const Route = createFileRoute("/_app/lotes")({ component: PaginaLotes });

function PaginaLotes() {
  return <EmBreve titulo="Lotes" fase={1} itens={["Cadastro do lote: origem, valor, frete, comissão", "Triagem dos itens e estado de cada um", "Rateio do custo do lote entre os itens", "Resultado por lote: custo, vendido, ROI"]} />;
}