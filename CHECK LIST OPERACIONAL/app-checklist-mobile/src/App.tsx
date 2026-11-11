import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router";
import { AppProvider, useApp } from "./app/contexto";
import { DadosProvider } from "./app/dados";
import { ERRO_CONFIG } from "./data/conexao";
import Concluir from "./pages/Concluir";
import Execucao from "./pages/Execucao";
import Hoje from "./pages/Hoje";
import Login from "./pages/Login";
import TarefasLoja from "./pages/TarefasLoja";
import PlanoDetalhe from "./pages/PlanoDetalhe";
import Planos from "./pages/Planos";
import { BarraSync } from "./ui/BarraSync";
import { Layout } from "./ui/Layout";
import { Carregando, Vazio } from "./ui/base";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const Relatorios = lazy(() => import("./pages/Relatorios"));
const Tempos = lazy(() => import("./pages/Tempos"));
// telas de configuração: só carregam quando abertas (o service worker guarda os pedaços para o uso offline)
const Agendamentos = lazy(() => import("./pages/Agendamentos"));
const Empresas = lazy(() => import("./pages/Empresas"));
const Equipe = lazy(() => import("./pages/Equipe"));
const Modelos = lazy(() => import("./pages/Modelos"));
const tardio = (el: React.ReactNode) => <Suspense fallback={<Carregando />}>{el}</Suspense>;

function Rotas() {
  const { carregando, sessao } = useApp();
  if (carregando) return <Carregando texto="Abrindo o Check List…" />;
  if (!sessao) return <Login />;
  return (
    <DadosProvider key={sessao.usuario_id}>
    <Routes>
      <Route element={<Layout barraStatus={<BarraSync />} />}>
        <Route index element={<Hoje />} />
        <Route path="execucao/:id" element={<Execucao />} />
        <Route path="execucao/:id/concluir" element={<Concluir />} />
        <Route path="planos" element={<Planos />} />
        <Route path="planos/:id" element={<PlanoDetalhe />} />
        <Route path="loja" element={<TarefasLoja />} />
        <Route path="dashboard" element={tardio(<Dashboard />)} />
        <Route path="relatorios" element={tardio(<Relatorios />)} />
        <Route path="tempos" element={tardio(<Tempos />)} />
        <Route path="agendamentos" element={tardio(<Agendamentos />)} />
        <Route path="modelos" element={tardio(<Modelos />)} />
        <Route path="equipe" element={tardio(<Equipe />)} />
        <Route path="empresas" element={tardio(<Empresas />)} />
        <Route path="*" element={<Vazio>Página não encontrada.</Vazio>} />
      </Route>
    </Routes>
    </DadosProvider>
  );
}

/** Build de produção sem as variáveis do Supabase: NÃO abre o modo demonstração. */
function ErroConfiguracao() {
  return (
    <main className="mx-auto flex min-h-full max-w-lg flex-col justify-center gap-3 p-6">
      <div className="text-2xl font-extrabold text-marca">Eco Sistema TB</div>
      <div role="alert" className="rounded-xl border-2 border-red-300 bg-red-50 p-4 text-red-900">
        <h1 className="text-lg font-bold">Erro de configuração</h1>
        <p className="mt-1">O Check List foi publicado sem o endereço do banco de dados (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).</p>
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
