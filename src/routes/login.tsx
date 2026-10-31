import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { Store, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth, homeRouteFor } from "@/lib/auth";
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

function LoginPage() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await signIn(email.trim(), password);
    setLoading(false);
    if (error) toast.error(error);
    // Se deu certo, o AuthProvider atualiza e a rota redireciona sozinha.
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-accent/10 p-4">
      <Card className="w-full max-w-md p-8 shadow-2xl">
        <div className="flex flex-col items-center mb-6">
          <div className="size-16 rounded-2xl bg-primary grid place-items-center mb-3">
            <Store className="size-8 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold">Eco Sistema TB</h1>
          <p className="text-sm text-muted-foreground">Gestão da loja de salvados</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus className="h-12" />
          </div>
          <div>
            <Label htmlFor="password">Senha</Label>
            <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required className="h-12" />
          </div>
          <Button type="submit" disabled={loading} className="w-full h-12 text-base font-semibold">
            {loading ? <Loader2 className="animate-spin" /> : "Entrar"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
