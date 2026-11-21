import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import { LIMITE_LINHAS, lerPlanilha } from '../src/utils/planilha.js';

function erroDe(funcao) {
  try {
    funcao();
  } catch (erro) {
    return erro;
  }
  throw new Error('Era esperado um erro');
}

function xlsx(linhas, ajustar = () => {}) {
  const aba = XLSX.utils.aoa_to_sheet(linhas);
  ajustar(aba);
  const pasta = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(pasta, aba, 'Leads');
  return XLSX.write(pasta, { type: 'buffer', bookType: 'xlsx' });
}

describe('lerPlanilha com CSV', () => {
  it('detecta ponto e vírgula e mantém tudo como texto (zeros, vírgula decimal, %)', () => {
    const csv = 'CNPJ;Nome do Lead;Nota\n01222333000181;"Padaria; Centro";7,5\n12ABC34501DE35;Mercado;75%\n';
    expect(lerPlanilha(Buffer.from(csv), 'leads.csv')).toEqual({
      colunas: ['CNPJ', 'Nome do Lead', 'Nota'],
      linhas: [
        { numero: 2, valores: ['01222333000181', 'Padaria; Centro', '7,5'] },
        { numero: 3, valores: ['12ABC34501DE35', 'Mercado', '75%'] },
      ],
    });
  });

  it('lê CSV em Windows-1252 (Excel em português) sem estragar acentos', () => {
    const csv = Buffer.from('Nome do Lead,Cidade\nPadaria São João,Itajubá\n', 'latin1');
    const { colunas, linhas } = lerPlanilha(csv, 'leads.CSV');
    expect(colunas).toEqual(['Nome do Lead', 'Cidade']);
    expect(linhas[0].valores).toEqual(['Padaria São João', 'Itajubá']);
  });

  it('lê CSV em UTF-8 com BOM', () => {
    const csv = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('Ação,Nº\nsim,1\n')]);
    expect(lerPlanilha(csv, 'a.csv').colunas).toEqual(['Ação', 'Nº']);
  });

  it('ignora linhas vazias antes do cabeçalho e entre os dados, mantendo o número da linha', () => {
    const csv = ',\nCNPJ,Nome\n,\n111,A\n';
    const { colunas, linhas } = lerPlanilha(Buffer.from(csv), 'a.csv');
    expect(colunas).toEqual(['CNPJ', 'Nome']);
    expect(linhas).toEqual([{ numero: 4, valores: ['111', 'A'] }]);
  });

  it('dá nome a cabeçalhos vazios e diferencia repetidos', () => {
    const { colunas } = lerPlanilha(Buffer.from('Obs,,obs,Obs\n1,2,3,4\n'), 'a.csv');
    expect(colunas).toEqual(['Obs', 'Coluna B', 'obs (2)', 'Obs (3)']);
  });

  it('recusa planilha sem dados', () => {
    expect(erroDe(() => lerPlanilha(Buffer.from('CNPJ,Nome\n'), 'a.csv')).message).toContain('não tem linhas');
    expect(erroDe(() => lerPlanilha(Buffer.from(''), 'a.csv')).status).toBe(400);
  });

  it(`recusa mais de ${LIMITE_LINHAS} linhas`, () => {
    const csv = `CNPJ\n${'1\n'.repeat(LIMITE_LINHAS + 1)}`;
    expect(erroDe(() => lerPlanilha(Buffer.from(csv), 'a.csv')).message).toContain('mais de 20.000 linhas');
  });

  it(`aceita exatamente ${LIMITE_LINHAS} linhas`, () => {
    const csv = `CNPJ\n${'1\n'.repeat(LIMITE_LINHAS)}`;
    expect(lerPlanilha(Buffer.from(csv), 'a.csv').linhas).toHaveLength(LIMITE_LINHAS);
  });
});

describe('lerPlanilha com XLSX', () => {
  it('lê números, porcentagens formatadas e datas', () => {
    const arquivo = xlsx(
      [
        ['CNPJ', 'ICP', 'Desde', 'Nome'],
        [1222333000181, 0.75, new Date(2024, 0, 15), '  Padaria  '],
      ],
      (aba) => {
        aba.B2.z = '0%';
      },
    );
    const { colunas, linhas } = lerPlanilha(arquivo, 'leads.xlsx');
    expect(colunas).toEqual(['CNPJ', 'ICP', 'Desde', 'Nome']);
    expect(linhas[0].valores).toEqual([1222333000181, '75%', '2024-01-15', 'Padaria']);
  });

  it('recusa arquivo .xlsx que não é xlsx', () => {
    expect(erroDe(() => lerPlanilha(Buffer.from('CNPJ,Nome'), 'leads.xlsx')).message).toBe('Arquivo .xlsx inválido');
  });

  it('recusa xlsx corrompido com mensagem amigável', () => {
    const erro = erroDe(() => lerPlanilha(Buffer.from('PK\u0003\u0004lixo'), 'leads.xlsx'));
    expect(erro.status).toBe(400);
  });

  it('recusa outros formatos', () => {
    expect(erroDe(() => lerPlanilha(Buffer.from('x'), 'leads.xls')).message).toContain('.xlsx ou .csv');
    expect(erroDe(() => lerPlanilha(Buffer.from('x'), 'leads.pdf')).status).toBe(400);
  });
});
