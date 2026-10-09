import { describe, it, expect } from 'vitest';
import {
  ataDeOutroOrgao,
  carteiraDaAta,
  chaveGestaoAta,
  chaveGestaoDaChave,
  papelSenaspDaAta,
  rotuloChaveGestao
} from '../ataIdentidade';
import { extractAtaKeyFromItemKey } from '../../services/arpContractLinkService';
import { buildAtaSaldoStats } from '../../components/atas/ataSaldoStats';
import { agruparVinculos } from '../../components/atas/distribuicao/contratosSemAta';

// Mesma regra de public.chave_gestao_ata() (migration 106).
describe('chave de gestão da ata', () => {
  it('ata da CGLIC (ou sem UASG): só o número, como sempre esteve em ata_managers', () => {
    expect(chaveGestaoAta('00005/2025', '200331')).toBe('00005/2025');
    expect(chaveGestaoAta('00005/2025', '200330')).toBe('00005/2025');
    expect(chaveGestaoAta('00005/2025')).toBe('00005/2025');
  });
  it('ata de outro órgão: número e UASG, para não colidir com a ata da CGLIC de mesmo número', () => {
    expect(chaveGestaoAta('00005/2025', '200342')).toBe('00005/2025-200342');
  });
  it('a partir da chave do item ou da ata', () => {
    expect(chaveGestaoDaChave('00005/2025-200342-00001')).toBe('00005/2025-200342');
    expect(chaveGestaoDaChave('00037/2026-200331-00002')).toBe('00037/2026');
    expect(chaveGestaoDaChave('00005/2025-200342')).toBe('00005/2025-200342');
    expect(extractAtaKeyFromItemKey('00005/2025-200342-00001')).toBe('00005/2025-200342');
    expect(extractAtaKeyFromItemKey('00037/2026-200331-00002')).toBe('00037/2026');
    expect(extractAtaKeyFromItemKey('lixo')).toBeNull();
  });
  it('rótulo para leitura', () => {
    expect(rotuloChaveGestao('00005/2025-200342')).toBe('00005/2025 (UASG 200342)');
    expect(rotuloChaveGestao('00005/2025')).toBe('00005/2025');
  });
});

describe('carteira e papel', () => {
  it('carteira: a gravada no banco; sem ela, a própria UASG', () => {
    expect(carteiraDaAta({ codigoUnidadeGerenciadora: '200342', uasgCarteira: '200331' })).toBe('200331');
    expect(carteiraDaAta({ codigoUnidadeGerenciadora: '200331' })).toBe('200331');
  });
  it('papel: o gravado; sem ele, gerenciadora nas UASGs da CGLIC', () => {
    expect(papelSenaspDaAta({ codigoUnidadeGerenciadora: '200109', papelSenasp: 'ADESAO' })).toBe('ADESAO');
    expect(papelSenaspDaAta({ codigoUnidadeGerenciadora: '200331' })).toBe('GERENCIADORA');
    expect(ataDeOutroOrgao({ codigoUnidadeGerenciadora: '200342', papelSenasp: 'PARTICIPANTE' })).toBe(true);
    expect(ataDeOutroOrgao({ codigoUnidadeGerenciadora: '200331', papelSenasp: 'GERENCIADORA' })).toBe(false);
  });
});

describe('atas de mesmo número na mesma carteira', () => {
  it('o saldo de cada ata fica separado', () => {
    const stats = buildAtaSaldoStats([
      { numero_ata: '00005/2025', codigo_uasg: '200331', numero_item: '00001', percentual_consumido: 95 },
      { numero_ata: '00005/2025', codigo_uasg: '200342', numero_item: '00001', percentual_consumido: 10 }
    ]);
    expect(stats['00005/2025'].maxPct).toBe(95);
    expect(stats['00005/2025-200342'].maxPct).toBe(10);
  });
  it('vínculos: cada ata com o seu gestor', () => {
    const gestores: Record<string, string> = { '00005/2025': 'Gestora CGLIC', '00005/2025-200342': 'Gestor PF' };
    const mapa = agruparVinculos(
      [
        { ataKey: '00005/2025', numeroAta: '00005/2025', contractKey: 'C1', uasg: '200331', numeroItem: 1 },
        { ataKey: '00005/2025-200342', numeroAta: '00005/2025', contractKey: 'C1', uasg: '200342', numeroItem: 4 }
      ],
      (chave) => gestores[chave]
    );
    expect(mapa.get('C1')).toEqual([
      { numeroAta: '00005/2025', uasg: '200331', itens: [1], gestorNome: 'Gestora CGLIC' },
      { numeroAta: '00005/2025', uasg: '200342', itens: [4], gestorNome: 'Gestor PF' }
    ]);
  });
});
