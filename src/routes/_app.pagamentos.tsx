import { createFileRoute } from "@tanstack/react-router";
import { EmBreve } from "@/components/em-breve";

export const Route = createFileRoute("/_app/pagamentos")({ component: () => <EmBreve titulo="Formas e meios de pagamento" fase={1} itens={["Formas (Dinheiro"," Pix"," Cartão…)","Meios (maquininha/bandeira"," taxa % e prazo de recebimento)","Usados no PDV e no financeiro"]} /> });
