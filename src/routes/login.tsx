import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { Store, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth, homeRouteFor } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/login")({
  beforeLoad: ({ context }) => {
    if (context.auth.user) throw redirect({ to: homeRouteFor(context.auth.role) });
  },
  component: LoginPage,
});

type Modo = "entrar" | "criar" | "esqueci";

const TITULO: Record<Modo, string> = {
  entrar: "Gestão da loja de salvados",
  criar: "Criar conta",
  esqueci: "Recuperar senha",
};

function LoginPage() {
  const { signIn } = useAuth();
  const [modo, setModo] = useState<Modo>("entrar");
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirma, setConfirma] = useState("");
  const [loading, setLoading] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  function trocar(m: Modo) {
    setModo(m);
    setAviso(null);
    setPassword("");
    setConfirma("");
  }

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await signIn(email.trim(), password);
    setLoading(false);
    if (error) toast.error(error);
    // Se deu certo, o AuthProvider atualiza e a rota redireciona sozinha.
  }

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) return toast.error("A senha precisa ter pelo menos 8 caracteres.");
    if (password !== confirma) return toast.error("As duas senhas não são iguais.");
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { nome: nome.trim() }, emailRedirectTo: `${window.location.origin}/login` },
    });
    setLoading(false);
    if (error) return toast.error("Não foi possível criar a conta: " + traduzir(error.message));
    // Com confirmação de e-mail ligada, o Supabase não abre sessão: precisa clicar no link.
    if (!data.session) {
      setAviso(
        "Conta criada! Enviamos um e-mail de confirmação para " +
          email.trim() +
          ". Clique no link do e-mail e depois entre aqui. Um administrador precisa liberar o seu perfil para você usar o sistema.",
      );
    }
  }

  async function esqueci(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/nova-senha`,
    });
    setLoading(false);
    if (error) return toast.error("Não foi possível enviar: " + traduzir(error.message));
    setAviso(
      "Se esse e-mail estiver cadastrado, você vai receber um link para criar uma senha nova. Confira também a caixa de Spam.",
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-accent/10 p-4">
      <Card className="w-full max-w-md p-8 shadow-2xl">
        <div className="flex flex-col items-center mb-6">
          <div className="size-16 rounded-2xl bg-primary grid place-items-center mb-3">
            <Store className="size-8 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold">Eco Sistema TB</h1>
          <p className="text-sm text-muted-foreground">{TITULO[modo]}</p>
        </div>

        {aviso ? (
          <div className="space-y-4 text-center">
            <p className="text-sm">{aviso}</p>
            <Button variant="outline" className="w-full h-12" onClick={() => trocar("entrar")}>
              Voltar para o login
            </Button>
          </div>
        ) : (
          <form onSubmit={modo === "entrar" ? entrar : modo === "criar" ? criar : esqueci} className="space-y-4">
            {modo === "criar" && (
              <div>
                <Label htmlFor="nome">Nome</Label>
                <Input id="nome" value={nome} onChange={(e) => setNome(e.target.value)} required className="h-12" />
              </div>
            )}
            <div>
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus className="h-12" />
            </div>
            {modo !== "esqueci" && (
              <div>
                <Label htmlFor="password">Senha</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete={modo === "criar" ? "new-password" : "current-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="h-12"
                />
              </div>
            )}
            {modo === "criar" && (
              <div>
                <Label htmlFor="confirma">Repita a senha</Label>
                <Input id="confirma" type="password" autoComplete="new-password" value={confirma} onChange={(e) => setConfirma(e.target.value)} required className="h-12" />
              </div>
            )}
            <Button type="submit" disabled={loading} className="w-full h-12 text-base font-semibold">
              {loading ? <Loader2 className="animate-spin" /> : modo === "entrar" ? "Entrar" : modo === "criar" ? "Criar conta" : "Enviar link de recuperação"}
            </Button>
          </form>
        )}

        {!aviso && (
          <div className="mt-5 flex flex-col items-center gap-2 text-sm">
            {modo !== "entrar" && (
              <button type="button" className="text-primary hover:underline" onClick={() => trocar("entrar")}>
                Já tenho conta — entrar
              </button>
            )}
            {modo !== "esqueci" && (
              <button type="button" className="text-primary hover:underline" onClick={() => trocar("esqueci")}>
                Esqueci minha senha
              </button>
            )}
            {modo !== "criar" && (
              <button type="button" className="text-primary hover:underline" onClick={() => trocar("criar")}>
                Criar uma conta
              </button>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

function traduzir(msg: string): string {
  if (/already registered|already exists/i.test(msg)) return "este e-mail já tem conta. Use \"Esqueci minha senha\".";
  if (/signups not allowed|signup is disabled/i.test(msg)) return "o cadastro de novas contas está desligado no Supabase.";
  if (/rate limit/i.test(msg)) return "muitas tentativas. Espere alguns minutos e tente de novo.";
  if (/password/i.test(msg)) return "senha fraca. Use pelo menos 8 caracteres, misturando letras e números.";
  return msg;
}
