import { describe, expect, it } from 'vitest';
import { pendenciasDoMenu } from '../pendenciasDoMenu';

const extras = { contratosAta: null, itensAAlocar: null, atasSemGestor: null, gestorDiferente: null };

describe('pendenciasDoMenu: Ajustes', () => {
  it('soma com e sem sugestão e abre Grupos das UASGs na aba "A confirmar"', () => {
    const r = pendenciasDoMenu({ empenhos: null, financeiro: null, extras, gruposUasgs: { aConfirmar: 3, semSugestao: 2 } });
    expect(r.configuracoes).toEqual({ contagem: 5, destino: '/admin/grupos-uasgs?situacao=A_CONFIRMAR' });
  });
  it('só sem sugestão: abre na aba "Sem sugestão"', () => {
    const r = pendenciasDoMenu({ empenhos: null, financeiro: null, extras, gruposUasgs: { aConfirmar: 0, semSugestao: 4 } });
    expect(r.configuracoes).toEqual({ contagem: 4, destino: '/admin/grupos-uasgs?situacao=SEM_SUGESTAO' });
  });
  it('sem UASG a confirmar (ou sem a contagem), Ajustes fica sem número', () => {
    expect(pendenciasDoMenu({ empenhos: null, financeiro: null, extras, gruposUasgs: { aConfirmar: 0, semSugestao: 0 } }).configuracoes).toBeUndefined();
    expect(pendenciasDoMenu({ empenhos: null, financeiro: null, extras, gruposUasgs: null }).configuracoes).toBeUndefined();
  });
});
