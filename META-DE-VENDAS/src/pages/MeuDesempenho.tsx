import { useEffect, useState, type FormEvent } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useApp, useDados } from "../app/contexto";
import { useMesAtual } from "../app/mes";
import { servidor } from "../data/conexao";
import { quantoFalta } from "../domain/premiacao";
import { fmtBRL, fmtInt, fmtPct, lerNumero, mesCurto, mesLongo, ultimosMeses } from "../lib/formato";
import { Aviso, Botao, Campo, Carregando, Cartao, classeEntrada, Titulo, Vazio } from "../ui/base";
import { Indicador, SeloFaixa, SeloFechado } from "../ui/resultado";

export default function MeuDesempenho() {
  const { unidade, acesso, escolherUnidade, mes, pode, recarregar } = useApp();
  const eu = useDados(() => servidor.meuVendedor(), []);
  const { dadosMes: d, erro, carregando } = useMesAtual();
  const meses = ultimosMeses(6, mes);
  const historico = useDados(() => servidor.meusLancamentos(meses), [mes]);
  const [fat, setFat] = useState("");
  const [cli, setCli] = useState("");
  const [msg, setMsg] = useState<{ tom: "ok" | "erro"; texto: string } | null>(null);
  const [salvando, setSalvando] = useState(false);

  const meu = d?.resultado.vendedores.find((v) => v.vendedor_id === eu.dados?.id);
  useEffect(() => {
    setFat(meu ? String(meu.faturamento_realizado).replace(".", ",") : "");
    setCli(meu ? String(meu.clientes_engajados) : "");
    setMsg(null);
  }, [meu?.faturamento_realizado, meu?.clientes_engajados, mes]); // eslint-disable-line react-hooks/exhaustive-deps

  if (erro || eu.erro) return <Aviso tom="erro">{erro ?? eu.erro}</Aviso>;
  if (carregando || eu.carregando || !d) return <Carregando />;
  if (!eu.dados) return <Vazio>O seu login ainda não está ligado a um cadastro de vendedor. Peça ao gerente para ligar (tela Vendedores).</Vazio>;

  const vendedor = eu.dados;
  if (unidade && vendedor.loja_id !== unidade.id) {
    const daMinha = acesso?.unidades.find((u) => u.id === vendedor.loja_id);
    return (
      <Aviso tom="info" titulo="Você está vendo outra unidade"
        acao={daMinha ? <Botao variante="secundario" onClick={() => escolherUnidade(daMinha.id)}>Ver a minha loja</Botao> : undefined}>
        O seu cadastro de vendedor é de {daMinha?.nome ?? "outra unidade"}.
      </Aviso>
    );
  }

  const r = d.resultado;
  const minimo = d.meta?.percentual_minimo ?? 0.9;
  const podeLancar = pode("metas.meu_desempenho", "editar") && !d.fechado && vendedor.ativo;
  const falta = quantoFalta(d.meta, r.faturamento_loja);
  const barras = meses.map((m) => ({ mes: mesCurto(m), faturamento: historico.dados?.find((l) => l.mes_referencia === m)?.faturamento_realizado ?? 0 }));

  async function salvar(e: FormEvent) {
    e.preventDefault();
    const f = lerNumero(fat);
    const c = Number(cli || 0);
    if (!(f >= 0) || !Number.isInteger(c) || c < 0) {
      setMsg({ tom: "erro", texto: "Confira os números: faturamento em reais e clientes engajados como número inteiro." });
      return;
    }
    setSalvando(true);
    try {
      await servidor.salvarLancamento({ vendedor_id: vendedor.id, mes_referencia: mes, faturamento_realizado: f, clientes_engajados: c });
      setMsg({ tom: "ok", texto: "Resultado salvo." });
      recarregar();
    } catch (x) {
      setMsg({ tom: "erro", texto: (x as Error).message });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <>
      <Titulo>Meu desempenho — {mesLongo(mes)} <SeloFechado fechado={d.fechado} /></Titulo>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Indicador rotulo="Meu faturamento" valor={fmtBRL(meu?.faturamento_realizado)} detalhe={`${fmtPct(meu?.participacao)} do faturamento da loja`} />
        <Indicador rotulo="Clientes engajados" valor={fmtInt(meu?.clientes_engajados)} detalhe={`${fmtBRL(meu?.premio_engajamento)} de bônus`} />
        <Indicador rotulo={d.fechado ? "Meu prêmio" : "Meu prêmio (até agora)"} valor={fmtBRL(meu?.premio_total)} detalhe={`Faturamento ${fmtBRL(meu?.premio_faturamento)}`} />
        <Indicador rotulo="Faixa da loja" valor={fmtPct(r.percentual_atingido)} detalhe={<SeloFaixa faixa={r.faixa} minimo={minimo} />} />
      </div>
      {d.meta && r.faixa !== "100" && (
        <Aviso tom="info">
          A loja precisa de mais <b>{fmtBRL(r.faixa === "abaixo" ? falta.paraMinima : falta.para100)}</b> para chegar à {r.faixa === "abaixo" ? "meta mínima" : "meta 100%"}.
        </Aviso>
      )}
      {podeLancar && (
        <Cartao>
          <h2 className="mb-3 font-bold text-gray-900">Lançar o meu resultado de {mesLongo(mes)}</h2>
          <form onSubmit={salvar} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <Campo rotulo="Faturamento (R$)">
              <input className={classeEntrada} inputMode="decimal" value={fat} onChange={(e) => setFat(e.target.value)} placeholder="0,00" />
            </Campo>
            <Campo rotulo="Clientes engajados">
              <input className={classeEntrada} inputMode="numeric" value={cli} onChange={(e) => setCli(e.target.value)} placeholder="0" />
            </Campo>
            <Botao type="submit" carregando={salvando}>Salvar</Botao>
          </form>
          {msg && <div className="mt-3"><Aviso tom={msg.tom}>{msg.texto}</Aviso></div>}
        </Cartao>
      )}
      <Cartao>
        <h2 className="mb-2 font-bold text-gray-900">Meu faturamento — últimos 6 meses</h2>
        <div className="h-64" role="img" aria-label={barras.map((b) => `${b.mes}: ${fmtBRL(b.faturamento)}`).join("; ")}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={barras}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="mes" />
              <YAxis tickFormatter={(v: number) => `${Math.round(v / 1000)} mil`} width={60} />
              <Tooltip formatter={(v) => fmtBRL(Number(v))} />
              <Bar dataKey="faturamento" name="Faturamento" fill="#0f5132" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Cartao>
    </>
  );
}
