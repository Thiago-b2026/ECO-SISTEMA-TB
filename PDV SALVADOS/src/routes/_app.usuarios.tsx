import { createFileRoute, Navigate } from "@tanstack/react-router";

// A antiga tela "Login de acesso" agora fica dentro da pessoa (CADASTROS → Pessoas → aba LOGIN E PERMISSÕES).
// O endereço antigo abre Pessoas já com o filtro "Login de acesso".
export const Route = createFileRoute("/_app/usuarios")({
  component: () => <Navigate to="/pessoas" search={{ filtro: "usuario" }} replace />,
});
