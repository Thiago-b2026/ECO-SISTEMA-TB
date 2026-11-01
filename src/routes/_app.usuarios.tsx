import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { KeyRound, Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth, type AppRole } from "@/lib/auth";
import { useLoja } from "@/lib/loja";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { VendedorasLegado } from "@/components/vendedoras-legado";

export const Route = createFileRoute("/_app/usuarios")({ component: PaginaUsuarios });

const PAPEIS: { id: AppRole; label: string }[] = [
  { id: "admin", label: "Admin" },
  { id: "gerente", label: "Gerente" },
  { id: "vendedor", label: "Vendedor" },
  { id: "estoquista", label: "Estoquista" },
];

interface Usuario {
  id: string;
  nome: string;
  email: string;
  ativo: boolean;
  papel: AppRole | null;
}

async function chamar(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("admin-usuarios", { body });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    const b = ctx && typeof ctx.json === "function" ? await ctx.json().catch(() => null) : null;
    throw new Error(b?.erro ?? error.message);
  }
  return data;
}

function PaginaUsuarios() {
  const { user } = useAuth();
  const { lojas } = useLoja();
  const [usuarios, setUsuarios] = useState<Usuario[] | null>(null);
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [papel, setPapel] = useState<AppRole>("vendedor");
  const [lojasSel, setLojasSel] = useState<string[]>([]);
  const [salvando, setSalvando] = useState(false);

  async function carregar() {
    const [{ data: ps }, { data: rs }] = await Promise.all([
      supabase.from("profiles").select("id, nome, email, ativo").order("nome"),
      supabase.from("user_roles").select("user_id, role"),
    ]);
    const papeis = new Map((rs ?? []).map((r) => [r.user_id, r.role as AppRole]));
    setUsuarios((ps ?? []).map((p) => ({ ...p, papel: papeis.get(p.id) ?? null })) as Usuario[]);
  }
  useEffect(() => {
    carregar();
  }, []);
  useEffect(() => {
    if (lojas.length === 1) setLojasSel([lojas[0].id]);
  }, [lojas]);

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    if (lojasSel.length === 0) return toast.error("Marque pelo menos uma loja.");
    setSalvando(true);
    try {
      await chamar({ acao: "criar", nome, email, senha, papel, lojas: lojasSel });
      toast.success(`Usuário ${nome} criado. Passe a senha para a pessoa trocar em "Minha conta".`);
      setNome(""); setEmail(""); setSenha("");
      carregar();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  async function acao(body: Record<string, unknown>, ok: string) {
    try {
      await chamar(body);
      toast.success(ok);
      carregar();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <div className="p-4 lg:p-6 space-y-4 max-w-4xl">
      <h1 className="text-2xl font-bold">Usuários</h1>

      <Card className="p-4 space-y-3">
        <h2 className="font-semibold flex items-center gap-2"><UserPlus className="size-4" /> Novo funcionário</h2>
        <form onSubmit={criar} className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-3">
            <div><Label>Nome</Label><Input value={nome} onChange={(e) => setNome(e.target.value)} required /></div>
            <div><Label>E-mail (login)</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="off" /></div>
            <div><Label>Senha inicial</Label><Input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} required minLength={8} autoComplete="new-password" /></div>
          </div>
          <div className="flex flex-wrap gap-1">
            {PAPEIS.map((p) => <Button key={p.id} type="button" size="sm" variant={papel === p.id ? "default" : "outline"} onClick={() => setPapel(p.id)}>{p.label}</Button>)}
          </div>
          <div className="flex flex-wrap gap-3 text-sm">
            {lojas.map((l) => (
              <label key={l.id} className="flex items-center gap-1">
                <input type="checkbox" className="size-4 accent-primary" checked={lojasSel.includes(l.id)}
                  onChange={(e) => setLojasSel((s) => (e.target.checked ? [...s, l.id] : s.filter((x) => x !== l.id)))} /> {l.nome}
              </label>
            ))}
          </div>
          <Button type="submit" disabled={salvando}>{salvando ? <Loader2 className="animate-spin" /> : "Criar usuário"}</Button>
        </form>
      </Card>

      <Card className="p-4">
        {!usuarios ? <Loader2 className="animate-spin text-muted-foreground" /> : (
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground"><tr className="border-b"><th className="py-2 pr-2">Usuário</th><th className="py-2 pr-2">Perfil</th><th className="py-2 pr-2">Situação</th><th></th></tr></thead>
            <tbody>
              {usuarios.map((u) => {
                const eu = u.id === user?.id;
                return (
                  <tr key={u.id} className="border-b last:border-0">
                    <td className="py-2 pr-2"><div className="font-medium">{u.nome}{eu && " (você)"}</div><div className="text-xs text-muted-foreground">{u.email}</div></td>
                    <td className="py-2 pr-2">
                      <select value={u.papel ?? ""} disabled={eu} onChange={(e) => acao({ acao: "papel", user_id: u.id, papel: e.target.value }, "Perfil alterado.")} className="h-8 rounded border bg-background px-1 text-sm">
                        <option value="" disabled>Sem perfil</option>
                        {PAPEIS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                      </select>
                    </td>
                    <td className="py-2 pr-2">{u.ativo ? <Badge variant="outline">Ativo</Badge> : <Badge variant="destructive">Desativado</Badge>}</td>
                    <td className="py-2 whitespace-nowrap text-right">
                      <Button size="sm" variant="ghost" title="Definir nova senha" onClick={() => {
                        const s = window.prompt(`Nova senha para ${u.nome} (mínimo 8 caracteres):`);
                        if (s) acao({ acao: "senha", user_id: u.id, senha: s }, "Senha alterada.");
                      }}><KeyRound /> Senha</Button>
                      {!eu && (
                        <Button size="sm" variant="ghost" className={u.ativo ? "text-destructive" : ""} onClick={() => {
                          if (window.confirm(u.ativo ? `Desativar ${u.nome}? Ele não conseguirá mais entrar.` : `Reativar ${u.nome}?`)) acao({ acao: "ativo", user_id: u.id, ativo: !u.ativo }, u.ativo ? "Usuário desativado." : "Usuário reativado.");
                        }}>{u.ativo ? "Desativar" : "Reativar"}</Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <p className="mt-2 text-xs text-muted-foreground">As lojas de cada pessoa são ajustadas na tela Lojas.</p>
      </Card>

      {usuarios && <VendedorasLegado usuarios={usuarios.map((u) => ({ id: u.id, nome: u.nome }))} />}
    </div>
  );
}
