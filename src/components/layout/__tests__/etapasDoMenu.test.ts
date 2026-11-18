import { describe, it, expect, beforeEach } from 'vitest';
import { avancarDe, ETAPA_DO_MENU, etapaLiberadaDoMenu, zerarEtapasDoMenu } from '../useTelaCarregada';

describe('etapas dos números do menu', () => {
  beforeEach(() => zerarEtapasDoMenu());

  it('ordem: Financeiro, Vínculos, Emendas e por último a Carteira (as contagens mais pesadas de montar)', () => {
    expect(ETAPA_DO_MENU).toEqual({ financeiro: 0, vinculos: 1, emendas: 2, carteira: 3 });
  });

  it('antes de a tela encher nenhuma etapa está liberada; depois, uma de cada vez', () => {
    expect(etapaLiberadaDoMenu()).toBe(-1);
    avancarDe(-1);
    expect(etapaLiberadaDoMenu()).toBe(0);
    avancarDe(0);
    avancarDe(1);
    expect(etapaLiberadaDoMenu()).toBe(2);
  });

  it('vários hooks pedindo ao mesmo tempo não pulam etapa', () => {
    avancarDe(-1);
    avancarDe(0);
    avancarDe(0);
    avancarDe(0);
    expect(etapaLiberadaDoMenu()).toBe(1);
  });

  it('para na última etapa', () => {
    for (let i = -1; i < 10; i++) avancarDe(i);
    expect(etapaLiberadaDoMenu()).toBe(ETAPA_DO_MENU.carteira);
  });
});
