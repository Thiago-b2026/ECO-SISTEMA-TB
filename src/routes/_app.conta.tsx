import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { salvarVisual, useVisual } from "@/lib/visual";

function EscolherVisual() {
  const visual = useVisual();
  const op = (id: "classico" | "erp", titulo: string, desc: string) => (
    <button onClick={() => salvarVisual(id)} className={`flex-1 min-w-48 rounded-lg border p-3 text-left ${visual === id ? "border-primary bg-primary/5" : "hover:bg-muted"}`}>
      <div className="font-semibold text-sm">{titulo}{visual === id ? " ✓" : ""}</div>
      <div className="text-xs text-muted-foreground">{desc}</div>
    </button>
  );
  return (
    <Card className="p-5 space-y-2 max-w-xl">
      <h2 className="font-semibold">Visual do sistema</h2>
      <div className="flex flex-wrap gap-2">
        {op("classico", "Clássico", "Menu lateral escuro, com grupos que abrem e fecham.")}
        {op("erp", "ERP (menu no topo)", "Mais claro e compacto, menus no alto da tela, mais espaço para tabelas.")}
      </div>
      <p className="text-xs text-muted-foreground">A troca vale para este computador/navegador e pode ser desfeita a qualquer momento.</p>
    </Card>
  );
}
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_app/conta")({ component: Configuracoes });

/** Configurações: minha conta, dados da loja (gestor) e atalho para lojas/equipe (admin). */
function Configuracoes() {
  return (
    <div className="p-4 lg:p-6 space-y-4">
      <h1 className="text-2xl font-bold">Minha conta</h1>
      <EscolherVisual />
      <MinhaConta />
    </div>
  );
}

function MinhaConta() {
  const { profile, user } = useAuth();
  const [nome, setNome] = useState(profile?.nome ?? "");
  const [salvandoNome, setSalvandoNome] = useState(false);
  const [senha, setSenha] = useState("");
  const [confirma, setConfirma] = useState("");
  const [salvandoSenha, setSalvandoSenha] = useState(false);

  async function salvarNome(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !nome.trim()) return;
    setSalvandoNome(true);
    const { error } = await supabase.from("profiles").update({ nome: nome.trim() }).eq("id", user.id);
    setSalvandoNome(false);
    if (error) return toast.error("Não foi possível salvar o nome: " + error.message);
    toast.success("Nome atualizado. Ele aparece no menu após recarregar a página.");
  }

  async function trocarSenha(e: React.FormEvent) {
    e.preventDefault();
    if (senha.length < 8) return toast.error("A senha precisa ter pelo menos 8 caracteres.");
    if (senha !== confirma) return toast.error("As duas senhas não são iguais.");
    setSalvandoSenha(true);
    const { error } = await supabase.auth.updateUser({ password: senha });
    setSalvandoSenha(false);
    if (error) return toast.error("Não foi possível trocar a senha: " + error.message);
    setSenha("");
    setConfirma("");
    toast.success("Senha trocada com sucesso.");
  }

  return (
    <div className="space-y-4 max-w-xl">

      <Card className="p-5">
        <form onSubmit={salvarNome} className="space-y-3">
          <h2 className="font-semibold">Dados</h2>
          <div>
            <Label>E-mail</Label>
            <Input value={profile?.email ?? ""} disabled className="h-11" />
          </div>
          <div>
            <Label htmlFor="nome">Nome</Label>
            <Input id="nome" value={nome} onChange={(e) => setNome(e.target.value)} required className="h-11" />
          </div>
          <Button type="submit" disabled={salvandoNome}>
            {salvandoNome ? <Loader2 className="animate-spin" /> : "Salvar nome"}
          </Button>
        </form>
      </Card>

      <Card className="p-5">
        <form onSubmit={trocarSenha} className="space-y-3">
          <h2 className="font-semibold">Trocar senha</h2>
          <div>
            <Label htmlFor="senha">Nova senha</Label>
            <Input id="senha" type="password" autoComplete="new-password" value={senha} onChange={(e) => setSenha(e.target.value)} required className="h-11" />
          </div>
          <div>
            <Label htmlFor="confirma">Repita a nova senha</Label>
            <Input id="confirma" type="password" autoComplete="new-password" value={confirma} onChange={(e) => setConfirma(e.target.value)} required className="h-11" />
          </div>
          <Button type="submit" disabled={salvandoSenha}>
            {salvandoSenha ? <Loader2 className="animate-spin" /> : "Trocar senha"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
