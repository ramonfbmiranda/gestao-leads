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
  await esperarStatus('PUT /leads/:id tentando trocar o CNPJ', 'PUT', `/leads/${leadId}`, { cnpj: CNPJ_NUMERICO }, 400);
  await esperarStatus('GET /leads/:id inexistente', 'GET', `/leads/${randomUUID()}`, undefined, 404);
  await esperarStatus('DELETE /leads/:id', 'DELETE', `/leads/${leadId}`, undefined, 204);
  await esperarStatus('GET /leads/:id depois de excluir', 'GET', `/leads/${leadId}`, undefined, 404);

  return organizacaoId;
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
