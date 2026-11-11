// Pré-visualização: o checklist como o operador vai ver, com as condicionais funcionando. Nada é gravado.
import { useState } from "react";
import { AlarmClock, Camera, GitBranch } from "lucide-react";
import { itemVisivel, mapaRespostas, pendencias, pontuacaoExecucao, textoPontuacao, todosItens } from "../domain/regras";
import { NOMES_DIA, dataSP, diaSemana } from "../domain/tempo";
import type { ConteudoModelo, Resposta, ValorResposta } from "../domain/tipos";
import { Cartao, Selo, classeEntrada } from "./base";
import { CampoResposta } from "./CampoResposta";

export function PreviaChecklist({ conteudo, nomeSetor }: { conteudo: ConteudoModelo; nomeSetor: (s?: string) => string }) {
  const [rs, setRs] = useState<Resposta[]>([]);
  const [dia, setDia] = useState(diaSemana(dataSP()));
  const itens = todosItens(conteudo);
  const porId = new Map(itens.map((i) => [i.id, i]));
  const mapa = mapaRespostas(rs);
  const responder = (item_id: string, valor: ValorResposta | null) =>
    setRs((x) => [...x.filter((r) => r.item_id !== item_id), { id: item_id, execucao_id: "previa", item_id, valor, respondido_em: new Date().toISOString() }]);
  const pend = pendencias(conteudo, rs, new Map(), dia);
  return (
    <div className="space-y-3">
      <Cartao className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-2">Simular o dia:
          <select className={classeEntrada} value={dia} onChange={(e) => setDia(Number(e.target.value))}>
            {NOMES_DIA.map((n, d) => <option key={n} value={d}>{n}</option>)}
          </select>
        </label>
        <span>Nota: <b>{textoPontuacao(pontuacaoExecucao(conteudo, rs, dia))}</b></span>
        <span>Pendências: <b>{pend.length}</b> (fotos não contam na prévia)</span>
      </Cartao>
      {conteudo.secoes.map((s) => {
        const vis = s.itens.filter((i) => itemVisivel(porId.get(i.id)!, porId, mapa, dia));
        return (
          <section key={s.id} className="space-y-2">
            <h3 className="font-bold text-marca">{s.titulo} <span className="text-sm font-normal text-gray-600">· {nomeSetor(s.setor)}</span></h3>
            {vis.length === 0 && <p className="text-sm text-gray-600">(nenhuma pergunta aparece nesta seção com as respostas/dia escolhidos)</p>}
            {vis.map((i0) => {
              const i = porId.get(i0.id)!;
              return (
                <Cartao key={i.id}>
                  <div className="mb-2 font-medium">{i.texto}</div>
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {i.obrigatorio && <Selo tom="neutro">Obrigatório</Selo>}
                    {i.foto === "sempre" && <Selo tom="info" icone={Camera}>Foto obrigatória</Selo>}
                    {i.foto === "se_nao_conforme" && <Selo tom="neutro" icone={Camera}>Foto se não conforme</Selo>}
                    {i.prazo_hora && <Selo tom="alerta" icone={AlarmClock}>Prazo {i.prazo_hora}</Selo>}
                    {i.condicao && <Selo tom="info" icone={GitBranch}>Pergunta extra</Selo>}
                    {i.pontua && <Selo tom="neutro">Peso {i.peso}</Selo>}
                  </div>
                  {i.ajuda && <p className="mb-2 text-sm text-gray-700">{i.ajuda}</p>}
                  {i.tipo === "assinatura" ? <div className="rounded-lg border-2 border-dashed p-4 text-center text-sm text-gray-600">Área de assinatura</div>
                    : i.tipo === "foto" ? <div className="rounded-lg border-2 border-dashed p-4 text-center text-sm text-gray-600">Botão da câmera</div>
                      : <CampoResposta item={i} valor={mapa.get(i.id)?.valor} onChange={(v) => responder(i.id, v)} />}
                </Cartao>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}
