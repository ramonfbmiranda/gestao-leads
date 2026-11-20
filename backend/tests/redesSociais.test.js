import { describe, expect, it } from 'vitest';
import { detectarPlataforma, extrairRedesSociais, normalizarUrl } from '../src/utils/redesSociais.js';

describe('normalizarUrl', () => {
  it('padroniza variações do mesmo endereço', () => {
    const esperado = 'https://instagram.com/empresa';
    expect(normalizarUrl('instagram.com/empresa')).toBe(esperado);
    expect(normalizarUrl('http://www.Instagram.com/empresa/')).toBe(esperado);
    expect(normalizarUrl('https://instagram.com/empresa#topo')).toBe(esperado);
    expect(normalizarUrl('(instagram.com/empresa).')).toBe(esperado);
  });

  it('mantém caminho e parâmetros', () => {
    expect(normalizarUrl('linkedin.com/company/x?trk=1')).toBe('https://linkedin.com/company/x?trk=1');
    expect(normalizarUrl('www.empresa.com.br')).toBe('https://empresa.com.br');
  });

  it.each([['@empresa'], ['contato@empresa.com'], ['(11) 99999-9999'], ['4.5'], ['Instagram'], ['ftp://x.com']])(
    'recusa %j',
    (texto) => {
      expect(normalizarUrl(texto)).toBeNull();
    },
  );
});

describe('detectarPlataforma', () => {
  it.each([
    ['instagram.com', 'instagram'],
    ['m.facebook.com', 'facebook'],
    ['br.linkedin.com', 'linkedin'],
    ['youtube.com', 'outra'],
    ['empresa.com.br', 'site'],
    ['notinstagram.com', 'site'],
  ])('%s → %s', (host, plataforma) => {
    expect(detectarPlataforma(host)).toBe(plataforma);
  });
});

describe('extrairRedesSociais', () => {
  it('separa por vírgula, ponto e vírgula, barra vertical, espaço e quebra de linha', () => {
    const texto = 'instagram.com/empresa, facebook.com/empresa; empresa.com.br | wa.me/5511999999999\nlinkedin.com/company/empresa';
    expect(extrairRedesSociais(texto)).toEqual([
      { plataforma: 'instagram', url: 'https://instagram.com/empresa' },
      { plataforma: 'facebook', url: 'https://facebook.com/empresa' },
      { plataforma: 'site', url: 'https://empresa.com.br' },
      { plataforma: 'outra', url: 'https://wa.me/5511999999999' },
      { plataforma: 'linkedin', url: 'https://linkedin.com/company/empresa' },
    ]);
  });

  it('ignora repetidos e o que não é link', () => {
    const texto = 'Instagram: @empresa instagram.com/empresa www.instagram.com/empresa/ contato@empresa.com';
    expect(extrairRedesSociais(texto)).toEqual([{ plataforma: 'instagram', url: 'https://instagram.com/empresa' }]);
  });

  it('texto vazio ou ausente não gera links', () => {
    expect(extrairRedesSociais('')).toEqual([]);
    expect(extrairRedesSociais(null)).toEqual([]);
    expect(extrairRedesSociais('não tem')).toEqual([]);
  });

  it('limita a quantidade de links', () => {
    const texto = Array.from({ length: 30 }, (_, i) => `site${i}.com.br`).join(' ');
    expect(extrairRedesSociais(texto)).toHaveLength(20);
  });
});
