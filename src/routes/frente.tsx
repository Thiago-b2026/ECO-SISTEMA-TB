import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LogOut, Monitor, Store, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { LojaProvider, TODAS, useLoja } from "@/lib/loja";
import { fmtDate } from "@/lib/format";
import { lerTerminal, salvarTerminal } from "@/lib/terminal";
import { Button } from "@/components/ui/button";
import { PdvTela } from "@/components/pdv-tela";
import { EscolherEmpresa } from "@/components/escolher-empresa";
import { PermissoesProvider } from "@/lib/permissoes";

// Janela própria da frente de loja: só o caixa, sem o menu do sistema.
export const Route = createFileRoute("/frente")({
  beforeLoad: ({ context }) => {
    const { user, role } = context.auth;
    if (!user) throw redirect({ to: "/login" });
    if (!role || !["admin", "gerente", "vendedor"].includes(role)) throw redirect({ to: "/sem-acesso" });
  },
  component: () => (
    <LojaProvider>
      <Frente />
    </LojaProvider>
  ),
});

function Frente() {
  const { profile, signOut } = useAuth();
  const { lojas, lojaAtual, setLojaAtual, filtroLoja, podeTrocar, precisaEscolher } = useLoja();
  const [agora, setAgora] = useState(new Date());
  const [terminal, setTerminal] = useState(lerTerminal());
  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), 30000);
    return () => clearInterval(t);
  }, []);
  const loja = lojas.find((l) => l.id === filtroLoja);

  function renomearTerminal() {
    const n = window.prompt("Nome deste terminal (ex.: CAIXA 01):", terminal)?.trim();
    if (n) { salvarTerminal(n); setTerminal(n); }
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b bg-sidebar text-sidebar-foreground px-3 py-2 text-sm">
        <div className="flex items-center gap-2 font-bold"><Store className="size-5" /> Frente de loja</div>
        {podeTrocar && (lojas.length > 1 || lojaAtual === TODAS) ? (
          <select value={filtroLoja ?? ""} onChange={(e) => setLojaAtual(e.target.value)} className="h-8 rounded bg-sidebar-accent px-2 text-sm">
            <option value="" disabled>Escolha a loja…</option>
            {lojas.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
          </select>
        ) : (
          <span>{loja?.nome}</span>
        )}
        <span className="opacity-80">Operador: <b>{profile?.nome}</b></span>
        <button onClick={renomearTerminal} className="flex items-center gap-1 opacity-80 hover:opacity-100" title="Renomear este terminal"><Monitor className="size-4" /> {terminal}</button>
        <span className="ml-auto opacity-80">{fmtDate(agora).slice(0, 16)}</span>
        <Button size="sm" variant="ghost" className="text-sidebar-foreground hover:bg-sidebar-accent" onClick={() => window.close()} title="Fechar janela"><X /> Fechar</Button>
        <Button size="sm" variant="ghost" className="text-sidebar-foreground hover:bg-sidebar-accent" onClick={signOut}><LogOut /> Sair</Button>
      </header>
      <main className="flex-1">
        {precisaEscolher ? <EscolherEmpresa /> : filtroLoja ? <PermissoesProvider><PdvTela /></PermissoesProvider> : <p className="p-6 text-sm text-muted-foreground">Escolha a loja no topo para começar.</p>}
      </main>
    </div>
  );
}
