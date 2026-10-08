import { describe, it, expect } from 'vitest';
import { mapDistribuicao } from '../../services/distribuicaoEmpenhoService';
import { montarEmpenhoDoItem, podeConterItem } from '../empenhoDoItem';

// Contrato 00002/2025 (real): itens 13 (placa, R$ 4.900), 43 e 45 (capacete, R$ 3.500).
const nota = (o: any) =>
  mapDistribuicao({ contrato_empenho_id: o.ne, contract_key: 'K', empenho_id: o.ne, numero_oficial: o.ne, valor_nota: 0, parcelas: [], sugestao: [], situacao: 'A_DISTRIBUIR', ...o });

const notas = [
  nota({ ne: '2024NE000337', valor_nota: 1197000, situacao: 'DISTRIBUIDA', origem: 'USUARIO', parcelas: [{ numero_item: 43, valor: 1197000 }], distribuido_por_nome: 'Maria' }),
  nota({ ne: '2024NE000301', valor_nota: 127400, situacao: 'DISTRIBUIDA', origem: 'USUARIO', parcelas: [{ numero_item: 13, valor: 127400 }] }),
  nota({ ne: '2024NE000330', valor_nota: 147000, sugestao_tipo: 'VARIAS_POSSIBILIDADES', sugestao: [{ numero_item: 13, quantidade: 30 }, { numero_item: 43, quantidade: 42 }] }),
  nota({ ne: '2024NE000328', valor_nota: 14700, sugestao_tipo: 'MULTIPLO_DO_PRECO', sugestao: [{ numero_item: 13, quantidade: 3 }] }),
  nota({ ne: '2025NE000010', valor_nota: 7000, situacao: 'REVISAR', motivo_revisao: 'VALOR_MUDOU', origem: 'USUARIO', parcelas: [{ numero_item: 43, valor: 3500 }] })
];

describe('montarEmpenhoDoItem', () => {
  it('soma só as parcelas deste item nas notas vinculadas; notas de outros itens não entram', () => {
    const r = montarEmpenhoDoItem({ numeroItem: 43, contratos: [{ contractKey: 'K', valorUnitario: 3500, distribuicoes: notas }] });
    expect(r.parcelas.map((p) => p.numeroOficial)).toEqual(['2024NE000337']);
    expect(r.empenhado).toBe(342);
    expect(r.porContrato.get('K')!.valorEmpenhado).toBe(1197000);
  });

  it('nota a vincular entra se pode conter este item; a de sugestão única de outro item fica separada; a rever entra', () => {
    const e = montarEmpenhoDoItem({ numeroItem: 43, contratos: [{ contractKey: 'K', valorUnitario: 3500, distribuicoes: notas }] }).porContrato.get('K')!;
    expect(e.aVincular.map((d) => d.numeroOficial)).toEqual(['2024NE000330', '2025NE000010']);
    expect(e.deOutroItem.map((d) => d.numeroOficial)).toEqual(['2024NE000328']);
  });

  it('sem preço unitário no contrato, a parcela entra em valor mas não em quantidade', () => {
    const r = montarEmpenhoDoItem({ numeroItem: 43, contratos: [{ contractKey: 'K', valorUnitario: null, distribuicoes: notas }] });
    expect(r.parcelas[0].quantidade).toBeNull();
    expect(r.empenhado).toBe(0);
    expect(r.porContrato.get('K')!.valorEmpenhado).toBe(1197000);
  });

  it('contrato sem itens na fonte: sem divisão por item, o valor fica só como referência', () => {
    const r = montarEmpenhoDoItem({
      numeroItem: 1,
      contratos: [{ contractKey: 'S', valorUnitario: 10, distribuicoes: [nota({ ne: 'X', valor_nota: 5000, situacao: 'SEM_ITENS' }), nota({ ne: 'Y', valor_nota: 2500, situacao: 'SEM_ITENS' })] }]
    });
    const e = r.porContrato.get('S')!;
    expect(e.semItens).toBe(true);
    expect(e.valorSemDivisao).toBe(7500);
    expect(r.empenhado).toBe(0);
    expect(r.contratosSemItens).toBe(1);
    expect(r.aVincular).toHaveLength(0);
  });

  it('soma vários contratos', () => {
    const r = montarEmpenhoDoItem({
      numeroItem: 43,
      contratos: [
        { contractKey: 'K', valorUnitario: 3500, distribuicoes: notas },
        { contractKey: 'L', valorUnitario: 3600, distribuicoes: [nota({ ne: 'Z', valor_nota: 36000, situacao: 'DISTRIBUIDA', origem: 'AUTO', parcelas: [{ numero_item: 43, valor: 36000 }] })] }
      ]
    });
    expect(r.empenhado).toBe(352);
    expect(r.parcelas).toHaveLength(2);
  });
});

describe('podeConterItem', () => {
  it('só exclui quando a sugestão é única e de outro item', () => {
    expect(podeConterItem({ sugestaoTipo: 'TOTAL_DO_ITEM', sugestao: [{ numeroItem: 43, quantidade: 342 }] }, 43)).toBe(true);
    expect(podeConterItem({ sugestaoTipo: 'MULTIPLO_DO_PRECO', sugestao: [{ numeroItem: 13, quantidade: 3 }] }, 43)).toBe(false);
    expect(podeConterItem({ sugestaoTipo: 'VARIAS_POSSIBILIDADES', sugestao: [{ numeroItem: 13, quantidade: 3 }, { numeroItem: 45, quantidade: 4 }] }, 43)).toBe(true);
    expect(podeConterItem({ sugestaoTipo: 'SEM_SUGESTAO', sugestao: [] }, 43)).toBe(true);
  });
});

describe('ordem fixa das notas do item', () => {
  const dist = (ordem: string[]) =>
    ordem.map((ne) => nota({ ne, data_emissao: ne.endsWith('9') ? '2024-12-01' : '2024-12-27', situacao: 'DISTRIBUIDA', origem: 'USUARIO', parcelas: [{ numero_item: 43, valor: 3500 }] }));

  it('a ordem não depende da ordem em que o banco devolve as notas (mais recentes primeiro, empate pelo número)', () => {
    const a = montarEmpenhoDoItem({ numeroItem: 43, contratos: [{ contractKey: 'K', valorUnitario: 3500, distribuicoes: dist(['2024NE000339', '2024NE000341', '2024NE000340']) }] });
    const b = montarEmpenhoDoItem({ numeroItem: 43, contratos: [{ contractKey: 'K', valorUnitario: 3500, distribuicoes: dist(['2024NE000340', '2024NE000339', '2024NE000341']) }] });
    const esperado = ['2024NE000340', '2024NE000341', '2024NE000339'];
    expect(a.parcelas.map((p) => p.numeroOficial)).toEqual(esperado);
    expect(b.parcelas.map((p) => p.numeroOficial)).toEqual(esperado);
  });

  it('as notas a vincular também têm ordem fixa', () => {
    const f = (ordem: string[]) => montarEmpenhoDoItem({ numeroItem: 43, contratos: [{ contractKey: 'K', valorUnitario: 3500, distribuicoes: ordem.map((ne) => nota({ ne })) }] }).porContrato.get('K')!.aVincular.map((d) => d.numeroOficial);
    expect(f(['2024NE000330', '2024NE000320'])).toEqual(f(['2024NE000320', '2024NE000330']));
  });
});
