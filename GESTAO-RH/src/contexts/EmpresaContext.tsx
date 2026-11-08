import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "../lib/supabase";
import type { EmpresaComPapel, Loja, Papel } from "../lib/types";
import { useAuth } from "./AuthContext";

const CHAVE = "rhcompass.empresa";

interface EmpresaCtx {
  empresas: EmpresaComPapel[];
  empresa: EmpresaComPapel | null;
  lojas: Loja[];
  papel: Papel | null;
  isGestor: boolean;
  carregando: boolean;
  selecionar: (id: string) => void;
  recarregar: () => Promise<void>;
}

const Ctx = createContext<EmpresaCtx>(null as unknown as EmpresaCtx);

function lerSelecionada() {
  try {
    return localStorage.getItem(CHAVE);
  } catch {
    return null;
  }
}

export function EmpresaProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [empresas, setEmpresas] = useState<EmpresaComPapel[]>([]);
  const [selId, setSelId] = useState<string | null>(lerSelecionada);
  const [lojas, setLojas] = useState<Loja[]>([]);
  const [carregando, setCarregando] = useState(true);

  const recarregar = useCallback(async () => {
    if (!user) {
      setEmpresas([]);
      setCarregando(false);
      return;
    }
    setCarregando(true);
    const { data, error } = await supabase
      .from("empresa_membros")
      .select("papel, empresas(*)")
      .eq("user_id", user.id);
    if (error) console.error(error);
    const lista = (data ?? [])
      .filter((r: any) => r.empresas)
      .map((r: any) => ({ ...r.empresas, papel: r.papel }) as EmpresaComPapel)
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    setEmpresas(lista);
    setCarregando(false);
  }, [user]);

  useEffect(() => {
    recarregar();
  }, [recarregar]);

  const empresa = empresas.find((e) => e.id === selId) ?? empresas[0] ?? null;

  useEffect(() => {
    if (!empresa) {
      setLojas([]);
      return;
    }
    supabase
      .from("lojas")
      .select("*")
      .eq("empresa_id", empresa.id)
      .order("ordem")
      .then(({ data }) => setLojas((data as Loja[]) ?? []));
  }, [empresa?.id, empresas]);

  const selecionar = (id: string) => {
    setSelId(id);
    try {
      localStorage.setItem(CHAVE, id);
    } catch {
      /* navegador sem armazenamento: só não lembra a escolha */
    }
  };

  const papel = empresa?.papel ?? null;
  return (
    <Ctx.Provider
      value={{
        empresas,
        empresa,
        lojas,
        papel,
        isGestor: papel === "owner" || papel === "admin",
        carregando,
        selecionar,
        recarregar,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export const useEmpresa = () => useContext(Ctx);
