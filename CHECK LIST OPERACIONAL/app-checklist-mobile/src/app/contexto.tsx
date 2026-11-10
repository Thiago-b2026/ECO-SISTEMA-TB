// Estado global: sessão (login único do Ecossistema), unidades, perfil e telas liberadas.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { servidor } from "../data/conexao";
import { nivel, type LojaAcesso, type Sessao } from "../data/servidor";
import type { Perfil } from "../domain/tipos";
import { podeVerTela } from "../lib/telas";

const CHAVE_LOJA = "checklist-loja-atual";

export interface Contexto {
  carregando: boolean;
  sessao: Sessao | null;
  lojas: LojaAcesso[];
  lojaAtual: LojaAcesso | null;
  setLojaAtual: (id: string) => void;
  /** perfil na unidade atual */
  perfil: Perfil | null;
  /** maior perfil entre as unidades (para o menu) */
  maiorPerfil: Perfil | null;
  /** telas liberadas; null = a consulta falhou (aviso + não bloqueia) */
  liberadas: ReadonlySet<string> | null;
  erroAcesso: string | null;
  podeTela: (codigo: string) => boolean;
  entrar: (email: string, senha: string) => Promise<void>;
  sair: () => Promise<void>;
  recarregar: () => Promise<void>;
}

const Ctx = createContext<Contexto | null>(null);

export function useApp(): Contexto {
  const c = useContext(Ctx);
  if (!c) throw new Error("useApp fora do AppProvider");
  return c;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [carregando, setCarregando] = useState(true);
  const [sessao, setSessao] = useState<Sessao | null>(null);
  const [lojas, setLojas] = useState<LojaAcesso[]>([]);
  const [lojaId, setLojaId] = useState<string | null>(() => { try { return localStorage.getItem(CHAVE_LOJA); } catch { return null; } });
  const [liberadas, setLiberadas] = useState<ReadonlySet<string> | null>(new Set());
  const [erroAcesso, setErroAcesso] = useState<string | null>(null);

  const carregarAcesso = useCallback(async () => {
    try {
      setLojas(await servidor.minhasLojas());
    } catch (e) {
      // sem internet: mantém o que já tinha (o app funciona offline com o cache)
      setErroAcesso((e as Error).message);
    }
    try {
      setLiberadas(new Set(await servidor.minhasTelas()));
      setErroAcesso(null);
    } catch (e) {
      // Regra do Ecossistema: se a consulta der erro, AVISA e não bloqueia todo mundo.
      setLiberadas(null);
      setErroAcesso((e as Error).message);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const s = await servidor.sessaoAtual();
        setSessao(s);
        if (s) await carregarAcesso();
      } finally {
        setCarregando(false);
      }
    })();
  }, [carregarAcesso]);

  const entrar = useCallback(async (email: string, senha: string) => {
    const s = await servidor.entrar(email, senha);
    setSessao(s);
    await carregarAcesso();
  }, [carregarAcesso]);

  const sair = useCallback(async () => {
    await servidor.sair();
    setSessao(null);
    setLojas([]);
    setLiberadas(new Set());
  }, []);

  const lojaAtual = lojas.find((l) => l.loja_id === lojaId && l.perfil) ?? lojas.find((l) => l.perfil) ?? null;
  const maiorPerfil = lojas.reduce<Perfil | null>((a, l) => (nivel(l.perfil) > nivel(a) ? l.perfil : a), null);

  const valor = useMemo<Contexto>(() => ({
    carregando, sessao, lojas, lojaAtual,
    setLojaAtual: (id) => { setLojaId(id); try { localStorage.setItem(CHAVE_LOJA, id); } catch { /* ok */ } },
    perfil: lojaAtual?.perfil ?? null,
    maiorPerfil, liberadas, erroAcesso,
    podeTela: (codigo) => podeVerTela(codigo, { liberadas, perfil: maiorPerfil }),
    entrar, sair, recarregar: carregarAcesso,
  }), [carregando, sessao, lojas, lojaAtual, maiorPerfil, liberadas, erroAcesso, entrar, sair, carregarAcesso]);

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}
