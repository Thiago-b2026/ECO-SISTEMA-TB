// Planos de ação: meus, da loja, atrasados (calculado), aguardando validação, encerrados. Supervisor cria plano manual.
import { useState } from "react";
import { Link } from "react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { equipeDaLoja } from "../data/equipe";
import { ChevronRight, Plus } from "lucide-react";
import { useApp } from "../app/contexto";
import { useDados } from "../app/dados";
import { nivel } from "../data/servidor";
import { SETORES, nomeSetor } from "../data/seed-modelos";
import { planoAtrasado } from "../domain/situacao";
import { dataHoraSP, dataSP, instanteSP, somarDias } from "../domain/tempo";
import type { PlanoAcao } from "../domain/tipos";
import { Aviso, Botao, Campo, Cartao, Carregando, Titulo, Vazio, classeEntrada, cx } from "../ui/base";
import { SeloPlano } from "../ui/estados";

type Filtro = "meus" | "abertos" | "atrasados" | "validacao" | "encerrados";

export default function Planos() {
  const { lojaAtual, perfil, sessao } = useApp();
  const { db, repo } = useDados();
  const supervisor = nivel(perfil) >= 2;
  const [filtro, setFiltro] = useState<Filtro>(supervisor ? "abertos" : "meus");
  const [novo, setNovo] = useState(false);
  const usuario = sessao!.usuario_id;
  const loja = lojaAtual?.loja_id;

  const d = useLiveQuery(async () => {
    if (!loja) return null;
    const planos = await db.planos.where("loja_id").equals(loja).toArray();
    const membros = await equipeDaLoja(db, loja);
    return { planos, membros };
  }, [loja]);

  if (!lojaAtual) return <Vazio>Você ainda não está na equipe de nenhuma unidade.</Vazio>;
  if (!d) return <Carregando />;

  const aberto = (p: PlanoAcao) => p.status !== "concluido" && p.status !== "cancelado";
  const filtros: { id: Filtro; nome: string; f: (p: PlanoAcao) => boolean; so?: boolean }[] = [
    { id: "meus", nome: "Meus", f: (p) => p.responsavel_id === usuario && aberto(p) },
    { id: "abertos", nome: "Abertos", f: aberto, so: true },
    { id: "atrasados", nome: "Atrasados", f: (p) => planoAtrasado(p) && (supervisor || p.responsavel_id === usuario) },
    { id: "validacao", nome: "Aguardando validação", f: (p) => p.status === "aguardando_validacao" },
    { id: "encerrados", nome: "Encerrados", f: (p) => !aberto(p) },
  ];
  const atual = filtros.find((x) => x.id === filtro)!;
  const lista = d.planos.filter(atual.f).sort((a, b) => Number(planoAtrasado(b)) - Number(planoAtrasado(a)) || a.prazo.localeCompare(b.prazo));
  const nome = (u: string | null | undefined) => d.membros.find((m) => m.usuario_id === u)?.nome ?? (u ? "—" : "Sem responsável");

  return (
    <div className="space-y-4">
      <Titulo acao={supervisor && <Botao variante="secundario" onClick={() => setNovo((v) => !v)}><Plus className="size-5" aria-hidden /> Novo plano</Botao>}>Planos de ação</Titulo>
      {novo && <NovoPlano lojaId={lojaAtual.loja_id} membros={d.membros} onFeito={() => setNovo(false)} criar={(p) => repo.criarPlano(p)} />}
      <div role="tablist" aria-label="Filtro" className="flex gap-2 overflow-x-auto pb-1">
        {filtros.filter((x) => !x.so || supervisor).map((x) => (
          <button key={x.id} role="tab" aria-selected={filtro === x.id} onClick={() => setFiltro(x.id)}
            className={cx("min-h-11 shrink-0 rounded-full border-2 px-4 text-sm font-semibold", filtro === x.id ? "border-marca bg-marca text-white" : "border-gray-300 bg-white")}>
            {x.nome} ({d.planos.filter(x.f).length})
          </button>
        ))}
      </div>
      {lista.length === 0 ? <Vazio>Nenhum plano de ação aqui.</Vazio> : (
        <ul className="space-y-2">
          {lista.map((p) => (
            <li key={p.id}>
              <Link to={`/planos/${p.id}`} className="block">
                <Cartao className={cx("flex items-center gap-3 hover:border-marca", planoAtrasado(p) && "border-red-300")}>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold leading-snug">{p.titulo}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-700">
                      <SeloPlano p={p} />
                      <span>Prazo {dataHoraSP(p.prazo)}</span>
                      <span>· {nome(p.responsavel_id)}</span>
                      {p.setor && <span>· {nomeSetor(p.setor)}</span>}
                    </div>
                  </div>
                  <ChevronRight className="size-6 shrink-0 text-gray-500" aria-hidden />
                </Cartao>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NovoPlano({ lojaId, membros, criar, onFeito }: {
  lojaId: string; membros: { usuario_id: string; nome: string; ativo: boolean }[];
  criar: (p: { loja_id: string; titulo: string; descricao: string | null; responsavel_id: string | null; prazo: string; setor: string | null }) => Promise<string>;
  onFeito: () => void;
}) {
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [resp, setResp] = useState("");
  const [setor, setSetor] = useState("");
  const [prazo, setPrazo] = useState(somarDias(dataSP(), 1));
  const [erro, setErro] = useState<string | null>(null);
  async function salvar() {
    setErro(null);
    try {
      await criar({ loja_id: lojaId, titulo, descricao: descricao.trim() || null, responsavel_id: resp || null, prazo: instanteSP(prazo, "18:00"), setor: setor || null });
      onFeito();
    } catch (e) {
      setErro((e as Error).message);
    }
  }
  return (
    <Cartao className="space-y-3">
      <Campo rotulo="O que precisa ser feito?"><input className={classeEntrada} value={titulo} onChange={(e) => setTitulo(e.target.value)} /></Campo>
      <Campo rotulo="Detalhes"><textarea className={cx(classeEntrada, "min-h-20 py-2")} value={descricao} onChange={(e) => setDescricao(e.target.value)} /></Campo>
      <div className="grid gap-3 sm:grid-cols-3">
        <Campo rotulo="Responsável">
          <select className={classeEntrada} value={resp} onChange={(e) => setResp(e.target.value)}>
            <option value="">Sem responsável</option>
            {membros.filter((m) => m.ativo).map((m) => <option key={m.usuario_id} value={m.usuario_id}>{m.nome}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Setor">
          <select className={classeEntrada} value={setor} onChange={(e) => setSetor(e.target.value)}>
            <option value="">—</option>
            {Object.entries(SETORES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Prazo (até 18:00)"><input type="date" className={classeEntrada} value={prazo} onChange={(e) => setPrazo(e.target.value)} /></Campo>
      </div>
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      <Botao onClick={salvar}>Criar plano</Botao>
    </Cartao>
  );
}
