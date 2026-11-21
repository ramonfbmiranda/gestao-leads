// Fila de prioridade (seção 8.10): quem abordar e quem retomar, por potencial.

import { useState } from 'react';
import { Link } from 'react-router';
import { CabecalhoPagina, Chip, ErroCarregamento, useCarregamento } from '../componentes/comuns.jsx';
import { MedidorBarra, SeloStatus } from '../componentes/potencial.jsx';
import { Cartao } from '../componentes/ui.jsx';
import { useOrganizacao } from '../contextos/OrganizacaoContexto.jsx';
import { api } from '../servicos/api.js';

function Lista({ titulo, descricao, itens, faixas }) {
  return (
    <Cartao className="min-w-0 flex-[1_1_460px] overflow-hidden" aria-label={titulo}>
      <div className="flex flex-col gap-0.5 border-b border-borda px-4.5 py-4">
        <h2 className="text-base font-semibold">{titulo} <span className="font-normal text-texto-2">· {itens.length}</span></h2>
        <p className="text-[13px] text-texto-2">{descricao}</p>
      </div>
      {itens.map((lead) => (
        <div key={lead.id} className="grid grid-cols-1 items-center gap-x-4 gap-y-1.5 border-b border-divisor px-4.5 py-3.5 last:border-b-0 sm:grid-cols-[160px_minmax(0,1fr)_auto]">
          <MedidorBarra valor={lead.score_compensacao} parcial={lead.score_parcial} faixas={faixas} />
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="flex flex-wrap items-center gap-2"><Link to={`/leads/${lead.id}`} className="font-semibold text-texto no-underline hover:underline">{lead.nome_lead}</Link><SeloStatus status={lead.status} /></span>
            <span className={`text-xs ${lead.tentativas_sem_resposta > 0 ? 'font-semibold text-aviso-texto' : 'text-texto-2'}`}>{lead.motivo} · {lead.responsavel?.nome ?? 'Sem responsável'}</span>
          </span>
          <Link to={`/leads/${lead.id}`} className="inline-flex min-h-9 items-center justify-center rounded-lg border border-borda-forte bg-superficie px-3.5 text-[13px] font-medium text-texto no-underline hover:bg-hover">Registrar contato</Link>
        </div>
      ))}
      {itens.length === 0 && <p className="px-4.5 py-6 text-center text-texto-2">Ninguém aqui agora.</p>}
    </Cartao>
  );
}

export function Prioridade() {
  const { faixas, config } = useOrganizacao();
  const [responsavel, setResponsavel] = useState('');
  const { dados: responsaveis } = useCarregamento(() => api.listarResponsaveis(), []);
  const { dados, erro, carregando, recarregar } = useCarregamento(
    () => api.prioridade({ limite: 50, ...(responsavel ? { responsavel_id: responsavel } : {}) }),
    [responsavel],
  );
  const espera = config?.prioridade?.dias_espera ?? 2;
  const retomar = config?.prioridade?.dias_retomar ?? 7;

  return (
    <>
      <CabecalhoPagina
        titulo="Quem abordar agora"
        descricao={`Ordenados pelo potencial. Quem teve contato nos últimos ${espera} dias sai de "abordar"; quem está em negociação e sumiu há ${retomar} dias ou mais volta em "retomar".`}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2" role="group" aria-label="Filtrar por responsável">
        <span className="mr-1 text-xs font-semibold text-texto-2">Responsável</span>
        <Chip ativo={responsavel === ''} onClick={() => setResponsavel('')}>Todos</Chip>
        {(responsaveis ?? []).map((r) => <Chip key={r.id} ativo={responsavel === r.id} onClick={() => setResponsavel(r.id)}>{r.nome}</Chip>)}
      </div>
      {erro && <ErroCarregamento erro={erro} aoTentar={recarregar} />}
      <div className={`flex flex-wrap items-start gap-4 ${carregando ? 'opacity-60' : ''}`} aria-busy={carregando}>
        <Lista titulo="Abordar" descricao="Leads novos sem contato recente: comece pelos de maior potencial." itens={dados?.abordar ?? []} faixas={faixas} />
        <Lista titulo="Retomar" descricao={`Em negociação e sem contato há ${retomar} dias ou mais.`} itens={dados?.retomar ?? []} faixas={faixas} />
      </div>
    </>
  );
}
