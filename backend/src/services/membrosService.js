import { ambiente } from '../config/ambiente.js';
import { supabase } from '../config/supabase.js';
import { ErroHttp, conflito, naoEncontrado, resultadoOuErro } from '../utils/erros.js';

const COLUNAS_CONVITE = 'id, email, papel, status, convidado_por, created_at';

// Códigos do Supabase Auth para "já existe usuário com este e-mail".
const CODIGOS_USUARIO_EXISTENTE = ['email_exists', 'user_already_exists'];

export async function listarMembros(organizacaoId) {
  return resultadoOuErro(
    await supabase.rpc('listar_membros', { p_organizacao_id: organizacaoId }),
  );
}

export async function listarConvitesPendentes(organizacaoId) {
  return resultadoOuErro(
    await supabase
      .from('convites')
      .select(COLUNAS_CONVITE)
      .eq('organizacao_id', organizacaoId)
      .eq('status', 'pendente')
      .order('created_at', { ascending: false }),
  );
}

export async function cancelarConvite(organizacaoId, conviteId) {
  const cancelados = resultadoOuErro(
    await supabase
      .from('convites')
      .update({ status: 'cancelado' })
      .eq('id', conviteId)
      .eq('organizacao_id', organizacaoId)
      .eq('status', 'pendente')
      .select('id'),
  );
  if (cancelados.length === 0) throw naoEncontrado('Convite não encontrado');
}

/**
 * Registra o convite e envia o e-mail do Supabase Auth.
 * Se a pessoa já tem conta, o e-mail não é enviado: o convite aparece para ela
 * no próximo login (GET /me). Se o envio falhar por outro motivo, o convite é
 * desfeito para o admin poder tentar de novo.
 */
export async function convidarMembro(organizacaoId, perfilAdmin, { email, papel }) {
  const membros = await listarMembros(organizacaoId);
  if (membros.some((membro) => membro.email?.toLowerCase() === email)) {
    throw conflito('Este e-mail já é membro da organização');
  }

  const convite = resultadoOuErro(
    await supabase
      .from('convites')
      .insert({ organizacao_id: organizacaoId, email, papel, convidado_por: perfilAdmin.id })
      .select(COLUNAS_CONVITE)
      .single(),
    { 23505: 'Já existe um convite pendente para este e-mail' },
  );

  const { error } = await supabase.auth.admin.inviteUserByEmail(email, {
    redirectTo: ambiente.frontendUrl,
  });

  if (!error) return { convite, email_enviado: true };
  if (CODIGOS_USUARIO_EXISTENTE.includes(error.code)) return { convite, email_enviado: false };

  await supabase.from('convites').delete().eq('id', convite.id);
  console.error('[convite] falha no envio do e-mail:', error.code ?? error.status, error.message);
  if (error.code === 'over_email_send_rate_limit') {
    throw new ErroHttp(429, 'Limite de envio de e-mails atingido. Tente novamente mais tarde');
  }
  throw new ErroHttp(502, 'Não foi possível enviar o convite por e-mail');
}
