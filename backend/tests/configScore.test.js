import { describe, expect, it } from 'vitest';
import { AVALIACAO_PADRAO, CONFIG_SCORE_PADRAO, mesclarConfigScore, validarConfigScore } from '../src/utils/configScore.js';

function mensagemDeErro(config) {
  try {
    validarConfigScore(config);
  } catch (erro) {
    expect(erro.status).toBe(400);
    return erro.message;
  }
  throw new Error('Era esperado um erro');
}

const pergunta = (extra = {}) => ({
  id: 'teste',
  bloco: 'qualificacao',
  texto: 'Pergunta de teste?',
  peso: 10,
  opcoes: [{ id: 'sim', rotulo: 'Sim', pontos: 100 }, { id: 'nao', rotulo: 'Não', pontos: 0 }],
  ...extra,
});

describe('mesclarConfigScore', () => {
  it('sem configuração, devolve o padrão (cópia, não o objeto congelado)', () => {
    const config = mesclarConfigScore({});
    expect(config).toEqual(CONFIG_SCORE_PADRAO);
    config.valor.pesos.porte = 0;
    expect(CONFIG_SCORE_PADRAO.valor.pesos.porte).toBe(45);
  });

  it('mescla pesos e reduções chave a chave e substitui tabelas e listas inteiras', () => {
    const config = mesclarConfigScore({
      valor: { pesos: { porte: 50 }, porte: { DEMAIS: 90 } },
      esforco: { ufs_atendidas: ['SP'], reducao_canais: { email_decisor: 80 } },
      perfil_ideal: { pesos: { setor: 70 }, setores: ['6201501'] },
      avaliacao: { perguntas: [pergunta()] },
    });
    expect(config.valor.pesos).toEqual({ porte: 50, capital_social: 40, idade: 15 });
    expect(config.valor.porte).toEqual({ DEMAIS: 90 });
    expect(config.esforco.contato_decisor).toBe(35);
    expect(config.esforco.reducao_canais).toEqual({ telefone_decisor: 100, email_decisor: 80, linkedin_decisor: 40, contato_empresa: 20 });
    expect(config.perfil_ideal).toMatchObject({ pesos: { setor: 70, porte: 30, idade: 20 }, setores: ['6201501'], portes: [] });
    expect(config.avaliacao.perguntas).toHaveLength(1);
  });

  it('lê pelo nome novo as chaves anteriores à revisão 7', () => {
    const config = mesclarConfigScore({
      valor: { cnaes_prioritarios: ['6201501'], pesos: { cnae: 10, porte: 50 } },
      esforco: { sem_numero_decisor: 40 },
    });
    expect(config.perfil_ideal.setores).toEqual(['6201501']);
    expect(config.valor).not.toHaveProperty('cnaes_prioritarios');
    expect(config.valor.pesos).toEqual({ porte: 50, capital_social: 40, idade: 15 });
    expect(config.esforco.contato_decisor).toBe(40);
    expect(config.esforco).not.toHaveProperty('sem_numero_decisor');
  });

  it('o modelo padrão de avaliação tem os três blocos', () => {
    expect(new Set(AVALIACAO_PADRAO.map((p) => p.bloco))).toEqual(new Set(['qualificacao', 'midias', 'relacionamento']));
  });
});

describe('validarConfigScore', () => {
  it('aceita a configuração padrão completa', () => {
    expect(validarConfigScore(structuredClone(CONFIG_SCORE_PADRAO))).toEqual(CONFIG_SCORE_PADRAO);
  });

  it('aceita objeto vazio (tudo no padrão)', () => {
    expect(validarConfigScore({})).toEqual({});
  });

  it('normaliza CNAEs, UFs, portes, letras e textos', () => {
    const config = validarConfigScore({
      valor: { porte: { ' micro  empresa ': 30, DEMAIS: 100 } },
      perfil_ideal: { setores: ['6201-5/01', '6201501'], portes: [' micro empresa'] },
      esforco: { ufs_atendidas: ['sp', ' RJ '] },
      equivalencia_letras: { a: 100, b: 50 },
      motivos_descarte: ['  Sem   verba ', 'Outro'],
      financeiro: { ticket_por_porte: { demais: 5000 } },
    });
    expect(config.perfil_ideal.setores).toEqual(['6201501']);
    expect(config.perfil_ideal.portes).toEqual(['MICRO EMPRESA']);
    expect(config.valor.porte).toEqual({ 'MICRO EMPRESA': 30, DEMAIS: 100 });
    expect(config.esforco.ufs_atendidas).toEqual(['SP', 'RJ']);
    expect(config.equivalencia_letras).toEqual({ A: 100, B: 50 });
    expect(config.motivos_descarte).toEqual(['Sem verba', 'Outro']);
    expect(config.financeiro.ticket_por_porte).toEqual({ DEMAIS: 5000 });
  });

  it('aceita um modelo de avaliação próprio e opção "não sei" com pontos nulos', () => {
    const config = validarConfigScore({
      avaliacao: { perguntas: [pergunta({ opcoes: [{ id: 'sim', rotulo: 'Sim', pontos: 100 }, { id: 'nao_sei', rotulo: 'Não sei', pontos: null }] })] },
    });
    expect(config.avaliacao.perguntas[0].opcoes[1].pontos).toBeNull();
  });

  it.each([
    [null, 'deve ser um objeto'],
    [[], 'deve ser um objeto'],
    [{ pesoss: {} }, 'chave desconhecida "pesoss"'],
    [{ toString: 1 }, 'chave desconhecida "toString"'],
    [{ valor: { pesos: { porte: 120 } } }, 'entre 0 e 100'],
    [{ valor: { pesos: { porte: '40' } } }, 'entre 0 e 100'],
    [{ valor: { pesos: { cnae: 10 } } }, 'chave desconhecida "cnae"'],
    [{ valor: { cnaes_prioritarios: ['6201501'] } }, 'chave desconhecida "cnaes_prioritarios"'],
    [{ valor: { pesos: { porte: 0, capital_social: 0, idade: 0 } } }, 'soma dos pesos'],
    [{ probabilidade: { pesos: { icp: 0, qualificacao: 0, midias_sociais: 0 } } }, 'soma dos pesos'],
    [{ valor: { capital_social_faixas: [[100, 10], [50, 20], [null, 30]] } }, 'ordem crescente'],
    [{ valor: { idade_faixas: [[1, 20], [3, 40]] } }, 'limite null'],
    [{ valor: { idade_faixas: [] } }, '1 a 20 faixas'],
    [{ perfil_ideal: { setores: ['123'] } }, 'CNAE inválido'],
    [{ perfil_ideal: { portes: ['GIGANTE'] } }, 'não está na tabela valor.porte'],
    [{ perfil_ideal: { idade_minima: 0 } }, 'maior que 0'],
    [{ perfil_ideal: { pesos: { setor: 0, porte: 0, idade: 0 } } }, 'soma dos pesos'],
    [{ valor: { porte: {} } }, 'não pode ficar vazio'],
    [{ valor: { porte: { micro: 10, MICRO: 20 } } }, 'repetido'],
    [{ esforco: { ufs_atendidas: ['XX'] } }, 'UF inválida'],
    [{ esforco: { ufs_atendidas: 'SP' } }, 'lista'],
    [{ esforco: { sem_numero_decisor: 35 } }, 'chave desconhecida "sem_numero_decisor"'],
    [{ esforco: { reducao_canais: { fax: 10 } } }, 'chave desconhecida "fax"'],
    [{ esforco: { tentativas: { toleradas: 2, pontos_por_tentativa: 5 } } }, 'falta "maximo"'],
    [{ esforco: { tentativas: { toleradas: 1.5, pontos_por_tentativa: 5, maximo: 30 } } }, 'inteiro'],
    [{ avaliacao: { perguntas: [pergunta({ id: 'Com Espaço' })] } }, 'letras minúsculas'],
    [{ avaliacao: { perguntas: [pergunta({ bloco: 'outro' })] } }, 'deve ser um de'],
    [{ avaliacao: { perguntas: [pergunta(), pergunta()] } }, 'repetida'],
    [{ avaliacao: { perguntas: [pergunta({ opcoes: [{ id: 'sim', rotulo: 'Sim', pontos: 100 }] })] } }, 'de 2 a 8 opções'],
    [{ avaliacao: { perguntas: [pergunta({ opcoes: [{ id: 'a', rotulo: 'A', pontos: 1 }, { id: 'a', rotulo: 'B', pontos: 2 }] })] } }, 'repetida'],
    [{ avaliacao: { perguntas: [pergunta({ peso: 0 })] } }, 'soma dos pesos do bloco'],
    [{ avaliacao: { perguntas: [pergunta({ texto: '' })] } }, '1 a 200'],
    [{ avaliacao: { perguntas: Array.from({ length: 31 }, (_, i) => pergunta({ id: `p${i}` })) } }, 'no máximo 30'],
    [{ financeiro: { ticket_por_porte: { DEMAIS: -1 } } }, 'maior ou igual a 0'],
    [{ financeiro: { ticket_por_porte: { GIGANTE: 1 } } }, 'não está na tabela valor.porte'],
    [{ financeiro: { horas_esforco_zero: 10, horas_esforco_maximo: 5 } }, 'maior ou igual'],
    [{ prioridade: { dias_espera: -1 } }, 'inteiro de 0 a 365'],
    [{ reconsulta_dias: 5000 }, 'inteiro de 0 a 3650'],
    [{ motivos_descarte: [] }, 'de 1 a 20'],
    [{ motivos_descarte: ['x'.repeat(61)] }, 'de 1 a 60'],
    [{ faixas: { alta: 40, media: 40 } }, '"alta" deve ser maior que "media"'],
    [{ faixas: { media: 80 } }, '"alta" deve ser maior que "media"'],
    [{ equivalencia_letras: { AB: 10 } }, 'não é uma letra'],
    [{ situacao_inativa_limite: -1 }, 'entre 0 e 100'],
  ])('recusa %j', (config, trecho) => {
    expect(mensagemDeErro(config)).toContain(trecho);
  });
});
