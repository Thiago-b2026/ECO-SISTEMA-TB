// Estado do app: sessão (login único do ecossistema), telas liberadas, unidade e mês escolhidos e as
// permissões da pessoa NA unidade. A tela só esconde botões; quem barra de verdade é o banco (RLS).
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { servidor } from "../data/conexao";
import type { Acesso, Sessao, Unidade } from "../data/servidor";
import { mesAtual } from "../lib/formato";
import { chave, podeVerTela } from "../lib/telas";

interface Ctx {
  carregando: boolean;
  sessao: Sessao | null;
  acesso: Acesso | null;
  erroAcesso: string | null;
  unidade: Unidade | null;
  escolherUnidade: (id: string) => void;
  mes: string;
  escolherMes: (m: string) => void;
  /** permissão na unidade escolhida (admin: tudo) */
  pode: (tela: string, acao: string) => boolean;
  veTela: (codigo: string) => boolean;
  entrar: (email: string, senha: string) => Promise<void>;
  sair: () => Promise<void>;
  /** aumenta a cada gravação: as telas recarregam */
  versao: number;
  recarregar: () => void;
}

const Contexto = createContext<Ctx | null>(null);
const CHAVE_UNIDADE = "metas-unidade";

function lerUnidadeSalva() {
  try {
    return globalThis.localStorage?.getItem(CHAVE_UNIDADE) ?? null;
  } catch {
    return null;
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [carregando, setCarregando] = useState(true);
  const [sessao, setSessao] = useState<Sessao | null>(null);
  const [acesso, setAcesso] = useState<Acesso | null>(null);
  const [erroAcesso, setErroAcesso] = useState<string | null>(null);
  const [unidadeId, setUnidadeId] = useState<string | null>(lerUnidadeSalva);
  const [mes, escolherMes] = useState(mesAtual);
  const [perms, setPerms] = useState<Set<string>>(new Set());
  const [versao, setVersao] = useState(0);

  const carregarAcesso = useCallback(async (s: Sessao | null) => {
    setSessao(s);
    if (!s) {
      setAcesso(null);
      return;
    }
    try {
      setAcesso(await servidor.acesso());
      setErroAcesso(null);
    } catch (e) {
      // não bloqueia todo mundo: mostra aviso e segue (o banco continua barrando)
      setAcesso({ liberadas: null, unidades: [] });
      setErroAcesso((e as Error).message);
    }
  }, []);

  useEffect(() => {
    servidor.sessaoAtual().then(carregarAcesso).catch(() => carregarAcesso(null)).finally(() => setCarregando(false));
  }, [carregarAcesso]);

  const unidade = useMemo(() => {
    const lista = acesso?.unidades ?? [];
    return lista.find((u) => u.id === unidadeId) ?? lista[0] ?? null;
  }, [acesso, unidadeId]);

  useEffect(() => {
    if (!unidade) {
      setPerms(new Set());
      return;
    }
    let vivo = true;
    servidor.permissoes(unidade.id).then((p) => vivo && setPerms(p)).catch(() => vivo && setPerms(new Set()));
    return () => {
      vivo = false;
    };
  }, [unidade, sessao]);

  const escolherUnidade = useCallback((id: string) => {
    setUnidadeId(id);
    try {
      globalThis.localStorage?.setItem(CHAVE_UNIDADE, id);
    } catch {
      /* sem armazenamento: vale só nesta visita */
    }
  }, []);

  const valor: Ctx = {
    carregando,
    sessao,
    acesso,
    erroAcesso,
    unidade,
    escolherUnidade,
    mes,
    escolherMes,
    pode: (tela, acao) => !!sessao?.admin || perms.has(chave(tela, acao)),
    veTela: (codigo) => podeVerTela(codigo, { admin: sessao?.admin, liberadas: acesso?.liberadas ?? null }),
    entrar: async (email, senha) => {
      const s = await servidor.entrar(email, senha);
      await carregarAcesso(s);
    },
    sair: async () => {
      await servidor.sair();
      await carregarAcesso(null);
    },
    versao,
    recarregar: () => setVersao((v) => v + 1),
  };
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useApp() {
  const c = useContext(Contexto);
  if (!c) throw new Error("useApp fora do AppProvider");
  return c;
}

/** Carrega dados de forma assíncrona e recarrega quando as dependências (ou a versão) mudam. */
export function useDados<T>(carregar: () => Promise<T>, deps: unknown[]) {
  const { versao } = useApp();
  const [estado, setEstado] = useState<{ dados: T | null; erro: string | null; carregando: boolean }>({ dados: null, erro: null, carregando: true });
  useEffect(() => {
    let vivo = true;
    setEstado((e) => ({ ...e, carregando: true }));
    carregar()
      .then((dados) => vivo && setEstado({ dados, erro: null, carregando: false }))
      .catch((e: Error) => vivo && setEstado({ dados: null, erro: e.message, carregando: false }));
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, versao]);
  return estado;
}
