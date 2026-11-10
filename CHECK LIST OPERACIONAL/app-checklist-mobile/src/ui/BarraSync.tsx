// Status de salvamento SEMPRE visível (regra G):
// "Salvo no aparelho às HH:MM" · "Enviado ao servidor às HH:MM" · pendências · erro com "Tentar de novo".
// Erro nunca aparece como sucesso.
import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { AlertOctagon, CheckCircle2, CloudOff, Loader2, RefreshCw, Smartphone, Trash2 } from "lucide-react";
import { useDados, useEstadoSync } from "../app/dados";
import { horaSP } from "../domain/tempo";
import { Botao, cx } from "./base";

const NOMES_OP: Record<string, string> = {
  execucao: "Checklist", plano_acao: "Plano de ação", plano_criar: "Novo plano de ação", plano_foto: "Foto do plano",
  validar_execucao: "Validação", cancelar_tarefa: "Cancelamento de tarefa", cancelar_execucao: "Cancelamento de checklist",
};

export function BarraSync() {
  const { sinc, db } = useDados();
  const e = useEstadoSync();
  const [aberto, setAberto] = useState(false);
  const comErro = useLiveQuery(() => db.fila.filter((o) => !!o.erro).toArray(), []) ?? [];

  const salvo = e.salvoEm ? `Salvo no aparelho às ${horaSP(e.salvoEm)}` : "Nada salvo ainda";
  const enviado = e.enviadoEm ? `Enviado ao servidor às ${horaSP(e.enviadoEm)}` : "Ainda não enviado";

  let tom = "bg-green-50 text-green-900 border-green-200";
  let Icone = CheckCircle2;
  let principal = e.pendentes ? `${e.pendentes} pendente(s)` : "Tudo enviado";
  if (e.erro) { tom = "bg-red-50 text-red-900 border-red-300"; Icone = AlertOctagon; principal = "Erro ao enviar"; }
  else if (!e.online) { tom = "bg-amber-50 text-amber-900 border-amber-300"; Icone = CloudOff; principal = e.pendentes ? `Sem internet · ${e.pendentes} pendente(s)` : "Sem internet"; }
  else if (e.enviando) { tom = "bg-blue-50 text-blue-900 border-blue-200"; Icone = Loader2; principal = "Enviando…"; }
  else if (e.pendentes) { tom = "bg-amber-50 text-amber-900 border-amber-300"; Icone = Smartphone; }

  return (
    <div className={cx("border-t text-xs sm:text-sm", tom)} role="status" aria-live="polite">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1.5">
        <span className="inline-flex items-center gap-1 font-semibold"><Icone className={cx("size-4", e.enviando && "animate-spin")} aria-hidden /> {principal}</span>
        <span className="inline-flex items-center gap-1"><Smartphone className="size-3.5" aria-hidden /> {salvo}</span>
        <span className="hidden sm:inline">· {enviado}</span>
        <span className="ml-auto flex items-center gap-1">
          {(e.erro || e.pendentes > 0) && (
            <button onClick={() => void sinc.tentarDeNovo()} className="inline-flex min-h-9 items-center gap-1 rounded-md border border-current px-2 font-semibold">
              <RefreshCw className="size-4" aria-hidden /> Tentar de novo
            </button>
          )}
          {e.erro && (
            <button onClick={() => setAberto((v) => !v)} className="min-h-9 rounded-md px-2 font-semibold underline" aria-expanded={aberto}>Detalhes</button>
          )}
        </span>
      </div>
      {e.erro && (
        <div className="mx-auto max-w-6xl px-3 pb-2 font-semibold sm:hidden">{enviado}</div>
      )}
      {aberto && e.erro && (
        <div className="mx-auto max-w-6xl space-y-2 px-3 pb-3">
          <p><b>Mensagem do servidor:</b> {e.erro}</p>
          {comErro.map((o) => (
            <div key={o.seq} className="flex flex-wrap items-center gap-2 rounded-lg border border-red-300 bg-white p-2 text-gray-900">
              <span className="flex-1"><b>{NOMES_OP[o.tipo] ?? o.tipo}</b> · {o.erro} · {o.tentativas} tentativa(s)</span>
              {o.tipo !== "execucao" ? (
                <Botao variante="perigo" onClick={() => { if (confirm("Descartar esta alteração? Ela será desfeita neste aparelho.")) void sinc.descartar(o.seq!); }}>
                  <Trash2 className="size-4" aria-hidden /> Descartar
                </Botao>
              ) : <span className="text-xs">Corrija o checklist e toque em Tentar de novo. Os dados continuam no aparelho.</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
