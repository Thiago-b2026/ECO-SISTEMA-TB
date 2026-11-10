import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router";
import { AppProvider, useApp } from "./app/contexto";
import { DadosProvider } from "./app/dados";
import Concluir from "./pages/Concluir";
import Execucao from "./pages/Execucao";
import Hoje from "./pages/Hoje";
import Agendamentos from "./pages/Agendamentos";
import Equipe from "./pages/Equipe";
import Login from "./pages/Login";
import Modelos from "./pages/Modelos";
import TarefasLoja from "./pages/TarefasLoja";
import PlanoDetalhe from "./pages/PlanoDetalhe";
import Planos from "./pages/Planos";
import { BarraSync } from "./ui/BarraSync";
import { Layout } from "./ui/Layout";
import { Carregando, Vazio } from "./ui/base";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const Relatorios = lazy(() => import("./pages/Relatorios"));
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
        <Route path="agendamentos" element={<Agendamentos />} />
        <Route path="modelos" element={<Modelos />} />
        <Route path="equipe" element={<Equipe />} />
        <Route path="*" element={<Vazio>Página não encontrada.</Vazio>} />
      </Route>
    </Routes>
    </DadosProvider>
  );
}

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <Rotas />
      </BrowserRouter>
    </AppProvider>
  );
}
