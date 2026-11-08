import { useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";
import { Aviso } from "../components/ui";

// Sem "Criar conta": no Ecossistema TB quem cria usuário é só o admin (mesmo login do PDV Salvados).
export default function Login() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
    if (error) setErro(error.message === "Invalid login credentials" ? "E-mail ou senha incorretos." : error.message);
    setEnviando(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-card border border-border rounded-xl p-6 shadow-lg shadow-black/30">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-10 w-10 rounded-lg bg-primary/15 text-primary grid place-items-center font-bold">RH</div>
          <div>
            <h1 className="text-lg font-bold">Gestão RH</h1>
            <p className="text-xs text-muted-foreground">Gestão de RH e Custos de Pessoal</p>
          </div>
        </div>
        <h2 className="text-sm font-medium mb-4">Entre com sua conta do Ecossistema TB</h2>
        <form onSubmit={enviar} className="space-y-3">
          <input className="campo" type="email" placeholder="email@exemplo.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <input className="campo" type="password" placeholder="Senha" minLength={6} value={senha} onChange={(e) => setSenha(e.target.value)} required />
          {erro && <Aviso>{erro}</Aviso>}
          <button className="btn-primario w-full" disabled={enviando}>{enviando ? "Aguarde..." : "Entrar"}</button>
        </form>
        <p className="mt-4 text-[11px] text-muted-foreground text-center">
          Use o mesmo e-mail e senha do PDV Salvados. Não tem acesso? Peça ao administrador.
        </p>
      </div>
    </div>
  );
}
