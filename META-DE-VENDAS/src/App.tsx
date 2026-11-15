import { lazy, Suspense, type ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { AppProvider, useApp } from "./app/contexto";
import { ERRO_CONFIG } from "./data/conexao";
import { telaInicial } from "./lib/telas";
import Dashboard from "./pages/Dashboard";
import Lancamentos from "./pages/Lancamentos";
import Login from "./pages/Login";
import Ranking from "./pages/Ranking";
import { Carregando, Vazio } from "./ui/base";
import { Layout } from "./ui/Layout";

// telas com gráfico ou menos usadas: só carregam quando abertas
const MeuDesempenho = lazy(() => import("./pages/MeuDesempenho"));
const Historico = lazy(() => import("./pages/Historico"));
const Vendedores = lazy(() => import("./pages/Vendedores"));
const Configuracao = lazy(() => import("./pages/Configuracao"));
const tardio = (el: ReactNode) => <Suspense fallback={<Carregando />}>{el}</Suspense>;

function Inicio() {
  const { sessao, acesso } = useApp();
  const t = telaInicial({ admin: sessao?.admin, liberadas: acesso?.liberadas ?? null });
  return t ? <Navigate to={t.rota} replace /> : <Vazio>Nenhuma tela do Meta de Vendas liberada para você. Peça ao administrador.</Vazio>;
}

function Rotas() {
  const { carregando, sessao } = useApp();
  if (carregando) return <Carregando texto="Abrindo o Meta de Vendas…" />;
  if (!sessao) return <Login />;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Inicio />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="ranking" element={<Ranking />} />
        <Route path="meu-desempenho" element={tardio(<MeuDesempenho />)} />
        <Route path="historico" element={tardio(<Historico />)} />
        <Route path="lancamentos" element={<Lancamentos />} />
        <Route path="vendedores" element={tardio(<Vendedores />)} />
        <Route path="configuracao" element={tardio(<Configuracao />)} />
        <Route path="*" element={<Vazio>Página não encontrada.</Vazio>} />
      </Route>
    </Routes>
  );
}

/** Build de produção sem as variáveis do Supabase: NÃO abre o modo demonstração. */
function ErroConfiguracao() {
  return (
    <main className="mx-auto flex min-h-full max-w-lg flex-col justify-center gap-3 p-6">
      <div className="text-2xl font-extrabold text-marca">Eco Sistema TB</div>
      <div role="alert" className="rounded-xl border-2 border-red-300 bg-red-50 p-4 text-red-900">
        <h1 className="text-lg font-bold">Erro de configuração</h1>
        <p className="mt-1">O Meta de Vendas foi publicado sem o endereço do banco de dados (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).</p>
        <p className="mt-1">Avise o administrador: as variáveis precisam ser cadastradas na Vercel e o site publicado de novo.</p>
      </div>
    </main>
  );
}

export default function App() {
  if (ERRO_CONFIG) return <ErroConfiguracao />;
  return (
    <AppProvider>
      <BrowserRouter>
        <Rotas />
      </BrowserRouter>
    </AppProvider>
  );
}
