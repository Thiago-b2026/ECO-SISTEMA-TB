// Usuários e acessos (SÓ o admin). O login é o mesmo de todo o ecossistema; aqui o admin cria o login (se ainda
// não existir) e escolhe o perfil no Meta de Vendas, por unidade (ou a empresa toda, para o gestor).
// Tirar o acesso NUNCA apaga o login nem o histórico.
import { KeyRound, Plus, UserMinus, UserPlus } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useApp, useDados } from "../app/contexto";
import { servidor } from "../data/conexao";
import { NOME_PERFIL, type NovoAcesso, type Perfil, type UsuarioAcesso } from "../data/servidor";
import { Aviso, Botao, Campo, Carregando, Cartao, classeEntrada, cx, Selo, Titulo, Vazio } from "../ui/base";

type Form = NovoAcesso & { modo: "existente" | "novo"; senha: string };
const DESC_PERFIL: Record<Perfil, string> = {
  vendedor: "Vê o Ranking e o próprio desempenho. Opcional: lança o próprio resultado.",
  gerente: "Tudo da unidade: meta, lançamentos, vendedores, histórico e fechamento do mês.",
  gestor: "O mesmo do gerente, em todas as lojas da empresa que usam o Meta de Vendas.",
};

export default function Usuarios() {
  const { unidade, recarregarAcesso } = useApp();
  const empresas = useDados(() => servidor.empresas(), []);
  const [rede, setRede] = useState("");
  const usuarios = useDados(async () => (rede ? servidor.usuarios(rede) : []), [rede]);
  const [form, setForm] = useState<Form | null>(null);
  const [msg, setMsg] = useState<{ tom: "ok" | "erro"; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    if (!rede && empresas.dados?.length) setRede(unidade?.rede_id ?? empresas.dados[0].id);
  }, [empresas.dados, unidade?.rede_id, rede]);

  if (empresas.erro) return <Aviso tom="erro">{empresas.erro}</Aviso>;
  if (empresas.carregando || !empresas.dados) return <Carregando />;
  if (!empresas.dados.length) return <Vazio>Cadastre primeiro a empresa e as lojas em Empresas e lojas.</Vazio>;

  const empresa = empresas.dados.find((e) => e.id === rede);
  const lojasMetas = (empresa?.unidades ?? []).filter((u) => u.ativo && u.usaMetas);

  async function rodar(fn: () => Promise<void>, ok: string) {
    setOcupado(true);
    setMsg(null);
    try {
      await fn();
      setMsg({ tom: "ok", texto: ok });
      setForm(null);
      await recarregarAcesso();
    } catch (x) {
      setMsg({ tom: "erro", texto: (x as Error).message });
    } finally {
      setOcupado(false);
    }
  }

  const novo = (): Form => ({ modo: "existente", email: "", senha: "", nome: "", rede_id: rede, loja_id: lojasMetas[0]?.id ?? null, perfil: "vendedor", lanca: true });
  const trocar = (u: UsuarioAcesso): Form => ({
    modo: "existente", email: u.email, senha: "", nome: u.nome, rede_id: rede, loja_id: u.loja_id,
    perfil: u.perfil === "personalizado" ? "vendedor" : u.perfil, lanca: u.lanca,
  });

  function salvar(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    const a: NovoAcesso = { email: form.email.trim(), nome: form.nome.trim(), rede_id: rede, loja_id: form.perfil === "gestor" ? null : form.loja_id, perfil: form.perfil, lanca: form.perfil === "vendedor" && form.lanca };
    if (!a.email) return setMsg({ tom: "erro", texto: "Informe o e-mail." });
    if (form.perfil !== "gestor" && !a.loja_id) return setMsg({ tom: "erro", texto: "Escolha a unidade." });
    if (form.modo === "novo") {
      if (!a.nome) return setMsg({ tom: "erro", texto: "Informe o nome." });
      if (form.senha.length < 8) return setMsg({ tom: "erro", texto: "A senha precisa ter pelo menos 8 caracteres." });
      void rodar(() => servidor.criarLogin({ ...a, senha: form.senha }), `Login de ${a.nome} criado com o acesso de ${NOME_PERFIL[a.perfil]}. Passe o e-mail e a senha para a pessoa.`);
    } else {
      void rodar(() => servidor.darAcesso(a), `Acesso de ${a.email} salvo: ${NOME_PERFIL[a.perfil]}.`);
    }
  }

  // agrupa por pessoa
  const pessoas = [...new Map((usuarios.dados ?? []).map((u) => [u.user_id, (usuarios.dados ?? []).filter((x) => x.user_id === u.user_id)])).values()];

  return (
    <>
      <Titulo acao={!form && lojasMetas.length > 0 ? <Botao onClick={() => { setForm(novo()); setMsg(null); }}><Plus className="size-4" aria-hidden /> Dar acesso</Botao> : undefined}>
        Usuários e acessos
      </Titulo>
      <label className="block max-w-sm text-sm">
        <span className="mb-1 block font-semibold text-gray-800">Empresa</span>
        <select className={classeEntrada} value={rede} onChange={(e) => { setRede(e.target.value); setForm(null); }}>
          {empresas.dados.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
        </select>
      </label>
      {msg && <Aviso tom={msg.tom}>{msg.texto}</Aviso>}
      {!lojasMetas.length && <Aviso tom="alerta">Nenhuma loja desta empresa usa o Meta de Vendas. Marque em Empresas e lojas antes de dar acessos.</Aviso>}

      {form && (
        <Cartao>
          <form onSubmit={salvar} className="space-y-4">
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Quem vai receber o acesso">
              {(["existente", "novo"] as const).map((m) => (
                <button key={m} type="button" role="radio" aria-checked={form.modo === m} onClick={() => setForm({ ...form, modo: m })}
                  className={cx("flex min-h-12 items-center gap-2 rounded-lg border-2 px-3 font-semibold", form.modo === m ? "border-marca bg-marca-claro" : "border-gray-300")}>
                  {m === "existente" ? <><KeyRound className="size-4" aria-hidden /> Já tem login no Ecossistema</> : <><UserPlus className="size-4" aria-hidden /> Criar login novo</>}
                </button>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo rotulo="E-mail"><input className={classeEntrada} type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Campo>
              <Campo rotulo={form.modo === "novo" ? "Nome" : "Nome (para o cadastro de vendedor)"}>
                <input className={classeEntrada} value={form.nome} maxLength={80} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
              </Campo>
              {form.modo === "novo" && (
                <Campo rotulo="Senha inicial" ajuda="Pelo menos 8 caracteres. A pessoa pode trocar depois.">
                  <input className={classeEntrada} type="text" autoComplete="new-password" value={form.senha} onChange={(e) => setForm({ ...form, senha: e.target.value })} />
                </Campo>
              )}
            </div>
            <fieldset>
              <legend className="mb-2 text-sm font-semibold text-gray-800">Perfil no Meta de Vendas</legend>
              <div className="grid gap-2 sm:grid-cols-3">
                {(["vendedor", "gerente", "gestor"] as const).map((p) => (
                  <label key={p} className={cx("cursor-pointer rounded-lg border-2 p-3", form.perfil === p ? "border-marca bg-marca-claro" : "border-gray-300")}>
                    <span className="flex items-center gap-2 font-semibold">
                      <input type="radio" name="perfil" className="size-4" checked={form.perfil === p} onChange={() => setForm({ ...form, perfil: p })} /> {NOME_PERFIL[p]}
                    </span>
                    <span className="mt-1 block text-xs text-gray-700">{DESC_PERFIL[p]}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            {form.perfil !== "gestor" ? (
              <Campo rotulo="Unidade">
                <select className={classeEntrada} value={form.loja_id ?? ""} onChange={(e) => setForm({ ...form, loja_id: e.target.value })}>
                  {lojasMetas.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
                </select>
              </Campo>
            ) : (
              <p className="text-sm text-gray-800">Vale para: <b>{lojasMetas.map((u) => u.nome).join(", ")}</b>. Loja nova não entra sozinha: dê o acesso de novo depois de cadastrá-la.</p>
            )}
            {form.perfil === "vendedor" && (
              <label className="flex min-h-12 items-center gap-2 text-sm font-semibold">
                <input type="checkbox" className="size-5" checked={form.lanca} onChange={(e) => setForm({ ...form, lanca: e.target.checked })} /> Lança o próprio resultado (faturamento e clientes)
              </label>
            )}
            <div className="flex gap-2">
              <Botao type="submit" carregando={ocupado}>{form.modo === "novo" ? "Criar login e dar acesso" : "Salvar acesso"}</Botao>
              <Botao type="button" variante="secundario" onClick={() => setForm(null)}>Cancelar</Botao>
            </div>
          </form>
        </Cartao>
      )}

      {usuarios.erro ? <Aviso tom="erro">{usuarios.erro}</Aviso> : usuarios.carregando ? <Carregando /> : !pessoas.length ? (
        <Vazio>Ninguém tem acesso ao Meta de Vendas nesta empresa ainda.</Vazio>
      ) : (
        <ul className="space-y-2">
          {pessoas.map((acessos) => (
            <li key={acessos[0].user_id}>
              <Cartao>
                <div className="font-semibold">{acessos[0].nome}</div>
                <div className="text-sm text-gray-700">{acessos[0].email}</div>
                <ul className="mt-2 space-y-1">
                  {acessos.map((u) => (
                    <li key={u.loja_id} className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-2">
                      <span className="min-w-32 flex-1 text-sm">{u.loja}</span>
                      <Selo tom={u.perfil === "personalizado" ? "alerta" : "info"}>{NOME_PERFIL[u.perfil]}</Selo>
                      {u.perfil === "vendedor" && <Selo tom={u.lanca ? "ok" : "neutro"}>{u.lanca ? "Lança o próprio resultado" : "Só acompanha"}</Selo>}
                      <Botao variante="secundario" onClick={() => { setForm(trocar(u)); setMsg(null); window.scrollTo?.({ top: 0 }); }}>Trocar perfil</Botao>
                      <Botao variante="fantasma" carregando={ocupado}
                        onClick={() => window.confirm(`Tirar o acesso de ${u.nome} ao Meta de Vendas em ${u.loja}? O login e o histórico continuam.`)
                          && void rodar(() => servidor.removerAcesso(u.user_id, u.loja_id), `Acesso de ${u.nome} em ${u.loja} retirado.`)}>
                        <UserMinus className="size-4" aria-hidden /> Tirar acesso
                      </Botao>
                    </li>
                  ))}
                </ul>
              </Cartao>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
