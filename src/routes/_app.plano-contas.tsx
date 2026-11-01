import { createFileRoute } from "@tanstack/react-router";
import { EmBreve } from "@/components/em-breve";

export const Route = createFileRoute("/_app/plano-contas")({ component: () => <EmBreve titulo="Plano de contas" fase={1} itens={["Receitas e despesas em níveis (ex.: 3.1.01)","Usado no financeiro e nos relatórios"]} /> });
