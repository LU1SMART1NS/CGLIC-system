import { describe, expect, it } from 'vitest';
import {
  buildCarteiraItemRows,
  chaveItem,
  chaveItemDeItemKey,
  listarUnidades,
  resumirAtas,
  unidadesPorContrato
} from '../carteiraItens';
import type { ArpItemRecord, ArpRecord } from '../../types';

const arp = (numero: string, uasg = '200331') =>
  ({ numeroAtaRegistroPreco: numero, codigoUnidadeGerenciadora: uasg } as unknown as ArpRecord);
const item = (numeroItem: string, qtd = 100) =>
  ({ numeroItem, quantidadeHomologadaItem: qtd, descricaoItem: `Item ${numeroItem}` } as unknown as ArpItemRecord);

const base = {
  gestorByAta: { '00001/2025': 'Marina' },
  saldos: [],
  allocations: [],
  links: [],
  empenhos: [],
  prazoOf: () => ({ dias: 120, faixa: 'ATENCAO' as const })
};

describe('chaves de item', () => {
  it('ignora zeros à esquerda e aceita número de ata com hífen', () => {
    expect(chaveItem('00001/2025', '200331', '00002')).toBe(chaveItem('00001/2025', '200331', 2));
    expect(chaveItemDeItemKey('00001/2025-200331-00002')).toBe(chaveItem('00001/2025', '200331', '2'));
    expect(chaveItemDeItemKey('37/2026-200331-00001')).toBe(chaveItem('00037/2026', '200331', '1'));
    expect(chaveItemDeItemKey('chave inválida')).toBeNull();
  });
});

describe('buildCarteiraItemRows', () => {
  const arps = [arp('00001/2025')];
  const itemsByAta = { '00001/2025-200331': [item('00001', 100), item('00002', 50)] };

  it('classifica alocação contra o quantitativo SENASP e empenho contra o contratado', () => {
    const rows = buildCarteiraItemRows({
      ...base,
      arps,
      itemsByAta,
      saldos: [{ numero_ata: '00001/2025', codigo_uasg: '200331', numero_item: 1, quantidade_senasp: 80, percentual_consumido: 25 }],
      allocations: [
        { id: '1', itemKey: '00001/2025-200331-00001', unitName: 'CGLIC', allocatedQty: 50, empenhadaQty: 0 },
        { id: '2', itemKey: '00001/2025-200331-00001', unitName: 'cglic ', allocatedQty: 30, empenhadaQty: 0 },
        { id: '3', itemKey: '00001/2025-200331-00002', unitName: 'DIOP', allocatedQty: 10, empenhadaQty: 0 }
      ],
      links: [{ itemKey: '00001/2025-200331-00001', contractKey: 'C1', quantidadeContratada: 60 }],
      empenhos: [
        { itemKey: '00001/2025-200331-00001', quantidade: 60 },
        { itemKey: '00001/2025-200331-00001', quantidade: null }
      ]
    });

    const [a, b] = rows;
    // Item 1: SENASP = 80 (do saldo, não os 100 da ata); 50 + 30 alocados na mesma unidade (caixa ignorada).
    expect(a.quantitativoSenasp).toBe(80);
    expect(a.alocado).toBe(80);
    expect(a.alocadoPorUnidade).toEqual({ cglic: 80 });
    expect(a.nivelAlocacao).toBe('TOTAL');
    expect(a.consumoPct).toBe(25);
    // Empenho pendente (quantidade nula) não conta.
    expect(a.contratada).toBe(60);
    expect(a.empenhado).toBe(60);
    expect(a.nivelEmpenho).toBe('TOTAL');
    expect(a.empenhosPendentes).toBe(1);
    expect(a.gestorNome).toBe('Marina');
    // Item 2: sem saldo sincronizado usa o homologado da ata; 10 de 50 = parcial; sem contrato nem empenho.
    expect(b.quantitativoSenasp).toBe(50);
    expect(b.nivelAlocacao).toBe('PARCIAL');
    expect(b.contratada).toBeNull();
    expect(b.nivelEmpenho).toBe('SEM');
  });

  it('soma a quantidade contratada de vários contratos e mantém nula quando nenhuma foi lida', () => {
    const rows = buildCarteiraItemRows({
      ...base,
      arps,
      itemsByAta,
      links: [
        { itemKey: '00001/2025-200331-00001', contractKey: 'C1', quantidadeContratada: 20 },
        { itemKey: '00001/2025-200331-00001', contractKey: 'C2', quantidadeContratada: 30 },
        { itemKey: '00001/2025-200331-00002', contractKey: 'C1', quantidadeContratada: null }
      ]
    });
    expect(rows[0].contratada).toBe(50);
    expect(rows[1].contratada).toBeNull();
  });
});

describe('resumirAtas e unidadesPorContrato', () => {
  const arps = [arp('00001/2025')];
  const itemsByAta = { '00001/2025-200331': [item('00001', 10), item('00002', 10)] };
  const allocations = [
    { id: '1', itemKey: '00001/2025-200331-00001', unitName: 'CGLIC', allocatedQty: 10, empenhadaQty: 0 },
    { id: '2', itemKey: '00001/2025-200331-00002', unitName: 'DIOP', allocatedQty: 4, empenhadaQty: 0 }
  ];
  const links = [{ itemKey: '00001/2025-200331-00002', contractKey: 'C9', quantidadeContratada: 4 }];

  it('agrega o nível da ata e junta as unidades dos itens', () => {
    const rows = buildCarteiraItemRows({ ...base, arps, itemsByAta, allocations, links });
    const resumo = resumirAtas(rows).get('00001/2025-200331')!;
    expect(resumo.itens).toBe(2);
    expect(resumo.nivelAlocacao).toBe('PARCIAL'); // item 1 total, item 2 parcial
    expect(resumo.nivelEmpenho).toBe('SEM');
    expect([...resumo.unidades].sort()).toEqual(['cglic', 'diop']);
  });

  it('deriva as unidades do contrato pelos itens vinculados', () => {
    const mapa = unidadesPorContrato(links, allocations);
    expect([...mapa.get('C9')!]).toEqual(['diop']);
  });

  it('lista as unidades pela grafia da primeira alocação, em ordem alfabética', () => {
    expect(listarUnidades(allocations).map((u) => u.nome)).toEqual(['CGLIC', 'DIOP']);
  });
});
