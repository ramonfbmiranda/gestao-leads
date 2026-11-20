import { ErroHttp } from '../utils/erros.js';

export function rotaNaoEncontrada(req, res) {
  res.status(404).json({ erro: 'Rota não encontrada' });
}

// Último middleware: transforma qualquer erro em { "erro": "mensagem" }.
// Erros inesperados viram 500 genérico; o detalhe fica só no log do servidor.
// Os 4 parâmetros são obrigatórios: é assim que o Express reconhece o tratador de erros.
export function tratadorDeErros(erro, req, res, next) {
  if (res.headersSent) return next(erro);

  if (erro instanceof ErroHttp) {
    return res.status(erro.status).json({ erro: erro.message });
  }
  if (erro.type === 'entity.parse.failed') {
    return res.status(400).json({ erro: 'JSON inválido' });
  }
  if (erro.type === 'entity.too.large') {
    return res.status(413).json({ erro: 'Corpo da requisição muito grande' });
  }

  console.error(`[erro interno] ${req.method} ${req.originalUrl}`, erro);
  return res.status(500).json({ erro: 'Erro interno do servidor' });
}
