import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { KeyRound, Loader2, Pencil, Search, ShieldCheck, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth, type AppRole } from "@/lib/auth";
import { useLoja } from "@/lib/loja";
import { fetchAllRows } from "@/lib/fetch-all";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PessoaForm, type Pessoa } from "@/components/pessoa-form";
import { PermissoesDialog } from "@/components/editor-permissoes";
import { VendedorasLegado } from "@/components/vendedoras-legado";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/usuarios")({ component: PaginaUsuarios });

const PAPEL: Record<AppRole, { label: string; cor: string }> = {
  admin: { label: "Admin", cor: "bg-primary text-primary-foreground" },
  gerente: { label: "Gerente", cor: "bg-secondary text-secondary-foreground" },
  vendedor: { label: "Vendedor", cor: "bg-muted text-foreground" },
  estoquista: { label: "Estoquista", cor: "bg-muted text-foreground" },
};

type Situacao = "ativo" | "inativo" | "pendente";
interface Linha {
  pessoa: Pessoa;
  papel: AppRole | null;
  situacao: Situacao;
  lojas: string[];
  /** quantas permissões estão bloqueadas (null = nunca configurado: padrão do perfil) */
  bloqueios: number | null;
}

const FILTROS: { id: "todos" | Situacao; nome: string }[] = [
  { id: "todos", nome: "Todos" }, { id: "ativo", nome: "Ativos" }, { id: "pendente", nome: "Sem login" }, { id: "inativo", nome: "Desativados" },
];

/** Login de acesso: quem entra no sistema, em qual empresa e com quais permissões. */
function PaginaUsuarios() {
  const { user } = useAuth();
  const { lojas } = useLoja();
  const [linhas, setLinhas] = useState<Linha[] | null>(null);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<"todos" | Situacao>("todos");
  const [filtroLoja, setFiltroLoja] = useState("");
  const [editando, setEditando] = useState<Pessoa | "novo" | null>(null);
  const [permissoes, setPermissoes] = useState<Linha | null>(null);

  async function carregar() {
    try {
      const [ps, roles, profs, vinc, perm, acoes] = await Promise.all([
        fetchAllRows<Pessoa>(() => supabase.from("pessoas").select("*").eq("eh_usuario", true).order("nome")),
        supabase.from("user_roles").select("user_id, role"),
        supabase.from("profiles").select("id, ativo"),
        supabase.from("usuario_lojas").select("user_id, loja_id"),
        supabase.from("permissoes").select("user_id, ver, inserir, editar, excluir"),
        supabase.from("permissoes_acoes").select("user_id, permitido"),
      ]);
      const papel = new Map((roles.data ?? []).map((r) => [r.user_id, r.role as AppRole]));
      const ativo = new Map((profs.data ?? []).map((p) => [p.id, p.ativo as boolean]));
      const lj = new Map<string, string[]>();
      for (const v of vinc.data ?? []) lj.set(v.user_id, [...(lj.get(v.user_id) ?? []), v.loja_id]);
      const bloq = new Map<string, number>();
      for (const p of perm.data ?? []) bloq.set(p.user_id, (bloq.get(p.user_id) ?? 0) + [p.ver, p.inserir, p.editar, p.excluir].filter((x) => !x).length);
      for (const a of acoes.data ?? []) bloq.set(a.user_id, (bloq.get(a.user_id) ?? 0) + (a.permitido ? 0 : 1));
      setLinhas(ps.map((p) => ({
        pessoa: p,
        papel: p.user_id ? papel.get(p.user_id) ?? null : null,
        situacao: !p.user_id ? "pendente" : ativo.get(p.user_id) ?? true ? "ativo" : "inativo",
        lojas: p.user_id ? lj.get(p.user_id) ?? [] : [],
        bloqueios: p.user_id && bloq.has(p.user_id) ? bloq.get(p.user_id)! : null,
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
    return (linhas ?? []).filter((l) =>
      (filtro === "todos" || l.situacao === filtro) &&
      (!filtroLoja || l.lojas.includes(filtroLoja)) &&
      (!t || l.pessoa.nome.toLowerCase().includes(t) || (l.pessoa.email ?? "").toLowerCase().includes(t)));
  }, [linhas, busca, filtro, filtroLoja]);

  const conta = (s: "todos" | Situacao) => (linhas ?? []).filter((l) => s === "todos" || l.situacao === s).length;
  const nomeLoja = (id: string) => lojas.find((l) => l.id === id)?.nome ?? "outra loja";
  const iniciais = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join("").toUpperCase();
  const comLogin = (linhas ?? []).filter((l) => l.pessoa.user_id).map((l) => ({ id: l.pessoa.user_id!, nome: l.pessoa.nome }));

  return (
    <div className="p-4 lg:p-6 space-y-4 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Users className="size-6 text-primary" /> Login de acesso</h1>
          <p className="text-sm text-muted-foreground">Quem entra no sistema, em qual empresa e o que pode fazer.</p>
        </div>
        <Button onClick={() => setEditando("novo")}><UserPlus /> Novo usuário</Button>
      </div>

      {/* Resumo / filtros */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {FILTROS.map((f) => (
          <button key={f.id} onClick={() => setFiltro(f.id)}
            className={cn("rounded-lg border bg-card p-3 text-left transition-colors hover:border-primary", filtro === f.id && "border-primary ring-1 ring-primary")}>
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{f.nome}</div>
            <div className="text-2xl font-bold tabular-nums">{linhas ? conta(f.id) : "–"}</div>
          </button>
        ))}
      </div>

      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center gap-2 border-b bg-muted/30 p-3">
          <div className="relative flex-1 min-w-48 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome ou e-mail" className="pl-8 bg-background" />
          </div>
          <select value={filtroLoja} onChange={(e) => setFiltroLoja(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm">
            <option value="">Todas as empresas</option>
            {lojas.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
          </select>
          <span className="ml-auto text-xs text-muted-foreground">{visiveis.length} usuário(s)</span>
        </div>

        {!linhas ? <div className="grid place-items-center p-10"><Loader2 className="animate-spin text-muted-foreground" /></div> : visiveis.length === 0 ? (
          <p className="p-10 text-center text-sm text-muted-foreground">Ninguém encontrado com esse filtro.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr><th>Usuário</th><th>Perfil</th><th>Empresa(s)</th><th>Situação</th><th>Permissões</th><th className="text-right">Ações</th></tr>
              </thead>
              <tbody>
                {visiveis.map((l) => (
                  <tr key={l.pessoa.id} className={cn(l.situacao === "inativo" && "opacity-60")}>
                    <td>
                      <div className="flex items-center gap-3">
                        <div className={cn("grid size-9 shrink-0 place-items-center rounded-full text-xs font-bold", l.papel === "admin" ? "bg-primary text-primary-foreground" : "bg-primary/15 text-primary")}>{iniciais(l.pessoa.nome)}</div>
                        <div className="min-w-0">
                          <div className="font-semibold truncate">{l.pessoa.nome}{l.pessoa.user_id === user?.id && <span className="ml-1 text-xs font-normal text-muted-foreground">(você)</span>}</div>
                          <div className="text-xs text-muted-foreground truncate">{l.pessoa.email ?? "sem e-mail"}{l.pessoa.cargo ? ` · ${l.pessoa.cargo}` : ""}</div>
                        </div>
                      </div>
                    </td>
                    <td>{l.papel ? <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", PAPEL[l.papel].cor)}>{PAPEL[l.papel].label}</span> : <span className="text-xs text-muted-foreground">—</span>}</td>
                    <td>
                      {l.papel === "admin" ? <span className="text-xs text-muted-foreground">todas</span>
                        : l.lojas.length === 0 ? <span className="text-xs text-destructive">nenhuma</span>
                        : <div className="flex flex-wrap gap-1">{l.lojas.map((id) => <span key={id} className="rounded border px-1.5 py-0.5 text-xs whitespace-nowrap">{nomeLoja(id)}</span>)}</div>}
                    </td>
                    <td>
                      {l.situacao === "pendente" ? <span className="inline-flex items-center gap-1 rounded-full bg-warning/20 px-2.5 py-0.5 text-xs font-medium"><span className="size-1.5 rounded-full bg-warning" /> Sem login</span>
                        : l.situacao === "inativo" ? <span className="inline-flex items-center gap-1 rounded-full bg-destructive/15 px-2.5 py-0.5 text-xs font-medium text-destructive"><span className="size-1.5 rounded-full bg-destructive" /> Desativado</span>
                        : <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2.5 py-0.5 text-xs font-medium text-success"><span className="size-1.5 rounded-full bg-success" /> Ativo</span>}
                    </td>
                    <td className="text-xs">
                      {l.papel === "admin" ? <span className="text-muted-foreground">pode tudo</span>
                        : !l.pessoa.user_id ? <span className="text-muted-foreground">—</span>
                        : l.bloqueios == null ? <span className="font-medium">padrão do perfil (não configurado)</span>
                        : l.bloqueios === 0 ? <span className="text-muted-foreground">tudo liberado</span>
                        : <span>{l.bloqueios} bloqueio(s)</span>}
                    </td>
                    <td>
                      <div className="flex justify-end gap-1">
                        {l.pessoa.user_id && l.papel !== "admin" && (
                          <Button size="sm" variant="outline" onClick={() => setPermissoes(l)}><ShieldCheck /> Permissões</Button>
                        )}
                        <Button size="sm" variant={l.situacao === "pendente" ? "default" : "ghost"} onClick={() => setEditando(l.pessoa)} title="Cadastro, perfil, senha e situação">
                          {l.situacao === "pendente" ? <><KeyRound /> Criar login</> : <><Pencil /> Cadastro</>}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <VendedorasLegado usuarios={comLogin} />

      {editando && (
        <PessoaForm
          pessoa={editando === "novo" ? null : editando}
          inicial={{ eh_usuario: true, eh_funcionario: true, eh_cliente: false }}
          onClose={() => setEditando(null)}
          onSalvo={carregar}
        />
      )}
      {permissoes?.pessoa.user_id && (
        <PermissoesDialog
          userId={permissoes.pessoa.user_id}
          nome={permissoes.pessoa.nome}
          papel={permissoes.papel}
          outros={comLogin.filter((o) => o.id !== permissoes.pessoa.user_id)}
          onClose={() => setPermissoes(null)}
          onSalvo={carregar}
        />
      )}
    </div>
  );
}
