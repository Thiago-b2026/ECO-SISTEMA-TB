// Editor do RASCUNHO de um checklist: seções (setor, renomear, subir/descer, remover) e itens (tipo, obrigatório,
// pontua/peso, foto, observação, prazo, dias da semana, plano, ajuda, opções, condicional) e TEMPO PADRÃO
// (do checklist e de cada item), com a sugestão "usar como padrão" depois de 5 execuções.
import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, Copy, GitBranch, Plus, Timer, Trash2, Wand2 } from "lucide-react";
import {
  ROTULO_TIPO, adicionarItem, adicionarSecao, alterarItem, alterarSecao, candidatasCondicao, definirCondicao, definirTempoItem, definirTempoPadrao, dependentes, duplicarItem,
  moverItem, moverSecao, removerItem, removerSecao, respostasPossiveis,
} from "../domain/editor";
import { NOMES_DIA } from "../domain/tempo";
import { MINIMO_SUGESTAO, minutosBR } from "../domain/tempos";
import type { ConteudoModelo, Item, RegraFoto, RegraObs, TipoItem } from "../domain/tipos";
import { Botao, Campo, Cartao, Selo, classeEntrada, cx } from "./base";

interface Props {
  conteudo: ConteudoModelo;
  setores: { codigo: string; nome: string }[];
  onChange: (c: ConteudoModelo) => void;
  /** médias reais (≥ 5 execuções) para sugerir como padrão; undefined = ainda carregando / sem acesso */
  sugestoes?: SugestoesTempo;
}

export interface SugestoesTempo {
  checklist: { n: number; media_min: number } | null;
  itens: Map<string, { n: number; media_min: number }>;
}

const lerMinutos = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));

/** Campo de minutos + sugestão "usar como padrão". */
function CampoTempo({ rotulo, valor, sugestao, onChange, passo = 1 }: {
  rotulo: string; valor: number | undefined; sugestao?: { n: number; media_min: number } | null; onChange: (m: number | null) => void; passo?: number;
}) {
  const mostrar = sugestao && sugestao.media_min !== valor;
  const comoTexto = (m: number | undefined) => (m == null ? "" : String(m).replace(".", ","));
  // texto local: deixa digitar "1," sem perder a vírgula; vale o número quando ele é válido
  const [texto, setTexto] = useState(comoTexto(valor));
  useEffect(() => { setTexto((t) => (lerMinutos(t) === (valor ?? null) ? t : comoTexto(valor))); }, [valor]);
  const invalido = texto.trim() !== "" && !(Number(texto.replace(",", ".")) > 0);
  return (
    <div className="space-y-2">
      <Campo rotulo={rotulo}>
        <input type="text" inputMode="decimal" className={cx(classeEntrada, invalido && "border-red-500")} value={texto} placeholder="sem padrão"
          aria-invalid={invalido || undefined}
          onChange={(e) => {
            const t = e.target.value.replace(/[^\d.,]/g, "");
            setTexto(t);
            const m = lerMinutos(t);
            if (m == null || (Number.isFinite(m) && m > 0)) onChange(m == null ? null : Math.round(m / passo) * passo);
          }} />
      </Campo>
      {mostrar && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 p-2 text-sm text-sky-900" role="note">
          <span>Tempo médio real: <b>{minutosBR(sugestao.media_min)}</b> em {sugestao.n} execuções.</span>
          <Botao variante="secundario" className="min-h-10 px-3 text-sm" onClick={() => onChange(sugestao.media_min)}><Wand2 className="size-4" aria-hidden /> Usar como padrão</Botao>
        </div>
      )}
    </div>
  );
}

const TIPOS = Object.keys(ROTULO_TIPO) as TipoItem[];

export function EditorChecklist({ conteudo, setores, onChange, sugestoes }: Props) {
  const [aberto, setAberto] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const aplicar = (fn: () => ConteudoModelo) => { setErro(null); try { onChange(fn()); } catch (e) { setErro((e as Error).message); } };

  return (
    <div className="space-y-3">
      <Cartao className="space-y-2">
        <h3 className="flex items-center gap-2 font-semibold"><Timer className="size-5" aria-hidden /> Tempo de execução</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <CampoTempo rotulo="Tempo padrão do checklist (min)" valor={conteudo.tempo_padrao_min} sugestao={sugestoes?.checklist}
            onChange={(m) => aplicar(() => definirTempoPadrao(conteudo, m))} />
        </div>
        <p className="text-xs text-gray-600">
          Opcional. Serve de referência nos Tempos de execução e no Dashboard (no tempo, acima, muito acima, rápido demais). Sem padrão, a comparação é com a média do período.
          {sugestoes && !sugestoes.checklist && ` A sugestão aparece depois de ${MINIMO_SUGESTAO} execuções concluídas.`}
          {" "}O tempo padrão de cada item fica dentro do item.
        </p>
      </Cartao>
      {conteudo.secoes.map((s, si) => (
        <Cartao key={s.id} className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <Campo rotulo={`Seção ${si + 1}`}><input className={classeEntrada} value={s.titulo} onChange={(e) => aplicar(() => alterarSecao(conteudo, s.id, { titulo: e.target.value }))} /></Campo>
            <Campo rotulo="Setor">
              <select className={classeEntrada} value={s.setor ?? ""} onChange={(e) => aplicar(() => alterarSecao(conteudo, s.id, { setor: e.target.value || undefined }))}>
                <option value="">—</option>
                {setores.map((x) => <option key={x.codigo} value={x.codigo}>{x.nome}</option>)}
              </select>
            </Campo>
            <div className="flex gap-1">
              <Botao variante="fantasma" aria-label="Subir seção" disabled={si === 0} onClick={() => aplicar(() => moverSecao(conteudo, s.id, -1))}><ArrowUp className="size-5" /></Botao>
              <Botao variante="fantasma" aria-label="Descer seção" disabled={si === conteudo.secoes.length - 1} onClick={() => aplicar(() => moverSecao(conteudo, s.id, 1))}><ArrowDown className="size-5" /></Botao>
              <Botao variante="fantasma" aria-label="Remover seção" onClick={() => { if (confirm(`Remover a seção "${s.titulo}" e os ${s.itens.length} itens dela (só no rascunho)?`)) aplicar(() => removerSecao(conteudo, s.id)); }}><Trash2 className="size-5 text-red-700" /></Botao>
            </div>
          </div>

          <ol className="space-y-2">
            {s.itens.map((i, ii) => (
              <li key={i.id} className="rounded-lg border">
                <div className="flex flex-wrap items-center gap-2 p-2">
                  <button type="button" className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left" aria-expanded={aberto === i.id} onClick={() => setAberto(aberto === i.id ? null : i.id)}>
                    <ChevronDown className={cx("size-5 shrink-0 transition", aberto === i.id && "rotate-180")} aria-hidden />
                    <span className="min-w-0 flex-1 truncate font-medium">{ii + 1}. {i.texto || "(sem texto)"}</span>
                  </button>
                  <Selo tom="neutro">{ROTULO_TIPO[i.tipo]}</Selo>
                  {i.condicao && <Selo tom="info" icone={GitBranch}>Condicional</Selo>}
                  {i.tempo_padrao_min ? <Selo tom="neutro" icone={Timer}>{minutosBR(i.tempo_padrao_min)}</Selo> : null}
                  <Botao variante="fantasma" aria-label="Subir item" disabled={ii === 0} onClick={() => aplicar(() => moverItem(conteudo, i.id, -1))}><ArrowUp className="size-5" /></Botao>
                  <Botao variante="fantasma" aria-label="Descer item" disabled={ii === s.itens.length - 1} onClick={() => aplicar(() => moverItem(conteudo, i.id, 1))}><ArrowDown className="size-5" /></Botao>
                  <Botao variante="fantasma" aria-label="Duplicar item" onClick={() => aplicar(() => duplicarItem(conteudo, i.id))}><Copy className="size-5" /></Botao>
                  <Botao variante="fantasma" aria-label="Remover item" onClick={() => {
                    const dep = dependentes(conteudo, i.id);
                    if (confirm(dep.length ? `Remover? ${dep.length} pergunta(s) dependem desta e vão perder a condição.` : "Remover este item do rascunho?")) aplicar(() => removerItem(conteudo, i.id));
                  }}><Trash2 className="size-5 text-red-700" /></Botao>
                </div>
                {aberto === i.id && <ItemForm conteudo={conteudo} item={i} aplicar={aplicar} sugestao={sugestoes?.itens.get(i.id) ?? null} />}
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">Adicionar item:</span>
            {TIPOS.map((t) => (
              <Botao key={t} variante="secundario" className="min-h-10 px-3 text-sm" onClick={() => { const r = adicionarItem(conteudo, s.id, t); onChange(r.conteudo); setAberto(r.itemId); }}>
                <Plus className="size-4" aria-hidden /> {ROTULO_TIPO[t]}
              </Botao>
            ))}
          </div>
        </Cartao>
      ))}
      {erro && <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-2 text-sm text-red-900">{erro}</div>}
      <Botao variante="secundario" onClick={() => aplicar(() => adicionarSecao(conteudo))}><Plus className="size-5" aria-hidden /> Nova seção</Botao>
    </div>
  );
}

function ItemForm({ conteudo, item: i, aplicar, sugestao }: { conteudo: ConteudoModelo; item: Item; aplicar: (fn: () => ConteudoModelo) => void; sugestao: { n: number; media_min: number } | null }) {
  const set = (p: Partial<Item>) => aplicar(() => alterarItem(conteudo, i.id, p));
  const candidatas = candidatasCondicao(conteudo, i.id);
  const mae = i.condicao ? candidatas.find((c) => c.id === i.condicao!.item_id) : undefined;
  const avaliativo = i.tipo === "sim_nao" || i.tipo === "conformidade" || i.tipo === "numero";
  return (
    <div className="space-y-3 border-t bg-gray-50 p-3">
      <Campo rotulo="Pergunta / tarefa"><textarea className={cx(classeEntrada, "min-h-16 py-2")} value={i.texto} onChange={(e) => set({ texto: e.target.value })} /></Campo>
      <div className="grid gap-3 sm:grid-cols-3">
        <Campo rotulo="Tipo de resposta">
          <select className={classeEntrada} value={i.tipo} onChange={(e) => set({ tipo: e.target.value as TipoItem })}>
            {TIPOS.map((t) => <option key={t} value={t}>{ROTULO_TIPO[t]}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Foto">
          <select className={classeEntrada} value={i.foto} onChange={(e) => set({ foto: e.target.value as RegraFoto })}>
            <option value="nunca">Não pede</option><option value="sempre">Obrigatória</option><option value="se_nao_conforme">Se não conforme</option>
          </select>
        </Campo>
        <Campo rotulo="Observação">
          <select className={classeEntrada} value={i.observacao} onChange={(e) => set({ observacao: e.target.value as RegraObs })}>
            <option value="nunca">Opcional</option><option value="sempre">Obrigatória</option><option value="se_nao_conforme">Se não conforme</option>
          </select>
        </Campo>
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1">
        <label className="flex min-h-11 items-center gap-2"><input type="checkbox" className="size-5" checked={i.obrigatorio} onChange={(e) => set({ obrigatorio: e.target.checked })} /> Obrigatório</label>
        <label className={cx("flex min-h-11 items-center gap-2", !avaliativo && "opacity-50")}><input type="checkbox" className="size-5" disabled={!avaliativo} checked={i.pontua} onChange={(e) => set({ pontua: e.target.checked, peso: e.target.checked ? Math.max(i.peso, 1) : 0 })} /> Pontua na nota</label>
        <label className={cx("flex min-h-11 items-center gap-2", !avaliativo && "opacity-50")}><input type="checkbox" className="size-5" disabled={!avaliativo} checked={i.gera_plano} onChange={(e) => set({ gera_plano: e.target.checked })} /> Gera plano se não conforme</label>
        {i.tipo === "sim_nao" && <label className="flex min-h-11 items-center gap-2"><input type="checkbox" className="size-5" checked={!!i.permite_na} onChange={(e) => set({ permite_na: e.target.checked })} /> Permite N/A</label>}
        {i.tipo === "sim_nao" && <label className="flex min-h-11 items-center gap-2"><input type="checkbox" className="size-5" checked={i.resposta_esperada === false} onChange={(e) => set({ resposta_esperada: e.target.checked ? false : undefined })} /> “Não” é a resposta certa</label>}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Campo rotulo="Peso"><input type="number" min={0} max={10} step={0.5} className={classeEntrada} value={i.peso} disabled={!i.pontua} onChange={(e) => set({ peso: Number(e.target.value) })} /></Campo>
        <Campo rotulo="Prazo no dia (opcional)"><input type="time" className={classeEntrada} value={i.prazo_hora ?? ""} onChange={(e) => set({ prazo_hora: e.target.value || undefined })} /></Campo>
        <Campo rotulo="Relatório do CISS (opcional)"><input className={classeEntrada} value={i.ref_ciss ?? ""} onChange={(e) => set({ ref_ciss: e.target.value || undefined })} /></Campo>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <CampoTempo rotulo="Tempo padrão do item (min, opcional)" valor={i.tempo_padrao_min} sugestao={sugestao} passo={0.5}
          onChange={(m) => aplicar(() => definirTempoItem(conteudo, i.id, m))} />
      </div>
      {i.tipo === "numero" && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Campo rotulo="Mínimo (fora = não conforme)"><input type="number" className={classeEntrada} value={i.min ?? ""} onChange={(e) => set({ min: e.target.value === "" ? undefined : Number(e.target.value), pontua: true, peso: Math.max(i.peso, 1) })} /></Campo>
          <Campo rotulo="Máximo"><input type="number" className={classeEntrada} value={i.max ?? ""} onChange={(e) => set({ max: e.target.value === "" ? undefined : Number(e.target.value), pontua: true, peso: Math.max(i.peso, 1) })} /></Campo>
          <Campo rotulo="Unidade (ex.: °C)"><input className={classeEntrada} value={i.unidade ?? ""} onChange={(e) => set({ unidade: e.target.value || undefined })} /></Campo>
        </div>
      )}
      {i.tipo === "multipla" && (
        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold">Opções</legend>
          {(i.opcoes ?? []).map((o, n) => (
            <div key={n} className="flex gap-2">
              <input aria-label={`Opção ${n + 1}`} className={classeEntrada} value={o} onChange={(e) => set({ opcoes: (i.opcoes ?? []).map((x, k) => (k === n ? e.target.value : x)) })} />
              <Botao variante="fantasma" aria-label={`Remover opção ${n + 1}`} onClick={() => set({ opcoes: (i.opcoes ?? []).filter((_, k) => k !== n) })}><Trash2 className="size-5" /></Botao>
            </div>
          ))}
          <div className="flex flex-wrap gap-3">
            <Botao variante="secundario" onClick={() => set({ opcoes: [...(i.opcoes ?? []), `Opção ${(i.opcoes?.length ?? 0) + 1}`] })}><Plus className="size-4" aria-hidden /> Opção</Botao>
            <label className="flex min-h-11 items-center gap-2"><input type="checkbox" className="size-5" checked={!!i.multipla_selecao} onChange={(e) => set({ multipla_selecao: e.target.checked })} /> Pode marcar mais de uma</label>
          </div>
        </fieldset>
      )}
      <fieldset>
        <legend className="mb-1 text-sm font-semibold">Dias da semana (vazio = todos)</legend>
        <div className="flex flex-wrap gap-2">
          {NOMES_DIA.map((n, d) => {
            const on = (i.dias_semana ?? []).includes(d);
            return (
              <button key={n} type="button" role="checkbox" aria-checked={on}
                onClick={() => { const ds = on ? (i.dias_semana ?? []).filter((x) => x !== d) : [...(i.dias_semana ?? []), d].sort(); set({ dias_semana: ds.length ? ds : undefined }); }}
                className={cx("min-h-10 rounded-lg border-2 px-3 text-sm font-semibold", on ? "border-marca bg-marca text-white" : "border-gray-300 bg-white")}>
                {on ? "✓ " : ""}{n.slice(0, 3)}
              </button>
            );
          })}
        </div>
      </fieldset>
      <Campo rotulo="Texto de ajuda (como fazer)"><textarea className={cx(classeEntrada, "min-h-16 py-2")} value={i.ajuda ?? ""} onChange={(e) => set({ ajuda: e.target.value || undefined })} /></Campo>
      <fieldset className="space-y-2 rounded-lg border bg-white p-3">
        <legend className="px-1 text-sm font-semibold">Pergunta condicional</legend>
        {candidatas.length === 0 ? <p className="text-sm text-gray-600">Para ser condicional, precisa haver antes uma pergunta de sim/não, conformidade ou múltipla escolha.</p> : (
          <>
            <Campo rotulo="Mostrar esta pergunta só quando…">
              <select className={classeEntrada} value={i.condicao?.item_id ?? ""}
                onChange={(e) => aplicar(() => definirCondicao(conteudo, i.id, e.target.value ? { item_id: e.target.value, valores: [respostasPossiveis(candidatas.find((c) => c.id === e.target.value)!)[0].valor] } : null))}>
                <option value="">Sempre mostrar</option>
                {candidatas.map((c) => <option key={c.id} value={c.id}>{c.texto.slice(0, 70)}</option>)}
              </select>
            </Campo>
            {mae && (
              <div className="flex flex-wrap gap-2" role="group" aria-label="Respostas que mostram a pergunta">
                <span className="text-sm">…a resposta for:</span>
                {respostasPossiveis(mae).map((r) => {
                  const on = i.condicao!.valores.includes(r.valor);
                  return (
                    <button key={String(r.valor)} type="button" role="checkbox" aria-checked={on}
                      onClick={() => aplicar(() => definirCondicao(conteudo, i.id, { item_id: mae.id, valores: on ? i.condicao!.valores.filter((v) => v !== r.valor) : [...i.condicao!.valores, r.valor] }))}
                      className={cx("min-h-10 rounded-lg border-2 px-3 text-sm font-semibold", on ? "border-marca bg-marca text-white" : "border-gray-300 bg-white")}>
                      {on ? "✓ " : ""}{r.rotulo}
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}
      </fieldset>
    </div>
  );
}
