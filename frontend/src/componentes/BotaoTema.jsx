import { useTema } from '../contextos/TemaContexto.jsx';
import { IconeLua, IconeSol } from './Icones.jsx';
import { Botao } from './ui.jsx';

export function BotaoTema() {
  const { escuro, alternarTema } = useTema();
  return (
    <Botao variante="icone" onClick={alternarTema} aria-pressed={escuro} aria-label="Tema escuro" title={escuro ? 'Usar tema claro' : 'Usar tema escuro'}>
      {escuro ? <IconeSol /> : <IconeLua />}
    </Botao>
  );
}
