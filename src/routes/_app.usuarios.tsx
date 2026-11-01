import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Loader2, Search, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth, type AppRole } from "@/lib/auth";
import { useLoja } from "@/lib/loja";
import { fetchAllRows } from "@/lib/fetch-all";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PessoaForm, type Pessoa } from "@/components/pessoa-form";
import { VendedorasLegado } from "@/components/vendedoras-legado";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/usuarios")({ component: PaginaUsuarios });

const PAPEL: Record<AppRole, { label: string; cor: string }> = {
  admin: { label: "Admin", cor: "bg-primary text-primary-foreground" },
  gerente: { label: "Gerente", cor: "bg-secondary text-secondary-foreground" },
  vendedor: { label: "Vendedor", cor: "border" },
  estoquista: { label: "Estoquista", cor: "border" },
};

interface Linha {
  pessoa: Pessoa;
  papel: AppRole | null;
  acessoAtivo: boolean;
  lojas: string[];
}

/** Login de acesso: quem entra no sistema, com que permissão e em quais lojas. */
function PaginaUsuarios() {
  const { user } = useAuth();
  const { lojas } = useLoja();
  const [linhas, setLinhas] = useState<Linha[] | null>(null);
  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState<Pessoa | "novo" | null>(null);

  async function carregar() {
    try {
      const [ps, roles, profs, vinc] = await Promise.all([
        fetchAllRows<Pessoa>(() => supabase.from("pessoas").select("*").eq("eh_usuario", true).order("nome")),
        supabase.from("user_roles").select("user_id, role"),
        supabase.from("profiles").select("id, ativo"),
        supabase.from("usuario_lojas").select("user_id, loja_id"),
      ]);
      const papel = new Map((roles.data ?? []).map((r) => [r.user_id, r.role as AppRole]));
      const ativo = new Map((profs.data ?? []).map((p) => [p.id, p.ativo as boolean]));
      const lj = new Map<string, string[]>();
      for (const v of vinc.data ?? []) lj.set(v.user_id, [...(lj.get(v.user_id) ?? []), v.loja_id]);
      setLinhas(ps.map((p) => ({
        pessoa: p,
        papel: p.user_id ? papel.get(p.user_id) ?? null : null,
        acessoAtivo: p.user_id ? ativo.get(p.user_id) ?? true : false,
        lojas: p.user_id ? lj.get(p.user_id) ?? [] : [],
      })));
    } catch (e) {
      toast.error((e as Error).message);
      setLinhas([]);
    }
  }
  useEffect(() => {
    carregar();
  }, []);

  const visiveis = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return (linhas ?? []).filter((l) => !t || l.pessoa.nome.toLowerCase().includes(t) || (l.pessoa.email ?? "").toLowerCase().includes(t));
  }, [linhas, busca]);

  const nomeLoja = (id: string) => lojas.find((l) => l.id === id)?.nome ?? "outra loja";
  const iniciais = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join("").toUpperCase();

  return (
    <div className="p-4 lg:p-6 space-y-4 max-w-5xl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Login de acesso</h1>
          <p className="text-sm text-muted-foreground">Quem entra no sistema, com qual permissão e em quais lojas. Clique numa pessoa para trocar senha, permissão ou desativar.</p>
        </div>
        <Button onClick={() => setEditando("novo")}><UserPlus /> Novo usuário</Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-2 top-2.5 size-4 text-muted-foreground" />
        <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome ou e-mail" className="pl-8" />
      </div>

      {!linhas ? <Loader2 className="animate-spin text-muted-foreground" /> : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visiveis.map((l) => {
            const pendente = !l.pessoa.user_id;
            const inativo = !pendente && !l.acessoAtivo;
            return (
              <button key={l.pessoa.id} onClick={() => setEditando(l.pessoa)} className="text-left">
                <Card className={cn("p-4 h-full space-y-2 transition-colors hover:border-primary", inativo && "opacity-60")}>
                  <div className="flex items-center gap-3">
                    <div className="size-10 shrink-0 rounded-full bg-primary/15 text-primary grid place-items-center font-bold">{iniciais(l.pessoa.nome)}</div>
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{l.pessoa.nome}{l.pessoa.user_id === user?.id ? " (você)" : ""}</div>
                      <div className="text-xs text-muted-foreground truncate">{l.pessoa.email ?? "sem e-mail"}</div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1 text-xs">
                    {l.papel && <span className={cn("rounded px-2 py-0.5 font-medium", PAPEL[l.papel].cor)}>{PAPEL[l.papel].label}</span>}
                    {pendente ? <span className="rounded bg-warning/20 px-2 py-0.5">Login ainda não criado: clique para definir a senha</span>
                      : inativo ? <span className="rounded bg-destructive/15 px-2 py-0.5 text-destructive">Acesso desativado</span>
                      : <span className="rounded bg-success/15 px-2 py-0.5 text-success">Ativo</span>}
                    {l.pessoa.cargo && <span className="rounded border px-2 py-0.5">{l.pessoa.cargo}</span>}
                  </div>
                  {l.lojas.length > 0 && <div className="text-xs text-muted-foreground">Lojas: {l.lojas.map(nomeLoja).join(", ")}</div>}
                </Card>
              </button>
            );
          })}
          {visiveis.length === 0 && <p className="text-sm text-muted-foreground">Ninguém encontrado.</p>}
        </div>
      )}

      <VendedorasLegado usuarios={(linhas ?? []).filter((l) => l.pessoa.user_id).map((l) => ({ id: l.pessoa.user_id!, nome: l.pessoa.nome }))} />

      {editando && (
        <PessoaForm
          pessoa={editando === "novo" ? null : editando}
          inicial={{ eh_usuario: true, eh_funcionario: true, eh_cliente: false }}
          onClose={() => setEditando(null)}
          onSalvo={carregar}
        />
      )}
    </div>
  );
}
