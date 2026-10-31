import { createFileRoute } from "@tanstack/react-router";
import { EmBreve } from "@/components/em-breve";

export const Route = createFileRoute("/_app/usuarios")({ component: PaginaUsuarios });

function PaginaUsuarios() {
  return <EmBreve titulo="Usuários" fase={1} itens={["Criar, editar e desativar usuários", "Definir perfil: admin, gerente, vendedor, estoquista"]} />;
}