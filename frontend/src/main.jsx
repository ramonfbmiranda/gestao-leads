import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';
import { faltando } from './config/ambiente.js';
import './estilos.css';

const raiz = createRoot(document.getElementById('raiz'));

function ErroConfiguracao({ nomes }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-3 px-4">
      <h1 className="text-xl font-bold">Configuração incompleta</h1>
      <p className="text-texto-2">Crie o arquivo <code>frontend/.env</code> a partir do <code>.env.example</code> e preencha:</p>
      <ul className="list-disc pl-5 font-mono text-[13px]">{nomes.map((nome) => <li key={nome}>{nome}</li>)}</ul>
      <p className="text-texto-2">Depois, reinicie o <code>npm run dev</code>.</p>
    </main>
  );
}

if (faltando) {
  raiz.render(<ErroConfiguracao nomes={faltando} />);
} else {
  // Importados só com o ambiente completo: o cliente do Supabase precisa das variáveis.
  const [{ ProvedorTema }, { ProvedorAutenticacao }, { roteador }] = await Promise.all([
    import('./contextos/TemaContexto.jsx'),
    import('./contextos/AutenticacaoContexto.jsx'),
    import('./rotas/rotas.jsx'),
  ]);
  raiz.render(
    <StrictMode>
      <ProvedorTema>
        <ProvedorAutenticacao>
          <RouterProvider router={roteador} />
        </ProvedorAutenticacao>
      </ProvedorTema>
    </StrictMode>,
  );
}
