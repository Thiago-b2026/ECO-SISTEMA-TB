import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth, homeRouteFor } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";

// Página aberta pelo link "Esqueci minha senha" do e-mail.
// O Supabase já abre a sessão a partir do link; aqui a pessoa só define a senha nova.
export const Route = createFileRoute("/nova-senha")({ component: NovaSenha });

function NovaSenha() {
  const { user, role, loading } = useAuth();
  const navigate = useNavigate();
  const [senha, setSenha] = useState("");
  const [confirma, setConfirma] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [esperou, setEsperou] = useState(false);

  // O link pode levar 1–2 segundos para virar sessão
  useEffect(() => {
    const t = setTimeout(() => setEsperou(true), 3000);
    return () => clearTimeout(t);
  }, []);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (senha.length < 8) return toast.error("A senha precisa ter pelo menos 8 caracteres.");
    if (senha !== confirma) return toast.error("As duas senhas não são iguais.");
    setSalvando(true);
    const { error } = await supabase.auth.updateUser({ password: senha });
    setSalvando(false);
    if (error) return toast.error("Não foi possível salvar a senha: " + error.message);
    toast.success("Senha nova salva!");
    navigate({ to: homeRouteFor(role) });
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-accent/10 p-4">
      <Card className="w-full max-w-md p-8 shadow-2xl space-y-4">
        <div className="flex flex-col items-center">
          <div className="size-16 rounded-2xl bg-primary grid place-items-center mb-3">
            <KeyRound className="size-8 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold">Criar senha nova</h1>
        </div>

        {user ? (
          <form onSubmit={salvar} className="space-y-4">
            <p className="text-sm text-muted-foreground text-center">{user.email}</p>
            <div>
              <Label htmlFor="senha">Senha nova</Label>
              <Input id="senha" type="password" autoComplete="new-password" value={senha} onChange={(e) => setSenha(e.target.value)} required autoFocus className="h-12" />
            </div>
            <div>
              <Label htmlFor="confirma">Repita a senha nova</Label>
              <Input id="confirma" type="password" autoComplete="new-password" value={confirma} onChange={(e) => setConfirma(e.target.value)} required className="h-12" />
            </div>
            <Button type="submit" disabled={salvando} className="w-full h-12 text-base font-semibold">
              {salvando ? <Loader2 className="animate-spin" /> : "Salvar senha nova"}
            </Button>
          </form>
        ) : loading || !esperou ? (
          <div className="flex justify-center">
            <Loader2 className="animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4 text-center">
            <p className="text-sm">
              Este link expirou ou já foi usado. Peça um novo em "Esqueci minha senha" na tela de login.
            </p>
            <Button variant="outline" className="w-full h-12" onClick={() => navigate({ to: "/login" })}>
              Ir para o login
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
