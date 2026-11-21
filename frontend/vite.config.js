import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    // Os testes cobrem funções puras (formatos, tema, serviço de API).
    environment: 'node',
  },
});
