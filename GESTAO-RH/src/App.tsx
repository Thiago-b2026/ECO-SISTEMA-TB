import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { EmpresaProvider, useEmpresa } from "./contexts/EmpresaContext";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Empresas from "./pages/Empresas";
import Usuarios from "./pages/Usuarios";
import Historico from "./pages/Historico";
import Global from "./pages/Global";
import { TelasProvider, useTelas, type TelaRh } from "./contexts/TelasContext";
import type { ReactNode } from "react";

function Carregando() {
  return <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">Carregando...</div>;
}

function Protegido({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Carregando />;
  if (!user) return <Navigate to="/auth" replace />;
  return (
    <TelasProvider>
      <EmpresaProvider>{children}</EmpresaProvider>
    </TelasProvider>
  );
}

/** Tela sem permissão (controle por tela feito no ECO): mostra "Acesso negado". */
function AcessoNegado() {
  const { primeira } = useTelas();
  return (
    <div className="min-h-[60vh] grid place-items-center text-center p-6">
      <div className="max-w-sm space-y-3">
        <div className="text-4xl">⛔</div>
        <h1 className="text-xl font-semibold">Acesso negado</h1>
        <p className="text-sm text-muted-foreground">
          Você não tem permissão para esta tela. Peça ao administrador para liberar no Eco Sistema TB, em
          Cadastros → Login de acesso → Permissões (módulo RH).
        </p>
        {primeira && <Link to={primeira.rota} className="btn-secundario inline-block">Ir para {primeira.nome}</Link>}
      </div>
    </div>
  );
}

function Tela({ codigo, children }: { codigo: TelaRh; children: ReactNode }) {
  const { pode, carregando, primeira } = useTelas();
  const { pathname } = useLocation();
  if (carregando) return <Carregando />;
  if (pode(codigo)) return <>{children}</>;
  // Abriu o Painel (tela inicial) sem permissão, mas tem outra tela: vai para ela.
  if (pathname === "/" && primeira && primeira.rota !== "/") return <Navigate to={primeira.rota} replace />;
  return <AcessoNegado />;
}

/** Sem empresa ainda? Manda para o cadastro de empresa. */
function ComEmpresa({ children }: { children: ReactNode }) {
  const { empresa, carregando } = useEmpresa();
  if (carregando) return <Carregando />;
  if (!empresa) return <Navigate to="/empresas?nova=1" replace />;
  return <>{children}</>;
}

function Rotas() {
  const { user, loading } = useAuth();
  return (
    <Routes>
      <Route path="/auth" element={loading ? <Carregando /> : user ? <Navigate to="/" replace /> : <Login />} />
      <Route
        element={
          <Protegido>
            <Layout />
          </Protegido>
        }
      >
        <Route path="/" element={<Tela codigo="rh.painel"><ComEmpresa><Dashboard /></ComEmpresa></Tela>} />
        <Route path="/historico" element={<Tela codigo="rh.historico"><ComEmpresa><Historico /></ComEmpresa></Tela>} />
        <Route path="/usuarios" element={<Tela codigo="rh.usuarios"><ComEmpresa><Usuarios /></ComEmpresa></Tela>} />
        <Route path="/global" element={<Tela codigo="rh.global"><ComEmpresa><Global /></ComEmpresa></Tela>} />
        <Route path="/empresas" element={<Tela codigo="rh.empresas"><Empresas /></Tela>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Rotas />
    </AuthProvider>
  );
}
