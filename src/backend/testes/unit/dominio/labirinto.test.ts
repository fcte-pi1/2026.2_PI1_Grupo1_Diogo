import { describe, expect, it } from 'vitest';
import { ehTipoLabirinto } from '../../../src/dominio/index.js';

describe('ehTipoLabirinto', () => {
  it.each(['4x4', '8x4', '12x4'])('aceita %s', (tipo) => {
    expect(ehTipoLabirinto(tipo)).toBe(true);
  });

  it.each(['16x16', '', null, 4])('rejeita %s', (tipo) => {
    expect(ehTipoLabirinto(tipo)).toBe(false);
  });
});
