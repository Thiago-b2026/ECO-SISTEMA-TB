// Login ÚNICO do Ecossistema TB (Supabase Auth). Sem "Criar conta": quem cria usuário é o admin, no Portal.
import { useState, type FormEvent } from "react";
import { LogIn, RotateCcw, Trophy } from "lucide-react";
import { useApp } from "../app/contexto";
import { MODO_DEMO } from "../data/conexao";
import { reiniciarDemo, USUARIOS_DEMO } from "../data/demo-servidor";
import { PORTAL_URL } from "../lib/telas";
import { Aviso, Botao, Campo, Cartao, classeEntrada } from "../ui/base";

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
          <Trophy className="size-5" aria-hidden /> Meta de Vendas e Premiação
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
          <p className="mb-3 text-sm text-amber-900">Começa vazio: entre como administrador e cadastre a empresa, as lojas e os usuários. Quem você criar entra com o e-mail e a senha acima. Os dados ficam só neste navegador.</p>
          <div className="grid gap-2">
            {USUARIOS_DEMO.map((u) => (
              <Botao key={u.id} variante="secundario" disabled={enviando} onClick={() => void enviar(undefined, u.email, u.senha)} className="justify-start text-left">
                <span className="flex flex-col items-start leading-tight">
                  <span>{u.nome}</span>
                  <span className="text-xs font-normal text-gray-600">{u.papel}</span>
                </span>
              </Botao>
            ))}
          </div>
          <Botao variante="fantasma" className="mt-2 w-full" onClick={() => { if (window.confirm("Apagar todas as empresas, lojas, usuários e lançamentos da demonstração?")) { reiniciarDemo(); window.location.reload(); } }}>
            <RotateCcw className="size-4" aria-hidden /> Apagar tudo o que foi cadastrado na demonstração
          </Botao>
        </Cartao>
      )}
    </main>
  );
}
