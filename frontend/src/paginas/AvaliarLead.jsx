// Avaliação do lead (seção 8.8): as perguntas do modelo da organização em
// blocos. O medidor mostra uma prévia a cada resposta; o cálculo oficial
// acontece no backend ao salvar.

import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ErroCarregamento, useCarregamento } from '../componentes/comuns.jsx';
import { MedidorArco, SeloFaixa } from '../componentes/potencial.jsx';
import { Aviso, Botao, Campo, Cartao } from '../componentes/ui.jsx';
import { useOrganizacao } from '../contextos/OrganizacaoContexto.jsx';
import { api } from '../servicos/api.js';
import { formatarNumero } from '../utils/formatos.js';
import { notaDoBloco, simularAvaliacao } from '../utils/potencial.js';

const BLOCOS = [
  ['qualificacao', 'Qualificação', 'Chance real de fechar. Entra na probabilidade.'],
  ['midias', 'Mídias sociais', 'Presença digital. Entra na probabilidade e substitui a nota da planilha.'],
  ['relacionamento', 'Relacionamento', 'Soma pontos ao esforço: quanto mais frio, mais difícil conquistar.'],
];

export function AvaliarLead() {
  const { id } = useParams();
  const navegar = useNavigate();
  const { faixas } = useOrganizacao();
  const carregamento = useCarregamento(async () => {
    const [lead, modelo] = await Promise.all([api.obterLead(id), api.modeloAvaliacao()]);
    return { lead, perguntas: modelo.perguntas };
  }, [id]);
  const [respostas, setRespostas] = useState({});
  const [ticket, setTicket] = useState('');
  const [erro, setErro] = useState(null);
  const [salvando, setSalvando] = useState(false);

  const { lead, perguntas } = carregamento.dados ?? {};
  useEffect(() => {
    if (!lead) return;
    setRespostas(lead.avaliacao?.respostas ?? {});
    setTicket(lead.ticket_estimado !== null && lead.ticket_estimado !== undefined ? String(lead.ticket_estimado) : '');
  }, [lead]);

  const previa = useMemo(() => (lead && perguntas ? simularAvaliacao(lead.score_detalhes, perguntas, respostas) : null), [lead, perguntas, respostas]);

  if (carregamento.erro) return <ErroCarregamento erro={carregamento.erro} aoTentar={carregamento.recarregar} />;
  if (!lead) return <p className="text-texto-2">Carregando…</p>;

  async function salvar() {
    setErro(null);
    const corpo = { respostas: Object.fromEntries(perguntas.map((p) => [p.id, respostas[p.id] ?? null])) };
    const textoTicket = ticket.trim().replace(/\./g, '').replace(',', '.');
    if (textoTicket === '') corpo.ticket_estimado = null;
    else if (Number.isFinite(Number(textoTicket)) && Number(textoTicket) >= 0) corpo.ticket_estimado = Number(textoTicket);
    else return setErro('Informe o ticket como um valor em reais, por exemplo 12000.');
    setSalvando(true);
    try {
      await api.avaliarLead(lead.id, corpo);
      navegar(`/leads/${lead.id}`);
    } catch (falha) {
      setErro(falha.message);
      setSalvando(false);
    }
  }

  const potencialAntes = lead.score_compensacao;
  const diferenca = previa?.compensacao !== null && previa?.compensacao !== undefined && potencialAntes !== null ? previa.compensacao - potencialAntes : null;

  return (
    <>
      <div className="mb-5 flex flex-col gap-1">
        <Link to={`/leads/${lead.id}`} className="text-[13px] no-underline">← {lead.nome_lead}</Link>
        <h1 className="text-2xl font-bold tracking-tight">Avaliar lead</h1>
        <p className="text-texto-2">Responda o que você sabe. “Não sei” não conta como zero: só tira a pergunta da conta.</p>
      </div>
      {erro && <Aviso tipo="erro" className="mb-4">{erro}</Aviso>}

      <div className="flex flex-wrap items-start gap-5">
        <div className="flex min-w-0 flex-[2_1_620px] flex-col gap-4">
          {BLOCOS.map(([bloco, titulo, descricao]) => {
            const doBloco = perguntas.filter((p) => p.bloco === bloco);
            if (doBloco.length === 0) return null;
            const nota = bloco === 'relacionamento' ? null : notaDoBloco(perguntas, respostas, bloco);
            return (
              <Cartao key={bloco} aria-label={titulo}>
                <div className="flex flex-wrap items-baseline justify-between gap-1.5 border-b border-divisor px-5 py-4">
                  <div><h2 className="text-base font-semibold">{titulo}</h2><p className="text-[13px] text-texto-2">{descricao}</p></div>
                  {bloco !== 'relacionamento' && <span className="text-[13px] text-texto-2">nota {formatarNumero(nota)}</span>}
                </div>
                {doBloco.map((pergunta) => (
                  <fieldset key={pergunta.id} className="flex flex-col gap-2.5 border-b border-divisor px-5 py-4 last:border-b-0">
                    <legend className="sr-only">{pergunta.texto}</legend>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold">{pergunta.texto}</span>
                      <span className="rounded-full bg-hover px-2 py-px text-[11px] font-semibold text-texto-2">{bloco === 'relacionamento' ? 'esforço' : `peso ${pergunta.peso}`}</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {pergunta.opcoes.map((opcao) => {
                        const ativo = respostas[pergunta.id] === opcao.id;
                        const pontos = opcao.pontos === null ? '' : bloco === 'relacionamento' ? (opcao.pontos > 0 ? `+${opcao.pontos}` : '0') : String(opcao.pontos);
                        return (
                          <button
                            key={opcao.id}
                            type="button"
                            aria-pressed={ativo}
                            onClick={() => setRespostas({ ...respostas, [pergunta.id]: ativo ? null : opcao.id })}
                            className={`inline-flex min-h-[38px] cursor-pointer items-center gap-2 rounded-full border px-3.5 text-[13px] font-medium ${opcao.pontos === null ? 'border-dashed' : ''} ${
                              ativo ? 'border-tinta bg-tinta text-sobre-tinta' : 'border-borda-forte bg-superficie text-texto hover:border-texto-2'
                            }`}
                          >
                            {opcao.rotulo}{pontos && <span className="text-[11px] opacity-70">{pontos}</span>}
                          </button>
                        );
                      })}
                    </div>
                  </fieldset>
                ))}
              </Cartao>
            );
          })}
        </div>

        <Cartao as="aside" className="flex min-w-[280px] flex-[1_1_320px] flex-col gap-3.5 p-5 lg:sticky lg:top-4" aria-label="Potencial com estas respostas">
          <h2 className="text-xs font-semibold tracking-wider text-texto-2 uppercase">Potencial com estas respostas</h2>
          {previa ? (
            <>
              <div className="self-center">
                <MedidorArco
                  valor={previa.compensacao}
                  faixas={faixas}
                  rotulo="Prévia do potencial"
                  legenda={`antes ${formatarNumero(potencialAntes)}${diferenca !== null && Math.abs(diferenca) >= 0.05 ? ` · ${diferenca > 0 ? '+' : ''}${formatarNumero(diferenca)}` : ''}`}
                />
              </div>
              <div className="self-center"><SeloFaixa valor={previa.compensacao} faixas={faixas} /></div>
              <dl className="text-[13px] [&>div]:flex [&>div]:justify-between [&>div]:border-b [&>div]:border-divisor [&>div]:py-1.5 [&_dt]:text-texto-2">
                <div><dt>Valor (Receita)</dt><dd className="font-semibold">{formatarNumero(previa.valor)}</dd></div>
                <div><dt>Probabilidade</dt><dd className="font-semibold">{formatarNumero(previa.probabilidade)}</dd></div>
                <div><dt>· Qualificação</dt><dd>{formatarNumero(previa.qualificacao)}</dd></div>
                <div><dt>· Mídias</dt><dd>{formatarNumero(previa.midias)}</dd></div>
                <div><dt>Esforço</dt><dd className="font-semibold">{formatarNumero(previa.esforco)}</dd></div>
              </dl>
              <p className="text-xs text-texto-2">Prévia. O número oficial é calculado ao salvar.</p>
            </>
          ) : (
            <p className="text-[13px] text-texto-2">A prévia aparece depois do primeiro cálculo do potencial deste lead. Ao salvar, o potencial é calculado.</p>
          )}
          <Campo id="ticket" rotulo="Ticket estimado deste lead (R$)" inputMode="decimal" value={ticket} onChange={(e) => setTicket(e.target.value)} placeholder="Vazio usa o padrão do porte" ajuda="Entra só na estimativa em reais." />
          <div className="flex gap-2">
            <Link to={`/leads/${lead.id}`} className="inline-flex min-h-10 flex-1 items-center justify-center rounded-lg border border-borda-forte bg-superficie font-medium text-texto no-underline hover:bg-hover">Cancelar</Link>
            <Botao variante="primario" className="flex-1" disabled={salvando} onClick={salvar}>{salvando ? 'Salvando…' : 'Salvar avaliação'}</Botao>
          </div>
        </Cartao>
      </div>
    </>
  );
}
