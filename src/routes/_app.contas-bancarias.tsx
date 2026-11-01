import { createFileRoute } from "@tanstack/react-router";
import { EmBreve } from "@/components/em-breve";

export const Route = createFileRoute("/_app/contas-bancarias")({ component: () => <EmBreve titulo="Contas bancárias" fase={1} itens={["Banco"," agência"," conta e loja","Saldo inicial","Destino dos recebimentos dos meios de pagamento"]} /> });
