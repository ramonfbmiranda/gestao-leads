// Telas que entram nas próximas fases (10 e 11), já com o lugar no menu.

import { Link } from 'react-router';
import { Cartao } from '../componentes/ui.jsx';

export function EmConstrucao({ titulo, descricao }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">{titulo}</h1>
        <p className="text-texto-2">{descricao}</p>
      </div>
      <Cartao className="p-6 text-texto-2">Esta tela entra na próxima fase, seguindo o protótipo aprovado.</Cartao>
    </div>
  );
}

export function NaoEncontrada() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
      <h1 className="text-2xl font-bold">Página não encontrada</h1>
      <p className="text-texto-2">O endereço não existe ou foi digitado errado.</p>
      <Link to="/">Voltar para o início</Link>
    </div>
  );
}
