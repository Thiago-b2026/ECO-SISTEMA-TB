// Login ÚNICO do Ecossistema TB (Supabase Auth). Sem "Criar conta": quem cria usuário é o admin, no Portal.
import { useState, type FormEvent } from "react";
import { ClipboardCheck, LogIn } from "lucide-react";
import { useApp } from "../app/contexto";
import { MODO_DEMO } from "../data/conexao";
import { USUARIOS_DEMO } from "../data/demo-servidor";
import { Aviso, Botao, Campo, Cartao, classeEntrada } from "../ui/base";
import { PORTAL_URL } from "../lib/telas";

export default function Login() {
  const { entrar } = useApp();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e?: FormEvent, em = email, se = senha) {
    e?.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      await entrar(em, se);
    } catch (x) {
      setErro((x as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col justify-center gap-4 p-4">
      <div className="text-center">
        <a href={PORTAL_URL} className="text-2xl font-extrabold tracking-wide text-marca">Eco Sistema TB</a>
        <div className="mt-1 flex items-center justify-center gap-2 text-gray-700">
          <ClipboardCheck className="size-5" aria-hidden /> Check List Operacional
        </div>
      </div>
      <Cartao>
        <form onSubmit={enviar} className="space-y-4">
          <Campo rotulo="E-mail">
            <input className={classeEntrada} type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Campo>
          <Campo rotulo="Senha">
            <input className={classeEntrada} type="password" autoComplete="current-password" required value={senha} onChange={(e) => setSenha(e.target.value)} />
          </Campo>
          {erro && <Aviso tom="erro">{erro}</Aviso>}
          <Botao type="submit" grande carregando={enviando}><LogIn className="size-5" aria-hidden /> Entrar</Botao>
          <p className="text-center text-xs text-gray-600">Use o mesmo e-mail e senha do Ecossistema TB. Sem acesso? Fale com o administrador.</p>
        </form>
      </Cartao>
      {MODO_DEMO && (
        <Cartao className="border-amber-300 bg-amber-50">
          <div className="mb-2 font-semibold text-amber-900">Modo demonstração (sem banco de dados)</div>
          <p className="mb-3 text-sm text-amber-900">Os dados ficam só neste navegador. Escolha quem você quer ser:</p>
          <div className="grid gap-2">
            {USUARIOS_DEMO.map((u) => (
              <Botao key={u.id} variante="secundario" disabled={enviando} onClick={() => enviar(undefined, u.email, u.senha)} className="justify-start text-left">
                <span className="flex flex-col items-start leading-tight">
                  <span>{u.nome}</span>
                  <span className="text-xs font-normal text-gray-600">{u.papel}</span>
                </span>
              </Botao>
            ))}
          </div>
        </Cartao>
      )}
    </main>
  );
}
