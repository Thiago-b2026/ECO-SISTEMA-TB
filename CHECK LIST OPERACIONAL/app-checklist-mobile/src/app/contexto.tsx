// Estado global: sessão (login único do Ecossistema), EMPRESA escolhida, unidades, perfil e telas liberadas.
// Multiempresa: o admin escolhe a empresa; os demais entram na sua (se estiverem em mais de uma, escolhem).
// Todas as telas mostram só a empresa escolhida.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { servidor } from "../data/conexao";
import { nivel, type Empresa, type LojaAcesso, type Sessao } from "../data/servidor";
import type { Perfil } from "../domain/tipos";
import { podeVerTela } from "../lib/telas";

const chave = (u: string, k: string) => `checklist-${k}-${u}`;
const ler = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const gravar = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* ok */ } };

export interface Contexto {
  carregando: boolean;
  sessao: Sessao | null;
  admin: boolean;
  empresas: Empresa[];
  empresaAtual: Empresa | null;
  setEmpresa: (redeId: string) => void;
  /** unidades da empresa escolhida */
  lojas: LojaAcesso[];
  /** todas as unidades da pessoa (todas as empresas) */
  todasLojas: LojaAcesso[];
  lojaAtual: LojaAcesso | null;
  setLojaAtual: (id: string) => void;
  /** perfil na unidade atual */
  perfil: Perfil | null;
  /** maior perfil na empresa escolhida (para o menu) */
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
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [todasLojas, setTodasLojas] = useState<LojaAcesso[]>([]);
  const [redeId, setRedeId] = useState<string | null>(null);
  const [lojaId, setLojaId] = useState<string | null>(null);
  const [liberadas, setLiberadas] = useState<ReadonlySet<string> | null>(new Set());
  const [erroAcesso, setErroAcesso] = useState<string | null>(null);

  const carregarAcesso = useCallback(async (s: Sessao | null) => {
    if (!s) return;
    setRedeId(ler(chave(s.usuario_id, "empresa")));
    setLojaId(ler(chave(s.usuario_id, "loja")));
    try {
      const [es, ls] = await Promise.all([servidor.minhasEmpresas(), servidor.minhasLojas()]);
      setEmpresas(es);
      setTodasLojas(ls);
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
        if (s) await carregarAcesso(s);
        setSessao(s);
      } finally {
        setCarregando(false);
      }
    })();
  }, [carregarAcesso]);

  const entrar = useCallback(async (email: string, senha: string) => {
    const s = await servidor.entrar(email, senha);
    // carrega empresas, unidades e telas ANTES de abrir o app (o menu não aparece vazio)
    await carregarAcesso(s);
    setSessao(s);
  }, [carregarAcesso]);

  const sair = useCallback(async () => {
    await servidor.sair();
    setSessao(null);
    setEmpresas([]);
    setTodasLojas([]);
    setLiberadas(new Set());
  }, []);

  // empresa: a escolhida (se ainda for válida) ou a primeira
  const empresaAtual = empresas.find((e) => e.rede_id === redeId) ?? empresas[0] ?? null;
  const lojas = todasLojas.filter((l) => l.rede_id === empresaAtual?.rede_id);
  const lojaAtual = lojas.find((l) => l.loja_id === lojaId && l.perfil) ?? lojas.find((l) => l.perfil) ?? null;
  const admin = !!sessao?.admin;
  const maiorPerfil = admin ? "gestor" : lojas.reduce<Perfil | null>((a, l) => (nivel(l.perfil) > nivel(a) ? l.perfil : a), empresaAtual?.perfil ?? null);

  const valor = useMemo<Contexto>(() => ({
    carregando, sessao, admin, empresas, empresaAtual,
    setEmpresa: (id) => { setRedeId(id); setLojaId(null); if (sessao) gravar(chave(sessao.usuario_id, "empresa"), id); },
    lojas, todasLojas, lojaAtual,
    setLojaAtual: (id) => { setLojaId(id); if (sessao) gravar(chave(sessao.usuario_id, "loja"), id); },
    perfil: lojaAtual?.perfil ?? null,
    maiorPerfil, liberadas, erroAcesso,
    podeTela: (codigo) => podeVerTela(codigo, { admin, liberadas, perfil: maiorPerfil }),
    entrar, sair, recarregar: () => carregarAcesso(sessao),
  }), [carregando, sessao, admin, empresas, empresaAtual, lojas, todasLojas, lojaAtual, maiorPerfil, liberadas, erroAcesso, entrar, sair, carregarAcesso]);

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}
