import { Copy, Lock, LockOpen, Save } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useApp, useDados } from "../app/contexto";
import { useMesAtual } from "../app/mes";
import { servidor } from "../data/conexao";
import type { Meta } from "../data/servidor";
import { fmtBRL, lerNumero, mesLongo, somarMeses } from "../lib/formato";
import { Aviso, Botao, Campo, Carregando, Cartao, classeEntrada, Titulo } from "../ui/base";
import { SeloFechado } from "../ui/resultado";

type Form = Record<"meta_total" | "percentual_minimo" | "premio_meta_100" | "premio_meta_90" | "valor_por_cliente_engajado", string>;
const txt = (n: number) => String(n).replace(".", ",");
const paraForm = (m: Meta | null): Form => ({
  meta_total: m ? txt(m.meta_total) : "",
  percentual_minimo: txt(Math.round((m?.percentual_minimo ?? 0.9) * 10000) / 100),
  premio_meta_100: m ? txt(m.premio_meta_100) : "",
  premio_meta_90: m ? txt(m.premio_meta_90) : "",
  valor_por_cliente_engajado: m ? txt(m.valor_por_cliente_engajado) : "",
});

export default function Configuracao() {
  const { unidade, mes, pode, recarregar } = useApp();
  const { dadosMes: d, erro, carregando } = useMesAtual();
  const anterior = useDados(async () => (unidade ? (await servidor.metas(unidade.id, [somarMeses(mes, -1)]))[0] ?? null : null), [unidade?.id, mes]);
  const [f, setF] = useState<Form>(paraForm(null));
  const [msg, setMsg] = useState<{ tom: "ok" | "erro"; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    setF(paraForm(d?.meta ?? null));
    setMsg(null);
  }, [d?.meta, mes]);

  if (erro) return <Aviso tom="erro">{erro}</Aviso>;
  if (carregando || !d || !unidade) return <Carregando />;
  const podeEditar = pode("metas.configuracao", "editar") && !d.fechado;
  const podeFechar = pode("metas.configuracao", "fechar_mes");

  async function rodar(fn: () => Promise<void>, ok: string) {
    setOcupado(true);
    setMsg(null);
    try {
      await fn();
      setMsg({ tom: "ok", texto: ok });
      recarregar();
    } catch (x) {
      setMsg({ tom: "erro", texto: (x as Error).message });
    } finally {
      setOcupado(false);
    }
  }

  function salvar(e: FormEvent) {
    e.preventDefault();
    const n = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, lerNumero(v)])) as Record<keyof Form, number>;
    if (Object.values(n).some((x) => !(x >= 0)) || !(n.percentual_minimo > 0 && n.percentual_minimo <= 100)) {
      setMsg({ tom: "erro", texto: "Confira os valores: nada negativo e o % mínimo entre 1 e 100." });
      return;
    }
    if (n.premio_meta_90 > n.premio_meta_100) {
      setMsg({ tom: "erro", texto: "O prêmio da meta mínima não pode ser maior que o da meta 100%." });
      return;
    }
    void rodar(() => servidor.salvarMeta({ loja_id: unidade!.id, mes_referencia: mes, ...n, percentual_minimo: n.percentual_minimo / 100 }), "Meta salva.");
  }

  const campo = (k: keyof Form, rotulo: string, ajuda?: string) => (
    <Campo rotulo={rotulo} ajuda={ajuda}>
      <input className={classeEntrada} inputMode="decimal" disabled={!podeEditar} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
    </Campo>
  );

  return (
    <>
      <Titulo>Meta e fechamento — {mesLongo(mes)} <SeloFechado fechado={d.fechado} /></Titulo>
      {msg && <Aviso tom={msg.tom}>{msg.texto}</Aviso>}
      <Cartao>
        <form onSubmit={salvar} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {campo("meta_total", "Meta de faturamento da loja (R$)")}
            {campo("percentual_minimo", "Meta mínima (% da meta)", "Ex.: 90 — abaixo disso não há prêmio de faturamento.")}
            {campo("premio_meta_100", "Prêmio se bater 100% (R$)", "Dividido entre os vendedores pela participação.")}
            {campo("premio_meta_90", "Prêmio se bater a mínima (R$)")}
            {campo("valor_por_cliente_engajado", "Bônus por cliente engajado (R$)", "Avaliação no Google, contato salvo, Instagram.")}
          </div>
          {podeEditar && (
            <div className="flex flex-wrap gap-2">
              <Botao type="submit" carregando={ocupado}><Save className="size-4" aria-hidden /> Salvar meta</Botao>
              {anterior.dados && (
                <Botao type="button" variante="secundario" onClick={() => setF(paraForm(anterior.dados))}>
                  <Copy className="size-4" aria-hidden /> Copiar de {mesLongo(somarMeses(mes, -1))} ({fmtBRL(anterior.dados.meta_total)})
                </Botao>
              )}
            </div>
          )}
          {d.fechado && <Aviso tom="info">Mês fechado: a meta não pode ser alterada. Reabra o mês para mudar.</Aviso>}
        </form>
      </Cartao>
      {podeFechar && (
        <Cartao className="space-y-3">
          <h2 className="font-bold text-gray-900">Fechamento do mês</h2>
          <p className="text-sm text-gray-800">
            Fechar o mês trava os lançamentos e a meta de {mesLongo(mes)} nesta unidade, para todos, inclusive o administrador.
            Use quando o resultado estiver conferido e o prêmio for pago.
          </p>
          {d.fechado ? (
            <Botao variante="secundario" carregando={ocupado}
              onClick={() => window.confirm(`Reabrir ${mesLongo(mes)}? Os lançamentos e a meta voltam a poder ser alterados.`) && void rodar(() => servidor.reabrirMes(unidade.id, mes), "Mês reaberto.")}>
              <LockOpen className="size-4" aria-hidden /> Reabrir o mês
            </Botao>
          ) : (
            <Botao carregando={ocupado} disabled={!d.meta}
              onClick={() => window.confirm(`Fechar ${mesLongo(mes)} em ${unidade.nome}? Ninguém mais altera os números até reabrir.`) && void rodar(() => servidor.fecharMes(unidade.id, mes), "Mês fechado.")}>
              <Lock className="size-4" aria-hidden /> Fechar o mês
            </Botao>
          )}
          {!d.fechado && !d.meta && <p className="text-sm text-gray-700">Cadastre a meta antes de fechar o mês.</p>}
        </Cartao>
      )}
    </>
  );
}
