import { describe, expect, it, vi } from 'vitest';
import { ErroApi, converterErro, criarApi } from '../src/servicos/api.js';

function clienteFalso() {
  const resposta = (metodo) => vi.fn(async (...args) => ({ data: { metodo, args } }));
  return { get: resposta('get'), post: resposta('post'), put: resposta('put'), delete: resposta('delete') };
}

describe('criarApi', () => {
  const cliente = clienteFalso();
  const api = criarApi(cliente);

  it.each([
    ['me', [], 'get', '/me'],
    ['onboarding', [{ nome_organizacao: 'X' }], 'post', '/onboarding'],
    ['aceitarConvite', ['c1'], 'post', '/convites/c1/aceitar'],
    ['atualizarOrganizacao', [{}], 'put', '/organizacao'],
    ['sugestaoPesos', [], 'get', '/organizacao/sugestao-pesos'],
    ['listarMembros', [], 'get', '/membros'],
    ['convidarMembro', [{}], 'post', '/membros/convite'],
    ['cancelarConvite', ['c1'], 'delete', '/convites/c1'],
    ['modeloAvaliacao', [], 'get', '/avaliacao/modelo'],
    ['listarLeads', [{ faixa: 'alta' }], 'get', '/leads'],
    ['prioridade', [], 'get', '/leads/prioridade'],
    ['statusEnriquecimento', [], 'get', '/leads/enriquecimento/status'],
    ['enriquecerLote', [], 'post', '/leads/enriquecer-lote'],
    ['recalcularScores', [], 'post', '/leads/recalcular-score'],
    ['obterLead', ['l1'], 'get', '/leads/l1'],
    ['atualizarLead', ['l1', {}], 'put', '/leads/l1'],
    ['excluirLead', ['l1'], 'delete', '/leads/l1'],
    ['enriquecerLead', ['l1'], 'post', '/leads/l1/enriquecer'],
    ['calcularScoreLead', ['l1'], 'post', '/leads/l1/calcular-score'],
    ['avaliarLead', ['l1', { respostas: {} }], 'put', '/leads/l1/avaliacao'],
    ['listarInteracoes', ['l1'], 'get', '/leads/l1/interacoes'],
    ['registrarInteracao', ['l1', {}], 'post', '/leads/l1/interacoes'],
    ['excluirInteracao', ['l1', 'i1'], 'delete', '/leads/l1/interacoes/i1'],
    ['listarImportacoes', [], 'get', '/importacoes'],
    ['obterImportacao', ['m1'], 'get', '/importacoes/m1'],
    ['resumoDashboard', [], 'get', '/dashboard/resumo'],
    ['conversao', [], 'get', '/dashboard/conversao'],
  ])('%s → %s %s', async (funcao, argumentos, metodo, rota) => {
    const resposta = await api[funcao](...argumentos);
    expect(resposta.metodo).toBe(metodo);
    expect(resposta.args[0]).toBe(rota);
  });

  it('filtros da listagem vão como parâmetros da consulta', async () => {
    const resposta = await api.listarLeads({ faixa: 'media', pagina: 2 });
    expect(resposta.args[1]).toEqual({ params: { faixa: 'media', pagina: 2 } });
  });

  it('ids com caracteres especiais são codificados', async () => {
    expect((await api.obterLead('a/b')).args[0]).toBe('/leads/a%2Fb');
  });

  it('importação envia o arquivo e o mapeamento em multipart', async () => {
    const arquivo = new Blob(['CNPJ;Nome']);
    const resposta = await api.importar(arquivo, { cnpj: 'CNPJ' });
    const formulario = resposta.args[1];
    expect(formulario).toBeInstanceOf(FormData);
    expect(formulario.get('mapeamento')).toBe('{"cnpj":"CNPJ"}');
    expect(formulario.get('arquivo')).toBeInstanceOf(Blob);
  });
});

describe('converterErro', () => {
  it('usa a mensagem { erro } da API e o status', () => {
    const erro = converterErro({ response: { status: 409, data: { erro: 'Já existe' } } });
    expect(erro).toBeInstanceOf(ErroApi);
    expect(erro).toMatchObject({ status: 409, message: 'Já existe' });
  });

  it('sem resposta é falta de conexão (status 0)', () => {
    expect(converterErro(new Error('Network Error'))).toMatchObject({ status: 0, message: expect.stringContaining('conexão') });
  });

  it('tempo esgotado explica que o servidor pode estar acordando', () => {
    const erro = converterErro(Object.assign(new Error('timeout of 90000ms exceeded'), { code: 'ECONNABORTED' }));
    expect(erro).toMatchObject({ status: 0, message: expect.stringContaining('acordar') });
  });
});
