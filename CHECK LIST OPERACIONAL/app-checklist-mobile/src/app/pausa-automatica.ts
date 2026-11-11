// Pausa automática da execução: app em 2º plano (outra tela do celular, bloqueio) ou sair da tela = pausa;
// voltar = retoma. Assim o tempo ATIVO não conta o tempo parado. Se o app for fechado no meio,
// a pausa fica aberta no aparelho e é fechada ao abrir a execução de novo (ou ao concluir).
import { useEffect } from "react";
import type { Repositorio } from "../data/repositorio";

export function usePausaAutomatica(repo: Repositorio, execId: string | undefined, ativo: boolean) {
  useEffect(() => {
    if (!execId || !ativo) return;
    const visivel = () => typeof document === "undefined" || document.visibilityState !== "hidden";
    if (visivel()) void repo.retomar(execId);
    else void repo.pausar(execId);
    const mudou = () => void (visivel() ? repo.retomar(execId) : repo.pausar(execId));
    const saiu = () => void repo.pausar(execId);
    document.addEventListener("visibilitychange", mudou);
    window.addEventListener("pagehide", saiu);
    return () => {
      document.removeEventListener("visibilitychange", mudou);
      window.removeEventListener("pagehide", saiu);
      void repo.pausar(execId);
    };
  }, [repo, execId, ativo]);
}
