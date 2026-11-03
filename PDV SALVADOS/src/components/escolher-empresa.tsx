// Tela de escolha da empresa (loja/CNPJ) logo depois do login,
// para quem trabalha em mais de uma. Vale até sair do sistema.
import { Building2, LogOut } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useLoja } from "@/lib/loja";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function EscolherEmpresa() {
  const { profile, signOut } = useAuth();
  const { lojas, escolherEmpresa } = useLoja();
  return (
    <div className="min-h-screen grid place-items-center p-4 bg-gradient-to-br from-primary/10 via-background to-accent/10">
      <Card className="w-full max-w-md p-6 space-y-4">
        <div className="text-center">
          <Building2 className="mx-auto size-10 text-primary" />
          <h1 className="text-xl font-bold mt-2">Em qual empresa você vai trabalhar?</h1>
          <p className="text-sm text-muted-foreground">Olá, {profile?.nome}. Tudo o que você fizer agora fica nesta empresa.</p>
        </div>
        <div className="space-y-2">
          {lojas.map((l) => (
            <Button key={l.id} variant="outline" className="w-full h-14 justify-start text-base" onClick={() => escolherEmpresa(l.id)}>
              <Building2 /> {l.nome}
            </Button>
          ))}
        </div>
        <Button variant="ghost" className="w-full" onClick={signOut}><LogOut /> Sair</Button>
      </Card>
    </div>
  );
}
