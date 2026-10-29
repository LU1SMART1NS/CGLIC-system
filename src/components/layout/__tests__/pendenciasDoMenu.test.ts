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
  it('soma UASGs e beneficiários de emenda; abre primeiro nas UASGs', () => {
    const r = pendenciasDoMenu({
      empenhos: null,
      financeiro: null,
      extras,
      gruposUasgs: { aConfirmar: 0, semSugestao: 1 },
      gruposBeneficiarios: { aConfirmar: 540, semSugestao: 7 }
    });
    expect(r.configuracoes).toEqual({ contagem: 548, destino: '/admin/grupos-uasgs?situacao=SEM_SUGESTAO' });
  });
  it('só beneficiários (gestor de emendas ou UASGs em dia): abre Grupos dos beneficiários', () => {
    const base = { empenhos: null, financeiro: null, extras, gruposUasgs: null };
    expect(pendenciasDoMenu({ ...base, gruposBeneficiarios: { aConfirmar: 2, semSugestao: 3 } }).configuracoes).toEqual({
      contagem: 5,
      destino: '/emendas/grupos-beneficiarios?situacao=A_CONFIRMAR'
    });
    expect(pendenciasDoMenu({ ...base, gruposBeneficiarios: { aConfirmar: 0, semSugestao: 3 } }).configuracoes?.destino).toBe(
      '/emendas/grupos-beneficiarios?situacao=SEM_SUGESTAO'
    );
  });
});

describe('pendenciasDoMenu: Emendas', () => {
  it('padrão do Financeiro: todos os pedidos com aviso, vermelho quando há urgente, e abre Pedidos sem filtro', () => {
    expect(pendenciasDoMenu({ empenhos: null, financeiro: null, extras, emendas: { total: 67, urgentes: 8 } }).emendas).toEqual({
      contagem: 67,
      vermelho: true,
      destino: '/emendas/pedidos?ano=todos'
    });
    expect(pendenciasDoMenu({ empenhos: null, financeiro: null, extras, emendas: { total: 59, urgentes: 0 } }).emendas).toEqual({
      contagem: 59,
      vermelho: false,
      destino: '/emendas/pedidos?ano=todos'
    });
  });
  it('sem pedido com aviso (ou sem a contagem, como na consulta), Emendas fica sem número', () => {
    expect(pendenciasDoMenu({ empenhos: null, financeiro: null, extras, emendas: { total: 0, urgentes: 0 } }).emendas).toBeUndefined();
    expect(pendenciasDoMenu({ empenhos: null, financeiro: null, extras, emendas: null }).emendas).toBeUndefined();
  });
});

describe('pendenciasDoMenu: Atas e Contratos', () => {
  const base = { empenhos: null, financeiro: null, extras };
  it('atas a montar: número vermelho e abre Atas em "A montar"', () => {
    expect(pendenciasDoMenu({ ...base, atasAMontar: 3 }).carteira).toEqual({
      contagem: 3,
      vermelho: true,
      motivoVermelho: 'atas a montar',
      destino: '/atas?ver=montar'
    });
  });
  it('sem ata a montar (ou sem a contagem), fica sem número', () => {
    expect(pendenciasDoMenu({ ...base, atasAMontar: 0 }).carteira).toBeUndefined();
    expect(pendenciasDoMenu({ ...base, atasAMontar: null }).carteira).toBeUndefined();
  });
});
