// Importação em 3 passos (seção 7): enviar, mapear colunas (De-Para) e ver o
// resultado; depois, buscar os dados da Receita com a barra de progresso.

import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { CabecalhoPagina, ErroCarregamento, useCarregamento } from '../componentes/comuns.jsx';
import { Aviso, Botao, Cartao, classesBotao } from '../componentes/ui.jsx';
import { api } from '../servicos/api.js';

const TAMANHO_MAXIMO = 5 * 1024 * 1024;
const PASSOS = ['Enviar arquivo', 'Mapear colunas', 'Resultado'];

function Passos({ atual }) {
  return (
    <ol className="mb-5 flex flex-wrap items-center gap-x-7 gap-y-3" aria-label="Etapas da importação">
      {PASSOS.map((rotulo, i) => {
        const n = i + 1;
        const estilo = n === atual ? 'border-tinta bg-tinta text-sobre-tinta' : n < atual ? 'border-transparent bg-ok text-ok-texto' : 'border-borda bg-hover text-texto-2';
        return (
          <li key={rotulo} aria-current={n === atual ? 'step' : undefined} className={`flex items-center gap-2.5 font-medium ${n === atual ? 'text-texto' : 'text-texto-2'}`}>
            <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full border text-[13px] font-semibold ${estilo}`}>{n < atual ? '✓' : n}</span>{rotulo}
          </li>
        );
      })}
    </ol>
  );
}

function Enriquecimento() {
  const [status, setStatus] = useState(null);
  const [erro, setErro] = useState(null);
  const temporizador = useRef(null);

  async function acompanhar() {
    try {
      const atual = await api.statusEnriquecimento();
      setStatus(atual);
      if (atual.pendente + atual.processando > 0) temporizador.current = setTimeout(acompanhar, 4000);
    } catch (falha) {
      setErro(falha.message);
    }
  }
  useEffect(() => () => clearTimeout(temporizador.current), []);

  async function iniciar() {
    setErro(null);
    try {
      await api.enriquecerLote();
      acompanhar();
    } catch (falha) {
      setErro(falha.message);
    }
  }

  const naFila = status ? status.pendente + status.processando : 0;
  const feitos = status ? status.concluido + status.nao_encontrado + status.nao_suportado + status.erro : 0;
  const total = feitos + naFila;
  const porcentagem = total ? Math.round((feitos / total) * 100) : 0;

  return (
    <Cartao className="flex flex-col gap-3.5 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-base font-semibold">Buscar dados na Receita</h2><p className="text-[13px] text-texto-2">Porte, capital, abertura, CNAE, sócios e situação dos leads ainda não consultados. Esses dados completam o potencial.</p></div>
        {!status && <Botao variante="primario" onClick={iniciar}>Enriquecer leads</Botao>}
      </div>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {status && (
        <div className="flex flex-col gap-2.5">
          <div className="flex flex-wrap items-baseline justify-between gap-2"><span className="font-semibold">{naFila > 0 ? `Enriquecendo… ${feitos} de ${total}` : 'Fila concluída'}</span><span className="text-[13px] text-texto-2">{porcentagem}%</span></div>
          <div role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={feitos} aria-label="Progresso do enriquecimento" className="h-2.5 overflow-hidden rounded bg-pot-trilho">
            <div className="h-2.5 rounded bg-pot-media transition-[width] duration-500" style={{ width: `${porcentagem}%` }} />
          </div>
          <p className="text-xs text-texto-2">Concluídos {status.concluido} · não encontrados {status.nao_encontrado} · erros {status.erro} · na fila {naFila}. Pode sair desta tela: a fila continua no servidor.</p>
        </div>
      )}
    </Cartao>
  );
}

export function Importacao() {
  const [passo, setPasso] = useState(1);
  const [arquivo, setArquivo] = useState(null);
  const [previa, setPrevia] = useState(null);
  const [mapeamento, setMapeamento] = useState({});
  const [resultado, setResultado] = useState(null);
  const [erro, setErro] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const historico = useCarregamento(() => api.listarImportacoes(), []);

  function escolher(evento) {
    const escolhido = evento.target.files?.[0] ?? null;
    setErro(null);
    if (escolhido && escolhido.size > TAMANHO_MAXIMO) {
      setErro('O arquivo passa de 5 MB. Divida a planilha e importe em partes.');
      setArquivo(null);
      return;
    }
    setArquivo(escolhido);
  }

  async function verPrevia() {
    setErro(null);
    setEnviando(true);
    try {
      const resposta = await api.previewImportacao(arquivo);
      setPrevia(resposta);
      setMapeamento(Object.fromEntries(resposta.campos.map((c) => [c.campo, resposta.mapeamento_sugerido[c.campo] ?? ''])));
      setPasso(2);
    } catch (falha) {
      setErro(falha.message);
    } finally {
      setEnviando(false);
    }
  }

  async function importar() {
    setErro(null);
    setEnviando(true);
    try {
      const enviado = Object.fromEntries(Object.entries(mapeamento).map(([campo, coluna]) => [campo, coluna || null]));
      setResultado(await api.importar(arquivo, enviado));
      setPasso(3);
      historico.recarregar();
    } catch (falha) {
      setErro(falha.message);
    } finally {
      setEnviando(false);
    }
  }

  function recomecar() {
    setPasso(1);
    setArquivo(null);
    setPrevia(null);
    setResultado(null);
    setErro(null);
  }

  const usadas = Object.values(mapeamento).filter(Boolean);
  const repetidas = usadas.filter((c, i) => usadas.indexOf(c) !== i);
  const faltaObrigatorio = previa?.campos.filter((c) => c.obrigatorio && !mapeamento[c.campo]) ?? [];
  const naoMapeadas = previa?.colunas.filter((c) => !usadas.includes(c)) ?? [];

  return (
    <>
      <CabecalhoPagina titulo="Importar planilha" descricao="Leads que já existem (mesmo CNPJ) são atualizados. Células vazias não apagam o que já estava salvo." />
      <Passos atual={passo} />
      {erro && <Aviso tipo="erro" className="mb-4">{erro}</Aviso>}

      {passo === 1 && (
        <Cartao className="flex flex-col gap-5 p-6">
          <label htmlFor="arquivo" className="flex cursor-pointer flex-col items-center justify-center gap-2.5 rounded-xl border-2 border-dashed border-borda-forte bg-superficie-2 px-6 py-10 text-center">
            <span className="text-[15px] font-semibold">{arquivo ? arquivo.name : 'Clique para escolher a planilha'}</span>
            <span className="text-[13px] text-texto-2">.xlsx ou .csv · até 5 MB e 20.000 linhas · só a primeira aba é lida</span>
            <input id="arquivo" type="file" accept=".xlsx,.csv" className="sr-only" onChange={escolher} />
          </label>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[13px] text-texto-2">Nada é gravado nesta etapa. Na próxima, você confere de qual coluna vem cada informação.</p>
            <Botao variante="primario" disabled={!arquivo || enviando} onClick={verPrevia}>{enviando ? 'Lendo…' : 'Enviar e ver prévia'}</Botao>
          </div>
        </Cartao>
      )}

      {passo === 2 && previa && (
        <Cartao className="flex flex-col gap-5 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="text-base font-semibold">De qual coluna vem cada informação?</h2><p className="text-[13px] text-texto-2">{previa.nome_arquivo} · {previa.total_linhas} linhas · {previa.colunas.length} colunas. Já sugerimos pelo nome dos cabeçalhos.</p></div>
            <Botao onClick={recomecar}>Trocar arquivo</Botao>
          </div>
          {faltaObrigatorio.length > 0 && <Aviso tipo="aviso">Mapeie os campos obrigatórios: {faltaObrigatorio.map((c) => c.rotulo).join(' e ')}.</Aviso>}
          {repetidas.length > 0 && <Aviso tipo="aviso">Cada coluna só pode servir a um campo: “{[...new Set(repetidas)].join('”, “')}” está em mais de um.</Aviso>}
          {naoMapeadas.length > 0 && faltaObrigatorio.length === 0 && <Aviso tipo="ok">Colunas fora do modelo vão para “Outras colunas”: {naoMapeadas.join(', ')}.</Aviso>}
          <div className="overflow-x-auto">
            <div className="min-w-[640px]">
              <div className="grid grid-cols-[minmax(180px,1fr)_minmax(220px,1.2fr)_minmax(180px,1fr)] gap-4 py-2 text-xs font-semibold text-texto-2"><span>Campo do sistema</span><span>Coluna da planilha</span><span>Exemplo (1ª linha)</span></div>
              {previa.campos.map((c) => (
                <div key={c.campo} className="grid grid-cols-[minmax(180px,1fr)_minmax(220px,1.2fr)_minmax(180px,1fr)] items-center gap-4 border-b border-divisor py-2.5 text-[13px]">
                  <label htmlFor={`m-${c.campo}`} className="font-medium">{c.rotulo}{c.obrigatorio && <span className="ml-1 font-semibold text-perigo" aria-label="obrigatório">*</span>}</label>
                  <select id={`m-${c.campo}`} value={mapeamento[c.campo] ?? ''} onChange={(e) => setMapeamento({ ...mapeamento, [c.campo]: e.target.value })} className="min-h-10 rounded-lg border border-borda-forte bg-superficie px-3 text-texto">
                    <option value="">— Não importar —</option>
                    {previa.colunas.map((coluna) => <option key={coluna} value={coluna}>{coluna}</option>)}
                  </select>
                  <span className={mapeamento[c.campo] && previa.amostra[0]?.[mapeamento[c.campo]] ? '' : 'text-texto-3 italic'}>{mapeamento[c.campo] ? (previa.amostra[0]?.[mapeamento[c.campo]] || 'vazio') : '—'}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2.5">
            <h3 className="text-sm font-semibold">Amostra das primeiras linhas</h3>
            <div className="overflow-x-auto rounded-[10px] border border-borda">
              <table className="w-full border-collapse text-xs">
                <thead><tr>{previa.colunas.map((c) => <th key={c} className="border-b border-borda bg-superficie-2 px-2.5 py-2 text-left font-semibold whitespace-nowrap text-texto-2">{c}</th>)}</tr></thead>
                <tbody>{previa.amostra.map((linha, i) => <tr key={i}>{previa.colunas.map((c) => <td key={c} className="border-b border-divisor px-2.5 py-2 whitespace-nowrap">{linha[c] || <span className="text-texto-3 italic">vazio</span>}</td>)}</tr>)}</tbody>
              </table>
            </div>
          </div>
          <div className="flex flex-wrap justify-between gap-2">
            <Botao onClick={recomecar}>Voltar</Botao>
            <Botao variante="primario" disabled={enviando || faltaObrigatorio.length > 0 || repetidas.length > 0} onClick={importar}>{enviando ? 'Importando…' : `Importar ${previa.total_linhas} linhas`}</Botao>
          </div>
        </Cartao>
      )}

      {passo === 3 && resultado && (
        <div className="flex flex-col gap-4">
          <Cartao className="flex flex-col gap-5 p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><h2 className="text-base font-semibold">{resultado.status === 'concluida' ? 'Importação concluída' : 'A importação parou no meio'}</h2><p className="text-[13px] text-texto-2">{resultado.nome_arquivo} · o potencial dos leads importados já foi recalculado.</p></div>
              <div className="flex gap-2"><Botao onClick={recomecar}>Nova importação</Botao><Link to="/leads" className={classesBotao({ variante: 'primario' })}>Ver leads</Link></div>
            </div>
            {resultado.status === 'falhou' && <Aviso tipo="erro">Um lote falhou. As linhas anteriores ficaram gravadas; importe o arquivo de novo para completar (é seguro repetir).</Aviso>}
            <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
              {[['Linhas na planilha', resultado.total_linhas], ['Inseridos', resultado.inseridos], ['Atualizados', resultado.atualizados], ['Ignorados', resultado.ignorados]].map(([rotulo, n]) => (
                <div key={rotulo} className="rounded-[10px] border border-borda px-4 py-3.5"><span className="text-xs font-medium text-texto-2">{rotulo}</span><div className="text-[26px] font-bold">{n}</div></div>
              ))}
            </div>
            {resultado.erros?.length > 0 && (
              <div className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold">Linhas ignoradas</h3>
                <div className="max-h-80 overflow-y-auto rounded-[10px] border border-borda">
                  {resultado.erros.map((e, i) => <div key={i} className="grid grid-cols-[80px_1fr] gap-3 border-b border-divisor px-4 py-2.5 text-[13px] last:border-b-0"><span className="font-mono">{e.linha ?? '—'}</span><span>{e.motivo}</span></div>)}
                </div>
              </div>
            )}
          </Cartao>
          <Enriquecimento />
        </div>
      )}

      <Cartao className="mt-4 overflow-hidden">
        <h2 className="px-5 pt-4.5 pb-3 text-base font-semibold">Histórico de importações</h2>
        {historico.erro && <div className="px-5 pb-4"><ErroCarregamento erro={historico.erro} aoTentar={historico.recarregar} /></div>}
        <div className="overflow-x-auto">
          <div className="min-w-[760px]">
            <div className="grid grid-cols-[150px_minmax(200px,1.5fr)_70px_80px_90px_80px_100px] gap-3 border-b border-borda bg-superficie-2 px-5 py-2.5 text-xs font-semibold text-texto-2"><span>Data</span><span>Arquivo</span><span>Linhas</span><span>Inseridos</span><span>Atualizados</span><span>Ignorados</span><span>Status</span></div>
            {(historico.dados ?? []).map((imp) => (
              <div key={imp.id} className="grid grid-cols-[150px_minmax(200px,1.5fr)_70px_80px_90px_80px_100px] gap-3 border-b border-divisor px-5 py-2.5 text-[13px] last:border-b-0">
                <span>{new Date(imp.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                <span className="font-medium">{imp.nome_arquivo}</span><span>{imp.total_linhas}</span><span>{imp.inseridos}</span><span>{imp.atualizados}</span><span>{imp.ignorados}</span>
                <span><span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${imp.status === 'concluida' ? 'bg-ok text-ok-texto' : imp.status === 'falhou' ? 'bg-perigo-suave text-perigo' : 'bg-hover text-texto-2'}`}>{imp.status === 'concluida' ? 'Concluída' : imp.status === 'falhou' ? 'Falhou' : 'Processando'}</span></span>
              </div>
            ))}
            {historico.dados?.length === 0 && <p className="px-5 py-5 text-texto-2">Nenhuma importação ainda.</p>}
          </div>
        </div>
      </Cartao>
    </>
  );
}
