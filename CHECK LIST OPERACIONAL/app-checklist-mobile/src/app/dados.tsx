// Liga o banco local + fila + ações ao usuário logado.
import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { servidor } from "../data/conexao";
import { BancoLocal } from "../data/local";
import { Repositorio } from "../data/repositorio";
import { Sincronizador, type EstadoSync } from "../data/sync";
import { dataSP } from "../domain/tempo";
import { useApp } from "./contexto";

interface Dados {
  db: BancoLocal;
  sinc: Sincronizador;
  repo: Repositorio;
  /** true depois da primeira carga (do servidor ou do cache) */
  pronto: boolean;
  atualizar: () => Promise<void>;
}

const Ctx = createContext<Dados | null>(null);

export function useDados(): Dados {
  const c = useContext(Ctx);
  if (!c) throw new Error("useDados fora do DadosProvider");
  return c;
}

export function useEstadoSync(): EstadoSync {
  const { sinc } = useDados();
  return useSyncExternalStore((cb) => sinc.assinar(cb), () => sinc.estado);
}

export function DadosProvider({ children }: { children: ReactNode }) {
  const { sessao, lojas } = useApp();
  const usuario = sessao!.usuario_id;
  const { db, sinc, repo } = useMemo(() => {
    const db = new BancoLocal(usuario);
    const online = typeof navigator === "undefined" ? true : navigator.onLine !== false;
    const sinc = new Sincronizador(db, servidor, usuario, online);
    return { db, sinc, repo: new Repositorio(sinc) };
  }, [usuario]);
  const [pronto, setPronto] = useState(false);
  const idsLojas = lojas.filter((l) => l.perfil).map((l) => l.loja_id).join(",");

  async function atualizar() {
    try {
      await servidor.gerarTarefas(dataSP());
    } catch {
      /* sem internet: segue com o que tem no aparelho */
    }
    await sinc.processar(); // envia a fila e depois baixa
    if (!sinc.estado.pendentes) await sinc.baixar().catch(() => undefined);
  }

  useEffect(() => {
    sinc.lojas = idsLojas ? idsLojas.split(",") : [];
    let vivo = true;
    (async () => {
      await sinc.iniciar();
      if (vivo) setPronto(true);
      await atualizar();
    })();
    const on = () => sinc.setOnline(true);
    const off = () => sinc.setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    // a cada 2 minutos tenta enviar o que ficou e buscar novidades
    const t = setInterval(() => { if (sinc.estado.online) void sinc.processar(); }, 120000);
    const visivel = () => { if (document.visibilityState === "visible") void sinc.processar(); };
    document.addEventListener("visibilitychange", visivel);
    return () => {
      vivo = false;
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      document.removeEventListener("visibilitychange", visivel);
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sinc, idsLojas]);

  const valor = useMemo(() => ({ db, sinc, repo, pronto, atualizar }), [db, sinc, repo, pronto]); // eslint-disable-line react-hooks/exhaustive-deps
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}
