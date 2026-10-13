import { describe, expect, it } from 'vitest';
import { SeparadorLinhas } from '../../../ponte/separador-linhas.js';

describe('SeparadorLinhas', () => {
  it('devolve linhas completas e guarda a que ficou pela metade', () => {
    const separador = new SeparadorLinhas();
    expect(separador.alimentar('{"a":1}\n{"b"')).toEqual(['{"a":1}']);
    expect(separador.alimentar(':2}\n')).toEqual(['{"b":2}']);
  });

  it('aceita \\r\\n e ignora linhas em branco', () => {
    expect(new SeparadorLinhas().alimentar('{"a":1}\r\n\r\n  \n{"b":2}\n')).toEqual([
      '{"a":1}',
      '{"b":2}',
    ]);
  });

  it('remonta caracteres UTF-8 partidos entre dois pedaços', () => {
    const bytes = new TextEncoder().encode('{"detalhe":"célula"}\n');
    const separador = new SeparadorLinhas();
    expect(separador.alimentar(bytes.slice(0, 14))).toEqual([]);
    expect(separador.alimentar(bytes.slice(14))).toEqual(['{"detalhe":"célula"}']);
  });

  it('descarta a linha que passa do limite e volta ao normal na seguinte', () => {
    const separador = new SeparadorLinhas(10);
    expect(separador.alimentar('x'.repeat(8))).toEqual([]);
    expect(separador.alimentar('x'.repeat(8))).toEqual([]);
    expect(separador.alimentar('resto\n{"a":1}\n')).toEqual(['{"a":1}']);
    expect(separador.linhasDescartadas).toBe(1);
  });

  it('esquece a linha incompleta ao reiniciar', () => {
    const separador = new SeparadorLinhas();
    separador.alimentar('{"pela metade"');
    separador.reiniciar();
    expect(separador.alimentar('{"a":1}\n')).toEqual(['{"a":1}']);
  });
});
