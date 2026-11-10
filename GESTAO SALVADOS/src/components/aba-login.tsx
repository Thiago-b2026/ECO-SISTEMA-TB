// Aba LOGIN E PERMISSÕES de uma pessoa (só o admin): criar login, perfil, senha, desativar,
// empresas e permissões, e excluir o login (só se nunca teve movimento). Substitui a antiga tela "Login de acesso".
import { useEffect, useState } from "react";
import { KeyRound, Loader2, ShieldCheck, Trash2, UserX } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth, type AppRole } from "@/lib/auth";
import { useLoja } from "@/lib/loja";
import { MODELO_DO_PERFIL } from "@/lib/permissoes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { chamarAdminUsuarios, GerenciarAcesso } from "@/components/gerenciar-acesso";
import { PermissoesDialog } from "@/components/editor-permissoes";
import type { Pessoa } from "@/components/pessoa-form";

const PAPEIS: { id: AppRole; label: string }[] = [
  { id: "vendedor", label: "Vendedor" }, { id: "estoquista", label: "Estoquista" }, { id: "gerente", label: "Gerente" }, { id: "admin", label: "Admin" },
];

export function AbaLogin({ pessoa, onMudou }: { pessoa: Pessoa; onMudou: (p: Pessoa) => void }) {
  const { role } = useAuth();
  const { lojas } = useLoja();
  const [papel, setPapel] = useState<AppRole | null>(null);
  const [outros, setOutros] = useState<{ id: string; nome: string }[]>([]);
  const [permissoes, setPermissoes] = useState<{ modelo?: string } | null>(null);
  // criar login
  const [criando, setCriando] = useState(false);
  const [email, setEmail] = useState(pessoa.email ?? "");
  const [senha, setSenha] = useState("");
  const [novoPapel, setNovoPapel] = useState<AppRole>("vendedor");
  const [lojasSel, setLojasSel] = useState<string[]>(lojas.length === 1 ? [lojas[0].id] : []);
  const [ocupado, setOcupado] = useState(false);
  // excluir login
  const [motivos, setMotivos] = useState<{ lista: string[]; historico: boolean } | null>(null);
  const [confirmar, setConfirmar] = useState(false);

  const uid = pessoa.user_id;

  async function recarregarPessoa(): Promise<Pessoa | null> {
    const { data } = await supabase.from("pessoas").select("*").eq("id", pessoa.id).single();
    if (data) onMudou(data as Pessoa);
    return (data as Pessoa) ?? null;
  }

  useEffect(() => {
    if (!uid) return;
    supabase.from("user_roles").select("role").eq("user_id", uid).maybeSingle().then(({ data }) => setPapel((data?.role as AppRole) ?? null));
    supabase.from("pessoas").select("user_id, nome").not("user_id", "is", null).neq("user_id", uid).order("nome")
      .then(({ data }) => setOutros((data ?? []).map((x) => ({ id: x.user_id as string, nome: x.nome as string }))));
    setMotivos(null);
    chamarAdminUsuarios({ acao: "motivos", user_id: uid })
      .then((d: { motivos: string[]; historico: boolean }) => setMotivos({ lista: d.motivos ?? [], historico: !!d.historico }))
      .catch(() => setMotivos({ lista: ["a função de servidor ainda não foi atualizada"], historico: false }));
  }, [uid]);

  if (role !== "admin") return <p className="text-sm text-muted-foreground">Só o admin vê e altera o login e as permissões.</p>;

  async function criarLogin() {
    if (!/^\S+@\S+\.\S+$/.test(email)) return toast.error("Informe o e-mail de login.");
    if (senha.length < 8) return toast.error("A senha precisa ter pelo menos 8 caracteres.");
    if (novoPapel !== "admin" && lojasSel.length === 0) return toast.error("Marque as empresas em que a pessoa trabalha.");
    setOcupado(true);
    try {
      await chamarAdminUsuarios({ acao: "criar", nome: pessoa.nome, email: email.trim().toLowerCase(), senha, papel: novoPapel, lojas: lojasSel, pessoa_id: pessoa.id });
      toast.success(`Login criado para ${email}.`);
      setCriando(false);
      setSenha("");
      await recarregarPessoa();
      // login novo: abre as permissões já com o modelo do perfil
      if (novoPapel !== "admin") setPermissoes({ modelo: MODELO_DO_PERFIL[novoPapel] });
    } catch (e) {
      toast.error("Login NÃO foi criado: " + (e as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  async function excluirLogin() {
    if (!uid) return;
    setOcupado(true);
    try {
      await chamarAdminUsuarios({ acao: "excluir", user_id: uid });
      toast.success("Login excluído. O cadastro da pessoa continua.");
      setConfirmar(false);
      setPapel(null);
      await recarregarPessoa();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  const dialogPermissoes = uid && permissoes ? (
    <PermissoesDialog userId={uid} nome={pessoa.nome} papel={papel} outros={outros} modeloSugerido={permissoes.modelo}
      onClose={() => setPermissoes(null)} onSalvo={() => {}} />
  ) : null;

  // ---------- SEM LOGIN ----------
  if (!uid) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">Esta pessoa ainda não entra no sistema.</p>
        {!criando ? (
          <Button type="button" onClick={() => setCriando(true)} className="font-bold"><KeyRound /> CRIAR LOGIN</Button>
        ) : (
          <div className="space-y-3 rounded-lg border border-primary/40 p-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <div><Label className="text-xs">E-mail de login</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" /></div>
              <div><Label className="text-xs">Senha inicial (mín. 8)</Label><Input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="new-password" /></div>
            </div>
            <div className="text-xs font-medium">Perfil</div>
            <div className="flex flex-wrap gap-1">
              {PAPEIS.map((x) => <Button key={x.id} type="button" size="sm" variant={novoPapel === x.id ? "default" : "outline"} onClick={() => setNovoPapel(x.id)}>{x.label}</Button>)}
            </div>
            <p className="text-xs text-muted-foreground">Vendedor: PDV, caixa e vendas · Estoquista: lotes e estoque · Gerente: tudo menos usuários · Admin: tudo.</p>
            <div className="text-xs font-medium">Empresas</div>
            <div className="flex flex-wrap gap-3 text-sm">
              {lojas.map((l) => (
                <label key={l.id} className="flex items-center gap-1">
                  <input type="checkbox" className="size-4 accent-primary" checked={lojasSel.includes(l.id)} onChange={(e) => setLojasSel((s) => (e.target.checked ? [...s, l.id] : s.filter((x) => x !== l.id)))} /> {l.nome}
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setCriando(false)}>Cancelar</Button>
              <Button type="button" onClick={criarLogin} disabled={ocupado}>{ocupado ? <Loader2 className="animate-spin" /> : <KeyRound />} Criar login</Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ---------- COM LOGIN ----------
  return (
    <div className="space-y-4">
      <div className="text-sm">Login: <b>{pessoa.email ?? "—"}</b></div>
      <GerenciarAcesso userId={uid} onMudou={() => supabase.from("user_roles").select("role").eq("user_id", uid).maybeSingle().then(({ data }) => setPapel((data?.role as AppRole) ?? null))} />

      <div className="rounded-lg border p-3">
        <div className="mb-1 text-sm font-bold uppercase">Empresas e permissões</div>
        {papel === "admin" ? (
          <p className="text-xs text-muted-foreground">Admin pode tudo, em todas as empresas.</p>
        ) : (
          <Button type="button" variant="outline" onClick={() => setPermissoes({})}><ShieldCheck /> Abrir empresas e permissões</Button>
        )}
      </div>

      <div className="rounded-lg border border-destructive/30 p-3 space-y-2">
        <div className="text-sm font-bold uppercase flex items-center gap-1.5"><UserX className="size-4" /> Excluir usuário</div>
        {!motivos ? <Loader2 className="size-4 animate-spin text-muted-foreground" />
          : motivos.lista.length === 0 ? (
            <>
              <p className="text-xs text-muted-foreground">Nunca fez movimento. Excluir apaga o login e as permissões; o cadastro da pessoa continua.</p>
              <Button type="button" variant="destructive" size="sm" onClick={() => setConfirmar(true)}><Trash2 /> Excluir usuário</Button>
            </>
          ) : (
            <p className="text-xs">
              {motivos.historico ? <b>Não pode excluir, já tem histórico. Use Desativar.</b> : <b>Não pode excluir.</b>}{" "}
              <span className="text-muted-foreground">({motivos.lista.join(", ")})</span>
            </p>
          )}
      </div>

      {dialogPermissoes}

      <Dialog open={confirmar} onOpenChange={(v) => !v && setConfirmar(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Excluir usuário</DialogTitle>
            <DialogDescription>{pessoa.nome} · {pessoa.email}</DialogDescription>
          </DialogHeader>
          <p className="text-sm font-semibold text-destructive">Tem certeza? Não dá para desfazer.</p>
          <p className="text-xs text-muted-foreground">Apaga o login, o perfil, as empresas e as permissões. O cadastro da pessoa continua em Pessoas.</p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setConfirmar(false)}>Cancelar</Button>
            <Button type="button" variant="destructive" disabled={ocupado} onClick={excluirLogin}>{ocupado ? <Loader2 className="animate-spin" /> : <Trash2 />} Excluir</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
