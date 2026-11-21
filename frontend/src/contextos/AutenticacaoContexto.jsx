// Sessão do Supabase Auth + dados da conta (GET /me): perfil, organização e
// convites pendentes. Sem perfil, a pessoa vai para o primeiro acesso (seção 6).

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../servicos/api.js';
import { mensagemDeErroAuth, supabase } from '../servicos/supabase.js';

const Contexto = createContext(null);

export function ProvedorAutenticacao({ children }) {
  // undefined = ainda lendo a sessão guardada; null = sem sessão.
  const [sessao, setSessao] = useState(undefined);
  const [conta, setConta] = useState(null);
  const [erroConta, setErroConta] = useState(null);

  useEffect(() => {
    let ativo = true;
    supabase.auth.getSession().then(({ data }) => {
      if (ativo) setSessao(data.session ?? null);
    });
    // Não chamar outros métodos do Supabase dentro deste callback (recomendação da biblioteca).
    const { data } = supabase.auth.onAuthStateChange((_evento, novaSessao) => setSessao(novaSessao ?? null));
    return () => {
      ativo = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const usuarioId = sessao?.user?.id ?? null;

  const recarregarConta = useCallback(async () => {
    if (!usuarioId) {
      setConta(null);
      return null;
    }
    setErroConta(null);
    try {
      const dados = await api.me();
      setConta(dados);
      return dados;
    } catch (erro) {
      setErroConta(erro);
      return null;
    }
  }, [usuarioId]);

  // A conta só é buscada de novo quando muda o usuário (não a cada renovação do token).
  useEffect(() => {
    setConta(null);
    recarregarConta();
  }, [recarregarConta]);

  const entrar = useCallback(async (email, senha) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
    return { erro: mensagemDeErroAuth(error) };
  }, []);

  const cadastrar = useCallback(async (email, senha) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password: senha,
      options: { emailRedirectTo: `${window.location.origin}/entrar` },
    });
    if (error) return { erro: mensagemDeErroAuth(error) };
    // E-mail já cadastrado: o Supabase devolve um usuário sem identidades, sem dizer o motivo.
    if (data.user && data.user.identities?.length === 0) {
      return { erro: mensagemDeErroAuth({ code: 'user_already_exists' }) };
    }
    return { erro: null, precisaConfirmar: !data.session };
  }, []);

  const sair = useCallback(async () => {
    await supabase.auth.signOut();
    setConta(null);
  }, []);

  const valor = useMemo(() => {
    const lendoSessao = sessao === undefined;
    return {
      sessao: sessao ?? null,
      usuario: sessao?.user ?? null,
      conta,
      perfil: conta?.perfil ?? null,
      organizacao: conta?.organizacao ?? null,
      erroConta,
      // Carregando enquanto lê a sessão ou, com sessão, enquanto busca a conta.
      carregando: lendoSessao || (Boolean(sessao) && !conta && !erroConta),
      entrar,
      cadastrar,
      sair,
      recarregarConta,
      definirConta: setConta,
    };
  }, [sessao, conta, erroConta, entrar, cadastrar, sair, recarregarConta]);

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useAutenticacao() {
  return useContext(Contexto);
}
