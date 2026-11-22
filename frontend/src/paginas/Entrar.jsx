// Login e cadastro (Supabase Auth), com o aviso de confirmar o e-mail.

import { useState } from 'react';
import { BotaoTema } from '../componentes/BotaoTema.jsx';
import { IconeEnvelope } from '../componentes/Icones.jsx';
import { Aviso, Botao, Campo, Cartao, Logo } from '../componentes/ui.jsx';
import { useAutenticacao } from '../contextos/AutenticacaoContexto.jsx';

const DESTAQUES = [
  ['Importe a planilha como ela é', 'Você escolhe de qual coluna vem cada informação.'],
  ['Dados da Receita pelo CNPJ', 'Porte, capital, idade, sócios e situação, inclusive para CNPJ alfanumérico.'],
  ['Avalie e gerencie no mesmo lugar', 'Perguntas rápidas sobre o lead, funil e equipe, sem inventar nota quando falta dado.'],
];

export function Entrar() {
  const { entrar, cadastrar } = useAutenticacao();
  const [modo, setModo] = useState('entrar');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [repetida, setRepetida] = useState('');
  const [erro, setErro] = useState(null);
  const [enviando, setEnviando] = useState(false);

  const trocarModo = (novo) => {
    setModo(novo);
    setErro(null);
  };

  async function enviar(evento) {
    evento.preventDefault();
    setErro(null);
    if (modo === 'criar' && senha !== repetida) {
      setErro('As senhas não são iguais.');
      return;
    }
    setEnviando(true);
    const resultado = modo === 'entrar' ? await entrar(email.trim(), senha) : await cadastrar(email.trim(), senha);
    setEnviando(false);
    if (resultado.erro) setErro(resultado.erro);
    else if (modo === 'criar' && resultado.precisaConfirmar) setModo('enviado');
    // Login certo: a sessão muda e as rotas levam para o lugar certo.
  }

  return (
    <div className="relative flex min-h-screen flex-wrap">
      <div className="absolute top-4 right-4"><BotaoTema /></div>

      <section aria-label="Sobre o sistema" className="flex flex-[1_1_440px] flex-col justify-between gap-9 border-r border-borda bg-superficie-2 px-6 py-12 md:px-14">
        <div className="flex items-center gap-2.5 text-[17px] font-bold"><Logo tamanho={34} />LeadRank</div>
        <div className="flex max-w-[480px] flex-col gap-7">
          <h1 className="text-4xl leading-tight font-bold tracking-tight text-balance">Meça o potencial de cada lead antes de correr atrás dele.</h1>
          <ul className="flex flex-col gap-4">
            {DESTAQUES.map(([titulo, texto]) => (
              <li key={titulo}><strong className="block font-semibold">{titulo}</strong><span className="text-texto-2">{texto}</span></li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-texto-2">Cada empresa vê somente os próprios dados.</p>
      </section>

      <section aria-label="Acesso" className="flex flex-[1_1_480px] items-center justify-center px-4 py-12">
        <Cartao as="div" className="flex w-full max-w-[420px] flex-col gap-5 p-8">
          {modo === 'enviado' ? (
            <div className="flex flex-col items-center gap-3.5 py-2 text-center">
              <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-hover"><IconeEnvelope tamanho={26} /></span>
              <h2 className="text-xl font-bold">Confirme seu e-mail</h2>
              <p className="text-texto-2">Enviamos um link de confirmação para <strong className="text-texto">{email}</strong>. Clique nele para ativar a conta e depois entre aqui.</p>
              <p className="text-xs text-texto-2">Não chegou? Confira a caixa de spam.</p>
              <Botao largo onClick={() => trocarModo('entrar')}>Voltar para o login</Botao>
            </div>
          ) : (
            <>
              <div className="flex gap-1 rounded-[10px] bg-hover p-1" role="group" aria-label="Entrar ou criar conta">
                {[['entrar', 'Entrar'], ['criar', 'Criar conta']].map(([id, rotulo]) => (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={modo === id}
                    onClick={() => trocarModo(id)}
                    className={`min-h-10 flex-1 cursor-pointer rounded-[7px] font-semibold ${modo === id ? 'bg-superficie text-texto shadow-sm' : 'text-texto-2'}`}
                  >
                    {rotulo}
                  </button>
                ))}
              </div>
              <form className="flex flex-col gap-4" onSubmit={enviar} noValidate>
                <div className="flex flex-col gap-1">
                  <h2 className="text-xl font-bold">{modo === 'entrar' ? 'Bem-vindo de volta' : 'Criar conta'}</h2>
                  <p className="text-[13px] text-texto-2">
                    {modo === 'entrar' ? 'Entre com o e-mail e a senha da sua conta.' : 'Depois de confirmar o e-mail, você cria sua organização ou aceita um convite.'}
                  </p>
                </div>
                {erro && <Aviso tipo="erro">{erro}</Aviso>}
                <Campo id="email" rotulo="E-mail" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nome@empresa.com.br" />
                <Campo
                  id="senha"
                  rotulo="Senha"
                  type="password"
                  required
                  minLength={6}
                  autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'}
                  ajuda={modo === 'criar' ? 'Pelo menos 6 caracteres.' : undefined}
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                />
                {modo === 'criar' && (
                  <Campo id="repetida" rotulo="Repita a senha" type="password" required autoComplete="new-password" value={repetida} onChange={(e) => setRepetida(e.target.value)} />
                )}
                <Botao type="submit" variante="primario" largo disabled={enviando || !email || !senha}>
                  {enviando ? 'Aguarde…' : modo === 'entrar' ? 'Entrar' : 'Criar conta'}
                </Botao>
              </form>
            </>
          )}
        </Cartao>
      </section>
    </div>
  );
}
