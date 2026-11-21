import { describe, expect, it } from 'vitest';
import {
  converterNota,
  lerNumero,
  montarLeads,
  normalizarCabecalho,
  resumirErros,
  sugerirMapeamento,
  validarMapeamento,
} from '../src/utils/importacao.js';

const LETRAS = { A: 100, B: 75, C: 50, D: 25, E: 0 };
const OPCOES = { escalas: { escala_icp_max: 10, escala_midias_max: 100, escala_nota_max: 100 }, letras: LETRAS };

const COLUNAS_PADRAO = [
  'CNPJ', 'Link - Informações do CNPJ', 'Nome do Lead', 'Nome do Decisor', 'Número do Decisor',
  'Redes Sociais', 'Calculadora - ICP', 'Calculadora - Mídias Sociais', 'Nota final', 'Quem mapeou?',
];

describe('normalizarCabecalho', () => {
  it('remove acentos, pontuação e caixa', () => {
    expect(normalizarCabecalho('  Calculadora - Mídias Sociais ')).toBe('calculadora midias sociais');
    expect(normalizarCabecalho('Quem mapeou?')).toBe('quem mapeou');
  });
});

describe('sugerirMapeamento', () => {
  it('reconhece o modelo padrão da especificação', () => {
    expect(sugerirMapeamento(COLUNAS_PADRAO)).toEqual({
      cnpj: 'CNPJ',
      link_cnpj: 'Link - Informações do CNPJ',
      nome_lead: 'Nome do Lead',
      nome_decisor: 'Nome do Decisor',
      numero_decisor: 'Número do Decisor',
      redes_sociais: 'Redes Sociais',
      calculadora_icp: 'Calculadora - ICP',
      calculadora_midias_sociais: 'Calculadora - Mídias Sociais',
      nota_final: 'Nota final',
      responsavel_id: 'Quem mapeou?',
    });
  });

  it('reconhece sinônimos e deixa null o que não encontra', () => {
    const sugestao = sugerirMapeamento(['Empresa', 'cnpj', 'Telefone', 'Observações']);
    expect(sugestao.nome_lead).toBe('Empresa');
    expect(sugestao.cnpj).toBe('cnpj');
    expect(sugestao.numero_decisor).toBe('Telefone');
    expect(sugestao.nota_final).toBeNull();
  });

  it('não sugere a mesma coluna para dois campos', () => {
    const sugestao = sugerirMapeamento(['Nome']);
    expect(Object.values(sugestao).filter((coluna) => coluna === 'Nome')).toHaveLength(1);
  });
});

describe('validarMapeamento', () => {
  const colunas = ['CNPJ', 'Empresa', 'Nota'];

  it('devolve só os campos mapeados', () => {
    expect(validarMapeamento({ cnpj: 'CNPJ', nome_lead: 'Empresa', nota_final: null, nome_decisor: '' }, colunas)).toEqual({
      cnpj: 'CNPJ',
      nome_lead: 'Empresa',
    });
  });

  it.each([
    [[], 'deve ser um objeto'],
    [{ cnpj: 'CNPJ' }, 'Nome do Lead'],
    [{ nome_lead: 'Empresa' }, 'CNPJ'],
    [{ cnpj: 'CNPJ', nome_lead: 'Inexistente' }, 'não existe na planilha'],
    [{ cnpj: 'CNPJ', nome_lead: 'CNPJ' }, 'foi usada em cnpj e nome_lead'],
    [{ cnpj: 'CNPJ', nome_lead: 'Empresa', score_compensacao: 'Nota' }, 'Campo desconhecido'],
    [{ cnpj: 'CNPJ', nome_lead: 'Empresa', toString: 'Nota' }, 'Campo desconhecido'],
  ])('recusa %j', (mapeamento, trecho) => {
    expect(() => validarMapeamento(mapeamento, colunas)).toThrow(trecho);
  });
});

describe('lerNumero', () => {
  it.each([
    ['7,5', 7.5],
    ['7.5', 7.5],
    ['1.234,5', 1234.5],
    ['1,234.5', 1234.5],
    ['1.234.567', 1234567],
    ['1,234,567', 1234567],
    [' 8 ', 8],
    [',5', 0.5],
  ])('%j → %d', (texto, numero) => {
    expect(lerNumero(texto)).toBe(numero);
  });

  it.each([['alto'], ['7,5 pontos'], [''], ['--1']])('%j não é número', (texto) => {
    expect(lerNumero(texto)).toBeNaN();
  });
});

describe('converterNota', () => {
  it('número dentro da escala', () => {
    expect(converterNota(7.5, 10, LETRAS)).toEqual({ numero: 7.5, original: null });
    expect(converterNota('7,5', 10, LETRAS)).toEqual({ numero: 7.5, original: null });
  });

  it('porcentagem vira fração da escala e guarda o original', () => {
    expect(converterNota('75%', 10, LETRAS)).toEqual({ numero: 7.5, original: '75%' });
    expect(converterNota('82,5%', 100, LETRAS)).toEqual({ numero: 82.5, original: '82,5%' });
  });

  it('letra usa a equivalência configurada (percentual da escala)', () => {
    expect(converterNota('b', 10, LETRAS)).toEqual({ numero: 7.5, original: 'b' });
    expect(converterNota('A', 100, LETRAS)).toEqual({ numero: 100, original: 'A' });
  });

  it.each([
    [15, 10, 'fora da escala (0 a 10)'],
    [-1, 10, 'fora da escala'],
    ['120%', 10, 'fora da escala'],
    ['F', 10, 'sem equivalência'],
    ['alto', 10, 'não é um número'],
  ])('recusa %j na escala %d', (valor, escala, trecho) => {
    expect(() => converterNota(valor, escala, LETRAS)).toThrow(trecho);
  });
});

describe('montarLeads', () => {
  const colunas = ['CNPJ', 'Empresa', 'ICP', 'Quem mapeou?', 'Redes', 'Decisor', 'Cidade', 'originais'];
  const mapeamento = {
    cnpj: 'CNPJ',
    nome_lead: 'Empresa',
    calculadora_icp: 'ICP',
    responsavel_id: 'Quem mapeou?',
    redes_sociais: 'Redes',
    nome_decisor: 'Decisor',
  };
  const linha = (numero, valores) => ({ numero, valores });

  it('monta o lead com conversões, extras e sem campos vazios', () => {
    const { leads, erros, ignorados } = montarLeads(
      {
        colunas,
        linhas: [linha(2, ['12.abc.345/01de-35', 'Padaria', 'B', '  Ana   Souza ', 'instagram.com/padaria', null, 'Campinas', 'x'])],
      },
      mapeamento,
      OPCOES,
    );
    expect(erros).toEqual([]);
    expect(ignorados).toBe(0);
    expect(leads).toEqual([
      {
        cnpj: '12ABC34501DE35',
        nome_lead: 'Padaria',
        redes_sociais: 'instagram.com/padaria',
        calculadora_icp: 7.5,
        responsavel_nome: 'Ana Souza',
        dados_extras: { Cidade: 'Campinas', 'originais (planilha)': 'x' },
        originais: { calculadora_icp: 'B' },
        redes: [{ plataforma: 'instagram', url: 'https://instagram.com/padaria' }],
      },
    ]);
    // Célula vazia não entra (não apaga o valor existente na reimportação).
    expect(leads[0]).not.toHaveProperty('nome_decisor');
  });

  it('CNPJ numérico sem o zero inicial (como o Excel salva) é aceito', () => {
    const { leads } = montarLeads(
      {
        colunas,
        linhas: [
          linha(2, [1234567000195, 'Um zero', null, null, null, null, null, null]),
          linha(3, [123456000149, 'Dois zeros', null, null, null, null, null, null]),
        ],
      },
      mapeamento,
      OPCOES,
    );
    expect(leads.map((lead) => lead.cnpj)).toEqual(['01234567000195', '00123456000149']);
  });

  it('nota numérica limpa o original de uma importação anterior', () => {
    const { leads } = montarLeads({ colunas, linhas: [linha(2, ['11222333000181', 'A', 8, null, null, null, null, null])] }, mapeamento, OPCOES);
    expect(leads[0].originais).toEqual({ calculadora_icp: null });
  });

  it('linhas inválidas viram erro sem derrubar as outras', () => {
    const { leads, erros, ignorados } = montarLeads(
      {
        colunas,
        linhas: [
          linha(2, [null, 'Sem CNPJ', null, null, null, null, null, null]),
          linha(3, ['11222333000180', 'DV errado', null, null, null, null, null, null]),
          linha(4, ['11222333000181', null, null, null, null, null, null, null]),
          linha(5, ['11222333000181', 'ICP alto', 15, null, null, null, null, null]),
          linha(6, ['12ABC34501DE35', 'Válido', null, null, null, null, null, null]),
        ],
      },
      mapeamento,
      OPCOES,
    );
    expect(leads.map((lead) => lead.nome_lead)).toEqual(['Válido']);
    expect(ignorados).toBe(4);
    expect(erros).toEqual([
      { linha: 2, motivo: 'CNPJ vazio' },
      { linha: 3, motivo: 'CNPJ inválido: 11222333000180' },
      { linha: 4, motivo: 'Nome do Lead vazio' },
      { linha: 5, motivo: 'Calculadora - ICP: valor 15 fora da escala (0 a 10)' },
    ]);
  });

  it('CNPJ repetido: a última linha prevalece e as anteriores apontam para ela', () => {
    const { leads, erros, ignorados } = montarLeads(
      {
        colunas,
        linhas: [
          linha(2, ['11222333000181', 'Primeira', null, null, null, null, null, null]),
          linha(3, ['11.222.333/0001-81', 'Segunda', null, null, null, null, null, null]),
          linha(4, ['11222333000181', 'Terceira', null, null, null, null, null, null]),
        ],
      },
      mapeamento,
      OPCOES,
    );
    expect(leads.map((lead) => lead.nome_lead)).toEqual(['Terceira']);
    expect(ignorados).toBe(2);
    expect(erros).toEqual([
      { linha: 2, motivo: 'CNPJ duplicado na planilha (prevalece a linha 4)' },
      { linha: 3, motivo: 'CNPJ duplicado na planilha (prevalece a linha 4)' },
    ]);
  });

  it('texto acima do tamanho máximo vira erro da linha', () => {
    const { erros } = montarLeads(
      { colunas, linhas: [linha(2, ['11222333000181', 'x'.repeat(201), null, null, null, null, null, null])] },
      mapeamento,
      OPCOES,
    );
    expect(erros[0].motivo).toBe('Nome do Lead com mais de 200 caracteres');
  });
});

describe('resumirErros', () => {
  it('limita a lista e informa quantos ficaram de fora', () => {
    const erros = Array.from({ length: 1005 }, (_, i) => ({ linha: i + 2, motivo: 'x' }));
    const resumo = resumirErros(erros);
    expect(resumo).toHaveLength(1001);
    expect(resumo.at(-1)).toEqual({ linha: null, motivo: 'Mais 5 linhas com erro não listadas' });
  });
});
