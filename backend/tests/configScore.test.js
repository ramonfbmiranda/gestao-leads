import { describe, expect, it } from 'vitest';
import { CONFIG_SCORE_PADRAO, mesclarConfigScore, validarConfigScore } from '../src/utils/configScore.js';

function mensagemDeErro(config) {
  try {
    validarConfigScore(config);
  } catch (erro) {
    expect(erro.status).toBe(400);
    return erro.message;
  }
  throw new Error('Era esperado um erro');
}

describe('mesclarConfigScore', () => {
  it('sem configuração, devolve o padrão (cópia, não o objeto congelado)', () => {
    const config = mesclarConfigScore({});
    expect(config).toEqual(CONFIG_SCORE_PADRAO);
    config.valor.pesos.porte = 0;
    expect(CONFIG_SCORE_PADRAO.valor.pesos.porte).toBe(40);
  });

  it('mescla pesos chave a chave e substitui tabelas inteiras', () => {
    const config = mesclarConfigScore({
      valor: { pesos: { porte: 50 }, porte: { DEMAIS: 90 } },
      esforco: { ufs_atendidas: ['SP'] },
    });
    expect(config.valor.pesos).toEqual({ porte: 50, capital_social: 35, idade: 15, cnae: 10 });
    expect(config.valor.porte).toEqual({ DEMAIS: 90 });
    expect(config.valor.idade_faixas).toEqual(CONFIG_SCORE_PADRAO.valor.idade_faixas);
    expect(config.esforco.sem_numero_decisor).toBe(35);
    expect(config.esforco.ufs_atendidas).toEqual(['SP']);
  });
});

describe('validarConfigScore', () => {
  it('aceita a configuração padrão completa', () => {
    expect(validarConfigScore(structuredClone(CONFIG_SCORE_PADRAO))).toEqual(CONFIG_SCORE_PADRAO);
  });

  it('aceita objeto vazio (tudo no padrão)', () => {
    expect(validarConfigScore({})).toEqual({});
  });

  it('normaliza CNAEs, UFs, portes e letras', () => {
    const config = validarConfigScore({
      valor: { cnaes_prioritarios: ['6201-5/01', '6201501'], porte: { ' micro  empresa ': 30 } },
      esforco: { ufs_atendidas: ['sp', ' RJ '] },
      equivalencia_letras: { a: 100, b: 50 },
    });
    expect(config.valor.cnaes_prioritarios).toEqual(['6201501']);
    expect(config.valor.porte).toEqual({ 'MICRO EMPRESA': 30 });
    expect(config.esforco.ufs_atendidas).toEqual(['SP', 'RJ']);
    expect(config.equivalencia_letras).toEqual({ A: 100, B: 50 });
  });

  it.each([
    [null, 'deve ser um objeto'],
    [[], 'deve ser um objeto'],
    [{ pesoss: {} }, 'chave desconhecida "pesoss"'],
    [{ toString: 1 }, 'chave desconhecida "toString"'],
    [{ valor: { pesos: { porte: 120 } } }, 'entre 0 e 100'],
    [{ valor: { pesos: { porte: '40' } } }, 'entre 0 e 100'],
    [{ valor: { pesos: { tamanho: 40 } } }, 'chave desconhecida "tamanho"'],
    [{ valor: { pesos: { porte: 0, capital_social: 0, idade: 0, cnae: 0 } } }, 'soma dos pesos'],
    [{ probabilidade: { pesos: { icp: 0, midias_sociais: 0 } } }, 'soma dos pesos'],
    [{ valor: { capital_social_faixas: [[100, 10], [50, 20], [null, 30]] } }, 'ordem crescente'],
    [{ valor: { idade_faixas: [[1, 20], [3, 40]] } }, 'limite null'],
    [{ valor: { idade_faixas: [] } }, '1 a 20 faixas'],
    [{ valor: { cnaes_prioritarios: ['123'] } }, 'CNAE inválido'],
    [{ valor: { porte: {} } }, 'não pode ficar vazio'],
    [{ valor: { porte: { micro: 10, MICRO: 20 } } }, 'repetido'],
    [{ esforco: { ufs_atendidas: ['XX'] } }, 'UF inválida'],
    [{ esforco: { ufs_atendidas: 'SP' } }, 'lista'],
    [{ faixas: { alta: 40, media: 40 } }, '"alta" deve ser maior que "media"'],
    [{ faixas: { media: 80 } }, '"alta" deve ser maior que "media"'],
    [{ equivalencia_letras: { AB: 10 } }, 'não é uma letra'],
    [{ situacao_inativa_limite: -1 }, 'entre 0 e 100'],
  ])('recusa %j', (config, trecho) => {
    expect(mensagemDeErro(config)).toContain(trecho);
  });
});
