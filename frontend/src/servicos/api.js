// Serviço da API (especificação, seções 10 e 11). Cada função corresponde a
// uma rota do backend; o token da sessão do Supabase vai em toda chamada.

import axios from 'axios';
import { ambiente } from '../config/ambiente.js';
import { supabase } from './supabase.js';

/** Erro da API num formato único: { status, mensagem }. */
export class ErroApi extends Error {
  constructor(status, mensagem) {
    super(mensagem);
    this.status = status;
  }
}

export function converterErro(erro) {
  if (erro instanceof ErroApi) return erro;
  const resposta = erro?.response;
  if (!resposta) return new ErroApi(0, 'Sem conexão com o servidor. Confira sua internet e tente de novo.');
  const mensagem = resposta.data?.erro ?? 'Algo deu errado. Tente de novo em instantes.';
  return new ErroApi(resposta.status, mensagem);
}

const id = (valor) => encodeURIComponent(valor);

function planilha(arquivo, mapeamento) {
  const formulario = new FormData();
  formulario.append('arquivo', arquivo);
  if (mapeamento !== undefined) formulario.append('mapeamento', JSON.stringify(mapeamento));
  return formulario;
}

/**
 * Funções da API sobre um cliente HTTP no formato do axios
 * (get/post/put/delete devolvendo { data }). Separado para ser testável.
 */
export function criarApi(cliente) {
  const dados = (promessa) => promessa.then((resposta) => resposta.data);
  const get = (rota, params) => dados(cliente.get(rota, params ? { params } : undefined));
  const post = (rota, corpo) => dados(cliente.post(rota, corpo));
  const put = (rota, corpo) => dados(cliente.put(rota, corpo));
  const del = (rota) => dados(cliente.delete(rota));

  return {
    // Sistema e conta
    saude: () => get('/saude'),
    me: () => get('/me'),
    onboarding: (corpo) => post('/onboarding', corpo),
    aceitarConvite: (conviteId, corpo = {}) => post(`/convites/${id(conviteId)}/aceitar`, corpo),

    // Organização, equipe e convites (admin, menos obterOrganizacao)
    obterOrganizacao: () => get('/organizacao'),
    atualizarOrganizacao: (corpo) => put('/organizacao', corpo),
    sugestaoPesos: () => get('/organizacao/sugestao-pesos'),
    listarMembros: () => get('/membros'),
    convidarMembro: (corpo) => post('/membros/convite', corpo),
    listarConvites: () => get('/convites'),
    cancelarConvite: (conviteId) => del(`/convites/${id(conviteId)}`),

    // Responsáveis e avaliação
    listarResponsaveis: () => get('/responsaveis'),
    criarResponsavel: (corpo) => post('/responsaveis', corpo),
    modeloAvaliacao: () => get('/avaliacao/modelo'),

    // Leads
    listarLeads: (filtros) => get('/leads', filtros),
    prioridade: (filtros) => get('/leads/prioridade', filtros),
    statusEnriquecimento: () => get('/leads/enriquecimento/status'),
    enriquecerLote: (corpo = {}) => post('/leads/enriquecer-lote', corpo),
    recalcularScores: () => post('/leads/recalcular-score'),
    obterLead: (leadId) => get(`/leads/${id(leadId)}`),
    criarLead: (corpo) => post('/leads', corpo),
    atualizarLead: (leadId, corpo) => put(`/leads/${id(leadId)}`, corpo),
    excluirLead: (leadId) => del(`/leads/${id(leadId)}`),
    enriquecerLead: (leadId) => post(`/leads/${id(leadId)}/enriquecer`),
    calcularScoreLead: (leadId) => post(`/leads/${id(leadId)}/calcular-score`),
    avaliarLead: (leadId, corpo) => put(`/leads/${id(leadId)}/avaliacao`, corpo),

    // Interações
    listarInteracoes: (leadId) => get(`/leads/${id(leadId)}/interacoes`),
    registrarInteracao: (leadId, corpo) => post(`/leads/${id(leadId)}/interacoes`, corpo),
    excluirInteracao: (leadId, interacaoId) => del(`/leads/${id(leadId)}/interacoes/${id(interacaoId)}`),

    // Importação
    previewImportacao: (arquivo) => post('/importacoes/preview', planilha(arquivo)),
    importar: (arquivo, mapeamento) => post('/importacoes', planilha(arquivo, mapeamento)),
    listarImportacoes: () => get('/importacoes'),
    obterImportacao: (importacaoId) => get(`/importacoes/${id(importacaoId)}`),

    // Dashboard
    resumoDashboard: () => get('/dashboard/resumo'),
    conversao: () => get('/dashboard/conversao'),
  };
}

function criarCliente() {
  const cliente = axios.create({ baseURL: ambiente?.apiUrl, timeout: 30_000 });
  cliente.interceptors.request.use(async (config) => {
    const { data } = (await supabase?.auth.getSession()) ?? { data: {} };
    const token = data?.session?.access_token;
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  });
  cliente.interceptors.response.use(undefined, (erro) => Promise.reject(converterErro(erro)));
  return cliente;
}

export const api = criarApi(criarCliente());
