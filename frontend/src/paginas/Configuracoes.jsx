// Configurações (admin, seção 11): cálculo do potencial, perfil ideal,
// perguntas da avaliação, negócio e funil, escalas e equipe. Edita a
// configuração efetiva e, ao salvar, envia só o que difere do padrão.

import { useEffect, useState } from 'react';
import { Chip, ErroCarregamento, Selecao, useCarregamento, useMensagem } from '../componentes/comuns.jsx';
import { Aviso, Botao, Campo, Cartao } from '../componentes/ui.jsx';
import { useAutenticacao } from '../contextos/AutenticacaoContexto.jsx';
import { useOrganizacao } from '../contextos/OrganizacaoContexto.jsx';
import { api } from '../servicos/api.js';
import { comValor, diferencasDoPadrao, idDoTexto, iguais } from '../utils/config.js';

const ABAS = [['potencial', 'Cálculo do potencial'], ['perfil', 'Perfil ideal'], ['avaliacao', 'Perguntas da avaliação'], ['negocio', 'Negócio e funil'], ['escalas', 'Escalas da planilha'], ['equipe', 'Equipe']];
const UFS = ['AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO'];
const BLOCOS = [['qualificacao', 'Qualificação', 'probabilidade'], ['midias', 'Mídias', 'probabilidade'], ['relacionamento', 'Relacionamento', 'soma ao esforço']];

function Secao({ titulo, descricao, children }) {
  return (
    <div className="flex flex-col gap-4 border-b border-divisor px-6 py-5 last:border-b-0">
      <div><h2 className="text-base font-semibold">{titulo}</h2>{descricao && <p className="text-[13px] text-texto-2">{descricao}</p>}</div>
      {children}
    </div>
  );
}

function Numero({ id, rotulo, valor, aoMudar, ajuda, nulo = false, passo = 1 }) {
  return (
    <Campo
      id={id}
      rotulo={rotulo}
      ajuda={ajuda}
      type="number"
      step={passo}
      min={0}
      value={valor ?? ''}
      onChange={(e) => aoMudar(e.target.value === '' ? (nulo ? null : 0) : Number(e.target.value))}
      className="max-w-[220px]"
    />
  );
}

function Etiquetas({ itens, aoRemover, rotulo }) {
  return itens.map((item) => (
    <span key={item} className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-hover pr-1.5 pl-3 text-[13px] font-medium">
      {item}<button type="button" aria-label={`Remover ${rotulo} ${item}`} className="h-6 w-6 cursor-pointer rounded-full hover:bg-borda" onClick={() => aoRemover(item)}>✕</button>
    </span>
  ));
}

function AdicionarTexto({ id, rotulo, placeholder, aoAdicionar }) {
  const [texto, setTexto] = useState('');
  return (
    <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (texto.trim()) { aoAdicionar(texto.trim()); setTexto(''); } }}>
      <label htmlFor={id} className="sr-only">{rotulo}</label>
      <input id={id} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={placeholder} className="min-h-10 max-w-60 rounded-lg border border-borda-forte bg-superficie px-3 text-texto" />
      <Botao type="submit">Adicionar</Botao>
    </form>
  );
}

function SugestaoPesos() {
  const { dados, erro } = useCarregamento(() => api.sugestaoPesos(), []);
  if (erro) return <p className="text-[13px] text-texto-2">{erro.message}</p>;
  if (!dados) return null;
  if (!dados.suficiente) {
    return (
      <div className="flex max-w-lg flex-col gap-2 text-[13px]">
        {[['Convertidos', dados.convertidos], ['Descartados', dados.descartados]].map(([rotulo, n]) => (
          <div key={rotulo}>
            <div className="flex justify-between"><span>{rotulo}</span><span><b>{n}</b> de {dados.minimo}</span></div>
            <div className="h-2 rounded bg-hover"><div className="h-2 rounded bg-pot-media" style={{ width: `${Math.min(100, (n / dados.minimo) * 100)}%` }} /></div>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3 text-[13px]">
      {['valor', 'probabilidade', 'esforco'].map((pilar) => dados[pilar] && (
        <div key={pilar}>
          <h3 className="font-semibold capitalize">{pilar === 'esforco' ? 'Esforço' : pilar}</h3>
          {dados[pilar].sugeridos ? (
            <ul className="flex flex-wrap gap-x-5 gap-y-1">{Object.entries(dados[pilar].sugeridos).map(([chave, valor]) => <li key={chave}>{chave}: <span className="text-texto-2">{dados[pilar].atuais?.[chave]}</span> → <b>{valor ?? '—'}</b></li>)}</ul>
          ) : <p className="text-texto-2">Sem diferença clara entre convertidos e descartados.</p>}
        </div>
      ))}
      <p className="text-xs text-texto-2">É só uma sugestão: para aplicar, ajuste os campos acima e salve.</p>
    </div>
  );
}

function Equipe() {
  const membros = useCarregamento(() => api.listarMembros(), []);
  const convites = useCarregamento(() => api.listarConvites(), []);
  const responsaveis = useCarregamento(() => api.listarResponsaveis(), []);
  const [email, setEmail] = useState('');
  const [papel, setPapel] = useState('membro');
  const [aviso, setAviso] = useState(null);

  async function tentar(acao, texto) {
    try {
      const outroTexto = await acao();
      setAviso({ tipo: 'ok', texto: typeof outroTexto === 'string' ? outroTexto : texto });
    } catch (falha) {
      setAviso({ tipo: 'erro', texto: falha.message });
    }
  }

  return (
    <Cartao>
      {aviso && <div className="px-6 pt-5"><Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso></div>}
      <Secao titulo="Convidar pessoa" descricao="Quem já tem conta não recebe e-mail: o convite aparece no próximo login.">
        <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); tentar(async () => { const r = await api.convidarMembro({ email: email.trim(), papel }); setEmail(''); convites.recarregar(); if (!r.email_enviado) return 'Convite criado. Esta pessoa já tem conta: ela verá o convite no próximo login.'; }, 'Convite enviado por e-mail.'); }}>
          <Campo id="cv-email" rotulo="E-mail" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="flex-[1_1_280px]" />
          <Selecao id="cv-papel" rotulo="Papel" value={papel} onChange={(e) => setPapel(e.target.value)} className="flex-[0_1_160px]"><option value="membro">Membro</option><option value="admin">Admin</option></Selecao>
          <Botao type="submit" variante="primario" disabled={!email.trim()}>Enviar convite</Botao>
        </form>
      </Secao>
      <Secao titulo="Membros">
        {membros.erro && <ErroCarregamento erro={membros.erro} aoTentar={membros.recarregar} />}
        {(membros.dados ?? []).map((m) => (
          <div key={m.id} className="grid grid-cols-[1fr_1.4fr_90px] gap-3 border-b border-divisor pb-2 text-[13px] last:border-b-0"><b className="font-semibold">{m.nome || '—'}</b><span className="break-all">{m.email}</span><span>{m.papel === 'admin' ? 'Admin' : 'Membro'}</span></div>
        ))}
      </Secao>
      <Secao titulo="Convites pendentes">
        {(convites.dados ?? []).length === 0 && <p className="text-[13px] text-texto-2">Nenhum convite pendente.</p>}
        {(convites.dados ?? []).map((c) => (
          <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 text-[13px]">
            <span className="break-all">{c.email} · {c.papel === 'admin' ? 'Admin' : 'Membro'}</span>
            <Botao pequeno variante="perigo" onClick={() => tentar(async () => { await api.cancelarConvite(c.id); convites.recarregar(); }, 'Convite cancelado.')}>Cancelar</Botao>
          </div>
        ))}
      </Secao>
      <Secao titulo="Responsáveis (“Quem mapeou?”)" descricao="Nomes que aparecem na planilha. Não precisam ser usuários do sistema; nomes novos são criados na importação.">
        <div className="flex flex-wrap gap-2">{(responsaveis.dados ?? []).map((r) => <span key={r.id} className="rounded-full bg-hover px-3 py-1 text-[13px] font-medium">{r.nome}</span>)}</div>
        <AdicionarTexto id="novo-resp" rotulo="Novo responsável" placeholder="Novo responsável" aoAdicionar={(nome) => tentar(async () => { await api.criarResponsavel({ nome }); responsaveis.recarregar(); }, 'Responsável adicionado.')} />
      </Secao>
    </Cartao>
  );
}

export function Configuracoes() {
  const { perfil } = useAutenticacao();
  const { organizacao, recarregar } = useOrganizacao();
  const [aba, setAba] = useState('potencial');
  const [config, setConfig] = useState(null);
  const [dadosOrg, setDadosOrg] = useState(null);
  const [aviso, setAviso] = useMensagem();
  const [salvo, setSalvo] = useState(false);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!organizacao) return;
    setConfig(structuredClone(organizacao.config_efetivo));
    setDadosOrg({ nome: organizacao.nome, escala_icp_max: Number(organizacao.escala_icp_max), escala_midias_max: Number(organizacao.escala_midias_max), escala_nota_max: Number(organizacao.escala_nota_max) });
  }, [organizacao]);

  if (perfil?.papel !== 'admin') return <Aviso tipo="aviso">Só administradores mexem nas configurações. Peça para um admin da sua organização.</Aviso>;
  if (!config || !dadosOrg) return <p className="text-texto-2">Carregando…</p>;

  const mudar = (caminho, valor) => setConfig(comValor(config, caminho, valor));
  const padrao = organizacao.config_padrao;
  const alterado = !iguais(config, organizacao.config_efetivo)
    || dadosOrg.nome !== organizacao.nome
    || ['escala_icp_max', 'escala_midias_max', 'escala_nota_max'].some((k) => dadosOrg[k] !== Number(organizacao[k]));

  async function salvar() {
    setSalvando(true);
    try {
      const corpo = { config_score: diferencasDoPadrao(config, padrao) };
      if (dadosOrg.nome !== organizacao.nome) corpo.nome = dadosOrg.nome;
      for (const k of ['escala_icp_max', 'escala_midias_max', 'escala_nota_max']) if (dadosOrg[k] !== Number(organizacao[k])) corpo[k] = dadosOrg[k];
      await api.atualizarOrganizacao(corpo);
      await recarregar();
      setSalvo(true);
      setAviso({ tipo: 'ok', texto: 'Configuração salva.' });
    } catch (falha) {
      setAviso({ tipo: 'erro', texto: falha.message });
    } finally {
      setSalvando(false);
    }
  }

  async function recalcular() {
    try {
      const { recalculados } = await api.recalcularScores();
      setSalvo(false);
      setAviso({ tipo: 'ok', texto: `Potencial de ${recalculados} lead(s) recalculado com a nova configuração.` });
    } catch (falha) {
      setAviso({ tipo: 'erro', texto: falha.message });
    }
  }

  const portes = Object.keys(config.valor.porte);
  const perguntas = config.avaliacao.perguntas;
  const mudarPergunta = (indice, campo, valor) => mudar(['avaliacao', 'perguntas', indice, campo], valor);
  const mudarOpcao = (indice, indiceOpcao, campo, valor) => mudar(['avaliacao', 'perguntas', indice, 'opcoes', indiceOpcao, campo], valor);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div><h1 className="text-2xl font-bold tracking-tight">Configurações</h1><p className="text-texto-2">Ajuste o cálculo do potencial à realidade da sua empresa.</p></div>
        {aba !== 'equipe' && <Botao variante="primario" disabled={!alterado || salvando} onClick={salvar}>{salvando ? 'Salvando…' : 'Salvar alterações'}</Botao>}
      </div>
      <div className="mb-5 flex flex-wrap gap-x-5 gap-y-1 border-b border-borda" role="tablist" aria-label="Seções das configurações">
        {ABAS.map(([id, rotulo]) => (
          <button key={id} type="button" role="tab" aria-selected={aba === id} onClick={() => setAba(id)} className={`-mb-px min-h-11 cursor-pointer border-b-2 px-1 font-medium ${aba === id ? 'border-tinta text-texto' : 'border-transparent text-texto-2 hover:text-texto'}`}>{rotulo}</button>
        ))}
      </div>
      {aviso && <Aviso tipo={aviso.tipo} className="mb-4">{aviso.texto}</Aviso>}
      {salvo && (
        <Aviso tipo="aviso" className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <span>O potencial dos leads foi calculado com a configuração anterior.</span>
          <Botao pequeno variante="primario" onClick={recalcular}>Recalcular todos os leads</Botao>
        </Aviso>
      )}

      {aba === 'potencial' && (
        <Cartao>
          <Secao titulo="Faixas do potencial" descricao="Onde cada lead cai no medidor, em todas as telas.">
            <div className="flex flex-wrap gap-4">
              <Numero id="f-alta" rotulo="Alto a partir de" valor={config.faixas.alta} aoMudar={(v) => mudar(['faixas', 'alta'], v)} />
              <Numero id="f-media" rotulo="Médio a partir de" valor={config.faixas.media} aoMudar={(v) => mudar(['faixas', 'media'], v)} />
              <Numero id="f-inativa" rotulo="Teto para empresa inativa" valor={config.situacao_inativa_limite} aoMudar={(v) => mudar(['situacao_inativa_limite'], v)} />
            </div>
          </Secao>
          <Secao titulo="Valor · quanto o cliente pode render" descricao="Pesos em %. Fator sem dado fica N/A e o peso vai para os outros.">
            <div className="flex flex-wrap gap-4">
              {[['porte', 'Porte'], ['capital_social', 'Capital social'], ['idade', 'Idade da empresa']].map(([k, r]) => <Numero key={k} id={`v-${k}`} rotulo={r} valor={config.valor.pesos[k]} aoMudar={(v) => mudar(['valor', 'pesos', k], v)} />)}
            </div>
            <div className="flex flex-wrap gap-4">
              {portes.map((p) => <Numero key={p} id={`pt-${p}`} rotulo={`Pontos: ${p.toLowerCase()}`} valor={config.valor.porte[p]} aoMudar={(v) => mudar(['valor', 'porte', p], v)} />)}
            </div>
          </Secao>
          <Secao titulo="Probabilidade · chance de fechar" descricao="Pesos em %. O que o sistema calcula ou a equipe responde prevalece sobre a planilha.">
            <div className="flex flex-wrap gap-4">
              {[['icp', 'Encaixe no perfil ideal'], ['qualificacao', 'Qualificação'], ['midias_sociais', 'Mídias sociais']].map(([k, r]) => <Numero key={k} id={`p-${k}`} rotulo={r} valor={config.probabilidade.pesos[k]} aoMudar={(v) => mudar(['probabilidade', 'pesos', k], v)} />)}
            </div>
          </Secao>
          <Secao titulo="Esforço · dificuldade de conquistar" descricao="Pontos somados ao esforço (no máximo 100 no total).">
            <div className="flex flex-wrap gap-4">
              {[['contato_decisor', 'Contato do decisor'], ['sem_nome_decisor', 'Sem nome do decisor'], ['reducao_decisor_provavel', 'Decisor provável reduz (%)'], ['sem_redes_sociais', 'Sem redes nem site'], ['fora_ufs_atendidas', 'UF fora das atendidas']].map(([k, r]) => <Numero key={k} id={`e-${k}`} rotulo={r} valor={config.esforco[k]} aoMudar={(v) => mudar(['esforco', k], v)} />)}
            </div>
            <p className="text-[13px] font-medium">Quanto cada canal tira da penalidade de contato (%)</p>
            <div className="flex flex-wrap gap-4">
              {[['telefone_decisor', 'Telefone do decisor'], ['email_decisor', 'E-mail do decisor'], ['linkedin_decisor', 'LinkedIn do decisor'], ['contato_empresa', 'Contato da empresa']].map(([k, r]) => <Numero key={k} id={`c-${k}`} rotulo={r} valor={config.esforco.reducao_canais[k]} aoMudar={(v) => mudar(['esforco', 'reducao_canais', k], v)} />)}
            </div>
            <div className="flex flex-wrap gap-4">
              {[['toleradas', 'Tentativas toleradas'], ['pontos_por_tentativa', 'Pontos por tentativa'], ['maximo', 'Máximo das tentativas']].map(([k, r]) => <Numero key={k} id={`t-${k}`} rotulo={r} valor={config.esforco.tentativas[k]} aoMudar={(v) => mudar(['esforco', 'tentativas', k], Math.round(v))} />)}
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-[13px] font-medium">UFs atendidas {config.esforco.ufs_atendidas.length === 0 && <span className="font-normal text-texto-2">(nenhuma: a penalidade de UF fica desligada)</span>}</span>
              <div className="flex flex-wrap items-center gap-2">
                <Etiquetas itens={config.esforco.ufs_atendidas} rotulo="UF" aoRemover={(uf) => mudar(['esforco', 'ufs_atendidas'], config.esforco.ufs_atendidas.filter((x) => x !== uf))} />
                <select aria-label="Adicionar UF" value="" onChange={(e) => e.target.value && mudar(['esforco', 'ufs_atendidas'], [...config.esforco.ufs_atendidas, e.target.value])} className="min-h-10 rounded-lg border border-borda-forte bg-superficie px-3 text-texto">
                  <option value="">Adicionar UF</option>
                  {UFS.filter((uf) => !config.esforco.ufs_atendidas.includes(uf)).map((uf) => <option key={uf} value={uf}>{uf}</option>)}
                </select>
              </div>
            </div>
          </Secao>
          <Secao titulo="Sugestão de pesos" descricao="Com desfechos suficientes, o sistema compara convertidos e descartados e sugere pesos. Você decide se aplica."><SugestaoPesos /></Secao>
          <Secao titulo="Voltar ao padrão"><Botao className="self-start" onClick={() => setConfig(structuredClone(padrao))}>Restaurar toda a configuração padrão</Botao></Secao>
        </Cartao>
      )}

      {aba === 'perfil' && (
        <Cartao>
          <Secao titulo="Perfil de cliente ideal" descricao="Quem vocês querem conquistar. Com isso, o encaixe sai sozinho dos dados da Receita, sem depender da planilha.">
            <div className="flex flex-col gap-2">
              <span className="text-[13px] font-medium">Setores (CNAE principal, 7 dígitos)</span>
              <div className="flex flex-wrap items-center gap-2">
                <Etiquetas itens={config.perfil_ideal.setores} rotulo="CNAE" aoRemover={(c) => mudar(['perfil_ideal', 'setores'], config.perfil_ideal.setores.filter((x) => x !== c))} />
                <AdicionarTexto id="novo-cnae" rotulo="Adicionar CNAE" placeholder="Ex.: 6201-5/01" aoAdicionar={(t) => { const c = t.replace(/\D/g, ''); if (c.length === 7 && !config.perfil_ideal.setores.includes(c)) mudar(['perfil_ideal', 'setores'], [...config.perfil_ideal.setores, c]); else setAviso({ tipo: 'erro', texto: 'O CNAE precisa ter 7 dígitos e não pode repetir.' }); }} />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-[13px] font-medium">Portes que vocês atendem</span>
              <div className="flex flex-wrap gap-2">
                {portes.map((p) => <Chip key={p} ativo={config.perfil_ideal.portes.includes(p)} onClick={() => mudar(['perfil_ideal', 'portes'], config.perfil_ideal.portes.includes(p) ? config.perfil_ideal.portes.filter((x) => x !== p) : [...config.perfil_ideal.portes, p])}>{p.toLowerCase()}</Chip>)}
              </div>
            </div>
            <Numero id="idade-min" rotulo="Idade mínima da empresa (anos)" nulo passo={0.5} valor={config.perfil_ideal.idade_minima} aoMudar={(v) => mudar(['perfil_ideal', 'idade_minima'], v === 0 ? null : v)} ajuda="Vazio desliga. Abaixo disso, a nota cai proporcionalmente." />
            <div className="flex flex-wrap gap-4">
              {[['setor', 'Peso do setor'], ['porte', 'Peso do porte'], ['idade', 'Peso da idade']].map(([k, r]) => <Numero key={k} id={`pi-${k}`} rotulo={r} valor={config.perfil_ideal.pesos[k]} aoMudar={(v) => mudar(['perfil_ideal', 'pesos', k], v)} />)}
            </div>
          </Secao>
        </Cartao>
      )}

      {aba === 'avaliacao' && (
        <Cartao>
          {BLOCOS.map(([bloco, titulo, uso]) => (
            <Secao key={bloco} titulo={`${titulo} · ${uso}`}>
              {perguntas.map((p, i) => p.bloco === bloco && (
                <div key={p.id} className="flex flex-col gap-2.5 rounded-[10px] border border-borda p-4">
                  <div className="flex flex-wrap items-end gap-3">
                    <Campo id={`pq-${p.id}`} rotulo="Pergunta" value={p.texto} maxLength={200} onChange={(e) => mudarPergunta(i, 'texto', e.target.value)} className="min-w-0 flex-[1_1_320px]" />
                    {bloco !== 'relacionamento' && <Numero id={`pp-${p.id}`} rotulo="Peso" valor={p.peso} aoMudar={(v) => mudarPergunta(i, 'peso', v)} />}
                    <Botao variante="perigo" pequeno onClick={() => mudar(['avaliacao', 'perguntas'], perguntas.filter((_, j) => j !== i))}>Remover pergunta</Botao>
                  </div>
                  <div className="flex flex-col gap-2">
                    {p.opcoes.map((o, k) => (
                      <div key={o.id} className="flex flex-wrap items-center gap-2 text-[13px]">
                        <input aria-label="Texto da opção" value={o.rotulo} maxLength={80} onChange={(e) => mudarOpcao(i, k, 'rotulo', e.target.value)} className="min-h-9 flex-[1_1_200px] rounded-lg border border-borda-forte bg-superficie px-3 text-texto" />
                        <label className="flex items-center gap-1.5"><input type="checkbox" checked={o.pontos === null} onChange={(e) => mudarOpcao(i, k, 'pontos', e.target.checked ? null : 0)} />“Não sei”</label>
                        {o.pontos !== null && <input aria-label={bloco === 'relacionamento' ? 'Pontos de esforço' : 'Pontos'} type="number" min={0} max={100} value={o.pontos} onChange={(e) => mudarOpcao(i, k, 'pontos', Number(e.target.value))} className="min-h-9 w-20 rounded-lg border border-borda-forte bg-superficie px-2 text-right text-texto" />}
                        <button type="button" disabled={p.opcoes.length <= 2} className="cursor-pointer text-texto-2 underline disabled:cursor-not-allowed disabled:opacity-40" onClick={() => mudarPergunta(i, 'opcoes', p.opcoes.filter((_, j) => j !== k))}>remover</button>
                      </div>
                    ))}
                    {p.opcoes.length < 8 && <button type="button" className="cursor-pointer self-start text-[13px] font-semibold text-link" onClick={() => mudarPergunta(i, 'opcoes', [...p.opcoes, { id: idDoTexto(`opcao ${p.opcoes.length + 1}`, p.opcoes.map((o) => o.id)), rotulo: 'Nova opção', pontos: 0 }])}>+ Opção</button>}
                  </div>
                </div>
              ))}
              {perguntas.length < 30 && (
                <Botao pequeno className="self-start" onClick={() => {
                  const id = idDoTexto(`nova pergunta ${titulo}`, perguntas.map((p) => p.id));
                  mudar(['avaliacao', 'perguntas'], [...perguntas, { id, bloco, texto: 'Nova pergunta?', peso: bloco === 'relacionamento' ? 0 : 10, opcoes: [{ id: 'sim', rotulo: 'Sim', pontos: bloco === 'relacionamento' ? 0 : 100 }, { id: 'nao', rotulo: 'Não', pontos: bloco === 'relacionamento' ? 10 : 0 }, { id: 'nao_sei', rotulo: 'Não sei', pontos: null }] }]);
                }}>+ Pergunta em {titulo}</Botao>
              )}
            </Secao>
          ))}
          <Secao titulo="Voltar ao modelo padrão" descricao="As respostas já dadas a perguntas que saírem do modelo ficam guardadas, mas deixam de contar.">
            <Botao className="self-start" onClick={() => mudar(['avaliacao'], structuredClone(padrao.avaliacao))}>Restaurar perguntas padrão</Botao>
          </Secao>
        </Cartao>
      )}

      {aba === 'negocio' && (
        <Cartao>
          <Secao titulo="Estimativa em reais" descricao="Ticket médio por porte (o vendedor pode ajustar em cada lead) e horas para conquistar um lead. Sem ticket, a estimativa fica N/A.">
            <div className="flex flex-wrap gap-4">
              {portes.map((p) => (
                <Numero key={p} id={`tk-${p}`} rotulo={`Ticket: ${p.toLowerCase()} (R$)`} nulo passo={100} valor={config.financeiro.ticket_por_porte[p]} aoMudar={(v) => {
                  const tabela = { ...config.financeiro.ticket_por_porte };
                  if (v === null) delete tabela[p]; else tabela[p] = v;
                  mudar(['financeiro', 'ticket_por_porte'], tabela);
                }} />
              ))}
            </div>
            <div className="flex flex-wrap gap-4">
              <Numero id="h-zero" rotulo="Horas com esforço 0" nulo valor={config.financeiro.horas_esforco_zero} aoMudar={(v) => mudar(['financeiro', 'horas_esforco_zero'], v || null)} />
              <Numero id="h-max" rotulo="Horas com esforço 100" nulo valor={config.financeiro.horas_esforco_maximo} aoMudar={(v) => mudar(['financeiro', 'horas_esforco_maximo'], v || null)} />
            </div>
          </Secao>
          <Secao titulo="Motivos de descarte" descricao="Aparecem ao descartar um lead e alimentam a análise de conversão.">
            <div className="flex flex-wrap items-center gap-2">
              <Etiquetas itens={config.motivos_descarte} rotulo="motivo" aoRemover={(m) => config.motivos_descarte.length > 1 && mudar(['motivos_descarte'], config.motivos_descarte.filter((x) => x !== m))} />
              {config.motivos_descarte.length < 20 && <AdicionarTexto id="novo-motivo" rotulo="Novo motivo" placeholder="Novo motivo" aoAdicionar={(m) => !config.motivos_descarte.includes(m) && mudar(['motivos_descarte'], [...config.motivos_descarte, m.slice(0, 60)])} />}
            </div>
          </Secao>
          <Secao titulo="Fila de prioridade e Receita">
            <div className="flex flex-wrap gap-4">
              <Numero id="d-esp" rotulo="Sai de “abordar” por (dias)" valor={config.prioridade.dias_espera} aoMudar={(v) => mudar(['prioridade', 'dias_espera'], Math.round(v))} ajuda="depois de um contato" />
              <Numero id="d-ret" rotulo="“Retomar” depois de (dias)" valor={config.prioridade.dias_retomar} aoMudar={(v) => mudar(['prioridade', 'dias_retomar'], Math.round(v))} ajuda="sem contato, em negociação" />
              <Numero id="d-rec" rotulo="Reconsultar a Receita a cada (dias)" valor={config.reconsulta_dias} aoMudar={(v) => mudar(['reconsulta_dias'], Math.round(v))} ajuda="0 desliga" />
            </div>
          </Secao>
        </Cartao>
      )}

      {aba === 'escalas' && (
        <Cartao>
          <Secao titulo="Organização e escalas da planilha" descricao="As escalas só importam para as notas que vêm da planilha.">
            <Campo id="c-org" rotulo="Nome da organização" maxLength={150} value={dadosOrg.nome} onChange={(e) => setDadosOrg({ ...dadosOrg, nome: e.target.value })} className="max-w-md" />
            <div className="flex flex-wrap gap-4">
              {[['escala_icp_max', 'Nota ICP vai até'], ['escala_midias_max', 'Nota de mídias vai até'], ['escala_nota_max', 'Nota final vai até']].map(([k, r]) => <Numero key={k} id={k} rotulo={r} passo={0.5} valor={dadosOrg[k]} aoMudar={(v) => setDadosOrg({ ...dadosOrg, [k]: v })} />)}
            </div>
          </Secao>
          <Secao titulo="Notas em letra" descricao="Quanto vale cada letra, em % da escala. Com escala 0 a 10, “B” 75% vira 7,5.">
            <div className="flex flex-wrap gap-4">
              {Object.entries(config.equivalencia_letras).map(([letra, valor]) => <Numero key={letra} id={`l-${letra}`} rotulo={`Letra ${letra} (%)`} valor={valor} aoMudar={(v) => mudar(['equivalencia_letras', letra], v)} />)}
            </div>
          </Secao>
        </Cartao>
      )}

      {aba === 'equipe' && <Equipe />}
    </>
  );
}
