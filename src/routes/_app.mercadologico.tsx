import { createFileRoute } from "@tanstack/react-router";
import { EmBreve } from "@/components/em-breve";

export const Route = createFileRoute("/_app/mercadologico")({ component: () => <EmBreve titulo="Mercadológico" fase={1} itens={["Árvore Departamento → Categoria → Subcategoria"," vinda do Mercado Livre e das planilhas","Usada nos produtos"," nas etiquetas e nos relatórios"]} /> });
