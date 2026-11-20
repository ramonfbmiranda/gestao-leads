import { supabase } from '../config/supabase.js';
import { acessoNegado, resultadoOuErro, traduzirErroBanco } from '../utils/erros.js';
import { buscarOrganizacao } from './organizacaoService.js';

const COLUNAS_PERFIL = 'id, organizacao_id, nome, papel, created_at';

const MENSAGEM_JA_TEM_ORGANIZACAO = 'Usuário já pertence a uma organização';

export async function buscarPerfil(usuarioId) {
  return resultadoOuErro(
    await supabase.from('perfis').select(COLUNAS_PERFIL).eq('id', usuarioId).maybeSingle(),
  );
}

async function listarConvitesPendentesDoEmail(email) {
  if (!email) return [];
  const convites = resultadoOuErro(
    await supabase
      .from('convites')
      .select('id, papel, created_at, organizacoes (nome)')
      .eq('email', email)
      .eq('status', 'pendente')
      .order('created_at', { ascending: false }),
  );
  return convites.map(({ organizacoes, ...convite }) => ({
    ...convite,
    nome_organizacao: organizacoes?.nome ?? null,
  }));
}

/**
 * Dados da rota GET /me. Sem perfil, devolve os convites pendentes para o
 * e-mail do usuário, para o frontend decidir entre aceitar convite e onboarding.
 */
export async function obterDadosConta(usuario) {
  const perfil = await buscarPerfil(usuario.id);
  if (!perfil) {
    return {
      usuario,
      perfil: null,
      organizacao: null,
      convites_pendentes: await listarConvitesPendentesDoEmail(usuario.email),
    };
  }
  return {
    usuario,
    perfil,
    organizacao: await buscarOrganizacao(perfil.organizacao_id),
    convites_pendentes: [],
  };
}

/**
 * Busca o usuário direto no Supabase Auth (fonte confiável do e-mail) e exige
 * e-mail confirmado. Usado nas operações que ligam o usuário a uma organização.
 */
export async function exigirEmailConfirmado(usuarioId) {
  const { data, error } = await supabase.auth.admin.getUserById(usuarioId);
  if (error) throw traduzirErroBanco(error);
  if (!data.user?.email_confirmed_at) {
    throw acessoNegado('Confirme seu e-mail antes de continuar');
  }
  return data.user;
}

export async function criarOrganizacao(usuario, { nome_organizacao, nome }) {
  await exigirEmailConfirmado(usuario.id);
  resultadoOuErro(
    await supabase.rpc('criar_organizacao_com_admin', {
      p_usuario_id: usuario.id,
      p_nome_organizacao: nome_organizacao,
      p_nome: nome,
    }),
    { 23505: MENSAGEM_JA_TEM_ORGANIZACAO },
  );
  return obterDadosConta(usuario);
}

export async function aceitarConvite(usuario, conviteId, { nome }) {
  const usuarioAuth = await exigirEmailConfirmado(usuario.id);
  resultadoOuErro(
    await supabase.rpc('aceitar_convite', {
      p_convite_id: conviteId,
      p_usuario_id: usuario.id,
      p_email: usuarioAuth.email,
      p_nome: nome,
    }),
    { P0002: 'Convite não encontrado', 23505: MENSAGEM_JA_TEM_ORGANIZACAO },
  );
  return obterDadosConta(usuario);
}
