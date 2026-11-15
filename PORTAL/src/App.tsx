// Portal do ECO SISTEMA TB (QUADRO GERAL) – com login.
// Não logado → tela de login. Logado → quadros dos sistemas que a pessoa tem liberados
// (public.meus_sistemas(), mesma regra dos outros sistemas). POP e Precificação abrem DENTRO do Portal.
import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import { irPara, useCaminho } from "./lib/navegacao";
import { QUADROS } from "./lib/quadros";
import Login from "./pages/Login";
import Inicio from "./pages/Inicio";
import Arquivos from "./pages/Arquivos";
import Topo from "./components/Topo";

export interface SistemaLiberado {
  codigo: string;
  nome: string;
  url: string | null;
  ordem: number;
}

export interface Contexto {
  sessao: Session;
  nome: string;
  admin: boolean;
  sistemas: SistemaLiberado[] | null; // null = carregando
  erro: string | null;
  recarregar: () => void;
}

export default function App() {
  const [sessao, setSessao] = useState<Session | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSessao(data.session);
      setCarregando(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_evento, s) => setSessao(s));
    return () => data.subscription.unsubscribe();
  }, []);

  if (carregando) return <div className="grid min-h-screen place-items-center text-sm text-muted-foreground">Carregando…</div>;
  return sessao ? <Logado sessao={sessao} /> : <Login />;
}

function Logado({ sessao }: { sessao: Session }) {
  const caminho = useCaminho();
  const [sistemas, setSistemas] = useState<SistemaLiberado[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [admin, setAdmin] = useState(false);
  const [nome, setNome] = useState("");

  const recarregar = useCallback(async () => {
    setErro(null);
    setSistemas(null);
    const [s, a, p] = await Promise.all([
      supabase.rpc("meus_sistemas"),
      supabase.rpc("is_admin"),
      supabase.from("profiles").select("nome").eq("id", sessao.user.id).maybeSingle(),
    ]);
    if (s.error) {
      setErro("Não foi possível carregar os seus sistemas. Tente de novo.");
      setSistemas([]);
    } else {
      setSistemas(((s.data ?? []) as SistemaLiberado[]).sort((x, y) => x.ordem - y.ordem));
    }
    setAdmin(a.data === true);
    setNome((p.data?.nome as string | undefined) || sessao.user.email || "");
  }, [sessao.user.id, sessao.user.email]);

  useEffect(() => {
    recarregar();
  }, [recarregar]);

  const codigo = caminho.slice(1);
  const interno = !!codigo && !!QUADROS[codigo]?.interno;

  // endereço desconhecido → volta para o início
  useEffect(() => {
    if (codigo && !interno) irPara("/");
  }, [codigo, interno]);

  // Página interna de um quadro (ex.: /pop, /precificacao)
  if (interno) {
    const liberado = sistemas?.some((s) => s.codigo === codigo);
    return (
      <div className="min-h-screen">
        <Topo nome={nome} voltar />
        {sistemas === null ? (
          <p className="mx-auto max-w-5xl px-4 py-10 text-sm text-muted-foreground">Carregando…</p>
        ) : liberado ? (
          <Arquivos codigo={codigo} admin={admin} />
        ) : (
          <SemAcesso />
        )}
      </div>
    );
  }
  return <Inicio ctx={{ sessao, nome, admin, sistemas, erro, recarregar }} />;
}

function SemAcesso() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <div className="rounded-xl border border-border bg-card p-6 text-center">
        <p className="titulo text-lg">Acesso negado</p>
        <p className="mt-2 text-sm text-muted-foreground">Você não tem acesso a esta área. Peça ao administrador.</p>
        <button className="botao-primario mt-4" onClick={() => irPara("/")}>Voltar ao início</button>
      </div>
    </main>
  );
}
