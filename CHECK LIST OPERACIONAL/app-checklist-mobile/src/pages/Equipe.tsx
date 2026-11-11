// Equipe e colaboradores da EMPRESA escolhida.
//  - Gestor da empresa: inclui quem JÁ tem login, troca perfil/unidade, inativa e reativa (nunca apaga o login).
//  - Admin: além disso, cadastra colaborador NOVO (cria o login pelo serviço central admin-usuarios)
//    e libera as telas do Check List conforme o perfil (permissões centrais).
import { useEffect, useState } from "react";
import { KeyRound, ShieldCheck, UserCheck, UserPlus, UserX } from "lucide-react";
import { useApp } from "../app/contexto";
import { useDados } from "../app/dados";
import { servidor } from "../data/conexao";
import { PERFIS, type Membro } from "../data/servidor";
import type { Perfil } from "../domain/tipos";
import { Aviso, Botao, Campo, Cartao, Carregando, Selo, Titulo, classeEntrada } from "../ui/base";

const TODA = "__empresa__";
const DESCRICAO: Record<Perfil, string> = {
  operador: "executa as próprias tarefas da unidade",
  supervisor: "vê a unidade, valida, trata planos e agenda",
  gestor: "tudo na empresa inteira, inclusive checklists e equipe",
};

function SeletorPerfilUnidade({ perfil, setPerfil, loja, setLoja, lojas }: {
  perfil: Perfil; setPerfil: (p: Perfil) => void; loja: string; setLoja: (l: string) => void; lojas: { loja_id: string; nome: string; tipo: string | null }[];
}) {
  return (
    <>
      <Campo rotulo="Perfil" ajuda={DESCRICAO[perfil]}>
        <select className={classeEntrada} value={perfil} onChange={(e) => { const p = e.target.value as Perfil; setPerfil(p); if (p === "gestor") setLoja(TODA); else if (loja === TODA) setLoja(lojas[0]?.loja_id ?? ""); }}>
          {(Object.keys(PERFIS) as Perfil[]).map((p) => <option key={p} value={p}>{PERFIS[p]}</option>)}
        </select>
      </Campo>
      <Campo rotulo="Unidade">
        <select className={classeEntrada} value={loja} disabled={perfil === "gestor"} onChange={(e) => setLoja(e.target.value)}>
          {perfil === "gestor" && <option value={TODA}>Empresa toda (gestor)</option>}
          {lojas.map((l) => <option key={l.loja_id} value={l.loja_id}>{l.nome}{l.tipo ? ` (${l.tipo})` : ""}</option>)}
        </select>
      </Campo>
    </>
  );
}

export default function Equipe() {
  const { empresaAtual, lojas, admin, maiorPerfil } = useApp();
  const { sinc } = useDados();
  const [lista, setLista] = useState<Membro[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [modo, setModo] = useState<"existente" | "novo">("existente");
  // formulário
  const [email, setEmail] = useState("");
  const [nome, setNome] = useState("");
  const [senha, setSenha] = useState("");
  const [perfil, setPerfil] = useState<Perfil>("operador");
  const [loja, setLoja] = useState(lojas[0]?.loja_id ?? "");
  const rede = empresaAtual?.rede_id;

  async function carregar() {
    if (!rede) return;
    try { setLista(await servidor.equipe(rede)); } catch (e) { setErro(`${(e as Error).message} (a tela de equipe precisa de internet)`); }
  }
  useEffect(() => { setLista(null); void carregar(); }, [rede]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!loja || (loja !== TODA && !lojas.some((l) => l.loja_id === loja))) setLoja(perfil === "gestor" ? TODA : lojas[0]?.loja_id ?? ""); }, [lojas]); // eslint-disable-line react-hooks/exhaustive-deps

  async function fazer(fn: () => Promise<unknown>, msg: string) {
    setErro(null); setOk(null); setOcupado(true);
    try { await fn(); await carregar(); await sinc.baixar().catch(() => undefined); setOk(msg); } catch (e) { setErro((e as Error).message); } finally { setOcupado(false); }
  }

  if (!empresaAtual) return <Aviso tom="alerta">Escolha uma empresa.</Aviso>;
  if (maiorPerfil !== "gestor") return <Aviso tom="erro" titulo="Acesso negado">Só o gestor da empresa define a equipe.</Aviso>;
  const lojaEscolhida = perfil === "gestor" || loja === TODA ? null : loja;
  const nomeLoja = (id: string | null) => (id ? lojas.find((l) => l.loja_id === id)?.nome ?? "Unidade" : "Empresa toda");

  return (
    <div className="space-y-4">
      <Titulo>Colaboradores · {empresaAtual.nome}</Titulo>
      <Aviso tom="info">
        O login (e-mail e senha) é do Ecossistema TB e vale para todos os sistemas. Tirar alguém da equipe aqui só <b>inativa</b> no Check List; o login nunca é apagado.
      </Aviso>

      <Cartao className="space-y-3">
        {admin && (
          <div role="tablist" aria-label="Como incluir" className="flex gap-2">
            {(["existente", "novo"] as const).map((m) => (
              <button key={m} role="tab" aria-selected={modo === m} onClick={() => setModo(m)}
                className={`min-h-11 rounded-full border-2 px-4 text-sm font-semibold ${modo === m ? "border-marca bg-marca text-white" : "border-gray-300 bg-white"}`}>
                {m === "existente" ? "Quem já tem login" : "Colaborador novo (cria o login)"}
              </button>
            ))}
          </div>
        )}
        <h2 className="font-semibold">{modo === "novo" ? "Cadastrar colaborador novo" : "Incluir quem já tem login"}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo rotulo="Nome (como aparece no app)"><input className={classeEntrada} value={nome} onChange={(e) => setNome(e.target.value)} /></Campo>
          <Campo rotulo="E-mail do login"><input type="email" autoComplete="off" className={classeEntrada} value={email} onChange={(e) => setEmail(e.target.value)} /></Campo>
          {modo === "novo" && (
            <Campo rotulo="Senha inicial" ajuda="Pelo menos 8 caracteres. Passe para a pessoa trocar depois.">
              <input type="text" autoComplete="new-password" className={classeEntrada} value={senha} onChange={(e) => setSenha(e.target.value)} />
            </Campo>
          )}
          <SeletorPerfilUnidade perfil={perfil} setPerfil={setPerfil} loja={loja} setLoja={setLoja} lojas={lojas} />
        </div>
        {modo === "novo" ? (
          <Botao disabled={!email.trim() || !nome.trim() || senha.length < 8} carregando={ocupado}
            onClick={() => fazer(async () => {
              await servidor.criarColaborador({ nome, email, senha, rede_id: empresaAtual.rede_id, loja_id: lojaEscolhida, perfil });
              setEmail(""); setNome(""); setSenha("");
            }, "Colaborador criado: login pronto e telas do Check List liberadas.")}>
            <KeyRound className="size-5" aria-hidden /> Criar login e incluir na equipe
          </Botao>
        ) : (
          <Botao disabled={!email.trim()} carregando={ocupado}
            onClick={() => fazer(async () => {
              await servidor.definirMembro(email, empresaAtual.rede_id, lojaEscolhida, perfil, nome, true);
              setEmail(""); setNome("");
            }, admin ? "Pessoa incluída. Use “Liberar telas” para ela já entrar funcionando." : "Pessoa incluída. Peça ao admin para liberar as telas do Check List para ela.")}>
            <UserPlus className="size-5" aria-hidden /> Incluir na equipe
          </Botao>
        )}
      </Cartao>

      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {ok && <Aviso tom="ok">{ok}</Aviso>}
      {!lista ? !erro && <Carregando /> : (
        <ul className="space-y-2">
          {lista.map((m) => (
            <li key={m.id}>
              <Cartao className="flex flex-wrap items-center gap-2">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{m.nome}</div>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {m.ativo ? <Selo tom="ok" icone={UserCheck}>Ativo</Selo> : <Selo tom="neutro" icone={UserX}>Inativo</Selo>}
                    <Selo tom="info">{PERFIS[m.perfil]}</Selo>
                    <Selo tom="neutro">{nomeLoja(m.loja_id)}</Selo>
                  </div>
                </div>
                <EditarMembro m={m} lojas={lojas} ocupado={ocupado}
                  onSalvar={(p, l, ativo) => fazer(() => servidor.alterarMembro(m.id, p, ativo, l), `${m.nome}: ${PERFIS[p]} · ${nomeLoja(p === "gestor" ? null : l)}${ativo ? "" : " (inativo)"}.`)} />
                {admin && (
                  <Botao variante="fantasma" carregando={ocupado} onClick={() => fazer(() => servidor.liberarAcesso(m.id), `Telas do Check List liberadas para ${m.nome} (${PERFIS[m.perfil]}).`)}>
                    <ShieldCheck className="size-5" aria-hidden /> Liberar telas
                  </Botao>
                )}
              </Cartao>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EditarMembro({ m, lojas, ocupado, onSalvar }: {
  m: Membro; lojas: { loja_id: string; nome: string; tipo: string | null }[]; ocupado: boolean; onSalvar: (p: Perfil, loja: string | null, ativo: boolean) => void;
}) {
  const [p, setP] = useState<Perfil>(m.perfil);
  const [l, setL] = useState(m.loja_id ?? TODA);
  const mudou = p !== m.perfil || (p !== "gestor" && l !== (m.loja_id ?? TODA));
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="grid grid-cols-2 gap-2"><SeletorPerfilUnidade perfil={p} setPerfil={setP} loja={l} setLoja={setL} lojas={lojas} /></div>
      {mudou && <Botao carregando={ocupado} disabled={p !== "gestor" && l === TODA} onClick={() => onSalvar(p, p === "gestor" ? null : l, m.ativo)}>Salvar</Botao>}
      <Botao variante="fantasma" carregando={ocupado} onClick={() => onSalvar(m.perfil, m.loja_id, !m.ativo)}>{m.ativo ? "Inativar" : "Reativar"}</Botao>
    </div>
  );
}
