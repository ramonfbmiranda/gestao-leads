// Detalhe do lead (seção 11): o medidor de potencial explicado a partir do
// score_detalhes, as ações do funil, as interações e os dados do lead.

import { Fragment, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { AreaTexto, Chip, ErroCarregamento, Modal, Selecao, useCarregamento, useMensagem } from '../componentes/comuns.jsx';
import { MedidorArco, NotaFinal, SeloFaixa, SeloParcial, SeloStatus } from '../componentes/potencial.jsx';
import { Aviso, Botao, Campo, Cartao, classesBotao } from '../componentes/ui.jsx';
import { useAutenticacao } from '../contextos/AutenticacaoContexto.jsx';
import { useOrganizacao } from '../contextos/OrganizacaoContexto.jsx';
import { api } from '../servicos/api.js';
import { ROTULOS_STATUS, formatarCnpj, formatarMoeda, formatarNumero } from '../utils/formatos.js';
import { PROXIMO_STATUS, decisorProvavel } from '../utils/potencial.js';

const TIPOS_INTERACAO = [['ligacao', 'Ligação'], ['whatsapp', 'WhatsApp'], ['email', 'E-mail'], ['reuniao', 'Reunião'], ['visita', 'Visita'], ['outro', 'Outro']];
const ROTULO_ORIGEM = { sistema: 'Sistema', avaliacao: 'Avaliação', planilha: 'Planilha' };

const dataHora = (valor) => (valor ? new Date(valor).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—');
const data = (valor) => (valor ? new Date(`${String(valor).slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR') : '—');

function Pilar({ nome, descricao, valor, esforco = false, parcial }) {
  return (
    <div role="meter" aria-label={nome} aria-valuemin={0} aria-valuemax={100} aria-valuenow={valor ?? undefined} aria-valuetext={`${nome} ${formatarNumero(valor)}${esforco ? ', menor é melhor' : ''}`} className="grid grid-cols-[minmax(110px,150px)_1fr_64px] items-center gap-3 text-[13px]">
      <span className="flex flex-col leading-snug"><span className="font-semibold">{nome}</span><span className="text-xs text-texto-2">{descricao}</span></span>
      <div className={`h-2.5 overflow-hidden rounded ${esforco ? 'bg-hover' : 'bg-pot-trilho'}`}>
        <div className={`h-2.5 rounded ${esforco ? 'bg-texto-3' : 'bg-pot-media'}`} style={{ width: `${valor ?? 0}%` }} />
      </div>
      <span className="text-right font-bold">{formatarNumero(valor)}{parcial && <span className="block"><SeloParcial pequeno /></span>}</span>
    </div>
  );
}

function FatorLinha({ fator }) {
  const na = fator.situacao === 'na';
  const desligado = fator.situacao === 'desligado';
  return (
    <div className={`grid grid-cols-[minmax(150px,1.2fr)_minmax(150px,1.4fr)_64px_120px_minmax(120px,1fr)] items-center gap-3 border-b border-divisor py-2.5 text-[13px] ${na ? 'bg-superficie-2' : ''}`}>
      <span className="font-medium">{fator.rotulo}</span>
      <span className="text-texto-2">
        {fator.origem && <span className="mr-1.5 rounded-full bg-pot-suave px-2 py-px text-[11px] font-semibold text-pot-texto">{ROTULO_ORIGEM[fator.origem]}</span>}
        {na || desligado ? fator.motivo : fator.valor_bruto !== null && fator.valor_bruto !== undefined ? String(fator.valor_bruto) : ''}
      </span>
      <span className="font-semibold">{na ? <span className="rounded-full bg-hover px-2 py-0.5 text-xs text-texto-2">N/A</span> : desligado ? '—' : formatarNumero(fator.pontos, 0)}</span>
      <span>{desligado ? <span className="text-texto-2">desligado</span> : na ? <span className="text-texto-2">redistribuído</span> : <>{fator.peso_efetivo !== fator.peso && <span className="mr-1 text-texto-2 line-through">{fator.peso}%</span>}{formatarNumero(fator.peso_efetivo, 1)}%</>}</span>
      <span className="flex items-center gap-2">
        {fator.situacao === 'ok' && (
          <>
            <span className="h-2 flex-1 overflow-hidden rounded bg-pot-trilho"><span className="block h-2 rounded bg-pot-media" style={{ width: `${fator.contribuicao}%` }} /></span>
            <b className="min-w-9 text-right">{formatarNumero(fator.contribuicao)}</b>
          </>
        )}
      </span>
      {fator.itens?.length > 0 && (
        <span className="col-span-full flex flex-wrap gap-1.5 pt-1">
          {fator.itens.map((item) => (
            <span key={item.id} className="rounded-md border border-divisor bg-superficie-2 px-2 py-0.5 text-xs">
              {item.rotulo}: {item.resposta ?? (item.situacao ? (item.situacao === 'ok' ? formatarNumero(item.pontos, 0) : item.situacao) : 'sem resposta')}
              {item.resposta && item.pontos !== null ? ` · ${formatarNumero(item.pontos, 0)}` : ''}
            </span>
          ))}
        </span>
      )}
    </div>
  );
}

function EditarLead({ lead, aoFechar, aoSalvar }) {
  const { organizacao } = useOrganizacao();
  const { dados: responsaveis } = useCarregamento(() => api.listarResponsaveis(), []);
  const CAMPOS = ['nome_lead', 'nome_decisor', 'numero_decisor', 'email_decisor', 'linkedin_decisor', 'link_cnpj', 'redes_sociais', 'calculadora_icp', 'calculadora_midias_sociais', 'nota_final', 'responsavel_id'];
  const [form, setForm] = useState(() => Object.fromEntries(CAMPOS.map((c) => [c, lead[c] ?? ''])));
  const [erro, setErro] = useState(null);
  const campo = (nome) => ({ value: form[nome] ?? '', onChange: (e) => setForm({ ...form, [nome]: e.target.value }) });

  async function salvar(evento) {
    evento.preventDefault();
    const corpo = {};
    for (const nome of CAMPOS) {
      const antes = lead[nome] ?? '';
      const agora = String(form[nome] ?? '').trim();
      if (String(antes) === agora) continue;
      if (['calculadora_icp', 'calculadora_midias_sociais', 'nota_final'].includes(nome)) corpo[nome] = agora === '' ? null : Number(agora.replace(',', '.'));
      else corpo[nome] = agora === '' ? null : agora;
    }
    // O texto de redes só acrescenta links; não manda o original de novo se não mudou.
    if (Object.keys(corpo).length === 0) return aoFechar();
    try {
      aoSalvar(await api.atualizarLead(lead.id, corpo), 'Dados salvos e potencial recalculado.');
    } catch (falha) {
      setErro(falha.message);
    }
  }

  return (
    <Modal titulo="Editar lead" aberto aoFechar={aoFechar} largura="max-w-2xl">
      <form className="flex flex-col gap-4" onSubmit={salvar}>
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
        <p className="-mt-2 text-xs text-texto-2">O CNPJ não pode ser alterado. Mudar decisor, contatos, redes ou notas recalcula o potencial.</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Campo id="e-nome" rotulo="Nome do lead" required {...campo('nome_lead')} />
          <Selecao id="e-resp" rotulo="Responsável" {...campo('responsavel_id')}>
            <option value="">Sem responsável</option>
            {(responsaveis ?? []).map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}
          </Selecao>
          <Campo id="e-decisor" rotulo="Nome do decisor" {...campo('nome_decisor')} />
          <Campo id="e-numero" rotulo="Telefone do decisor" {...campo('numero_decisor')} />
          <Campo id="e-email" rotulo="E-mail do decisor" type="email" {...campo('email_decisor')} />
          <Campo id="e-linkedin" rotulo="LinkedIn do decisor" {...campo('linkedin_decisor')} />
          <Campo id="e-link" rotulo="Link de informações do CNPJ" className="sm:col-span-2" {...campo('link_cnpj')} />
          <AreaTexto id="e-redes" rotulo="Redes sociais (links novos são acrescentados)" rows={2} className="sm:col-span-2" {...campo('redes_sociais')} />
          <Campo id="e-icp" rotulo={`Nota ICP (0 a ${Number(organizacao?.escala_icp_max ?? 10)})`} inputMode="decimal" {...campo('calculadora_icp')} />
          <Campo id="e-midias" rotulo={`Nota de mídias (0 a ${Number(organizacao?.escala_midias_max ?? 10)})`} inputMode="decimal" {...campo('calculadora_midias_sociais')} />
          <Campo id="e-nota" rotulo={`Nota final (0 a ${Number(organizacao?.escala_nota_max ?? 10)})`} inputMode="decimal" {...campo('nota_final')} />
        </div>
        <div className="flex justify-end gap-2"><Botao onClick={aoFechar}>Cancelar</Botao><Botao type="submit" variante="primario">Salvar</Botao></div>
      </form>
    </Modal>
  );
}

function Interacoes({ leadId, aoMudar }) {
  const { perfil } = useAutenticacao();
  const { dados: interacoes, erro, recarregar } = useCarregamento(() => api.listarInteracoes(leadId), [leadId]);
  const [aberto, setAberto] = useState(false);
  const [tipo, setTipo] = useState('ligacao');
  const [teveResposta, setTeveResposta] = useState(false);
  const [observacao, setObservacao] = useState('');
  const [falha, setFalha] = useState(null);

  async function salvar() {
    setFalha(null);
    try {
      await api.registrarInteracao(leadId, { tipo, teve_resposta: teveResposta, ...(observacao.trim() ? { observacao: observacao.trim() } : {}) });
      setAberto(false);
      setObservacao('');
      await recarregar();
      aoMudar(teveResposta ? 'Interação registrada. Com a resposta, as tentativas sem resposta zeraram.' : 'Interação registrada e potencial recalculado.');
    } catch (e) {
      setFalha(e.message);
    }
  }

  async function excluir(id) {
    try {
      await api.excluirInteracao(leadId, id);
      await recarregar();
      aoMudar('Interação excluída e potencial recalculado.');
    } catch (e) {
      setFalha(e.message);
    }
  }

  const rotuloTipo = Object.fromEntries(TIPOS_INTERACAO);
  return (
    <Cartao className="p-5">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold">Interações</h2>
        <Botao pequeno onClick={() => setAberto(!aberto)}>{aberto ? 'Fechar' : '+ Registrar'}</Botao>
      </div>
      {falha && <Aviso tipo="erro" className="mb-2">{falha}</Aviso>}
      {erro && <ErroCarregamento erro={erro} aoTentar={recarregar} />}
      {aberto && (
        <div className="my-2 flex flex-col gap-2.5 rounded-[10px] border border-divisor bg-superficie-2 p-3">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Tipo">
            {TIPOS_INTERACAO.map(([id, rotulo]) => <Chip key={id} ativo={tipo === id} onClick={() => setTipo(id)}>{rotulo}</Chip>)}
          </div>
          <div className="flex gap-1.5" role="group" aria-label="Teve resposta?">
            <Chip ativo={teveResposta} onClick={() => setTeveResposta(true)}>Teve resposta</Chip>
            <Chip ativo={!teveResposta} onClick={() => setTeveResposta(false)}>Sem resposta</Chip>
          </div>
          <AreaTexto id="obs" rotulo="Observação (opcional)" rows={2} maxLength={2000} value={observacao} onChange={(e) => setObservacao(e.target.value)} />
          <div className="flex justify-end"><Botao pequeno variante="primario" onClick={salvar}>Salvar</Botao></div>
        </div>
      )}
      <ul className="flex flex-col">
        {(interacoes ?? []).map((i) => (
          <li key={i.id} className="grid grid-cols-[16px_1fr_auto] items-start gap-2.5 border-b border-divisor py-2.5 text-[13px] last:border-b-0">
            <span className={`mt-1.5 h-2.5 w-2.5 rounded-full border-2 ${i.teve_resposta ? 'border-pot-media bg-pot-media' : 'border-texto-3'}`} aria-hidden="true" />
            <span className="flex flex-col">
              <span><b className="font-semibold">{rotuloTipo[i.tipo] ?? i.tipo}</b> · {i.teve_resposta ? 'teve resposta' : 'sem resposta'}</span>
              <span className="text-xs text-texto-2">{dataHora(i.ocorreu_em)} · {i.perfil?.nome ?? 'Alguém da equipe'}{i.observacao ? ` · ${i.observacao}` : ''}</span>
            </span>
            {(perfil?.papel === 'admin' || i.perfil_id === perfil?.id) && (
              <button type="button" className="cursor-pointer text-xs text-texto-2 underline" onClick={() => excluir(i.id)} aria-label="Excluir interação">Excluir</button>
            )}
          </li>
        ))}
        {interacoes?.length === 0 && <li className="py-3 text-[13px] text-texto-2">Nenhuma interação registrada.</li>}
      </ul>
    </Cartao>
  );
}

export function DetalheLead() {
  const { id } = useParams();
  const navegar = useNavigate();
  const { faixas, config, organizacao } = useOrganizacao();
  const { dados: lead, erro, carregando, recarregar, definir } = useCarregamento(() => api.obterLead(id), [id]);
  const [mensagem, setMensagem] = useMensagem();
  const [falha, setFalha] = useState(null);
  const [modal, setModal] = useState(null);
  const [motivo, setMotivo] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  if (erro?.status === 404) return <Aviso tipo="erro">Lead não encontrado. <Link to="/leads">Voltar para a lista</Link></Aviso>;
  if (erro) return <ErroCarregamento erro={erro} aoTentar={recarregar} />;
  if (carregando && !lead) return <p className="text-texto-2">Carregando…</p>;

  const detalhes = lead.score_detalhes?.versao === 2 ? lead.score_detalhes : null;
  const provavel = !lead.nome_decisor ? decisorProvavel(lead.socios) : null;
  const proximo = PROXIMO_STATUS[lead.status];
  const financeiro = detalhes?.financeiro;
  const extras = Object.entries(lead.dados_extras ?? {}).filter(([chave]) => chave !== 'originais');

  async function executar(acao, texto) {
    setFalha(null);
    setOcupado(true);
    try {
      const atualizado = await acao();
      if (atualizado) definir(atualizado);
      setModal(null);
      setMensagem(texto);
    } catch (e) {
      setFalha(e.message);
    } finally {
      setOcupado(false);
    }
  }

  const atualizar = (corpo, texto) => executar(() => api.atualizarLead(lead.id, corpo), texto);
  const acaoSugestao = {
    usar_decisor_provavel: () => atualizar({ nome_decisor: provavel?.nome }, `${provavel?.nome} virou o decisor. Potencial recalculado.`),
    enriquecer: () => executar(() => api.enriquecerLead(lead.id), 'Dados da Receita atualizados e potencial recalculado.'),
  };

  return (
    <>
      <nav aria-label="Caminho" className="mb-3 text-[13px]"><Link to="/leads" className="no-underline">Leads</Link><span className="px-2 text-texto-2">/</span><span className="text-texto-2">{lead.nome_lead}</span></nav>
      {mensagem && <Aviso tipo="ok" className="mb-4">{mensagem}</Aviso>}
      {falha && <Aviso tipo="erro" className="mb-4">{falha}</Aviso>}

      <Cartao className="mb-4 flex flex-wrap items-start justify-between gap-4 px-6 py-5">
        <div className="flex min-w-0 flex-col gap-2">
          <h1 className="text-2xl font-bold tracking-tight">{lead.nome_lead}</h1>
          <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2 text-[13px]">
            <span className="font-mono">{formatarCnpj(lead.cnpj)}</span>
            <SeloStatus status={lead.status} />
            <span className="text-texto-2">Responsável: <span className="font-medium text-texto">{lead.responsavel?.nome ?? 'nenhum'}</span></span>
            {lead.avaliado_em && <span className="text-texto-2">Avaliado em {dataHora(lead.avaliado_em)}</span>}
            {lead.status === 'descartado' && lead.motivo_descarte && <span className="text-texto-2">Motivo: {lead.motivo_descarte}</span>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to={`/leads/${lead.id}/avaliar`} className={classesBotao({ variante: 'primario' })}>Avaliar lead</Link>
          {proximo && <Botao disabled={ocupado} onClick={() => atualizar({ status: proximo }, `Status alterado para ${ROTULOS_STATUS[proximo]}.`)}>Avançar para {ROTULOS_STATUS[proximo]} →</Botao>}
          {!['descartado', 'convertido'].includes(lead.status) && <Botao onClick={() => { setMotivo(null); setModal('descartar'); }}>Descartar</Botao>}
          {['descartado', 'convertido'].includes(lead.status) && <Botao disabled={ocupado} onClick={() => atualizar({ status: 'em_contato' }, 'Lead reaberto. O desfecho e o motivo foram limpos.')}>Reabrir</Botao>}
          <Botao onClick={() => setModal('editar')}>Editar</Botao>
          <Botao disabled={ocupado} onClick={acaoSugestao.enriquecer}>Enriquecer</Botao>
          <Botao disabled={ocupado} onClick={() => executar(() => api.calcularScoreLead(lead.id), 'Potencial recalculado com a configuração atual.')}>Recalcular</Botao>
          <Botao variante="perigo" onClick={() => setModal('excluir')}>Excluir</Botao>
        </div>
      </Cartao>

      {!detalhes ? (
        <Cartao className="mb-4 flex flex-wrap items-center justify-between gap-3 p-6">
          <span className="text-texto-2">O potencial deste lead ainda não foi calculado com o motor atual.</span>
          <Botao variante="primario" onClick={() => executar(() => api.calcularScoreLead(lead.id), 'Potencial calculado.')}>Calcular agora</Botao>
        </Cartao>
      ) : (
        <Cartao className="mb-4 flex flex-wrap gap-x-9 gap-y-7 p-6">
          <div className="flex min-w-[250px] flex-[0_1_290px] flex-col items-center gap-2.5 text-center">
            <h2 className="self-stretch text-left text-xs font-semibold tracking-wider text-texto-2 uppercase">Potencial do lead</h2>
            <MedidorArco valor={lead.score_compensacao} parcial={lead.score_parcial} faixas={faixas} />
            <div className="flex flex-wrap justify-center gap-2"><SeloFaixa valor={lead.score_compensacao} faixas={faixas} />{lead.score_parcial && <SeloParcial />}</div>
            <p className="text-xs text-texto-2">Calculado em {dataHora(lead.score_calculado_em)}</p>
            {detalhes.confianca && (
              <div className="flex w-full flex-col gap-1.5 text-left">
                <div className="flex justify-between text-[13px]"><span className="font-semibold">Confiança</span><span className="text-texto-2">{detalhes.confianca.com_dado} de {detalhes.confianca.total} itens com dado</span></div>
                <div role="img" aria-label={`${detalhes.confianca.com_dado} de ${detalhes.confianca.total} itens com dado`} className="flex gap-[3px]">
                  {Array.from({ length: detalhes.confianca.total }, (_, i) => (
                    <span key={i} className={`h-3 flex-1 rounded-[3px] ${i < detalhes.confianca.com_dado ? 'bg-pot-media' : 'border-[1.5px] border-dashed border-texto-3'}`} />
                  ))}
                </div>
                {detalhes.motivos_parcial?.length > 0 && <span className="text-xs text-texto-2">Falta: {detalhes.motivos_parcial.join('; ')}.</span>}
              </div>
            )}
          </div>

          <div className="flex min-w-0 flex-[1_1_340px] flex-col gap-4">
            <div><h3 className="text-[15px] font-semibold">De onde vem o número</h3><p className="text-[13px] text-texto-2">Valor e probabilidade puxam para cima; esforço puxa para baixo.</p></div>
            <Pilar nome="Valor" descricao="quanto pode render" valor={lead.score_valor} parcial={detalhes.valor?.parcial} />
            <Pilar nome="Probabilidade" descricao="chance de fechar" valor={lead.score_probabilidade} parcial={detalhes.probabilidade?.parcial} />
            <Pilar nome="Esforço" descricao="menor é melhor" valor={lead.score_esforco} esforco />
            <p className="rounded-[10px] border border-divisor bg-superficie-2 px-3.5 py-3 font-mono text-[13px]">
              {detalhes.formula === 'media_geometrica' && `√(${formatarNumero(lead.score_valor, 2)} × ${formatarNumero(lead.score_probabilidade, 2)}) ÷ (1 + ${formatarNumero(lead.score_esforco, 2)} ÷ 100) = ${formatarNumero(detalhes.compensacao_sem_limite, 2)}`}
              {detalhes.formula === 'pilar_unico' && `${formatarNumero(lead.score_valor ?? lead.score_probabilidade, 2)} ÷ (1 + ${formatarNumero(lead.score_esforco, 2)} ÷ 100) = ${formatarNumero(detalhes.compensacao_sem_limite, 2)} (só um pilar com dado)`}
              {detalhes.formula === 'na' && 'Sem valor e sem probabilidade: potencial N/A.'}
              {detalhes.limite_situacao && ` → teto de ${detalhes.limite_situacao.limite} (situação ${detalhes.limite_situacao.situacao})`}
            </p>
            {financeiro && (
              <div className="flex flex-col gap-2 rounded-[10px] border border-borda px-4 py-3.5">
                <div className="flex flex-wrap items-baseline justify-between gap-1.5"><span className="font-semibold">Estimativa em reais</span><span className="text-xs text-texto-2">não entra no potencial</span></div>
                {financeiro.valor_esperado !== null ? (
                  <>
                    <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
                      <span><span className="text-[22px] font-bold">{formatarMoeda(financeiro.valor_esperado)}</span> <span className="text-xs text-texto-2">valor esperado</span></span>
                      {financeiro.horas !== null && <span><b className="text-base">{formatarNumero(financeiro.horas)} h</b> <span className="text-xs text-texto-2">para conquistar</span></span>}
                      {financeiro.valor_por_hora !== null && <b className="text-base">{formatarMoeda(financeiro.valor_por_hora)}/h</b>}
                    </div>
                    <span className="text-xs text-texto-2">
                      Ticket de {formatarMoeda(financeiro.ticket)} ({financeiro.origem_ticket === 'lead' ? 'informado na avaliação' : 'padrão do porte'}) × chance de {formatarNumero(financeiro.chance * 100, 0)}% ({financeiro.origem_chance === 'historico' ? 'taxa real da faixa' : 'índice de probabilidade'}).
                    </span>
                  </>
                ) : <span className="text-[13px] text-texto-2">{financeiro.motivo}</span>}
              </div>
            )}
          </div>

          <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-3">
            <div><h3 className="text-[15px] font-semibold">Como aumentar o potencial</h3><p className="text-[13px] text-texto-2">Simulado com os pesos atuais da organização.</p></div>
            {(detalhes.sugestoes ?? []).map((s) => (
              <div key={s.acao} className={`flex flex-col gap-1.5 rounded-[10px] border border-borda p-3.5 ${s.ganho === null ? 'border-dashed' : ''}`}>
                <span className="font-semibold">{s.rotulo}</span>
                {s.ganho !== null && (
                  <span className="flex flex-wrap items-center gap-2 text-[13px]">
                    <span className="font-mono">{formatarNumero(lead.score_compensacao)} → {formatarNumero(s.compensacao_simulada)}</span>
                    <span className="rounded-full bg-pot-suave px-2 py-px text-xs font-bold text-pot-texto">+{formatarNumero(s.ganho)}</span>
                  </span>
                )}
                {acaoSugestao[s.acao] && <Botao pequeno className="self-start" disabled={ocupado} onClick={acaoSugestao[s.acao]}>{s.acao === 'enriquecer' ? 'Buscar agora' : 'Fazer agora'}</Botao>}
                {s.acao.startsWith('avaliar_') && <Link to={`/leads/${lead.id}/avaliar`} className="text-[13px] font-semibold no-underline">Abrir a avaliação →</Link>}
                {['telefone_decisor', 'nome_decisor', 'redes_sociais'].includes(s.acao) && <button type="button" className="cursor-pointer self-start text-[13px] font-semibold text-link" onClick={() => setModal('editar')}>Preencher →</button>}
              </div>
            ))}
            {detalhes.sugestoes?.length === 0 && <p className="text-[13px] text-texto-2">Nada a sugerir: todos os dados que mexem no potencial já estão preenchidos.</p>}
          </div>
        </Cartao>
      )}

      <div className="flex flex-wrap items-start gap-4">
        {detalhes && (
          <Cartao className="min-w-0 flex-[3_1_620px] px-6 py-5">
            <h2 className="text-[15px] font-semibold">Fator a fator</h2>
            <p className="text-[13px] text-texto-2">N/A não é zero: o fator fica de fora e o peso vai para os outros do mesmo pilar.</p>
            <div className="overflow-x-auto">
              <div className="min-w-[660px]">
                {[['Valor', detalhes.valor, lead.score_valor], ['Probabilidade', detalhes.probabilidade, lead.score_probabilidade]].map(([titulo, pilar, valor]) => (
                  <div key={titulo}>
                    <h3 className="pt-4 pb-1 text-sm font-semibold">{titulo} · {formatarNumero(valor, 2)}</h3>
                    {(pilar?.fatores ?? []).map((f) => <FatorLinha key={f.fator} fator={f} />)}
                  </div>
                ))}
                <h3 className="pt-5 pb-1 text-sm font-semibold">Esforço · {formatarNumero(lead.score_esforco, 2)}</h3>
                {(detalhes.esforco?.penalidades ?? []).map((p) => (
                  <div key={p.penalidade} className="grid grid-cols-[minmax(170px,1.2fr)_minmax(200px,1.8fr)_110px] items-center gap-3 border-b border-divisor py-2.5 text-[13px]">
                    <span className="font-medium">{p.rotulo}</span>
                    <span className="text-texto-2">{p.detalhe ?? p.motivo ?? (p.situacao === 'desligado' ? 'desligado na configuração' : p.aplicada ? 'aplicada' : 'não se aplica')}</span>
                    <span className="text-right">{p.aplicada ? <b>+{formatarNumero(p.pontos, p.pontos % 1 ? 1 : 0)}</b> : <span className="text-texto-2">0</span>} <span className="text-texto-2">de {p.maximo}</span></span>
                  </div>
                ))}
              </div>
            </div>
          </Cartao>
        )}

        <div className="flex min-w-0 flex-[2_1_340px] flex-col gap-4">
          <Interacoes leadId={lead.id} aoMudar={(texto) => { setMensagem(texto); recarregar(); }} />

          <Cartao className="p-5">
            <h2 className="mb-3.5 text-[15px] font-semibold">Dados do lead</h2>
            <dl className="grid grid-cols-[minmax(120px,40%)_1fr] gap-x-4 gap-y-2.5 text-[13px] [&_dd]:min-w-0 [&_dd]:font-medium [&_dd]:break-words [&_dt]:text-texto-2">
              <dt>Decisor</dt><dd>{lead.nome_decisor || <span className="font-normal text-texto-2">Não informado</span>}</dd>
              <dt>Telefone do decisor</dt><dd>{lead.numero_decisor || <span className="font-normal text-texto-2">Não informado</span>}</dd>
              <dt>E-mail do decisor</dt><dd>{lead.email_decisor || <span className="font-normal text-texto-2">Não informado</span>}</dd>
              <dt>LinkedIn do decisor</dt><dd>{lead.linkedin_decisor ? <a href={lead.linkedin_decisor} target="_blank" rel="noopener noreferrer">{lead.linkedin_decisor}</a> : <span className="font-normal text-texto-2">Não informado</span>}</dd>
              <dt>Ticket estimado</dt><dd>{lead.ticket_estimado !== null && lead.ticket_estimado !== undefined ? formatarMoeda(lead.ticket_estimado) : <span className="font-normal text-texto-2">padrão do porte</span>}</dd>
              <dt>Nota final (planilha)</dt><dd><NotaFinal nota={lead.nota_final} escala={organizacao?.escala_nota_max} /></dd>
              {lead.link_cnpj && <Fragment><dt>Link do CNPJ</dt><dd><a href={lead.link_cnpj} target="_blank" rel="noopener noreferrer">abrir ↗</a></dd></Fragment>}
            </dl>
            {provavel && (
              <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-pot-suave px-3 py-2.5 text-[13px]">
                <span><b className="font-semibold">Decisor provável:</b> {provavel.nome}{provavel.qualificacao ? `, ${provavel.qualificacao}` : ''} (Receita)</span>
                <Botao pequeno disabled={ocupado} onClick={acaoSugestao.usar_decisor_provavel}>Usar como decisor</Botao>
              </div>
            )}
          </Cartao>

          <Cartao className="p-5">
            <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-[15px] font-semibold">Dados da Receita</h2>
              <span className="text-xs text-texto-2">{lead.enriquecido_em ? `Enriquecido em ${dataHora(lead.enriquecido_em)}` : lead.enriquecimento_status ? `Situação: ${lead.enriquecimento_status}` : 'Ainda não consultado'}</span>
            </div>
            {lead.enriquecimento_erro && <Aviso tipo="aviso" className="mb-3">{lead.enriquecimento_erro}</Aviso>}
            {lead.ultima_mudanca_receita && (
              <Aviso tipo="aviso" className="mb-3">Mudou na Receita: {lead.ultima_mudanca_receita.mudancas?.map((m) => `${m.campo} de ${m.de} para ${m.para}`).join('; ')}.</Aviso>
            )}
            <dl className="grid grid-cols-[minmax(120px,40%)_1fr] gap-x-4 gap-y-2.5 text-[13px] [&_dd]:min-w-0 [&_dd]:font-medium [&_dd]:break-words [&_dt]:text-texto-2">
              <dt>Razão social</dt><dd>{lead.razao_social ?? '—'}</dd>
              <dt>Porte</dt><dd>{lead.porte ?? '—'}</dd>
              <dt>Capital social</dt><dd>{lead.capital_social !== null && lead.capital_social !== undefined ? formatarMoeda(lead.capital_social) : '—'}{Number(lead.capital_social) === 0 && <span className="ml-1 rounded-full bg-hover px-2 text-xs text-texto-2">N/A</span>}</dd>
              <dt>CNAE principal</dt><dd>{lead.cnae_principal ?? '—'}</dd>
              <dt>Abertura</dt><dd>{data(lead.data_abertura)}</dd>
              <dt>Cidade / UF</dt><dd>{lead.cidade ? `${lead.cidade} / ${lead.uf}` : '—'}</dd>
              <dt>Situação</dt><dd>{lead.situacao_cadastral ?? '—'}</dd>
              <dt>Telefone da empresa</dt><dd>{lead.telefone_receita ?? '—'}</dd>
              <dt>E-mail da empresa</dt><dd>{lead.email_receita ?? '—'}</dd>
              <dt>Sócios</dt><dd>{lead.socios?.length ? lead.socios.map((s) => <span key={s.nome} className="block">{s.nome}<span className="font-normal text-texto-2">{s.qualificacao ? ` · ${s.qualificacao}` : ''}</span></span>) : '—'}</dd>
            </dl>
          </Cartao>

          {lead.lead_redes_sociais?.length > 0 && (
            <Cartao className="p-5">
              <h2 className="mb-3 text-[15px] font-semibold">Redes sociais</h2>
              <ul className="flex flex-col gap-2">
                {lead.lead_redes_sociais.map((r) => (
                  <li key={r.id} className="flex items-center gap-2.5"><span className="inline-flex min-w-[72px] justify-center rounded-md bg-hover px-2 py-0.5 text-xs font-semibold capitalize">{r.plataforma}</span><a href={r.url} target="_blank" rel="noopener noreferrer" className="break-all">{r.url.replace(/^https?:\/\//, '')}</a></li>
                ))}
              </ul>
            </Cartao>
          )}

          {extras.length > 0 && (
            <Cartao className="p-5">
              <h2 className="mb-1 text-[15px] font-semibold">Outras colunas da planilha</h2>
              <dl className="mt-3 grid grid-cols-[minmax(120px,40%)_1fr] gap-x-4 gap-y-2.5 text-[13px] [&_dd]:font-medium [&_dd]:break-words [&_dt]:text-texto-2">
                {extras.map(([chave, valor]) => <Fragment key={chave}><dt>{chave}</dt><dd>{String(valor)}</dd></Fragment>)}
              </dl>
            </Cartao>
          )}
        </div>
      </div>

      {modal === 'descartar' && (
        <Modal titulo="Por que descartar este lead?" aberto aoFechar={() => setModal(null)}>
          <p className="-mt-2 text-[13px] text-texto-2">O motivo ajuda a calibrar o cálculo. O potencial atual ({formatarNumero(lead.score_compensacao)}) fica guardado junto com o desfecho.</p>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Motivo do descarte">
            {(config?.motivos_descarte ?? []).map((m) => <Chip key={m} ativo={motivo === m} onClick={() => setMotivo(m)}>{m}</Chip>)}
          </div>
          <div className="flex justify-end gap-2">
            <Botao onClick={() => setModal(null)}>Cancelar</Botao>
            <Botao variante="primario" disabled={!motivo || ocupado} onClick={() => atualizar({ status: 'descartado', motivo_descarte: motivo }, `Lead descartado: ${motivo}.`)}>Descartar</Botao>
          </div>
        </Modal>
      )}
      {modal === 'excluir' && (
        <Modal titulo={`Excluir ${lead.nome_lead}?`} aberto aoFechar={() => setModal(null)}>
          <p className="text-[13px] text-texto-2">O lead, as interações, os links e o potencial calculado serão apagados. Não dá para desfazer.</p>
          <div className="flex justify-end gap-2">
            <Botao onClick={() => setModal(null)}>Cancelar</Botao>
            <button type="button" disabled={ocupado} className={`${classesBotao()} border-perigo-cheio! bg-perigo-cheio! text-white!`} onClick={() => executar(async () => { await api.excluirLead(lead.id); navegar('/leads', { replace: true }); return null; }, '')}>Excluir lead</button>
          </div>
        </Modal>
      )}
      {modal === 'editar' && <EditarLead lead={lead} aoFechar={() => setModal(null)} aoSalvar={(atualizado, texto) => { definir(atualizado); setModal(null); setMensagem(texto); }} />}
    </>
  );
}
