// Estrutura das telas logadas (especificação, seção 11): cabeçalho com
// organização e usuário, barra "Sites Úteis" e menu lateral.

import { Link, NavLink, Outlet } from 'react-router';
import { useAutenticacao } from '../contextos/AutenticacaoContexto.jsx';
import { ProvedorOrganizacao } from '../contextos/OrganizacaoContexto.jsx';
import { BotaoTema } from './BotaoTema.jsx';
import {
  IconeConfiguracoes,
  IconeExterno,
  IconeImportacao,
  IconeLeads,
  IconeOrganizacao,
  IconePotencial,
  IconePrioridade,
  IconeSair,
} from './Icones.jsx';
import { Botao, Logo } from './ui.jsx';

const SITES_UTEIS = [
  ['Casa dos Dados', 'https://casadosdados.com.br'],
  ['Econodata', 'https://econodata.com.br'],
  ['CNPJ.biz', 'https://cnpj.biz'],
  ['Consulta Sócio', 'https://consultasocio.com'],
];

const MENU = [
  ['/', 'Potencial', IconePotencial, true],
  ['/leads', 'Leads', IconeLeads, false],
  ['/prioridade', 'Prioridade', IconePrioridade, false],
  ['/importacao', 'Importação', IconeImportacao, false],
  ['/configuracoes', 'Configurações', IconeConfiguracoes, false],
];

function iniciais(nome, email) {
  const base = (nome || email || '?').trim();
  const partes = base.split(/\s+/).filter(Boolean);
  return (partes.length > 1 ? partes[0][0] + partes.at(-1)[0] : base.slice(0, 2)).toUpperCase();
}

export function Layout() {
  const { usuario, perfil, organizacao, sair } = useAutenticacao();
  const nome = perfil?.nome || usuario?.email;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-borda bg-superficie px-6 py-3">
        <Link to="/" className="flex items-center gap-2.5 text-base font-bold text-texto no-underline">
          <Logo />LeadRank
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-2 rounded-lg border border-borda px-3 py-1.5 font-medium">
            <IconeOrganizacao tamanho={16} />{organizacao?.nome}
          </span>
          <BotaoTema />
          <span className="flex items-center gap-2.5">
            <span className="inline-flex h-[34px] w-[34px] items-center justify-center rounded-full border border-borda bg-hover text-[13px] font-semibold">
              {iniciais(perfil?.nome, usuario?.email)}
            </span>
            <span className="flex flex-col leading-tight">
              <span className="font-semibold">{nome}</span>
              <span className="text-xs text-texto-2">{perfil?.papel === 'admin' ? 'Admin' : 'Membro'}</span>
            </span>
          </span>
          <Botao variante="icone" onClick={sair} aria-label="Sair"><IconeSair /></Botao>
        </div>
      </header>

      <nav aria-label="Sites úteis" className="flex flex-wrap items-center gap-x-5 gap-y-1.5 border-b border-borda bg-superficie-2 px-6 py-2 text-[13px]">
        <span className="font-semibold text-texto-2">Sites úteis</span>
        {SITES_UTEIS.map(([rotulo, url]) => (
          <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium no-underline">
            {rotulo}<IconeExterno />
          </a>
        ))}
      </nav>

      <div className="flex flex-1 flex-wrap">
        <aside className="max-w-none flex-[1_1_200px] border-b border-borda bg-superficie px-3 py-2 md:max-w-[220px] md:border-r md:border-b-0 md:py-5">
          <nav aria-label="Menu principal" className="flex flex-row flex-wrap gap-1 md:flex-col">
            {MENU.map(([rota, rotulo, IconeItem, exata]) => (
              <NavLink
                key={rota}
                to={rota}
                end={exata}
                className={({ isActive }) =>
                  `flex min-h-10 items-center gap-2.5 rounded-lg px-3 font-medium no-underline ${
                    isActive ? 'bg-hover text-texto shadow-[inset_3px_0_0_var(--pot-media)]' : 'text-texto-2 hover:bg-hover hover:text-texto'
                  }`
                }
              >
                <IconeItem />{rotulo}
              </NavLink>
            ))}
          </nav>
        </aside>
        <main className="min-w-0 flex-[999_1_560px] px-4 pt-5 pb-14 md:px-6 md:pt-7">
          <ProvedorOrganizacao>
            <Outlet />
          </ProvedorOrganizacao>
        </main>
      </div>
    </div>
  );
}
