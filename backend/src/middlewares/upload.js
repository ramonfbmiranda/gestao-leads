import multer from 'multer';
import { ErroHttp, requisicaoInvalida } from '../utils/erros.js';

export const TAMANHO_MAXIMO_ARQUIVO = 5 * 1024 * 1024;

// Em memória: o arquivo é lido e descartado na mesma requisição, nada vai para o disco.
const receber = multer({
  storage: multer.memoryStorage(),
  // Navegadores enviam o nome do arquivo em UTF-8 ("Leads São Paulo.xlsx").
  defParamCharset: 'utf8',
  limits: { fileSize: TAMANHO_MAXIMO_ARQUIVO, files: 1, fields: 5, fieldSize: 100 * 1024, parts: 6 },
}).single('arquivo');

/** Recebe o campo multipart "arquivo" (até 5 MB) em req.file. */
export function receberPlanilha(req, res, next) {
  receber(req, res, (erro) => {
    if (erro instanceof multer.MulterError) {
      if (erro.code === 'LIMIT_FILE_SIZE') return next(new ErroHttp(413, 'Arquivo maior que 5 MB'));
      if (erro.code === 'LIMIT_UNEXPECTED_FILE') {
        return next(requisicaoInvalida('Envie um único arquivo no campo "arquivo"'));
      }
      return next(requisicaoInvalida('Envio do arquivo inválido'));
    }
    if (erro) return next(erro);
    if (!req.file) return next(requisicaoInvalida('Envie a planilha no campo "arquivo" (multipart/form-data)'));
    next();
  });
}
