import { describe, expect, it } from 'vitest';
import {
  MAX_SOCIOS,
  MAX_TENTATIVAS,
  classificarResposta,
  converterDadosCnpj,
  esperaAntesDaProxima,
  mudancasNaReceita,
} from '../src/utils/enriquecimento.js';

// Trecho real da resposta da BrasilAPI (Banco do Brasil, consultado em 2026-11-20).
const BANCO_DO_BRASIL = {
  uf: 'DF',
  cnpj: '00000000000191',
  porte: 'DEMAIS',
  municipio: 'BRASILIA',
  cnae_fiscal: 6422100,
  codigo_porte: 5,
  razao_social: 'BANCO DO BRASIL SA',
  capital_social: 120000000000,
  situacao_cadastral: 2,
  data_inicio_atividade: '1966-08-01',
  descricao_situacao_cadastral: 'ATIVA',
};

describe('converterDadosCnpj', () => {
  it('converte a resposta real nas colunas do lead', () => {
    expect(converterDadosCnpj(BANCO_DO_BRASIL)).toEqual({
      razao_social: 'BANCO DO BRASIL SA',
      porte: 'DEMAIS',
      capital_social: 120000000000,
      cnae_principal: '6422100',
      data_abertura: '1966-08-01',
      cidade: 'BRASILIA',
      uf: 'DF',
      situacao_cadastral: 'ATIVA',
      telefone_receita: null,
      email_receita: null,
      socios: null,
    });
  });

  it('recompõe o zero inicial do CNAE que vem como número', () => {
    expect(converterDadosCnpj({ cnae_fiscal: 111301 }).cnae_principal).toBe('0111301');
    expect(converterDadosCnpj({ cnae_fiscal: '6201-5/01' }).cnae_principal).toBe('6201501');
    expect(converterDadosCnpj({ cnae_fiscal: 123456789 }).cnae_principal).toBeNull();
  });

  it('campo ausente ou fora do formato vira null, nunca um valor inventado', () => {
    expect(converterDadosCnpj({})).toEqual({
      razao_social: null,
      porte: null,
      capital_social: null,
      cnae_principal: null,
      data_abertura: null,
      cidade: null,
      uf: null,
      situacao_cadastral: null,
      telefone_receita: null,
      email_receita: null,
      socios: null,
    });
    const estranho = converterDadosCnpj({
      razao_social: '   ',
      capital_social: -5,
      data_inicio_atividade: '2024-02-30',
      uf: 'Distrito Federal',
      municipio: 42,
    });
    expect(estranho).toMatchObject({ razao_social: null, capital_social: null, data_abertura: null, uf: null, cidade: null });
  });

  it('capital zero é um dado (não N/A) e texto numérico é aceito', () => {
    expect(converterDadosCnpj({ capital_social: 0 }).capital_social).toBe(0);
    expect(converterDadosCnpj({ capital_social: '1500.555' }).capital_social).toBe(1500.56);
    expect(converterDadosCnpj({ capital_social: 1e15 }).capital_social).toBeNull();
  });

  it('situação pelo código quando a descrição vem vazia; porte "NÃO INFORMADO" é mantido', () => {
    expect(converterDadosCnpj({ situacao_cadastral: 8, descricao_situacao_cadastral: null }).situacao_cadastral).toBe('BAIXADA');
    expect(converterDadosCnpj({ situacao_cadastral: 7 }).situacao_cadastral).toBeNull();
    // O score trata o porte sem pontuação como N/A (seção 8.5).
    expect(converterDadosCnpj({ porte: 'NÃO INFORMADO' }).porte).toBe('NÃO INFORMADO');
  });

  it('normaliza espaços e UF em minúsculas', () => {
    expect(converterDadosCnpj({ razao_social: '  Padaria   Pão  ', uf: 'sp' })).toMatchObject({ razao_social: 'Padaria Pão', uf: 'SP' });
  });
});

// Formato da resposta conferido em 2026-11-21 (nomes e documentos fictícios).
const COM_CONTATOS = {
  ddd_telefone_1: '1123851939',
  ddd_telefone_2: '',
  email: '  Contato@Empresa.COM.br ',
  qsa: [
    {
      nome_socio: 'MARIA DA SILVA',
      qualificacao_socio: 'Sócio-Administrador',
      cnpj_cpf_do_socio: '***123456**',
      faixa_etaria: 'Entre 41 a 50 anos',
      data_entrada_sociedade: '2015-03-10',
      codigo_faixa_etaria: 5,
      identificador_de_socio: 2,
      nome_representante_legal: '',
      cpf_representante_legal: '***000000**',
    },
    {
      nome_socio: 'JOAO   PEREIRA ',
      qualificacao_socio: 'Sócio',
      cnpj_cpf_do_socio: '***654321**',
      faixa_etaria: 'Entre 31 a 40 anos',
    },
  ],
};

describe('converterDadosCnpj: contatos e sócios da Receita (seção 9.1)', () => {
  it('telefone e e-mail da empresa e sócios só com nome e qualificação', () => {
    expect(converterDadosCnpj(COM_CONTATOS)).toMatchObject({
      telefone_receita: '1123851939',
      email_receita: 'contato@empresa.com.br',
      socios: [
        { nome: 'MARIA DA SILVA', qualificacao: 'Sócio-Administrador' },
        { nome: 'JOAO PEREIRA', qualificacao: 'Sócio' },
      ],
    });
  });

  it('CPF, faixa etária e os demais campos do quadro societário nunca são gravados (LGPD)', () => {
    const { socios } = converterDadosCnpj(COM_CONTATOS);
    for (const socio of socios) expect(Object.keys(socio)).toEqual(['nome', 'qualificacao']);
    const texto = JSON.stringify(converterDadosCnpj(COM_CONTATOS));
    for (const proibido of ['123456', '654321', '000000', 'faixa', 'Entre 41', 'cpf', 'cnpj_cpf', '2015-03-10']) {
      expect(texto).not.toContain(proibido);
    }
  });

  it('telefone: o segundo só entra se o primeiro vier vazio ou inválido; máscara é removida', () => {
    expect(converterDadosCnpj({ ddd_telefone_1: '', ddd_telefone_2: '1140041234' }).telefone_receita).toBe('1140041234');
    expect(converterDadosCnpj({ ddd_telefone_1: null, ddd_telefone_2: '1140041234' }).telefone_receita).toBe('1140041234');
    expect(converterDadosCnpj({ ddd_telefone_1: '123', ddd_telefone_2: '1140041234' }).telefone_receita).toBe('1140041234');
    expect(converterDadosCnpj({ ddd_telefone_1: '1123851939', ddd_telefone_2: '1140041234' }).telefone_receita).toBe('1123851939');
    expect(converterDadosCnpj({ ddd_telefone_1: '(11) 2385-1939' }).telefone_receita).toBe('1123851939');
  });

  it.each([
    [{ ddd_telefone_1: '', ddd_telefone_2: '' }],
    [{ ddd_telefone_1: '1234567' }],
    [{ ddd_telefone_1: '1234567890123456' }],
    [{ ddd_telefone_1: 'sem telefone' }],
    [{ ddd_telefone_1: { numero: '1123851939' } }],
  ])('telefone vazio ou fora do formato vira null: %j', (dados) => {
    expect(converterDadosCnpj(dados).telefone_receita).toBeNull();
  });

  it.each([
    [null],
    [''],
    ['   '],
    ['sem-arroba.com.br'],
    ['dois@@empresa.com'],
    ['espaco no@meio.com'],
    ['sem@ponto'],
    [42],
    [`${'a'.repeat(190)}@empresa.com.br`],
  ])('e-mail vazio, inválido ou com mais de 200 caracteres vira null: %j', (email) => {
    expect(converterDadosCnpj({ email }).email_receita).toBeNull();
  });

  it('e-mail com exatamente 200 caracteres é aceito', () => {
    const email = `${'a'.repeat(185)}@empresa.com.br`;
    expect(email).toHaveLength(200);
    expect(converterDadosCnpj({ email }).email_receita).toBe(email);
  });

  it('sócios: ignora itens sem nome e devolve null se não sobrar nenhum', () => {
    const qsa = [
      { nome_socio: '', qualificacao_socio: 'Sócio' },
      { nome_socio: '   ' },
      null,
      'texto solto',
      { qualificacao_socio: 'Diretor' },
      { nome_socio: 'ANA SOUZA' },
    ];
    expect(converterDadosCnpj({ qsa }).socios).toEqual([{ nome: 'ANA SOUZA', qualificacao: null }]);
    expect(converterDadosCnpj({ qsa: qsa.slice(0, 5) }).socios).toBeNull();
    expect(converterDadosCnpj({ qsa: [] }).socios).toBeNull();
    expect(converterDadosCnpj({ qsa: 'MARIA' }).socios).toBeNull();
    expect(converterDadosCnpj({ qsa: { nome_socio: 'MARIA' } }).socios).toBeNull();
  });

  it(`sócios: no máximo ${MAX_SOCIOS}, na ordem da Receita`, () => {
    const qsa = Array.from({ length: 30 }, (_, i) => ({ nome_socio: `SOCIO ${i + 1}`, qualificacao_socio: 'Sócio' }));
    qsa.unshift({ nome_socio: '' });
    const { socios } = converterDadosCnpj({ qsa });
    expect(MAX_SOCIOS).toBe(20);
    expect(socios).toHaveLength(20);
    expect(socios[0].nome).toBe('SOCIO 1');
    expect(socios.at(-1).nome).toBe('SOCIO 20');
  });
});

describe('mudancasNaReceita', () => {
  const ANTERIOR = { enriquecido_em: '2026-08-01T12:00:00.000Z', situacao_cadastral: 'ATIVA', porte: 'MICRO EMPRESA' };

  it('registra situação cadastral e porte que mudaram', () => {
    expect(mudancasNaReceita(ANTERIOR, { situacao_cadastral: 'BAIXADA', porte: 'EMPRESA DE PEQUENO PORTE' })).toEqual([
      { campo: 'situacao_cadastral', de: 'ATIVA', para: 'BAIXADA' },
      { campo: 'porte', de: 'MICRO EMPRESA', para: 'EMPRESA DE PEQUENO PORTE' },
    ]);
    expect(mudancasNaReceita(ANTERIOR, { situacao_cadastral: 'ATIVA', porte: 'DEMAIS' })).toEqual([
      { campo: 'porte', de: 'MICRO EMPRESA', para: 'DEMAIS' },
    ]);
  });

  it('sem mudança devolve lista vazia; outros campos não contam', () => {
    expect(mudancasNaReceita(ANTERIOR, { ...ANTERIOR, razao_social: 'OUTRO NOME', cidade: 'CAMPINAS' })).toEqual([]);
  });

  it('lead nunca enriquecido (ou inexistente) não tem mudança', () => {
    expect(mudancasNaReceita({ ...ANTERIOR, enriquecido_em: null }, { situacao_cadastral: 'BAIXADA' })).toEqual([]);
    expect(mudancasNaReceita(null, { situacao_cadastral: 'BAIXADA' })).toEqual([]);
  });

  it('valor ausente em um dos lados não é mudança', () => {
    expect(mudancasNaReceita(ANTERIOR, { situacao_cadastral: null, porte: null })).toEqual([]);
    expect(mudancasNaReceita({ ...ANTERIOR, porte: null }, { situacao_cadastral: 'ATIVA', porte: 'DEMAIS' })).toEqual([]);
  });
});

describe('classificarResposta', () => {
  it.each([
    [200, '00000000000191', 'ok'],
    [404, '00000000000191', 'nao_encontrado'],
    [404, '12ABC34501DE35', 'nao_encontrado'],
    [400, '12ABC34501DE35', 'nao_suportado'],
    [400, '00000000000191', 'erro'],
    [403, '00000000000191', 'transitorio'],
    [429, '00000000000191', 'transitorio'],
    [500, '00000000000191', 'transitorio'],
    [503, '00000000000191', 'transitorio'],
    [405, '00000000000191', 'erro'],
  ])('HTTP %d com CNPJ %s → %s', (status, cnpj, tipo) => {
    expect(classificarResposta(status, cnpj).tipo).toBe(tipo);
  });
});

describe('esperaAntesDaProxima', () => {
  it('cresce a cada tentativa e acaba na última', () => {
    expect(MAX_TENTATIVAS).toBe(3);
    expect(esperaAntesDaProxima(1)).toBe(30_000);
    expect(esperaAntesDaProxima(2)).toBe(120_000);
    expect(esperaAntesDaProxima(3)).toBeNull();
  });
});
