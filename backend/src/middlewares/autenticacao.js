import { isAuthRetryableFetchError } from '@supabase/supabase-js';
import { supabase } from '../config/supabase.js';
import { buscarPerfil } from '../services/contaService.js';
import { ErroHttp, acessoNegado, naoAutenticado } from '../utils/erros.js';
import { limitarUso } from './limites.js';

/**
 * Valida o token "Authorization: Bearer <access_token>" do Supabase Auth.
 * Com chaves de assinatura assimétricas, getClaims valida localmente (sem ir ao
 * servidor a cada requisição). Coloca req.usuario = { id, email }.
 */
export async function autenticar(req, res, next) {
  const [tipo, token, ...resto] = (req.get('authorization') ?? '').trim().split(/\s+/);
  if (tipo?.toLowerCase() !== 'bearer' || !token || resto.length > 0) {
    throw naoAutenticado('Token de acesso ausente');
  }

  let resultado;
  try {
    resultado = await supabase.auth.getClaims(token);
  } catch (erro) {
    if (isAuthRetryableFetchError(erro)) throw servicoAuthIndisponivel();
    throw naoAutenticado('Token inválido ou expirado');
  }

  const { data, error } = resultado;
  if (error && isAuthRetryableFetchError(error)) throw servicoAuthIndisponivel();

  const claims = data?.claims;
  // Só usuários logados de verdade: recusa o token da chave pública (role anon)
  // e sessões anônimas.
  if (error || !claims?.sub || claims.role !== 'authenticated' || claims.is_anonymous === true) {
    throw naoAutenticado('Token inválido ou expirado');
  }

  req.usuario = { id: claims.sub, email: claims.email?.toLowerCase() ?? null };
  next();
}

/**
 * Carrega o perfil do usuário e define req.organizacaoId. É daqui, e só daqui,
 * que sai a organização usada em todas as consultas.
 */
export async function exigirPerfil(req, res, next) {
  const perfil = await buscarPerfil(req.usuario.id);
  if (!perfil) throw acessoNegado('Onboarding pendente');
  req.perfil = perfil;
  req.organizacaoId = perfil.organizacao_id;
  next();
}

export function exigirAdmin(req, res, next) {
  if (req.perfil?.papel !== 'admin') throw acessoNegado('Acesso restrito a administradores');
  next();
}

// Combinações usadas nas rotas (legenda da especificação, seção 10). O limite
// de uso vem logo depois do token, porque conta por usuário.
export const comToken = [autenticar, limitarUso];
export const comPerfil = [autenticar, limitarUso, exigirPerfil];
export const somenteAdmin = [autenticar, limitarUso, exigirPerfil, exigirAdmin];

function servicoAuthIndisponivel() {
  return new ErroHttp(503, 'Serviço de autenticação indisponível');
}
