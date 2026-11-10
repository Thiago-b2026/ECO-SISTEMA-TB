// Equipe e perfis (gestor). O LOGIN é criado só pelo admin, no Portal; aqui só se põe a pessoa na equipe da unidade.
// Ninguém é apagado: quem sai é inativado (o histórico continua).
import { useEffect, useState } from "react";
import { UserCheck, UserPlus, UserX } from "lucide-react";
import { useApp } from "../app/contexto";
import { useDados } from "../app/dados";
import { servidor } from "../data/conexao";
import { PERFIS, type Membro } from "../data/servidor";
import type { Perfil } from "../domain/tipos";
import { PORTAL_URL } from "../lib/telas";
import { Aviso, Botao, Campo, Cartao, Carregando, Selo, Titulo, classeEntrada } from "../ui/base";

export default function Equipe() {
  const { lojaAtual, perfil } = useApp();
  const { sinc } = useDados();
  const [lista, setLista] = useState<Membro[] | null>(null);
  const [email, setEmail] = useState("");
  const [nome, setNome] = useState("");
  const [novoPerfil, setNovoPerfil] = useState<Perfil>("operador");
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const loja = lojaAtual?.loja_id;

  async function carregar() {
    if (!loja) return;
    try { setLista(await servidor.equipe(loja)); } catch (e) { setErro(`${(e as Error).message} (a tela de equipe precisa de internet)`); }
  }
  useEffect(() => { void carregar(); }, [loja]); // eslint-disable-line react-hooks/exhaustive-deps

  async function definir(em: string, p: Perfil, n: string, ativo: boolean, msg: string) {
    setErro(null); setOk(null); setOcupado(true);
    try {
      await servidor.definirMembro(em, loja!, p, n, ativo);
      await carregar();
      await sinc.baixar().catch(() => undefined);
      setOk(msg);
      setEmail(""); setNome("");
    } catch (e) { setErro((e as Error).message); } finally { setOcupado(false); }
  }

  if (!lojaAtual) return null;
  if (perfil !== "gestor") return <Aviso tom="erro" titulo="Acesso negado">Só o gestor da unidade define a equipe.</Aviso>;

  return (
    <div className="space-y-4">
      <Titulo>Equipe e perfis · {lojaAtual.nome}</Titulo>
      <Aviso tom="info">
        O login (e-mail e senha) é criado só pelo administrador, no <a className="font-semibold underline" href={PORTAL_URL}>Portal do Ecossistema TB</a>. Aqui você coloca a pessoa na equipe desta unidade e escolhe o perfil.
      </Aviso>
      <Cartao className="space-y-3">
        <h2 className="font-semibold">Adicionar à equipe</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <Campo rotulo="E-mail do login"><input type="email" className={classeEntrada} value={email} onChange={(e) => setEmail(e.target.value)} /></Campo>
          <Campo rotulo="Nome (como aparece no app)"><input className={classeEntrada} value={nome} onChange={(e) => setNome(e.target.value)} /></Campo>
          <Campo rotulo="Perfil">
            <select className={classeEntrada} value={novoPerfil} onChange={(e) => setNovoPerfil(e.target.value as Perfil)}>
              {(Object.keys(PERFIS) as Perfil[]).map((p) => <option key={p} value={p}>{PERFIS[p]}</option>)}
            </select>
          </Campo>
        </div>
        <p className="text-xs text-gray-600">Operador: executa as próprias tarefas. Supervisor: vê a loja, valida, trata planos e agenda. Gestor: tudo, inclusive modelos e equipe.</p>
        <Botao disabled={!email.trim()} carregando={ocupado} onClick={() => definir(email, novoPerfil, nome, true, "Pessoa incluída na equipe.")}><UserPlus className="size-5" aria-hidden /> Adicionar</Botao>
      </Cartao>
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {ok && <Aviso tom="ok">{ok}</Aviso>}
      {!lista ? !erro && <Carregando /> : (
        <ul className="space-y-2">
          {lista.map((m) => (
            <li key={m.usuario_id}>
              <Cartao className="flex flex-wrap items-center gap-2">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{m.nome}</div>
                  <div className="mt-1 flex gap-2">{m.ativo ? <Selo tom="ok" icone={UserCheck}>Ativo</Selo> : <Selo tom="neutro" icone={UserX}>Inativo</Selo>}<Selo tom="info">{PERFIS[m.perfil]}</Selo></div>
                </div>
                <PerfilInline m={m} ocupado={ocupado} onSalvar={(p, ativo) => definirPorId(m, p, ativo)} />
              </Cartao>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  async function definirPorId(m: Membro, p: Perfil, ativo: boolean) {
    setErro(null); setOk(null); setOcupado(true);
    try {
      await servidor.alterarMembro(m.usuario_id, loja!, p, ativo);
      await carregar();
      await sinc.baixar().catch(() => undefined);
      setOk(`${m.nome}: ${PERFIS[p]}${ativo ? "" : " (inativo)"}.`);
    } catch (e) { setErro((e as Error).message); } finally { setOcupado(false); }
  }
}

function PerfilInline({ m, ocupado, onSalvar }: { m: Membro; ocupado: boolean; onSalvar: (p: Perfil, ativo: boolean) => void }) {
  const [p, setP] = useState<Perfil>(m.perfil);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label>
        <span className="sr-only">Perfil de {m.nome}</span>
        <select className={classeEntrada} value={p} onChange={(e) => setP(e.target.value as Perfil)}>
          {(Object.keys(PERFIS) as Perfil[]).map((x) => <option key={x} value={x}>{PERFIS[x]}</option>)}
        </select>
      </label>
      {p !== m.perfil && <Botao carregando={ocupado} onClick={() => onSalvar(p, m.ativo)}>Salvar</Botao>}
      <Botao variante="fantasma" carregando={ocupado} onClick={() => onSalvar(m.perfil, !m.ativo)}>{m.ativo ? "Inativar" : "Reativar"}</Botao>
    </div>
  );
}
