// Lê e valida as variáveis de ambiente uma única vez, na inicialização.
// Se faltar alguma obrigatória, o servidor nem sobe (melhor do que falhar depois).

const OBRIGATORIAS = ['SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'CORS_ORIGIN', 'FRONTEND_URL'];

export function carregarAmbiente(env = process.env) {
  const faltando = OBRIGATORIAS.filter((nome) => !env[nome]?.trim());
  if (faltando.length > 0) {
    throw new Error(`Variáveis de ambiente ausentes: ${faltando.join(', ')}`);
  }

  const porta = Number(env.PORT ?? 3000);
  if (!Number.isInteger(porta) || porta <= 0 || porta > 65535) {
    throw new Error('PORT deve ser um número de porta válido');
  }

  return {
    supabaseUrl: env.SUPABASE_URL.trim(),
    supabaseSecretKey: env.SUPABASE_SECRET_KEY.trim(),
    porta,
    // Aceita uma ou mais origens separadas por vírgula.
    corsOrigin: env.CORS_ORIGIN.split(',').map((origem) => origem.trim()).filter(Boolean),
    frontendUrl: env.FRONTEND_URL.trim(),
  };
}

export const ambiente = carregarAmbiente();
