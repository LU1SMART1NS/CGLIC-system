import { describe, expect, it } from 'vitest';
import { pendenciasDoMenu } from '../pendenciasDoMenu';

const extras = { contratosAta: null, itensAAlocar: null, atasSemGestor: null, gestorDiferente: null };

describe('pendenciasDoMenu: Ajustes', () => {
  it('UASGs a confirmar abrem Grupos das UASGs na aba "A confirmar"', () => {
    const r = pendenciasDoMenu({ empenhos: null, financeiro: null, extras, gruposUasgs: 3 });
    expect(r.configuracoes).toEqual({ contagem: 3, destino: '/admin/grupos-uasgs?situacao=A_CONFIRMAR' });
  });
  it('sem UASG a confirmar (ou sem a contagem), Ajustes fica sem número', () => {
    expect(pendenciasDoMenu({ empenhos: null, financeiro: null, extras, gruposUasgs: 0 }).configuracoes).toBeUndefined();
    expect(pendenciasDoMenu({ empenhos: null, financeiro: null, extras, gruposUasgs: null }).configuracoes).toBeUndefined();
  });
});
