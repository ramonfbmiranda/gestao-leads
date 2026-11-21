// Quem pode ver cada parte do sistema (especificação, seção 6):
// - sem sessão → /entrar;
// - com sessão e sem perfil → /primeiro-acesso (criar organização ou aceitar convite);
// - com perfil → telas do sistema.

import { Navigate, Outlet, useLocation } from 'react-router';
import { useAutenticacao } from '../contextos/AutenticacaoContexto.jsx';
import { Aviso, Botao, TelaCarregando } from '../componentes/ui.jsx';

function ErroConta() {
  const { erroConta, recarregarConta, sair } = useAutenticacao();
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-4">
      <Aviso tipo="erro">Não foi possível carregar sua conta: {erroConta?.message}</Aviso>
      <div className="flex gap-2">
        <Botao variante="primario" onClick={recarregarConta}>Tentar de novo</Botao>
        <Botao onClick={sair}>Sair</Botao>
      </div>
    </div>
  );
}

export function SomenteComPerfil() {
  const { sessao, perfil, carregando, erroConta } = useAutenticacao();
  const local = useLocation();
  if (carregando) return <TelaCarregando />;
  if (!sessao) return <Navigate to="/entrar" replace state={{ de: local.pathname }} />;
  if (erroConta) return <ErroConta />;
  if (!perfil) return <Navigate to="/primeiro-acesso" replace />;
  return <Outlet />;
}

export function SomenteSemPerfil() {
  const { sessao, perfil, carregando, erroConta } = useAutenticacao();
  if (carregando) return <TelaCarregando />;
  if (!sessao) return <Navigate to="/entrar" replace />;
  if (erroConta) return <ErroConta />;
  if (perfil) return <Navigate to="/" replace />;
  return <Outlet />;
}

export function SomenteSemSessao() {
  const { sessao, perfil, carregando } = useAutenticacao();
  const local = useLocation();
  if (carregando) return <TelaCarregando />;
  if (sessao) return <Navigate to={perfil ? (local.state?.de ?? '/') : '/primeiro-acesso'} replace />;
  return <Outlet />;
}
