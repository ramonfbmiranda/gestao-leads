// Verificação de ponta a ponta da API contra o projeto Supabase do .env.
//
// Uso: npm run verificar
//
// Cria um usuário temporário (já confirmado, sem envio de e-mail), faz login,
// percorre as rotas e apaga tudo no final, inclusive se algum passo falhar.
// Mostra só status e resultados; nenhuma chave ou token é exibido.

import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { criarApp } from '../src/app.js';
import { ambiente } from '../src/config/ambiente.js';
import { supabase } from '../src/config/supabase.js';
import { processarProximo } from '../src/services/filaEnriquecimento.js';

const OPCOES_CLIENTE = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const CNPJ_ALFANUMERICO = '12ABC34501DE35';
const CNPJ_NUMERICO = '11222333000181';

let falhas = 0;
let token;
let baseUrl;

function conferir(descricao, condicao, detalhe = '') {
  if (condicao) {
    console.log(`  ok    ${descricao}`);
  } else {
    falhas += 1;
    console.log(`  FALHOU ${descricao}${detalhe ? ` (${detalhe})` : ''}`);
  }
}

async function chamar(metodo, rota, corpo) {
  const resposta = await fetch(`${baseUrl}${rota}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const texto = await resposta.text();
  return { status: resposta.status, corpo: texto ? JSON.parse(texto) : null };
}

async function enviarArquivo(rota, conteudo, nomeArquivo, campos = {}) {
  const formulario = new FormData();
  formulario.append('arquivo', new Blob([conteudo]), nomeArquivo);
  for (const [nome, valor] of Object.entries(campos)) formulario.append(nome, valor);
  const resposta = await fetch(`${baseUrl}${rota}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formulario,
  });
  return { status: resposta.status, corpo: await resposta.json() };
}

async function esperarStatus(descricao, metodo, rota, corpo, esperado) {
  const resposta = await chamar(metodo, rota, corpo);
  conferir(`${descricao} → ${esperado}`, resposta.status === esperado, `veio ${resposta.status} ${JSON.stringify(resposta.corpo)}`);
  return resposta;
}

async function executar() {
  console.log('\nConta e organização');
  let r = await esperarStatus('GET /me sem perfil', 'GET', '/me', undefined, 200);
  conferir('perfil nulo antes do onboarding', r.corpo?.perfil === null);

  r = await esperarStatus('POST /onboarding', 'POST', '/onboarding', { nome_organizacao: 'Verificação API', nome: 'Teste' }, 201);
  const organizacaoId = r.corpo?.organizacao?.id;
  conferir('perfil criado como admin', r.corpo?.perfil?.papel === 'admin');

  r = await esperarStatus('PUT /organizacao', 'PUT', '/organizacao', {
    escala_icp_max: 10,
    config_score: { esforco: { ufs_atendidas: ['sp'] } },
  }, 200);
  conferir('escala e config_score gravados', r.corpo?.escala_icp_max === 10 && r.corpo?.config_score?.esforco?.ufs_atendidas?.[0] === 'SP');
  await esperarStatus('PUT /organizacao com config inválida', 'PUT', '/organizacao', { config_score: { faixas: { alta: 1 } } }, 400);

  console.log('\nResponsáveis');
  r = await esperarStatus('POST /responsaveis', 'POST', '/responsaveis', { nome: ' Ana   Souza ' }, 201);
  const responsavelId = r.corpo?.id;
  conferir('nome normalizado', r.corpo?.nome === 'Ana Souza');
  await esperarStatus('POST /responsaveis com outra caixa', 'POST', '/responsaveis', { nome: 'ana souza' }, 409);
  r = await esperarStatus('GET /responsaveis', 'GET', '/responsaveis', undefined, 200);
  conferir('lista com 1 responsável', r.corpo?.length === 1);

  console.log('\nLeads');
  r = await esperarStatus('POST /leads (CNPJ alfanumérico com máscara)', 'POST', '/leads', {
    cnpj: '12.abc.345/01de-35',
    nome_lead: 'Padaria São João',
    calculadora_icp: 8,
    nota_final: 70,
    redes_sociais: 'instagram.com/padaria, www.padaria.com.br/ @padaria',
    responsavel_id: responsavelId,
  }, 201);
  const leadId = r.corpo?.id;
  conferir('CNPJ gravado sem máscara', r.corpo?.cnpj === CNPJ_ALFANUMERICO);
  conferir('responsável incluído no lead', r.corpo?.responsavel?.nome === 'Ana Souza');
  conferir('2 links separados em lead_redes_sociais', r.corpo?.lead_redes_sociais?.length === 2,
    JSON.stringify(r.corpo?.lead_redes_sociais));
  // Sem enriquecimento: valor N/A. Probabilidade = ICP 8/10 = 80. Esforço = sem número (35)
  // + sem nome do decisor (25) = 60. Compensação = 80 ÷ 1,6 = 50, parcial.
  conferir('score calculado no cadastro (valor N/A, compensação 50, parcial)',
    r.corpo?.score_valor === null && r.corpo?.score_probabilidade === 80 && r.corpo?.score_esforco === 60
      && r.corpo?.score_compensacao === 50 && r.corpo?.score_parcial === true,
    JSON.stringify({ v: r.corpo?.score_valor, p: r.corpo?.score_probabilidade, e: r.corpo?.score_esforco, c: r.corpo?.score_compensacao }));

  await esperarStatus('POST /leads (CNPJ numérico)', 'POST', '/leads', { cnpj: CNPJ_NUMERICO, nome_lead: 'Mercado Dois' }, 201);
  await esperarStatus('POST /leads com CNPJ repetido', 'POST', '/leads', { cnpj: CNPJ_NUMERICO, nome_lead: 'Outro' }, 409);
  await esperarStatus('POST /leads com DV errado', 'POST', '/leads', { cnpj: '12ABC34501DE36', nome_lead: 'X' }, 400);
  await esperarStatus('POST /leads com ICP acima da escala (10)', 'POST', '/leads', { cnpj: '00000000000191', nome_lead: 'X', calculadora_icp: 15 }, 400);
  await esperarStatus('POST /leads com responsável inexistente', 'POST', '/leads', { cnpj: '00000000000191', nome_lead: 'X', responsavel_id: randomUUID() }, 400);

  r = await esperarStatus('GET /leads', 'GET', '/leads', undefined, 200);
  conferir('total 2 com responsável e links na listagem', r.corpo?.total === 2 && Array.isArray(r.corpo?.leads?.[0]?.lead_redes_sociais));
  r = await esperarStatus('GET /leads?ordem=nota_final', 'GET', '/leads?ordem=nota_final', undefined, 200);
  conferir('nota nula (N/A) no fim', r.corpo?.leads?.[1]?.nota_final === null && r.corpo?.leads?.[0]?.nota_final === 70);
  r = await esperarStatus('GET /leads?busca=12.abc.345', 'GET', '/leads?busca=12.abc.345', undefined, 200);
  conferir('busca por CNPJ com máscara', r.corpo?.total === 1 && r.corpo?.leads?.[0]?.id === leadId);
  r = await esperarStatus('GET /leads?busca=são joão', 'GET', `/leads?busca=${encodeURIComponent('são joão')}`, undefined, 200);
  conferir('busca por nome com acento e espaço', r.corpo?.total === 1);
  r = await esperarStatus('GET /leads?busca com sintaxe de filtro', 'GET', `/leads?busca=${encodeURIComponent('a),id.eq.x')}`, undefined, 200);
  conferir('busca maliciosa não quebra nem vaza', r.corpo?.total === 0);
  r = await esperarStatus('GET /leads?pagina=50', 'GET', '/leads?pagina=50', undefined, 200);
  conferir('página além do fim vem vazia com total', r.corpo?.leads?.length === 0 && r.corpo?.total === 2);

  r = await esperarStatus('PUT /leads/:id', 'PUT', `/leads/${leadId}`, {
    status: 'em_contato',
    nome_decisor: 'Carlos',
    redes_sociais: 'linkedin.com/company/padaria',
  }, 200);
  conferir('status atualizado', r.corpo?.status === 'em_contato');
  conferir('link novo acrescentado (3 no total)', r.corpo?.lead_redes_sociais?.length === 3);
  // Com o nome do decisor, o esforço cai para 35: 80 ÷ 1,35 = 59,26.
  conferir('score recalculado na edição (59,26)', r.corpo?.score_compensacao === 59.26, String(r.corpo?.score_compensacao));
  r = await esperarStatus('POST /leads/:id/calcular-score', 'POST', `/leads/${leadId}/calcular-score`, undefined, 200);
  conferir('detalhes do score com pilares e motivos de N/A',
    r.corpo?.score_detalhes?.formula === 'pilar_unico' && r.corpo?.score_detalhes?.motivos_parcial?.length > 0);
  await esperarStatus('PUT /leads/:id tentando trocar o CNPJ', 'PUT', `/leads/${leadId}`, { cnpj: CNPJ_NUMERICO }, 400);
  await esperarStatus('GET /leads/:id inexistente', 'GET', `/leads/${randomUUID()}`, undefined, 404);
  await esperarStatus('DELETE /leads/:id', 'DELETE', `/leads/${leadId}`, undefined, 204);
  await esperarStatus('GET /leads/:id depois de excluir', 'GET', `/leads/${leadId}`, undefined, 404);

  await verificarImportacao();
  return organizacaoId;
}

// Neste ponto existe 1 lead (CNPJ numérico) e 1 responsável (Ana Souza).
const PLANILHA = [
  'CNPJ;Nome do Lead;Nota final;Quem mapeou?;Redes Sociais;Cidade',
  '11.222.333/0001-81;Mercado Dois Atualizado;B;Bruno Lima;mercado.com.br;Campinas',
  '01234567000195;Loja Nova;80%;ana souza;instagram.com/lojanova;Santos',
  '00123456000149;Duplicado A;5;;;',
  '00123456000149;Duplicado B;6;;;',
  '99999999999999;CNPJ ruim;;;;',
].join('\n');

async function verificarImportacao() {
  console.log('\nImportação');
  let r = await enviarArquivo('/importacoes/preview', PLANILHA, 'Leads São Paulo.csv');
  conferir('POST /importacoes/preview → 200', r.status === 200, `veio ${r.status} ${JSON.stringify(r.corpo)}`);
  conferir('nome do arquivo com acento preservado', r.corpo?.nome_arquivo === 'Leads São Paulo.csv');
  conferir('5 linhas e sugestão de De-Para', r.corpo?.total_linhas === 5 && r.corpo?.mapeamento_sugerido?.responsavel_id === 'Quem mapeou?');

  const mapeamento = JSON.stringify(r.corpo?.mapeamento_sugerido ?? {});
  r = await enviarArquivo('/importacoes', PLANILHA, 'Leads São Paulo.csv', { mapeamento });
  conferir('POST /importacoes → 201', r.status === 201, `veio ${r.status} ${JSON.stringify(r.corpo)}`);
  const primeira = r.corpo;
  conferir('2 inseridos, 1 atualizado, 2 ignorados, concluída',
    primeira?.inseridos === 2 && primeira?.atualizados === 1 && primeira?.ignorados === 2 && primeira?.status === 'concluida',
    JSON.stringify(primeira));
  conferir('erros por linha (duplicado e CNPJ inválido)',
    primeira?.erros?.length === 2 && primeira.erros[0].motivo.includes('prevalece a linha 5'),
    JSON.stringify(primeira?.erros));

  r = await enviarArquivo('/importacoes', PLANILHA, 'Leads São Paulo.csv', { mapeamento });
  conferir('reimportar o mesmo arquivo: 0 inseridos, 3 atualizados',
    r.corpo?.inseridos === 0 && r.corpo?.atualizados === 3, JSON.stringify(r.corpo));

  r = await esperarStatus('GET /leads depois da importação', 'GET', '/leads?ordem=created_at&direcao=asc', undefined, 200);
  conferir('3 leads na organização (sem duplicar)', r.corpo?.total === 3);
  const mercado = r.corpo?.leads?.find((lead) => lead.cnpj === CNPJ_NUMERICO);
  conferir('lead existente atualizado com nota "B" convertida (75)', mercado?.nome_lead === 'Mercado Dois Atualizado' && mercado?.nota_final === 75);
  conferir('responsável novo criado pelo nome', mercado?.responsavel?.nome === 'Bruno Lima');

  r = await esperarStatus('GET /leads?busca=Loja Nova', 'GET', `/leads?busca=${encodeURIComponent('Loja Nova')}`, undefined, 200);
  const loja = r.corpo?.leads?.[0];
  conferir('"ana souza" ligada à responsável existente', loja?.responsavel?.nome === 'Ana Souza');
  conferir('80% convertido e link separado', loja?.nota_final === 80 && loja?.lead_redes_sociais?.length === 1);

  r = await esperarStatus('GET /responsaveis', 'GET', '/responsaveis', undefined, 200);
  conferir('2 responsáveis (sem duplicar "ana souza")', r.corpo?.length === 2);

  r = await esperarStatus('GET /leads/:id (dados extras)', 'GET', `/leads/${mercado?.id}`, undefined, 200);
  conferir('coluna não mapeada em dados_extras e original da nota guardado',
    r.corpo?.dados_extras?.Cidade === 'Campinas' && r.corpo?.dados_extras?.originais?.nota_final === 'B',
    JSON.stringify(r.corpo?.dados_extras));
  // Sem ICP, mídias nem enriquecimento: compensação N/A; o esforço (60) é sempre calculável.
  conferir('score recalculado depois da importação (N/A, esforço 60)',
    r.corpo?.score_calculado_em !== null && r.corpo?.score_compensacao === null && r.corpo?.score_esforco === 60,
    JSON.stringify({ c: r.corpo?.score_compensacao, e: r.corpo?.score_esforco, em: r.corpo?.score_calculado_em }));

  r = await esperarStatus('POST /leads/recalcular-score', 'POST', '/leads/recalcular-score', undefined, 200);
  conferir('3 leads recalculados', r.corpo?.recalculados === 3, JSON.stringify(r.corpo));

  r = await esperarStatus('GET /importacoes', 'GET', '/importacoes', undefined, 200);
  conferir('histórico com 2 importações', r.corpo?.length === 2);
  r = await esperarStatus('GET /importacoes/:id', 'GET', `/importacoes/${primeira?.id}`, undefined, 200);
  conferir('detalhe com mapeamento e erros', r.corpo?.mapeamento?.cnpj === 'CNPJ' && r.corpo?.erros?.length === 2);

  await verificarEnriquecimento(loja?.id);
}

// Consulta a BrasilAPI de verdade, com CNPJs públicos. Neste ponto existem os
// 3 leads da importação, nunca enriquecidos.
const CNPJ_BANCO_DO_BRASIL = '00000000000191';
const CNPJ_INEXISTENTE = '99999999000191';

async function verificarEnriquecimento(lojaId) {
  console.log('\nEnriquecimento (BrasilAPI real)');
  let r = await esperarStatus('POST /leads (Banco do Brasil)', 'POST', '/leads', { cnpj: CNPJ_BANCO_DO_BRASIL, nome_lead: 'Banco', calculadora_icp: 8 }, 201);
  const bancoId = r.corpo?.id;
  conferir('lead novo sem enriquecimento solicitado', r.corpo?.enriquecimento_status === null);

  r = await esperarStatus('POST /leads/:id/enriquecer', 'POST', `/leads/${bancoId}/enriquecer`, undefined, 200);
  conferir('dados da Receita gravados',
    r.corpo?.enriquecimento_status === 'concluido' && r.corpo?.razao_social === 'BANCO DO BRASIL SA'
      && r.corpo?.uf === 'DF' && r.corpo?.cnae_principal === '6422100' && r.corpo?.porte === 'DEMAIS'
      && r.corpo?.data_abertura === '1966-08-01' && r.corpo?.situacao_cadastral === 'ATIVA' && r.corpo?.enriquecido_em !== null,
    JSON.stringify({ s: r.corpo?.enriquecimento_status, e: r.corpo?.enriquecimento_erro, rs: r.corpo?.razao_social, uf: r.corpo?.uf }));
  // Valor 100 (porte DEMAIS, capital de 120 bi, 60 anos). Probabilidade 80 (ICP 8/10 da planilha).
  // O esforço depende do que a Receita traz: telefone da empresa reduz o contato (35 → 28) e um
  // diretor entre os sócios reduz o "sem nome" (25 → 12,5). Sem redes (20) e DF fora de SP (20).
  const esperado = Math.round((Math.sqrt(100 * 80) / (1 + (r.corpo?.score_esforco ?? 0) / 100)) * 100) / 100;
  conferir(`score recalculado com o pilar de valor (média geométrica, ${esperado})`,
    r.corpo?.score_valor === 100 && r.corpo?.score_probabilidade === 80 && r.corpo?.score_compensacao === esperado
      && r.corpo?.score_detalhes?.formula === 'media_geometrica' && r.corpo?.score_detalhes?.versao === 2,
    JSON.stringify({ v: r.corpo?.score_valor, p: r.corpo?.score_probabilidade, e: r.corpo?.score_esforco, c: r.corpo?.score_compensacao }));
  conferir('sócios da Receita só com nome e qualificação',
    Array.isArray(r.corpo?.socios) && r.corpo.socios.length > 0
      && r.corpo.socios.every((socio) => Object.keys(socio).sort().join() === 'nome,qualificacao'),
    JSON.stringify(r.corpo?.socios?.slice(0, 2)));
  const semNome = r.corpo?.score_detalhes?.esforco?.penalidades?.find((p) => p.penalidade === 'sem_nome_decisor');
  conferir('decisor provável pela Receita reduz a penalidade de nome', semNome?.pontos === 12.5 && semNome?.detalhe?.includes('Decisor provável'),
    JSON.stringify(semNome));

  r = await esperarStatus('POST /leads (CNPJ válido inexistente)', 'POST', '/leads', { cnpj: CNPJ_INEXISTENTE, nome_lead: 'Fantasma' }, 201);
  r = await esperarStatus('POST /leads/:id/enriquecer (inexistente)', 'POST', `/leads/${r.corpo?.id}/enriquecer`, undefined, 200);
  conferir('CNPJ inexistente fica "nao_encontrado"', r.corpo?.enriquecimento_status === 'nao_encontrado', r.corpo?.enriquecimento_status);

  r = await esperarStatus('POST /leads (CNPJ alfanumérico)', 'POST', '/leads', { cnpj: CNPJ_ALFANUMERICO, nome_lead: 'Alfa' }, 201);
  r = await esperarStatus('POST /leads/:id/enriquecer (alfanumérico)', 'POST', `/leads/${r.corpo?.id}/enriquecer`, undefined, 200);
  // A BrasilAPI aceita o formato novo: um CNPJ alfanumérico que não existe volta 404, não 400.
  conferir('CNPJ alfanumérico aceito pela BrasilAPI (não encontrado, não "nao_suportado")',
    ['nao_encontrado', 'concluido'].includes(r.corpo?.enriquecimento_status), r.corpo?.enriquecimento_status);

  await esperarStatus('POST /leads/:id/enriquecer de lead inexistente', 'POST', `/leads/${randomUUID()}/enriquecer`, undefined, 404);

  r = await esperarStatus('GET /leads/enriquecimento/status', 'GET', '/leads/enriquecimento/status', undefined, 200);
  conferir('contagem: 3 não solicitados, 1 concluído, 2 não encontrados, 6 no total',
    r.corpo?.nao_solicitado === 3 && r.corpo?.concluido === 1 && r.corpo?.nao_encontrado === 2 && r.corpo?.total === 6,
    JSON.stringify(r.corpo));

  await esperarStatus('POST /leads/enriquecer-lote com id inválido', 'POST', '/leads/enriquecer-lote', { ids: ['abc'] }, 400);
  r = await esperarStatus('POST /leads/enriquecer-lote', 'POST', '/leads/enriquecer-lote', undefined, 202);
  conferir('3 leads da importação enfileirados', r.corpo?.enfileirados === 3, JSON.stringify(r.corpo));
  r = await esperarStatus('POST /leads/enriquecer-lote de novo', 'POST', '/leads/enriquecer-lote', undefined, 202);
  conferir('nada entra duas vezes na fila', r.corpo?.enfileirados === 0, JSON.stringify(r.corpo));

  // Processa a fila aqui mesmo (o servidor de teste não liga o processador).
  const status = await processarFilaDaOrganizacao();
  conferir('fila processada: nenhum pendente e 4 concluídos',
    status?.pendente === 0 && status?.processando === 0 && status?.concluido === 4, JSON.stringify(status));

  r = await esperarStatus('GET /leads/:id (empresa baixada)', 'GET', `/leads/${lojaId}`, undefined, 200);
  // 01234567000195 está BAIXADA na Receita: a compensação fica limitada a 10.
  conferir('situação baixada limita a compensação a 10',
    r.corpo?.situacao_cadastral === 'BAIXADA' && r.corpo?.score_compensacao === 10
      && r.corpo?.score_detalhes?.limite_situacao?.situacao === 'BAIXADA',
    JSON.stringify({ s: r.corpo?.situacao_cadastral, c: r.corpo?.score_compensacao }));
  // Capital zero na Receita é "não informado": N/A, não 10 pontos.
  const capital = r.corpo?.score_detalhes?.valor?.fatores?.find((fator) => fator.fator === 'capital_social');
  conferir('capital zero tratado como N/A', capital?.situacao === 'na', JSON.stringify(capital));

  await verificarAvaliacao(bancoId);
  await verificarInteracoesEDesfecho(bancoId);

  r = await esperarStatus('POST /leads/enriquecer-lote com ids (reenriquecer)', 'POST', '/leads/enriquecer-lote', { ids: [bancoId] }, 202);
  conferir('lead já enriquecido entra de novo quando pedido pelo id', r.corpo?.enfileirados === 1, JSON.stringify(r.corpo));
}

// Avaliação do lead no sistema (revisão 7), usando o lead do Banco do Brasil já enriquecido.
const RESPOSTAS = {
  orcamento: 'confirmado', decisor: 'sim', necessidade: 'alguma', prazo: 'ate_3_meses',
  perfil_ativo: 'sim', frequencia: 'nao', site: 'sim', anuncios: 'nao', origem_contato: 'indicacao',
};

async function verificarAvaliacao(bancoId) {
  console.log('\nAvaliação do lead');
  let r = await esperarStatus('GET /avaliacao/modelo', 'GET', '/avaliacao/modelo', undefined, 200);
  conferir('modelo padrão com 9 perguntas em 3 blocos',
    r.corpo?.perguntas?.length === 9 && new Set(r.corpo.perguntas.map((p) => p.bloco)).size === 3);

  await esperarStatus('PUT /leads/:id/avaliacao com opção inválida', 'PUT', `/leads/${bancoId}/avaliacao`, { respostas: { orcamento: 'talvez' } }, 400);
  await esperarStatus('PUT /leads/:id/avaliacao de lead inexistente', 'PUT', `/leads/${randomUUID()}/avaliacao`, { respostas: {} }, 404);

  r = await esperarStatus('PUT /leads/:id/avaliacao', 'PUT', `/leads/${bancoId}/avaliacao`, { respostas: RESPOSTAS, ticket_estimado: 10000 }, 200);
  const fatores = r.corpo?.score_detalhes?.probabilidade?.fatores ?? [];
  const qualificacao = fatores.find((f) => f.fator === 'qualificacao');
  const midias = fatores.find((f) => f.fator === 'midias_sociais');
  // qualificação 83,5; mídias 55; ICP 80 (planilha) → probabilidade = 80×0,35 + 83,5×0,40 + 55×0,25 = 75,15
  conferir('respostas viram qualificação (83,5) e mídias (55) com origem "avaliacao"',
    qualificacao?.pontos === 83.5 && qualificacao?.origem === 'avaliacao' && midias?.pontos === 55 && midias?.origem === 'avaliacao',
    JSON.stringify({ qualificacao, midias }));
  conferir('probabilidade recalculada (75,15)', r.corpo?.score_probabilidade === 75.15, String(r.corpo?.score_probabilidade));
  conferir('avaliação gravada com data e ticket', r.corpo?.avaliado_em !== null && Number(r.corpo?.ticket_estimado) === 10000);
  const relacionamento = r.corpo?.score_detalhes?.esforco?.penalidades?.find((p) => p.penalidade === 'relacionamento:origem_contato');
  conferir('indicação soma 5 ao esforço', relacionamento?.pontos === 5, JSON.stringify(relacionamento));
  conferir('estimativa em reais pelo ticket do lead e índice de probabilidade',
    r.corpo?.score_detalhes?.financeiro?.origem_ticket === 'lead' && r.corpo?.score_detalhes?.financeiro?.valor_esperado === 7515,
    JSON.stringify(r.corpo?.score_detalhes?.financeiro));
  conferir('confiança gravada', typeof r.corpo?.score_confianca === 'number' && r.corpo.score_confianca > 0, String(r.corpo?.score_confianca));

  // Perfil ideal com o CNAE do banco: o ICP passa a ser calculado pelo sistema (100).
  await esperarStatus('PUT /organizacao com perfil ideal', 'PUT', '/organizacao', {
    config_score: { esforco: { ufs_atendidas: ['SP'] }, perfil_ideal: { setores: ['6422-1/00'] } },
  }, 200);
  r = await esperarStatus('POST /leads/:id/calcular-score com perfil ideal', 'POST', `/leads/${bancoId}/calcular-score`, undefined, 200);
  const icp = r.corpo?.score_detalhes?.probabilidade?.fatores?.find((f) => f.fator === 'icp');
  conferir('ICP pelo perfil ideal prevalece sobre a planilha (100, origem "sistema")', icp?.pontos === 100 && icp?.origem === 'sistema', JSON.stringify(icp));
  await esperarStatus('PUT /organizacao com chave antiga recusada', 'PUT', '/organizacao', { config_score: { valor: { cnaes_prioritarios: [] } } }, 400);
}

// Interações, prioridade, desfecho e aprendizado (revisão 7), ainda com o lead do Banco do Brasil.
async function verificarInteracoesEDesfecho(bancoId) {
  console.log('\nInterações, prioridade e desfecho');
  let r = await esperarStatus('GET /leads/prioridade', 'GET', '/leads/prioridade', undefined, 200);
  const naFila = r.corpo?.abordar?.find((item) => item.id === bancoId);
  conferir('lead novo sem interação está em "abordar"', naFila?.motivo === 'nenhuma interação registrada', JSON.stringify(naFila));

  await esperarStatus('POST /leads/:id/interacoes com tipo inválido', 'POST', `/leads/${bancoId}/interacoes`, { tipo: 'telegrama', teve_resposta: false }, 400);
  await esperarStatus('POST /leads/:id/interacoes no futuro', 'POST', `/leads/${bancoId}/interacoes`,
    { tipo: 'ligacao', teve_resposta: false, ocorreu_em: new Date(Date.now() + 86_400_000).toISOString() }, 400);
  let ultima;
  for (let i = 1; i <= 3; i += 1) {
    r = await esperarStatus(`POST /leads/:id/interacoes (tentativa ${i} sem resposta)`, 'POST', `/leads/${bancoId}/interacoes`, { tipo: 'ligacao', teve_resposta: false }, 201);
    ultima = r.corpo?.id;
  }
  r = await esperarStatus('GET /leads/:id depois das tentativas', 'GET', `/leads/${bancoId}`, undefined, 200);
  const tentativas = r.corpo?.score_detalhes?.esforco?.penalidades?.find((p) => p.penalidade === 'tentativas_sem_resposta');
  // 3 tentativas, 2 toleradas: +5 no esforço.
  conferir('3 tentativas sem resposta resumidas no lead e +5 no esforço',
    r.corpo?.tentativas_sem_resposta === 3 && r.corpo?.ultima_interacao_em !== null && tentativas?.pontos === 5,
    JSON.stringify({ t: r.corpo?.tentativas_sem_resposta, p: tentativas }));
  r = await esperarStatus('GET /leads/:id/interacoes', 'GET', `/leads/${bancoId}/interacoes`, undefined, 200);
  conferir('3 interações listadas', r.corpo?.length === 3);

  await esperarStatus('POST /leads/:id/interacoes (respondeu)', 'POST', `/leads/${bancoId}/interacoes`, { tipo: 'whatsapp', teve_resposta: true, observacao: 'Pediu proposta' }, 201);
  r = await esperarStatus('GET /leads/:id depois da resposta', 'GET', `/leads/${bancoId}`, undefined, 200);
  conferir('resposta zera as tentativas', r.corpo?.tentativas_sem_resposta === 0, String(r.corpo?.tentativas_sem_resposta));
  await esperarStatus('DELETE /leads/:id/interacoes/:id', 'DELETE', `/leads/${bancoId}/interacoes/${ultima}`, undefined, 204);
  await esperarStatus('DELETE de interação inexistente', 'DELETE', `/leads/${bancoId}/interacoes/${randomUUID()}`, undefined, 404);

  await esperarStatus('PUT /leads/:id descartado sem motivo', 'PUT', `/leads/${bancoId}`, { status: 'descartado' }, 400);
  await esperarStatus('PUT /leads/:id com motivo fora da lista', 'PUT', `/leads/${bancoId}`, { status: 'descartado', motivo_descarte: 'Inventado' }, 400);
  r = await esperarStatus('PUT /leads/:id descartado com motivo', 'PUT', `/leads/${bancoId}`, { status: 'descartado', motivo_descarte: 'Sem orçamento' }, 200);
  conferir('desfecho gravado com a cópia do score',
    r.corpo?.desfecho_em !== null && r.corpo?.motivo_descarte === 'Sem orçamento'
      && r.corpo?.desfecho_score?.score_compensacao === r.corpo?.score_compensacao && typeof r.corpo?.desfecho_score?.score_detalhes?.faixa === 'string',
    JSON.stringify({ em: r.corpo?.desfecho_em, m: r.corpo?.motivo_descarte }));

  r = await esperarStatus('GET /dashboard/conversao', 'GET', '/dashboard/conversao', undefined, 200);
  const descartados = Object.values(r.corpo?.faixas ?? {}).reduce((soma, faixa) => soma + (faixa?.descartados ?? 0), 0);
  conferir('1 descartado contado por faixa e por motivo',
    descartados === 1 && r.corpo?.motivos?.[0]?.motivo === 'Sem orçamento' && r.corpo.motivos[0].total === 1, JSON.stringify(r.corpo));
  r = await esperarStatus('GET /organizacao/sugestao-pesos', 'GET', '/organizacao/sugestao-pesos', undefined, 200);
  conferir('sugestão de pesos pede mais desfechos', r.corpo?.suficiente === false, JSON.stringify(r.corpo));

  r = await esperarStatus('PUT /leads/:id reaberto', 'PUT', `/leads/${bancoId}`, { status: 'em_contato' }, 200);
  conferir('reabrir limpa o desfecho e o motivo',
    r.corpo?.desfecho_em === null && r.corpo?.desfecho_score === null && r.corpo?.motivo_descarte === null);
  r = await esperarStatus('GET /leads/prioridade depois do contato', 'GET', '/leads/prioridade', undefined, 200);
  conferir('lead em contato saiu de "abordar"', !r.corpo?.abordar?.some((item) => item.id === bancoId));
}

// Chama o processador até a fila da organização esvaziar (no máximo 4 minutos,
// para cobrir uma nova tentativa se a BrasilAPI oscilar).
async function processarFilaDaOrganizacao() {
  const limite = Date.now() + 4 * 60_000;
  let status;
  while (Date.now() < limite) {
    status = (await chamar('GET', '/leads/enriquecimento/status')).corpo;
    if (status?.pendente === 0 && status?.processando === 0) return status;
    const resultado = await processarProximo();
    await new Promise((resolver) => setTimeout(resolver, resultado ? 500 : 5_000));
  }
  return status;
}

async function principal() {
  const servidor = criarApp().listen(0);
  await new Promise((resolver) => servidor.once('listening', resolver));
  baseUrl = `http://127.0.0.1:${servidor.address().port}`;

  const email = `verificacao.api.${Date.now()}@exemplo.com`;
  const senha = `${randomUUID()}Aa1!`;
  let usuarioId;
  let organizacaoId;

  try {
    const criado = await supabase.auth.admin.createUser({ email, password: senha, email_confirm: true });
    if (criado.error) throw criado.error;
    usuarioId = criado.data.user.id;

    const cliente = createClient(ambiente.supabaseUrl, ambiente.supabaseSecretKey, OPCOES_CLIENTE);
    const login = await cliente.auth.signInWithPassword({ email, password: senha });
    if (login.error) throw login.error;
    token = login.data.session.access_token;

    organizacaoId = await executar();
  } catch (erro) {
    falhas += 1;
    console.error('\nErro inesperado:', erro.message ?? erro);
  } finally {
    // Limpeza: a organização leva leads, responsáveis e perfis junto (cascade).
    if (organizacaoId) await supabase.from('organizacoes').delete().eq('id', organizacaoId);
    else if (usuarioId) {
      const { data } = await supabase.from('perfis').select('organizacao_id').eq('id', usuarioId).maybeSingle();
      if (data) await supabase.from('organizacoes').delete().eq('id', data.organizacao_id);
    }
    if (usuarioId) await supabase.auth.admin.deleteUser(usuarioId);
    servidor.close();
  }

  console.log(falhas === 0 ? '\nTudo certo: a API funciona com o banco real.' : `\n${falhas} verificação(ões) falharam.`);
  process.exit(falhas === 0 ? 0 : 1);
}

principal();
