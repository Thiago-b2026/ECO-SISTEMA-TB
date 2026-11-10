// Modelos (gestor). Versão publicada NÃO muda (regra A): editar = criar rascunho → ajustar → publicar nova versão.
// MVP: ajusta os itens que existem (texto, peso, obrigatório, foto, observação, prazo, plano) e duplica item.
// O editor completo (criar seções, reordenar, condicionais) fica para depois (I2).
import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Copy, FilePlus2, Lock, Rocket, Save } from "lucide-react";
import { useDados } from "../app/dados";
import { servidor } from "../data/conexao";
import { nomeSetor } from "../data/seed-modelos";
import { novoId } from "../domain/ids";
import { todosItens } from "../domain/regras";
import { dataHoraSP } from "../domain/tempo";
import type { Item, ModeloVersao, RegraFoto, RegraObs } from "../domain/tipos";
import { Aviso, Botao, Cartao, Carregando, Selo, Titulo, classeEntrada, cx } from "../ui/base";

const TIPOS: Record<string, string> = { sim_nao: "Sim/Não", conformidade: "Conforme/Não conforme", numero: "Número", texto: "Texto", multipla: "Múltipla escolha", assinatura: "Assinatura", foto: "Só foto" };

export default function Modelos() {
  const { db, sinc } = useDados();
  const modelos = useLiveQuery(() => db.modelos.toArray().then((ms) => ms.sort((a, b) => a.nome.localeCompare(b.nome))), []);
  const [sel, setSel] = useState<string>("");
  const [versoes, setVersoes] = useState<ModeloVersao[] | null>(null);
  const [rasc, setRasc] = useState<ModeloVersao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function carregar(id: string) {
    setErro(null); setOk(null); setVersoes(null); setRasc(null);
    try {
      const vs = await servidor.versoesDoModelo(id);
      setVersoes(vs);
      setRasc(vs.find((v) => v.status === "rascunho") ?? null);
    } catch (e) { setErro(`${(e as Error).message} (a tela de modelos precisa de internet)`); }
  }
  useEffect(() => { if (sel) void carregar(sel); }, [sel]);

  async function acao(fn: () => Promise<unknown>, msg: string) {
    setErro(null); setOk(null); setOcupado(true);
    try { await fn(); await carregar(sel); await sinc.baixar().catch(() => undefined); setOk(msg); } catch (e) { setErro((e as Error).message); } finally { setOcupado(false); }
  }

  if (!modelos) return <Carregando />;
  const publicada = versoes?.find((v) => v.status === "publicada");
  const mudarItem = (secId: string, itemId: string, p: Partial<Item>) => setRasc((r) => r && ({
    ...r, conteudo: { secoes: r.conteudo.secoes.map((s) => s.id !== secId ? s : { ...s, itens: s.itens.map((i) => i.id === itemId ? { ...i, ...p } : i) }) },
  }));
  const duplicar = (secId: string, itemId: string) => setRasc((r) => r && ({
    ...r, conteudo: { secoes: r.conteudo.secoes.map((s) => {
      if (s.id !== secId) return s;
      const idx = s.itens.findIndex((i) => i.id === itemId);
      const copia = { ...s.itens[idx], id: `${s.itens[idx].id}_${novoId().slice(0, 4)}`, texto: `${s.itens[idx].texto} (cópia)` };
      return { ...s, itens: [...s.itens.slice(0, idx + 1), copia, ...s.itens.slice(idx + 1)] };
    }) },
  }));

  return (
    <div className="space-y-4">
      <Titulo>Modelos de checklist</Titulo>
      <label className="block">
        <span className="mb-1 block text-sm font-semibold">Modelo</span>
        <select className={classeEntrada} value={sel} onChange={(e) => setSel(e.target.value)}>
          <option value="">Escolha…</option>
          {modelos.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
        </select>
      </label>
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {ok && <Aviso tom="ok">{ok}</Aviso>}
      {sel && !versoes && !erro && <Carregando />}
      {versoes && (
        <Cartao>
          <h2 className="mb-2 font-semibold">Versões</h2>
          <ul className="space-y-1 text-sm">
            {versoes.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center gap-2">
                <b>Versão {v.numero}</b>
                {v.status === "publicada" ? <Selo tom="ok" icone={Lock}>Publicada (não muda mais)</Selo> : v.status === "arquivada" ? <Selo tom="neutro" icone={Lock}>Arquivada</Selo> : <Selo tom="alerta">Rascunho</Selo>}
                {v.publicada_em && <span className="text-gray-600">em {dataHoraSP(v.publicada_em)}</span>}
                <span className="text-gray-600">· {todosItens(v.conteudo).length} itens</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-gray-600">Execuções antigas continuam ligadas à versão em que foram feitas.</p>
          {!rasc && (
            <Botao className="mt-3" variante="secundario" carregando={ocupado} onClick={() => acao(() => servidor.criarRascunho(sel), "Rascunho criado a partir da última versão.")}>
              <FilePlus2 className="size-5" aria-hidden /> Criar rascunho para editar
            </Botao>
          )}
        </Cartao>
      )}
      {!rasc && publicada && <Leitura v={publicada} />}
      {rasc && (
        <>
          <Aviso tom="alerta" titulo={`Editando o rascunho da versão ${rasc.numero}`}>Nada muda para quem executa até você publicar.</Aviso>
          {rasc.conteudo.secoes.map((s) => (
            <Cartao key={s.id}>
              <h3 className="mb-2 font-bold text-marca">{s.titulo} <span className="text-sm font-normal text-gray-600">· {nomeSetor(s.setor)}</span></h3>
              <ul className="space-y-3">
                {s.itens.map((i) => (
                  <li key={i.id} className="rounded-lg border p-3">
                    <label className="block text-sm">
                      <span className="font-semibold">Texto do item</span> <span className="text-gray-600">· {TIPOS[i.tipo]}{i.condicao ? " · pergunta condicional" : ""}</span>
                      <textarea className={cx(classeEntrada, "mt-1 min-h-16 py-2")} value={i.texto} onChange={(e) => mudarItem(s.id, i.id, { texto: e.target.value })} />
                    </label>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3 lg:grid-cols-6">
                      <label className="flex min-h-12 items-center gap-2"><input type="checkbox" className="size-5" checked={i.obrigatorio} onChange={(e) => mudarItem(s.id, i.id, { obrigatorio: e.target.checked })} /> Obrigatório</label>
                      <label className="flex min-h-12 items-center gap-2"><input type="checkbox" className="size-5" checked={i.gera_plano} onChange={(e) => mudarItem(s.id, i.id, { gera_plano: e.target.checked })} /> Plano se não conforme</label>
                      <label className="block">Foto
                        <select className={classeEntrada} value={i.foto} onChange={(e) => mudarItem(s.id, i.id, { foto: e.target.value as RegraFoto })}>
                          <option value="nunca">Não pede</option><option value="sempre">Obrigatória</option><option value="se_nao_conforme">Se não conforme</option>
                        </select>
                      </label>
                      <label className="block">Observação
                        <select className={classeEntrada} value={i.observacao} onChange={(e) => mudarItem(s.id, i.id, { observacao: e.target.value as RegraObs })}>
                          <option value="nunca">Opcional</option><option value="sempre">Obrigatória</option><option value="se_nao_conforme">Se não conforme</option>
                        </select>
                      </label>
                      <label className="block">Peso
                        <input type="number" min={0} max={10} step={0.5} className={classeEntrada} value={i.peso} disabled={!i.pontua} onChange={(e) => mudarItem(s.id, i.id, { peso: Number(e.target.value) })} />
                      </label>
                      <label className="block">Prazo
                        <input type="time" className={classeEntrada} value={i.prazo_hora ?? ""} onChange={(e) => mudarItem(s.id, i.id, { prazo_hora: e.target.value || undefined })} />
                      </label>
                    </div>
                    <Botao variante="fantasma" className="mt-1" onClick={() => duplicar(s.id, i.id)}><Copy className="size-5" aria-hidden /> Duplicar item</Botao>
                  </li>
                ))}
              </ul>
            </Cartao>
          ))}
          <div className="sticky bottom-16 z-10 flex flex-wrap gap-2 rounded-xl border bg-white p-3 shadow lg:bottom-2">
            <Botao variante="secundario" carregando={ocupado} onClick={() => acao(() => servidor.salvarRascunho(rasc), "Rascunho salvo.")}><Save className="size-5" aria-hidden /> Salvar rascunho</Botao>
            <Botao carregando={ocupado} onClick={() => { if (confirm(`Publicar a versão ${rasc.numero}? Ela não poderá mais ser alterada.`)) void acao(async () => { await servidor.salvarRascunho(rasc); await servidor.publicarVersao(rasc.id); }, `Versão ${rasc.numero} publicada.`); }}>
              <Rocket className="size-5" aria-hidden /> Publicar versão {rasc.numero}
            </Botao>
          </div>
        </>
      )}
    </div>
  );
}

function Leitura({ v }: { v: ModeloVersao }) {
  return (
    <Cartao>
      <h2 className="mb-2 font-semibold">Versão {v.numero} (publicada)</h2>
      {v.conteudo.secoes.map((s) => (
        <div key={s.id} className="mb-3">
          <div className="font-bold text-marca">{s.titulo}</div>
          <ol className="ml-5 list-decimal space-y-1 text-sm">
            {s.itens.map((i) => (
              <li key={i.id}>
                {i.texto}{" "}
                <span className="text-gray-600">({TIPOS[i.tipo]}{i.pontua ? `, peso ${i.peso}` : ""}{i.foto === "sempre" ? ", foto obrigatória" : i.foto === "se_nao_conforme" ? ", foto se NC" : ""}{i.prazo_hora ? `, prazo ${i.prazo_hora}` : ""})</span>
              </li>
            ))}
          </ol>
        </div>
      ))}
    </Cartao>
  );
}
