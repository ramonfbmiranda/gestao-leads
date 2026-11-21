// Rotas do sistema. O roteador é criado fora da árvore React (recomendação do React Router).

import { createBrowserRouter } from 'react-router';
import { Layout } from '../componentes/Layout.jsx';
import { AvaliarLead } from '../paginas/AvaliarLead.jsx';
import { Configuracoes } from '../paginas/Configuracoes.jsx';
import { DetalheLead } from '../paginas/DetalheLead.jsx';
import { NaoEncontrada } from '../paginas/EmConstrucao.jsx';
import { Entrar } from '../paginas/Entrar.jsx';
import { Importacao } from '../paginas/Importacao.jsx';
import { Leads } from '../paginas/Leads.jsx';
import { Painel } from '../paginas/Painel.jsx';
import { PrimeiroAcesso } from '../paginas/PrimeiroAcesso.jsx';
import { Prioridade } from '../paginas/Prioridade.jsx';
import { SomenteComPerfil, SomenteSemPerfil, SomenteSemSessao } from './Guardas.jsx';

export const roteador = createBrowserRouter([
  { element: <SomenteSemSessao />, children: [{ path: '/entrar', element: <Entrar /> }] },
  { element: <SomenteSemPerfil />, children: [{ path: '/primeiro-acesso', element: <PrimeiroAcesso /> }] },
  {
    element: <SomenteComPerfil />,
    children: [
      {
        element: <Layout />,
        children: [
          { index: true, element: <Painel /> },
          { path: 'leads', element: <Leads /> },
          { path: 'leads/:id', element: <DetalheLead /> },
          { path: 'leads/:id/avaliar', element: <AvaliarLead /> },
          { path: 'prioridade', element: <Prioridade /> },
          { path: 'importacao', element: <Importacao /> },
          { path: 'configuracoes', element: <Configuracoes /> },
          { path: '*', element: <NaoEncontrada /> },
        ],
      },
    ],
  },
  { path: '*', element: <NaoEncontrada /> },
]);
