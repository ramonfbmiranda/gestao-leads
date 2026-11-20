import { describe, expect, it } from 'vitest';
import { ErroHttp } from '../src/utils/erros.js';
import {
  corpoObjeto,
  ehUuid,
  emailValido,
  textoObrigatorio,
  textoOpcional,
  umDe,
} from '../src/utils/validacao.js';

function erroDe(funcao) {
  try {
    funcao();
  } catch (erro) {
    return erro;
  }
  throw new Error('Era esperado um erro');
}

describe('ehUuid', () => {
  it('aceita uuid válido, em maiúsculas ou minúsculas', () => {
    expect(ehUuid('3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b')).toBe(true);
    expect(ehUuid('3F2B8C1E-9A4D-4E6F-8B2A-1C3D5E7F9A0B')).toBe(true);
  });

  it('recusa formatos inválidos', () => {
    expect(ehUuid('123')).toBe(false);
    expect(ehUuid('3f2b8c1e9a4d4e6f8b2a1c3d5e7f9a0b')).toBe(false);
    expect(ehUuid(undefined)).toBe(false);
    expect(ehUuid(42)).toBe(false);
  });
});

describe('corpoObjeto', () => {
  it('aceita objeto', () => {
    expect(corpoObjeto({ a: 1 })).toEqual({ a: 1 });
  });

  it.each([[null], [undefined], [[]], ['texto'], [10]])('recusa %j com 400', (valor) => {
    const erro = erroDe(() => corpoObjeto(valor));
    expect(erro).toBeInstanceOf(ErroHttp);
    expect(erro.status).toBe(400);
  });
});

describe('textoObrigatorio', () => {
  it('remove espaços das pontas', () => {
    expect(textoObrigatorio('  Empresa X  ', 'nome')).toBe('Empresa X');
  });

  it.each([[undefined], [null], [''], ['   '], [123]])('recusa %j', (valor) => {
    const erro = erroDe(() => textoObrigatorio(valor, 'nome'));
    expect(erro.status).toBe(400);
    expect(erro.message).toBe('O campo "nome" é obrigatório');
  });

  it('respeita o tamanho máximo', () => {
    expect(erroDe(() => textoObrigatorio('abcdef', 'nome', { max: 5 })).status).toBe(400);
    expect(textoObrigatorio('abcde', 'nome', { max: 5 })).toBe('abcde');
  });
});

describe('textoOpcional', () => {
  it('converte ausente ou vazio em null', () => {
    expect(textoOpcional(undefined, 'nome')).toBeNull();
    expect(textoOpcional(null, 'nome')).toBeNull();
    expect(textoOpcional('   ', 'nome')).toBeNull();
  });

  it('remove espaços e recusa tipos errados', () => {
    expect(textoOpcional(' Ana ', 'nome')).toBe('Ana');
    expect(erroDe(() => textoOpcional(5, 'nome')).status).toBe(400);
  });
});

describe('emailValido', () => {
  it('normaliza para minúsculas', () => {
    expect(emailValido('  Pessoa@Exemplo.COM ')).toBe('pessoa@exemplo.com');
  });

  it.each([['sem-arroba'], ['a@b'], ['a b@c.com'], [''], [undefined]])('recusa %j', (valor) => {
    expect(erroDe(() => emailValido(valor)).status).toBe(400);
  });
});

describe('umDe', () => {
  it('aceita opção válida e usa o padrão quando ausente', () => {
    expect(umDe('admin', ['admin', 'membro'], 'papel')).toBe('admin');
    expect(umDe(undefined, ['admin', 'membro'], 'papel', { padrao: 'membro' })).toBe('membro');
  });

  it('recusa opção inválida', () => {
    expect(erroDe(() => umDe('dono', ['admin', 'membro'], 'papel')).status).toBe(400);
  });
});
