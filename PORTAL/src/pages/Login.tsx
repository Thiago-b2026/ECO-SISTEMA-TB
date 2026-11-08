import { useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";

// Sem "Criar conta": no Ecossistema TB quem cria usuário é só o administrador.
export default function Login() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function entrar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha });
    if (error) setErro(error.message === "Invalid login credentials" ? "E-mail ou senha incorretos." : error.message);
    setEnviando(false);
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-sm">
        <h1 className="titulo text-center text-2xl text-primary">Ecossistema TB</h1>
        <p className="mt-1 text-center text-sm text-muted-foreground">Entre com o seu e-mail e senha</p>
        <form onSubmit={entrar} className="mt-6 space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">E-mail</span>
            <input className="campo" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Senha</span>
            <input className="campo" type="password" autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} required />
          </label>
          {erro && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{erro}</p>}
          <button className="botao-primario w-full" disabled={enviando}>{enviando ? "Entrando…" : "Entrar"}</button>
        </form>
        <p className="mt-4 text-center text-xs text-muted-foreground">Use o mesmo login do PDV e do Gestão RH. Não tem acesso? Peça ao administrador.</p>
      </div>
    </div>
  );
}
