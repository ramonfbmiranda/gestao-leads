// Painel de potencial (seção 11.3): o potencial médio dos leads em aberto, como
// eles se distribuem, os 10 maiores e, ao lado, o funil, a Receita, se o
// potencial acerta (conversão por faixa) e o que mudou na Receita.
// Gráficos em HTML/SVG próprios, com as cores do medidor; cada marca tem o
// valor no foco e no passar do mouse, e os números também estão em texto.

import { useState } from 'react';
import { Link } from 'react-router';
import { CabecalhoPagina, ErroCarregamento, useCarregamento } from '../componentes/comuns.jsx';
import { IconeImportacao } from '../componentes/Icones.jsx';
import { MedidorArco, MedidorBarra, SeloFaixa, SeloParcial, SeloStatus } from '../componentes/potencial.jsx';
import { Cartao, classesBotao } from '../componentes/ui.jsx';
import { api } from '../servicos/api.js';
import {
  dataCurta,
  faixaDoBloco,
  formatarParte,
  intervaloDaFaixa,
  linhasDeConversao,
  partesDaCarteira,
  rotuloDoBloco,
  textoDaMudanca,
} from '../utils/dashboard.js';
import { formatarCnpj, formatarNumero } from '../utils/formatos.js';

const ROTULO_FAIXA = { alta: 'Alto', media: 'Médio', baixa: 'Baixo', na: 'N/A' };
const FUNDO = { alta: 'bg-pot-alta', media: 'bg-pot-media', baixa: 'bg-pot-baixa', na: 'bg-pot-na' };
const SOBRE = { alta: 'text-sobre-alta', media: 'text-sobre-media', baixa: 'text-sobre-baixa', na: 'text-sobre-na' };
const STATUS = ['novo', 'em_contato', 'qualificado', 'convertido', 'descartado'];
// Hachura do "parcial" (45°, na cor da superfície), sobre a cor da faixa.
const HACHURA = { backgroundImage: 'repeating-linear-gradient(45deg, var(--superficie) 0 1.5px, transparent 1.5px 5px)' };

const plural = (n, um, varios) => `${formatarNumero(n, 0)} ${n === 1 ? um : varios}`;

/** Balão do valor, para marcas com hover e foco. Fica acima da marca. */
function Dica({ visivel, children }) {
  if (!visivel) return null;
  return (
    <span role="presentation" className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 rounded-md border border-borda bg-superficie px-2.5 py-1.5 text-xs whitespace-nowrap text-texto shadow-lg">
      {children}
    </span>
  );
}

function Titulo({ id, titulo, descricao }) {
  return (
    <div className="flex flex-col gap-0.5">
      <h2 id={id} className="text-base font-semibold">{titulo}</h2>
      {descricao && <p className="text-[13px] text-texto-2">{descricao}</p>}
    </div>
  );
}

/** Barra segmentada: um bloco por faixa, largura proporcional, número dentro quando cabe. */
function BarraDaCarteira({ partes }) {
  const [ativo, setAtivo] = useState(null);
  return (
    <div className="flex h-7 gap-0.5" role="group" aria-label="Leads em aberto por faixa de potencial">
      {partes.filter((p) => p.total > 0).map((p) => {
        const texto = `${ROTULO_FAIXA[p.faixa]}: ${plural(p.total, 'lead', 'leads')}, ${formatarParte(p.parte)}`;
        return (
          <span
            key={p.faixa}
            role="img"
            aria-label={texto}
            tabIndex={0}
            onPointerEnter={() => setAtivo(p.faixa)}
            onPointerLeave={() => setAtivo(null)}
            onFocus={() => setAtivo(p.faixa)}
            onBlur={() => setAtivo(null)}
            className={`animar-x relative flex min-w-1 items-center rounded px-2 text-[13px] font-bold ${FUNDO[p.faixa]} ${SOBRE[p.faixa]} ${ativo && ativo !== p.faixa ? 'opacity-60' : ''}`}
            style={{ flex: `${p.total} 1 0` }}
          >
            {p.parte >= 0.08 && formatarParte(p.parte)}
            <Dica visivel={ativo === p.faixa}><b>{plural(p.total, 'lead', 'leads')}</b> <span className="text-texto-2">· {ROTULO_FAIXA[p.faixa]} · {formatarParte(p.parte)}</span></Dica>
          </span>
        );
      })}
    </div>
  );
}

/** Histograma em blocos de 10 pontos; a parte parcial de cada bloco vai hachurada no topo. */
function Distribuicao({ blocos, faixas }) {
  const [ativo, setAtivo] = useState(null);
  const maior = Math.max(1, ...blocos.map((b) => b.total));
  const ALTURA_MAXIMA = 96; // px; sobra espaço acima para o número
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[13px] font-semibold">De 10 em 10 pontos</h3>
        <ul className="flex gap-4 text-xs text-texto-2">
          <li className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-[3px] bg-pot-media" />Completo</li>
          <li className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-[3px] bg-pot-media" style={HACHURA} />Parcial</li>
        </ul>
      </div>
      <div className="grid h-32 grid-cols-10 gap-0.5 border-b border-borda" role="group" aria-label="Distribuição do potencial dos leads em aberto">
        {blocos.map((b) => {
          const faixa = faixaDoBloco(b.de, faixas);
          const completos = b.total - b.parciais;
          const texto = `${rotuloDoBloco(b.de)} pontos: ${plural(b.total, 'lead', 'leads')}${b.parciais ? `, ${b.parciais} parcial${b.parciais === 1 ? '' : 'is'}` : ''}`;
          return (
            <div
              key={b.de}
              role="img"
              aria-label={texto}
              tabIndex={0}
              onPointerEnter={() => setAtivo(b.de)}
              onPointerLeave={() => setAtivo(null)}
              onFocus={() => setAtivo(b.de)}
              onBlur={() => setAtivo(null)}
              className="relative flex h-full flex-col items-center justify-end"
            >
              {b.total > 0 && <span className="mb-1 text-[11px] font-semibold text-texto-2 tabular-nums">{b.total}</span>}
              <div className={`animar-y flex w-full max-w-6 flex-col gap-0.5 ${ativo !== null && ativo !== b.de ? 'opacity-60' : ''}`} style={{ height: b.total === 0 ? 0 : Math.max(3, Math.round((b.total / maior) * ALTURA_MAXIMA)) }}>
                {b.parciais > 0 && <div className={`rounded-t ${FUNDO[faixa]}`} style={{ ...HACHURA, flexGrow: b.parciais }} />}
                {completos > 0 && <div className={`${b.parciais > 0 ? '' : 'rounded-t'} ${FUNDO[faixa]}`} style={{ flexGrow: completos }} />}
              </div>
              <Dica visivel={ativo === b.de}><b>{plural(b.total, 'lead', 'leads')}</b> <span className="text-texto-2">· {rotuloDoBloco(b.de)}{b.parciais ? ` · ${b.parciais} parcial${b.parciais === 1 ? '' : 'is'}` : ''}</span></Dica>
            </div>
          );
        })}
      </div>
      <div className="relative h-4 text-[11px] text-texto-2 tabular-nums" aria-hidden="true">
        {[0, 20, 40, 60, 80, 100].map((n) => (
          <span key={n} className="absolute -translate-x-1/2" style={{ left: `${n}%` }}>{n}</span>
        ))}
      </div>
      <details className="text-[13px]">
        <summary className="cursor-pointer text-texto-2">Ver em tabela</summary>
        <table className="mt-2 w-full max-w-sm text-left">
          <thead className="text-xs text-texto-2"><tr><th className="py-1 font-semibold">Pontos</th><th className="font-semibold">Leads</th><th className="font-semibold">Parciais</th></tr></thead>
          <tbody className="tabular-nums">
            {blocos.map((b) => <tr key={b.de} className="border-t border-divisor"><td className="py-1">{rotuloDoBloco(b.de)}</td><td>{b.total}</td><td>{b.parciais}</td></tr>)}
          </tbody>
        </table>
      </details>
    </div>
  );
}

function Numero({ rotulo, valor, children }) {
  return (
    <div className="flex flex-col gap-1 rounded-[10px] border border-borda px-4 py-3.5">
      <span className="text-xs font-medium text-texto-2">{rotulo}</span>
      <span className="flex items-center gap-2 text-2xl font-bold">{valor}</span>
      <span className="text-xs text-texto-2">{children}</span>
    </div>
  );
}

function BarraSimples({ fracao, classe = 'bg-texto-3', trilho = 'bg-hover', altura = 'h-1.5' }) {
  return (
    <div className={`${altura} rounded-full ${trilho}`} aria-hidden="true">
      <div className={`animar-x ${altura} rounded-full ${classe}`} style={{ width: `${Math.min(100, fracao * 100)}%` }} />
    </div>
  );
}

function Ranking({ top, faixas }) {
  const grade = 'grid grid-cols-[28px_minmax(180px,1.4fr)_minmax(200px,1.3fr)_112px_minmax(100px,0.8fr)] items-center gap-x-3';
  return (
    <Cartao className="min-w-0 flex-[2_1_620px] overflow-hidden" aria-labelledby="titulo-ranking">
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4.5">
        <Titulo id="titulo-ranking" titulo="Os 10 maiores potenciais" descricao="Leads em aberto: retorno esperado diante do esforço para conquistar" />
        <Link to="/leads" className="text-[13px] font-semibold no-underline">Ver lista completa</Link>
      </div>
      {top.length === 0 ? (
        <p className="border-t border-divisor px-5 py-8 text-center text-texto-2">Nenhum lead em aberto com potencial calculado ainda.</p>
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[640px]">
            <div className={`${grade} border-y border-borda bg-superficie-2 px-4 py-2.5 text-xs font-semibold text-texto-2`}>
              <span>#</span><span>Lead</span><span>Potencial</span><span>Status</span><span>Responsável</span>
            </div>
            {top.map((lead, i) => (
              <div key={lead.id} className={`${grade} border-b border-divisor px-4 py-2.5 last:border-b-0`}>
                <span className="font-semibold text-texto-2">{i + 1}</span>
                <span className="flex min-w-0 flex-col">
                  <Link to={`/leads/${lead.id}`} className="truncate font-semibold text-texto no-underline hover:underline">{lead.nome_lead}</Link>
                  <span className="font-mono text-xs text-texto-2">{formatarCnpj(lead.cnpj)}</span>
                </span>
                <MedidorBarra valor={lead.score_compensacao === null ? null : Number(lead.score_compensacao)} parcial={lead.score_parcial} faixas={faixas} />
                <span><SeloStatus status={lead.status} /></span>
                <span className="truncate">{lead.responsavel?.nome ?? <span className="text-texto-2">—</span>}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Cartao>
  );
}

function Funil({ resumo, conversao }) {
  const { total, por_status: porStatus, enriquecimento } = resumo;
  const linhas = linhasDeConversao(conversao?.faixas);
  const motivo = conversao?.motivos?.[0];
  const faltaReceita = total - enriquecimento.concluido;
  return (
    <Cartao className="flex min-w-0 flex-[1_1_300px] flex-col gap-4 px-5 py-4.5" aria-labelledby="titulo-funil">
      <Titulo id="titulo-funil" titulo="Gestão do funil" descricao="Onde cada lead está agora" />
      <ul className="flex flex-col gap-3">
        {STATUS.map((status) => (
          <li key={status} className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <SeloStatus status={status} />
              <span className="font-semibold tabular-nums">{porStatus[status]} <span className="font-normal text-texto-2">· {formatarParte(total ? porStatus[status] / total : 0)}</span></span>
            </div>
            <BarraSimples fracao={total ? porStatus[status] / total : 0} />
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-2 border-t border-divisor pt-3.5">
        <span className="text-[13px] font-semibold">Dados da Receita</span>
        <BarraSimples fracao={total ? enriquecimento.concluido / total : 0} />
        <span className="text-[13px] text-texto-2">
          {enriquecimento.concluido} de {total} com dados
          {enriquecimento.na_fila > 0 && ` · ${enriquecimento.na_fila} na fila`}
          {enriquecimento.sem_resultado > 0 && ` · ${enriquecimento.sem_resultado} sem resultado`}
        </span>
        {faltaReceita > 0 && enriquecimento.na_fila === 0 && <Link to="/leads" className="text-[13px] font-semibold no-underline">Buscar dados da Receita →</Link>}
      </div>

      <div className="flex flex-col gap-2.5 border-t border-divisor pt-3.5">
        <div className="flex flex-col gap-0.5">
          <span className="text-[13px] font-semibold">O potencial acerta?</span>
          <span className="text-xs text-texto-2">Dos leads com desfecho, quantos viraram clientes em cada faixa</span>
        </div>
        {linhas.length === 0 ? (
          <p className="text-[13px] text-texto-2">Ainda sem desfechos. Converta ou descarte leads e aqui aparece se os de potencial alto fecham mais.</p>
        ) : (
          <div className="grid grid-cols-[56px_1fr_auto] items-center gap-x-2.5 gap-y-2 text-[13px]">
            {linhas.map((l) => (
              <div key={l.faixa} className="contents">
                <span className="font-semibold">{ROTULO_FAIXA[l.faixa]}</span>
                <BarraSimples fracao={l.taxa ?? 0} classe={FUNDO[l.faixa]} trilho="bg-pot-trilho" altura="h-2" />
                <span className="text-right tabular-nums"><b>{formatarParte(l.taxa ?? 0)}</b> <span className="text-texto-2">{l.convertidos}/{l.total}</span></span>
              </div>
            ))}
          </div>
        )}
        {motivo && <span className="text-xs text-texto-2">Principal motivo de descarte: {motivo.motivo} ({motivo.total})</span>}
      </div>

      <div className="flex flex-col gap-2 border-t border-divisor pt-3.5">
        <span className="text-[13px] font-semibold">Mudou na Receita</span>
        {resumo.mudancas_receita.length === 0 ? (
          <p className="text-[13px] text-texto-2">Nenhuma mudança de situação ou porte nas últimas consultas.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {resumo.mudancas_receita.map((m) => (
              <li key={m.id} className="flex flex-col">
                <Link to={`/leads/${m.id}`} className="text-[13px] font-semibold text-texto no-underline hover:underline">{m.nome_lead}</Link>
                <span className="text-xs text-texto-2">{(m.mudancas ?? []).map(textoDaMudanca).join(' · ')} · {dataCurta(m.em)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Cartao>
  );
}

export function Painel() {
  const { dados, erro, recarregar } = useCarregamento(async () => {
    const [resumo, conversao] = await Promise.all([api.resumoDashboard(), api.conversao()]);
    return { resumo, conversao };
  }, []);

  const acoes = (
    <>
      <Link to="/importacao" className={classesBotao()}><IconeImportacao tamanho={16} />Importar planilha</Link>
      <Link to="/prioridade" className={classesBotao()}>Quem abordar hoje</Link>
      <Link to="/leads" className={classesBotao({ variante: 'primario' })}>Ver todos os leads →</Link>
    </>
  );
  const cabecalho = <CabecalhoPagina titulo="Potencial dos leads" descricao="Quem vale mais a pena trabalhar agora, e como está o funil." acoes={acoes} />;

  if (erro) return <>{cabecalho}<ErroCarregamento erro={erro} aoTentar={recarregar} /></>;
  if (!dados) return <>{cabecalho}<p className="text-texto-2" role="status">Carregando…</p></>;

  const { resumo, conversao } = dados;
  const { faixas } = resumo;

  if (resumo.total === 0) {
    return (
      <>
        {cabecalho}
        <Cartao className="flex flex-col items-center gap-3 px-6 py-12 text-center">
          <h2 className="text-lg font-semibold">Nenhum lead por aqui ainda</h2>
          <p className="max-w-md text-texto-2">Importe a planilha de prospecção ou cadastre um lead. O potencial de cada um é calculado na hora, e este painel se monta sozinho.</p>
          <Link to="/importacao" className={classesBotao({ variante: 'primario' })}>Importar planilha</Link>
        </Cartao>
      </>
    );
  }

  const partes = partesDaCarteira(resumo.por_faixa);
  const media = resumo.media_potencial === null ? null : Number(resumo.media_potencial);
  const naoAvaliados = resumo.por_faixa.na;

  return (
    <>
      {cabecalho}
      <Cartao className="mb-4 flex flex-col gap-6 p-6" aria-labelledby="titulo-carteira">
        <div className="flex flex-wrap gap-8">
          <div className="flex min-w-60 flex-[0_1_300px] flex-col items-center gap-2.5 text-center">
            <h2 id="titulo-carteira" className="self-stretch text-left text-base font-semibold">Potencial médio da carteira</h2>
            <MedidorArco valor={media} faixas={faixas} rotulo="Potencial médio dos leads em aberto" />
            <SeloFaixa valor={media} faixas={faixas} />
            <p className="text-[13px] text-texto-2">
              Média de {plural(resumo.com_potencial, 'lead em aberto', 'leads em aberto')} com potencial.
              {naoAvaliados > 0 && ` ${naoAvaliados === 1 ? 'O 1 sem dados suficientes (N/A) fica' : `Os ${naoAvaliados} sem dados suficientes (N/A) ficam`} fora da média.`}
            </p>
          </div>

          <div className="flex min-w-0 flex-[1_1_420px] flex-col gap-4">
            <Titulo titulo="Como a carteira se distribui" descricao={`${plural(resumo.em_aberto, 'lead em aberto', 'leads em aberto')} por faixa de potencial (convertidos e descartados ficam de fora)`} />
            {resumo.em_aberto > 0 ? (
              <>
                <BarraDaCarteira partes={partes} />
                <ul className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-x-5 gap-y-2.5 text-[13px]">
                  {partes.map((p) => (
                    <li key={p.faixa} className="flex items-center gap-2">
                      <span className={`h-3 w-3 flex-none rounded-[3px] ${FUNDO[p.faixa]}`} />
                      <span className="font-semibold">{ROTULO_FAIXA[p.faixa]}</span>
                      <span className="text-texto-2">{intervaloDaFaixa(p.faixa, faixas)}</span>
                      <span className="ml-auto font-semibold tabular-nums">{p.total} <span className="font-normal text-texto-2">· {formatarParte(p.parte)}</span></span>
                    </li>
                  ))}
                </ul>
                {resumo.com_potencial > 0 && <Distribuicao blocos={resumo.distribuicao} faixas={faixas} />}
              </>
            ) : (
              <p className="text-[13px] text-texto-2">Todos os leads já tiveram desfecho (convertidos ou descartados).</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
          <Numero rotulo="Potencial parcial" valor={<>{resumo.parciais}{resumo.parciais > 0 && <SeloParcial />}</>}>faltam dados para algum fator</Numero>
          <Numero rotulo="Sem dados da Receita" valor={resumo.total - resumo.enriquecimento.concluido}>
            {resumo.enriquecimento.na_fila > 0 ? `${resumo.enriquecimento.na_fila} na fila agora` : <Link to="/leads" className="font-semibold no-underline">Buscar agora →</Link>}
          </Numero>
          <Numero rotulo="Total de leads" valor={resumo.total}>{resumo.em_aberto} em aberto · {resumo.total - resumo.em_aberto} com desfecho</Numero>
        </div>
      </Cartao>

      <div className="flex flex-wrap items-start gap-4">
        <Ranking top={resumo.top} faixas={faixas} />
        <Funil resumo={resumo} conversao={conversao} />
      </div>
    </>
  );
}
