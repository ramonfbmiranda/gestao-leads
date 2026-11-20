import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.js'],
    // Valores fictícios: os testes nunca acessam um Supabase real.
    env: {
      SUPABASE_URL: 'http://localhost:54321',
      SUPABASE_SECRET_KEY: 'chave-de-teste',
      CORS_ORIGIN: 'http://localhost:5173',
      FRONTEND_URL: 'http://localhost:5173',
    },
  },
});
