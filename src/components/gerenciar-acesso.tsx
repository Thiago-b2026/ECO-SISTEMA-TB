// Acesso ao sistema de um cadastro que já tem login: perfil, nova senha, ativar/desativar.
import { useEffect, useState } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth, type AppRole } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EditorPermissoes } from "@/components/editor-permissoes";

const PAPEIS: { id: AppRole; label: string }[] = [
  { id: "vendedor", label: "Vendedor" }, { id: "estoquista", label: "Estoquista" }, { id: "gerente", label: "Gerente" }, { id: "admin", label: "Admin" },
];

export async function chamarAdminUsuarios(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("admin-usuarios", { body });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    const b = ctx && typeof ctx.json === "function" ? await ctx.json().catch(() => null) : null;
    throw new Error(b?.erro ?? error.message);
  }
  return data;
}

export function GerenciarAcesso({ userId, onMudou }: { userId: string; onMudou?: () => void }) {
  const { user, role } = useAuth();
  const admin = role === "admin";
  const eu = user?.id === userId;
  const [papel, setPapel] = useState<AppRole | null>(null);
  const [ativo, setAtivo] = useState(true);
  const [senha, setSenha] = useState("");
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", userId).maybeSingle(),
      supabase.from("profiles").select("ativo").eq("id", userId).maybeSingle(),
    ]).then(([r, p]) => {
      setPapel((r.data?.role as AppRole) ?? null);
      setAtivo(p.data?.ativo ?? true);
    });
  }, [userId]);

  async function acao(body: Record<string, unknown>, ok: string, depois?: () => void) {
    setOcupado(true);
    try {
      await chamarAdminUsuarios({ ...body, user_id: userId });
      toast.success(ok);
      depois?.();
      onMudou?.();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  if (!admin) return <p className="text-sm text-muted-foreground">Este cadastro tem acesso ao sistema. Só o admin altera perfil, senha e situação do acesso.</p>;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span>Acesso:</span>
        {ativo ? <span className="rounded bg-success/15 px-2 py-0.5 text-success font-medium">Ativo</span> : <span className="rounded bg-destructive/15 px-2 py-0.5 text-destructive font-medium">Desativado</span>}
        {!eu && (
          <Button type="button" size="sm" variant="outline" disabled={ocupado} onClick={() => acao({ acao: "ativo", ativo: !ativo }, ativo ? "Acesso desativado." : "Acesso reativado.", () => setAtivo(!ativo))}>
            {ativo ? "Desativar acesso" : "Reativar acesso"}
          </Button>
        )}
      </div>
      <div>
        <div className="text-xs font-medium mb-1">Permissão</div>
        <div className="flex flex-wrap gap-1">
          {PAPEIS.map((x) => (
            <Button key={x.id} type="button" size="sm" disabled={eu || ocupado} variant={papel === x.id ? "default" : "outline"}
              onClick={() => acao({ acao: "papel", papel: x.id }, `Permissão alterada para ${x.label}.`, () => setPapel(x.id))}>{x.label}</Button>
          ))}
        </div>
        {eu && <p className="mt-1 text-xs text-muted-foreground">Você não pode mudar a própria permissão.</p>}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-40"><Label className="text-xs">Nova senha (mín. 8)</Label><Input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="new-password" /></div>
        <Button type="button" variant="outline" disabled={ocupado || senha.length < 8} onClick={() => acao({ acao: "senha", senha }, "Senha alterada.", () => setSenha(""))}>
          {ocupado ? <Loader2 className="animate-spin" /> : <KeyRound />} Trocar senha
        </Button>
      </div>
      <EditorPermissoes userId={userId} papel={papel} />
    </div>
  );
}
