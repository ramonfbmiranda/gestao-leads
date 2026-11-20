// Erro com status HTTP. O tratador de erros transforma em { "erro": mensagem }.
export class ErroHttp extends Error {
  constructor(status, mensagem) {
    super(mensagem);
    this.name = 'ErroHttp';
    this.status = status;
  }
}

export const requisicaoInvalida = (mensagem) => new ErroHttp(400, mensagem);
export const naoAutenticado = (mensagem = 'Não autenticado') => new ErroHttp(401, mensagem);
export const acessoNegado = (mensagem = 'Acesso negado') => new ErroHttp(403, mensagem);
export const naoEncontrado = (mensagem = 'Recurso não encontrado') => new ErroHttp(404, mensagem);
export const conflito = (mensagem) => new ErroHttp(409, mensagem);

// Códigos do Postgres (via PostgREST) mais comuns e o status HTTP equivalente.
const STATUS_POR_CODIGO = {
  23505: 409, // unique_violation
  23503: 400, // foreign_key_violation
  23514: 400, // check_violation
  23502: 400, // not_null_violation
  '22P02': 400, // invalid_text_representation (ex.: uuid ou enum inválido)
  22001: 400, // string_data_right_truncation
  P0002: 404, // no_data_found (lançado pelas nossas funções)
};

/**
 * Converte o erro do supabase-js em ErroHttp.
 * `mensagens` permite trocar a mensagem por código: { 23505: 'Já existe...' }.
 * Erros sem mapeamento viram 500 com mensagem genérica (o detalhe vai para o log).
 */
export function traduzirErroBanco(erro, mensagens = {}) {
  const status = STATUS_POR_CODIGO[erro?.code];
  if (!status) {
    const interno = new Error(`Erro do banco: ${erro?.message ?? 'desconhecido'}`);
    interno.cause = erro;
    return interno;
  }
  const padrao = status === 409 ? 'Registro já existe' : status === 404 ? 'Recurso não encontrado' : 'Dados inválidos';
  return new ErroHttp(status, mensagens[erro.code] ?? padrao);
}

/**
 * Recebe o resultado { data, error } do supabase-js: devolve data ou lança o erro traduzido.
 */
export function resultadoOuErro({ data, error }, mensagens) {
  if (error) throw traduzirErroBanco(error, mensagens);
  return data;
}
