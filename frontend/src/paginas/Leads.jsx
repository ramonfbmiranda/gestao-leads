// Lista de leads (seção 11): do maior para o menor potencial, com filtros de
// faixa e status, busca com espera, ordenação e paginação.

import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { AreaTexto, CabecalhoPagina, Chip, ErroCarregamento, Modal, Selecao, useCarregamento, useMensagem } from '../componentes/comuns.jsx';
import { MedidorBarra, NotaFinal, SeloStatus } from '../componentes/potencial.jsx';
import { Aviso, Botao, Campo, Cartao } from '../componentes/ui.jsx';
import { useOrganizacao } from '../contextos/OrganizacaoContexto.jsx';
import { api } from '../servicos/api.js';
import { ROTULOS_STATUS, formatarCnpj } from '../utils/formatos.js';

const FAIXAS = [['', 'Todos'], ['alta', 'Alto'], ['media', 'Médio'], ['baixa', 'Baixo'], ['na', 'N/A']];
const STATUS = [['', 'Todos'], ...Object.entries(ROTULOS_STATUS)];
const POR_PAGINA = 20;
const SIGLAS = { instagram: 'IG', linkedin: 'in', facebook: 'FB', site: 'Site', outra: 'Link' };
const GRADE = 'grid grid-cols-[180px_minmax(170px,1.5fr)_150px_minmax(120px,1fr)_88px_72px_120px_112px] items-center gap-x-2';

function usarEspera(valor, ms = 300) {
  const [atrasado, setAtrasado] = useState(valor);
  useEffect(() => {
    const id = setTimeout(() => setAtrasado(valor), ms);
    return () => clearTimeout(id);
  }, [valor, ms]);
  return atrasado;
}

function NovoLead({ aberto, aoFechar }) {
  const navegar = useNavigate();
  const { organizacao } = useOrganizacao();
  const { dados: responsaveis } = useCarregamento(() => api.listarResponsaveis(), []);
  const [form, setForm] = useState({});
  const [erro, setErro] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const campo = (nome) => ({ value: form[nome] ?? '', onChange: (e) => setForm({ ...form, [nome]: e.target.value }) });
  const escala = (nome) => `0 a ${Number(organizacao?.[nome] ?? 10)}`;

  async function salvar(evento) {
    evento.preventDefault();
    setErro(null);
    setEnviando(true);
    const corpo = Object.fromEntries(
      Object.entries(form)
        .filter(([, v]) => String(v).trim() !== '')
        .map(([k, v]) => [k, ['calculadora_icp', 'calculadora_midias_sociais', 'nota_final'].includes(k) ? Number(String(v).replace(',', '.')) : String(v).trim()]),
    );
    try {
      const lead = await api.criarLead(corpo);
      navegar(`/leads/${lead.id}`);
    } catch (falha) {
      setErro(falha.message);
      setEnviando(false);
    }
  }

  return (
    <Modal titulo="Novo lead" aberto={aberto} aoFechar={aoFechar} largura="max-w-2xl">
      <p className="-mt-2 text-[13px] text-texto-2">O potencial é calculado ao salvar. Os dados da Receita podem ser buscados depois.</p>
      <form className="flex flex-col gap-4" onSubmit={salvar}>
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Campo id="n-cnpj" rotulo="CNPJ *" required placeholder="12.ABC.345/01DE-35" {...campo('cnpj')} />
          <Campo id="n-nome" rotulo="Nome do lead *" required {...campo('nome_lead')} />
          <Campo id="n-decisor" rotulo="Nome do decisor" {...campo('nome_decisor')} />
          <Campo id="n-numero" rotulo="Telefone do decisor" {...campo('numero_decisor')} />
          <Campo id="n-email" rotulo="E-mail do decisor" type="email" {...campo('email_decisor')} />
          <Campo id="n-linkedin" rotulo="LinkedIn do decisor" {...campo('linkedin_decisor')} />
          <Selecao id="n-resp" rotulo="Responsável" {...campo('responsavel_id')}>
            <option value="">Sem responsável</option>
            {(responsaveis ?? []).map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}
          </Selecao>
          <Selecao id="n-status" rotulo="Status" {...campo('status')}>
            {Object.entries(ROTULOS_STATUS).filter(([k]) => k !== 'descartado').map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Selecao>
          <AreaTexto id="n-redes" rotulo="Redes sociais" rows={2} className="sm:col-span-2" placeholder="Cole os links separados por espaço ou vírgula" {...campo('redes_sociais')} />
          <Campo id="n-icp" rotulo={`Nota ICP da planilha (${escala('escala_icp_max')})`} inputMode="decimal" {...campo('calculadora_icp')} />
          <Campo id="n-midias" rotulo={`Nota de mídias (${escala('escala_midias_max')})`} inputMode="decimal" {...campo('calculadora_midias_sociais')} />
          <Campo id="n-nota" rotulo={`Nota final (${escala('escala_nota_max')})`} inputMode="decimal" {...campo('nota_final')} />
        </div>
        <p className="text-xs text-texto-2">* Obrigatórios. O CNPJ não pode ser alterado depois. As notas são opcionais: a avaliação no sistema tem prioridade.</p>
        <div className="flex justify-end gap-2">
          <Botao onClick={aoFechar}>Cancelar</Botao>
          <Botao type="submit" variante="primario" disabled={enviando || !form.cnpj || !form.nome_lead}>{enviando ? 'Salvando…' : 'Salvar lead'}</Botao>
        </div>
      </form>
    </Modal>
  );
}

export function Leads() {
  const { faixas, organizacao } = useOrganizacao();
  const [faixa, setFaixa] = useState('');
  const [status, setStatus] = useState('');
  const [busca, setBusca] = useState('');
  const [ordem, setOrdem] = useState('score_compensacao');
  const [pagina, setPagina] = useState(1);
  const [novoAberto, setNovoAberto] = useState(false);
  const [mensagem, setMensagem] = useMensagem();
  const buscaAtrasada = usarEspera(busca.trim());

  useEffect(() => setPagina(1), [faixa, status, buscaAtrasada, ordem]);

  const filtros = { ordem, direcao: 'desc', pagina, limite: POR_PAGINA };
  if (faixa) filtros.faixa = faixa;
  if (status) filtros.status = status;
  if (buscaAtrasada) filtros.busca = buscaAtrasada;
  const { dados, erro, carregando, recarregar } = useCarregamento(() => api.listarLeads(filtros), [faixa, status, buscaAtrasada, ordem, pagina]);
  const totalPaginas = Math.max(1, Math.ceil((dados?.total ?? 0) / POR_PAGINA));

  async function enriquecerPendentes() {
    try {
      const { enfileirados } = await api.enriquecerLote();
      setMensagem(enfileirados ? `${enfileirados} lead(s) na fila da Receita. O potencial atualiza conforme os dados chegam.` : 'Nenhum lead pendente de enriquecimento.');
    } catch (falha) {
      setMensagem(falha.message);
    }
  }

  return (
    <>
      <CabecalhoPagina
        titulo="Leads"
        descricao="Do maior para o menor potencial. Quem não tem dados suficientes (N/A) fica no fim."
        acoes={
          <>
            <Botao onClick={enriquecerPendentes}>Enriquecer pendentes</Botao>
            <Link to="/importacao" className="inline-flex min-h-10 items-center rounded-lg border border-borda-forte bg-superficie px-4 font-medium text-texto no-underline hover:bg-hover">Importar planilha</Link>
            <Botao variante="primario" onClick={() => setNovoAberto(true)}>+ Novo lead</Botao>
          </>
        }
      />
      {mensagem && <Aviso tipo="ok" className="mb-4">{mensagem}</Aviso>}

      <Cartao className="mb-4 flex flex-col gap-3 px-4 py-4">
        {[['Potencial', FAIXAS, faixa, setFaixa], ['Status', STATUS, status, setStatus]].map(([rotulo, opcoes, atual, definir]) => (
          <div key={rotulo} className="flex flex-wrap items-center gap-2" role="group" aria-label={`Filtrar por ${rotulo.toLowerCase()}`}>
            <span className="min-w-16 text-xs font-semibold text-texto-2">{rotulo}</span>
            {opcoes.map(([valor, nome]) => <Chip key={valor || 'todos'} ativo={atual === valor} onClick={() => definir(valor)}>{nome}</Chip>)}
          </div>
        ))}
      </Cartao>

      <Cartao className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-borda px-4 py-3.5">
          <div className="max-w-md flex-[1_1_320px]">
            <label htmlFor="busca" className="sr-only">Buscar leads</label>
            <input id="busca" type="search" value={busca} onChange={(e) => setBusca(e.target.value)} maxLength={100} placeholder="Buscar por nome, decisor, razão social ou CNPJ" className="min-h-10 w-full rounded-lg border border-borda-forte bg-superficie px-3 text-texto" />
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="ordem" className="text-[13px] whitespace-nowrap text-texto-2">Ordenar por</label>
            <select id="ordem" value={ordem} onChange={(e) => setOrdem(e.target.value)} className="min-h-10 rounded-lg border border-borda-forte bg-superficie px-3 text-texto">
              <option value="score_compensacao">Potencial (maior primeiro)</option>
              <option value="nota_final">Nota final (maior primeiro)</option>
              <option value="created_at">Mais recentes</option>
            </select>
          </div>
        </div>
        {erro && <div className="p-4"><ErroCarregamento erro={erro} aoTentar={recarregar} /></div>}
        <div className={`overflow-x-auto ${carregando ? 'opacity-60' : ''}`} aria-busy={carregando}>
          <div className="min-w-[1080px]">
            <div className={`${GRADE} border-b border-borda bg-superficie-2 px-3 py-2.5 text-xs font-semibold text-texto-2`}>
              <span>Potencial</span><span>Nome do lead</span><span>CNPJ</span><span>Decisor</span><span>Redes</span><span>Nota final</span><span>Responsável</span><span>Status</span>
            </div>
            {(dados?.leads ?? []).map((lead) => (
              <div key={lead.id} className={`${GRADE} border-b border-divisor px-3 py-2.5 hover:bg-superficie-2`}>
                <span className="pr-3"><MedidorBarra valor={lead.score_compensacao} parcial={lead.score_parcial} faixas={faixas} /></span>
                <Link to={`/leads/${lead.id}`} className="min-w-0 font-semibold text-texto no-underline hover:underline">{lead.nome_lead}</Link>
                <span className="font-mono text-[13px]">{formatarCnpj(lead.cnpj)}</span>
                <span className={lead.nome_decisor ? '' : 'text-texto-2'}>{lead.nome_decisor || '—'}</span>
                <span className="flex flex-wrap gap-1">
                  {lead.lead_redes_sociais?.length
                    ? lead.lead_redes_sociais.slice(0, 3).map((r) => (
                        <a key={r.id} href={r.url} target="_blank" rel="noopener noreferrer" title={r.url} className="inline-flex h-[22px] min-w-7 items-center justify-center rounded-md bg-hover px-1.5 text-[11px] font-semibold text-texto no-underline">{SIGLAS[r.plataforma] ?? 'Link'}</a>
                      ))
                    : <span className="text-texto-2">—</span>}
                </span>
                <NotaFinal nota={lead.nota_final} escala={organizacao?.escala_nota_max} />
                <span className={lead.responsavel ? '' : 'text-texto-2'}>{lead.responsavel?.nome ?? 'Sem responsável'}</span>
                <span><SeloStatus status={lead.status} /></span>
              </div>
            ))}
            {!carregando && dados?.leads?.length === 0 && (
              <div className="flex flex-col items-center gap-1.5 px-4 py-12 text-center">
                <span className="font-semibold">Nenhum lead encontrado</span>
                <span className="text-[13px] text-texto-2">{buscaAtrasada || faixa || status ? 'Tente outro termo, faixa ou status.' : 'Cadastre um lead ou importe uma planilha para começar.'}</span>
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <span className="text-[13px] text-texto-2" aria-live="polite">{dados ? `${dados.total} lead(s) · página ${pagina} de ${totalPaginas}` : ''}</span>
          <nav className="flex items-center gap-1" aria-label="Paginação">
            <Botao pequeno disabled={pagina <= 1} onClick={() => setPagina(pagina - 1)}>Anterior</Botao>
            <Botao pequeno disabled={pagina >= totalPaginas} onClick={() => setPagina(pagina + 1)}>Próxima</Botao>
          </nav>
        </div>
      </Cartao>
      {novoAberto && <NovoLead aberto aoFechar={() => setNovoAberto(false)} />}
    </>
  );
}
