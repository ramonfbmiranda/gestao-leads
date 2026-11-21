// Primeiro acesso (especificação, seção 6): aceitar um convite pendente ou
// criar a organização como admin. Os dois exigem e-mail confirmado.

import { useState } from 'react';
import { useNavigate } from 'react-router';
import { BotaoTema } from '../componentes/BotaoTema.jsx';
import { IconeEnvelope, IconeOrganizacao, IconeSair } from '../componentes/Icones.jsx';
import { Aviso, Botao, Campo, Cartao, Logo } from '../componentes/ui.jsx';
import { useAutenticacao } from '../contextos/AutenticacaoContexto.jsx';
import { api } from '../servicos/api.js';

export function PrimeiroAcesso() {
  const { usuario, conta, definirConta, sair } = useAutenticacao();
  const navegar = useNavigate();
  const convites = conta?.convites_pendentes ?? [];
  const [nome, setNome] = useState('');
  const [nomeOrganizacao, setNomeOrganizacao] = useState('');
  const [erro, setErro] = useState(null);
  const [enviando, setEnviando] = useState(null);

  async function concluir(acao, chave) {
    setErro(null);
    setEnviando(chave);
    try {
      definirConta(await acao());
      navegar('/', { replace: true });
    } catch (falha) {
      setErro(falha.message);
      setEnviando(null);
    }
  }

  const corpoNome = nome.trim() ? { nome: nome.trim() } : {};

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-borda bg-superficie px-6 py-3">
        <span className="flex items-center gap-2.5 text-base font-bold"><Logo />Gestão de Leads</span>
        <span className="flex items-center gap-2">
          <span className="text-[13px] text-texto-2">{usuario?.email}</span>
          <BotaoTema />
          <Botao variante="icone" onClick={sair} aria-label="Sair"><IconeSair /></Botao>
        </span>
      </header>

      <main className="mx-auto flex w-full max-w-[680px] flex-1 flex-col gap-6 px-4 pt-12 pb-16">
        <div className="flex flex-col gap-1.5 text-center">
          <h1 className="text-[28px] font-bold tracking-tight">Falta pouco para começar</h1>
          <p className="text-texto-2">Sua conta está criada. Agora ligue ela a uma organização.</p>
        </div>

        {erro && <Aviso tipo="erro">{erro}</Aviso>}

        <div className="max-w-sm self-center">
          <Campo id="nome" rotulo="Como quer ser chamado? (opcional)" value={nome} maxLength={150} onChange={(e) => setNome(e.target.value)} placeholder="Seu nome" />
        </div>

        {convites.map((convite) => (
          <Cartao key={convite.id} className="flex flex-wrap items-center justify-between gap-4 border-pot-media p-6">
            <div className="flex items-start gap-3.5">
              <span className="inline-flex h-11 w-11 flex-none items-center justify-center rounded-[10px] bg-hover"><IconeEnvelope tamanho={22} /></span>
              <div>
                <h2 className="text-[17px] font-semibold">Você foi convidado para {convite.nome_organizacao ?? 'uma organização'}</h2>
                <p className="text-[13px] text-texto-2">Papel: {convite.papel === 'admin' ? 'Admin' : 'Membro'}</p>
              </div>
            </div>
            <Botao variante="primario" disabled={Boolean(enviando)} onClick={() => concluir(() => api.aceitarConvite(convite.id, corpoNome), convite.id)}>
              {enviando === convite.id ? 'Aceitando…' : 'Aceitar convite'}
            </Botao>
          </Cartao>
        ))}

        {convites.length > 0 && (
          <div className="flex items-center gap-3" aria-hidden="true"><span className="h-px flex-1 bg-borda" /><span className="text-[13px] text-texto-2">ou</span><span className="h-px flex-1 bg-borda" /></div>
        )}

        <Cartao className="flex flex-col gap-4 p-6">
          <form
            className="flex flex-col gap-4"
            onSubmit={(evento) => {
              evento.preventDefault();
              concluir(() => api.onboarding({ nome_organizacao: nomeOrganizacao.trim(), ...corpoNome }), 'organizacao');
            }}
          >
            <div className="flex items-start gap-3.5">
              <span className="inline-flex h-11 w-11 flex-none items-center justify-center rounded-[10px] bg-hover"><IconeOrganizacao tamanho={22} /></span>
              <div>
                <h2 className="text-[17px] font-semibold">Criar uma nova organização</h2>
                <p className="text-[13px] text-texto-2">Você será o administrador e poderá convidar sua equipe depois.</p>
              </div>
            </div>
            <Campo id="organizacao" rotulo="Nome da organização" required maxLength={150} value={nomeOrganizacao} onChange={(e) => setNomeOrganizacao(e.target.value)} placeholder="Ex.: Prospecta Consultoria" />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="max-w-sm text-xs text-texto-2">Cada conta participa de uma organização só.</p>
              <Botao type="submit" variante={convites.length ? 'padrao' : 'primario'} disabled={!nomeOrganizacao.trim() || Boolean(enviando)}>
                {enviando === 'organizacao' ? 'Criando…' : 'Criar organização'}
              </Botao>
            </div>
          </form>
        </Cartao>
      </main>
    </div>
  );
}
