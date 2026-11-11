// Relatórios: execuções do período (servidor) → Excel; PDF de cada execução.
import { useEffect, useState } from "react";
import { FileDown, FileSpreadsheet, RefreshCw } from "lucide-react";
import { useApp } from "../app/contexto";
import { useDados } from "../app/dados";
import { servidor } from "../data/conexao";
import type { LinhaRelatorio } from "../data/servidor";
import { textoPontuacao } from "../domain/regras";
import { dataBR, dataSP, duracao, horaSP, somarDias } from "../domain/tempo";
import { baixarPdfExecucao } from "../lib/pdf-execucao";
import { baixar, gerarExcel, hojeArquivo } from "../lib/relatorios";
import { Aviso, Botao, Campo, Cartao, Carregando, Titulo, Vazio, classeEntrada } from "../ui/base";
import { SeloExecucao } from "../ui/estados";

export default function Relatorios() {
  const { lojas, empresaAtual } = useApp();
  const { db } = useDados();
  const minhas = lojas.filter((l) => l.perfil === "supervisor" || l.perfil === "gestor");
  const [de, setDe] = useState(somarDias(dataSP(), -6));
  const [ate, setAte] = useState(dataSP());
  const [loja, setLoja] = useState("");
  const [linhas, setLinhas] = useState<LinhaRelatorio[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  async function carregar() {
    setErro(null);
    setOcupado("lista");
    try { setLinhas(await servidor.relatorio(de, ate, loja || null, empresaAtual?.rede_id ?? null)); } catch (e) { setErro((e as Error).message); } finally { setOcupado(null); }
  }
  useEffect(() => { void carregar(); }, [de, ate, loja, empresaAtual?.rede_id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function excel() {
    if (!linhas) return;
    setErro(null);
    setOcupado("excel");
    try {
      const ids = loja ? [loja] : minhas.map((l) => l.loja_id);
      const planos = (await db.planos.where("loja_id").anyOf(ids).toArray()).filter((p) => p.criado_em.slice(0, 10) >= de && p.criado_em.slice(0, 10) <= somarDias(ate, 1));
      const membros = empresaAtual ? await db.membros.where("rede_id").equals(empresaAtual.rede_id).toArray() : [];
      const nomeLoja = loja ? minhas.find((l) => l.loja_id === loja)?.nome : "todas as unidades";
      baixar(await gerarExcel(linhas, planos, membros, `Check List – ${empresaAtual?.nome ?? ""} – ${nomeLoja} – ${dataBR(de)} a ${dataBR(ate)}`), `checklist-${hojeArquivo()}.xlsx`);
    } catch (e) { setErro((e as Error).message); } finally { setOcupado(null); }
  }

  async function pdf(l: LinhaRelatorio) {
    setErro(null);
    setOcupado(l.execucao_id);
    try { await baixarPdfExecucao(l.execucao_id, db, servidor, l.loja); } catch (e) { setErro(`PDF não gerado: ${(e as Error).message}`); } finally { setOcupado(null); }
  }

  return (
    <div className="space-y-4">
      <Titulo acao={<Botao variante="fantasma" onClick={carregar} carregando={ocupado === "lista"}><RefreshCw className="size-5" aria-hidden /> Atualizar</Botao>}>Relatórios</Titulo>
      <div className="grid gap-3 sm:grid-cols-3">
        <Campo rotulo="De"><input type="date" className={classeEntrada} value={de} max={ate} onChange={(e) => setDe(e.target.value)} /></Campo>
        <Campo rotulo="Até"><input type="date" className={classeEntrada} value={ate} min={de} onChange={(e) => setAte(e.target.value)} /></Campo>
        <Campo rotulo="Unidade">
          <select className={classeEntrada} value={loja} onChange={(e) => setLoja(e.target.value)}>
            <option value="">Todas as minhas</option>
            {minhas.map((l) => <option key={l.loja_id} value={l.loja_id}>{l.nome}</option>)}
          </select>
        </Campo>
      </div>
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      <Botao onClick={excel} disabled={!linhas?.length} carregando={ocupado === "excel"}><FileSpreadsheet className="size-5" aria-hidden /> Baixar Excel do período</Botao>
      {!linhas ? (ocupado === "lista" && <Carregando />) : linhas.length === 0 ? <Vazio>Nenhuma execução no período.</Vazio> : (
        <ul className="space-y-2">
          {linhas.map((l) => (
            <li key={l.execucao_id}>
              <Cartao className="flex flex-wrap items-center gap-2">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{l.modelo} <span className="text-sm font-normal text-gray-600">v{l.versao}</span></div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-700">
                    <SeloExecucao s={l.status as never} />
                    <span>{dataBR(l.data)} {horaSP(l.inicio)}{l.fim ? `–${horaSP(l.fim)}` : ""}</span>
                    <span>· {duracao(l.duracao_seg)}</span>
                    <span>· {l.pessoa}</span>
                    <span>· {l.loja}</span>
                    <span>· Nota {textoPontuacao({ percentual: l.pontuacao == null ? null : Number(l.pontuacao) })}</span>
                    {Number(l.nao_conformes) > 0 && <span>· {l.nao_conformes} não conforme(s)</span>}
                  </div>
                </div>
                <Botao variante="secundario" carregando={ocupado === l.execucao_id} onClick={() => pdf(l)}><FileDown className="size-5" aria-hidden /> PDF</Botao>
              </Cartao>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
