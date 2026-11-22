// Limites de requisições (seção 5, item 9). Contam por usuário logado, não por
// IP: no Render as requisições chegam por proxies em número não garantido, e
// um IP errado faria todos os usuários dividirem o mesmo limite. Por isso os
// limites vão sempre depois de autenticar (req.usuario já existe).
// A contagem fica na memória do processo: basta para uma instância só.

import { rateLimit } from 'express-rate-limit';
import { ambiente } from '../config/ambiente.js';

export function criarLimite({ limite, janelaMs, mensagem, pular = () => ambiente.limitesDesligados }) {
  return rateLimit({
    windowMs: janelaMs,
    limit: limite,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req) => req.usuario.id,
    skip: (req) => pular(req) || !req.usuario,
    handler: (req, res) => res.status(429).json({ erro: mensagem }),
    // A chave é o usuário, não o IP: os avisos sobre proxy não se aplicam.
    validate: { xForwardedForHeader: false, forwardedHeader: false },
  });
}

// Uso normal: 300 requisições a cada 5 minutos (média de 1 por segundo),
// folgado para a tela de importação, que consulta o status a cada 4 segundos.
export const limitarUso = criarLimite({
  limite: 300,
  janelaMs: 5 * 60_000,
  mensagem: 'Muitas requisições em pouco tempo. Aguarde alguns minutos e tente de novo.',
});

// Operações pesadas (importar planilha, enfileirar a Receita, recalcular todos).
export const limitarPesado = criarLimite({
  limite: 30,
  janelaMs: 15 * 60_000,
  mensagem: 'Limite de operações pesadas atingido (importação, Receita ou recálculo). Tente de novo em alguns minutos.',
});

// Convites mandam e-mail; o Supabase também limita os envios.
export const limitarConvites = criarLimite({
  limite: 20,
  janelaMs: 60 * 60_000,
  mensagem: 'Limite de convites por hora atingido. Tente de novo mais tarde.',
});
