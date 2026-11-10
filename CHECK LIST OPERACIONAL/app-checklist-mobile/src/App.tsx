import { BrowserRouter, Route, Routes } from "react-router";
import { AppProvider, useApp } from "./app/contexto";
import Login from "./pages/Login";
import { Layout } from "./ui/Layout";
import { Carregando, Titulo, Vazio } from "./ui/base";

function EmConstrucao({ nome }: { nome: string }) {
  return (
    <>
      <Titulo>{nome}</Titulo>
      <Vazio>Em construção.</Vazio>
    </>
  );
}

function Rotas() {
  const { carregando, sessao } = useApp();
  if (carregando) return <Carregando texto="Abrindo o Check List…" />;
  if (!sessao) return <Login />;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<EmConstrucao nome="Minhas tarefas" />} />
        <Route path="planos/*" element={<EmConstrucao nome="Planos de ação" />} />
        <Route path="loja" element={<EmConstrucao nome="Tarefas da loja" />} />
        <Route path="dashboard" element={<EmConstrucao nome="Dashboard" />} />
        <Route path="relatorios" element={<EmConstrucao nome="Relatórios" />} />
        <Route path="agendamentos" element={<EmConstrucao nome="Agendamentos" />} />
        <Route path="modelos/*" element={<EmConstrucao nome="Modelos de checklist" />} />
        <Route path="equipe" element={<EmConstrucao nome="Equipe e perfis" />} />
        <Route path="*" element={<Vazio>Página não encontrada.</Vazio>} />
      </Route>
    </Routes>
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
