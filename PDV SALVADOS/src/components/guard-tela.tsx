// Trava de tela: se o usuário não tem a tela marcada, mostra "Acesso negado" no lugar dela.
// Também mostra o aviso do modo de segurança (minhas_telas indisponível → acesso por perfil).
import { Link, Navigate, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { AlertTriangle, Loader2, ShieldX } from "lucide-react";
import { useAuth, homeRouteFor } from "@/lib/auth";
import { NAV, itemDaRota, itemVisivel, podeAbrirItem } from "@/lib/nav";
import { usePermissoes } from "@/lib/permissoes";
import { Button } from "@/components/ui/button";

export function AvisoModoLegado() {
  const { role } = useAuth();
  const { modoLegado } = usePermissoes();
  if (!modoLegado || role !== "admin") return null;
  return (
    <div className="no-print flex items-start gap-2 border-b border-warning/40 bg-warning/15 px-4 py-2 text-xs">
      <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" />
      <span>
        <b>Controle de acesso por tela ainda não ativado.</b> O sistema está usando o acesso antigo por perfil.
        Aplique a migration <code>20261108000017_permissao_por_tela.sql</code> no Supabase.
      </span>
    </div>
  );
}

export function AcessoNegado({ destino }: { destino?: { to: string; label: string } }) {
  return (
    <div className="grid min-h-[60vh] place-items-center p-6 text-center">
      <div className="max-w-sm space-y-3">
        <ShieldX className="mx-auto size-12 text-destructive" />
        <h1 className="text-xl font-bold">Acesso negado</h1>
        <p className="text-sm text-muted-foreground">
          Você não tem permissão para abrir esta tela. Se precisar dela, peça ao administrador para liberar em
          Cadastros → Login de acesso → Permissões.
        </p>
        {destino && (
          <Button asChild variant="outline">
            <Link to={destino.to}>Ir para {destino.label}</Link>
          </Button>
        )}
      </div>
    </div>
  );
}

export function GuardTela({ children }: { children: ReactNode }) {
  const { role } = useAuth();
  const perm = usePermissoes();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  if (perm.carregandoTelas) {
    return <div className="grid min-h-[40vh] place-items-center"><Loader2 className="animate-spin text-muted-foreground" /></div>;
  }
  const item = itemDaRota(pathname);
  if (!item || podeAbrirItem(item, perm)) return <>{children}</>;

  const primeira = NAV.find((n) => itemVisivel(n, perm));
  // Caiu na tela inicial do perfil mas ela não está liberada: vai para a primeira tela liberada.
  if (primeira && pathname === homeRouteFor(role)) return <Navigate to={primeira.to} replace />;
  return <AcessoNegado destino={primeira ? { to: primeira.to, label: primeira.label } : undefined} />;
}
