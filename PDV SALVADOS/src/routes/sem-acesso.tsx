import { createFileRoute, redirect } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { useAuth, homeRouteFor } from "@/lib/auth";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/sem-acesso")({
  beforeLoad: ({ context }) => {
    if (!context.auth.user) throw redirect({ to: "/login" });
    if (context.auth.role) throw redirect({ to: homeRouteFor(context.auth.role) });
  },
  component: SemAcesso,
});

function SemAcesso() {
  const { signOut, profile } = useAuth();
  return (
    <div className="min-h-screen grid place-items-center p-4 text-center">
      <div className="max-w-sm space-y-3">
        <ShieldAlert className="size-12 mx-auto text-warning" />
        <h1 className="text-xl font-bold">Usuário sem perfil</h1>
        <p className="text-sm text-muted-foreground">
          {profile?.email ?? "Seu usuário"} ainda não tem um perfil (admin, gerente, vendedor ou
          estoquista). Peça ao administrador para liberar seu acesso.
        </p>
        <Button variant="outline" onClick={signOut}>Sair</Button>
      </div>
    </div>
  );
}
