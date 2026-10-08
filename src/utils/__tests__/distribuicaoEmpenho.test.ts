import { describe, it, expect } from 'vitest';
import { empenhadoPorItem, itensNumerados, motivoDaRevisao, rotuloDaSituacao, textoDaSugestao } from '../distribuicaoEmpenho';
import { mapDistribuicao, type DistribuicaoDoEmpenho } from '../../services/distribuicaoEmpenhoService';

const linha = (over: any) => ({ posicao: 1, numeroItem: 13, descricao: 'Placa', tipo: 'Material', quantidade: 10, valorUnitario: 4900, valorTotal: 49000, ...over });
const dist = (over: Partial<DistribuicaoDoEmpenho>): DistribuicaoDoEmpenho =>
  mapDistribuicao({ contrato_empenho_id: 'c', empenho_id: 'e', situacao: 'A_DISTRIBUIR', valor_nota: 100, parcelas: [], sugestao: [], ...over });

describe('itensNumerados', () => {
  it('junta as linhas do mesmo número, soma quantidade e total e mantém o preço só se for o mesmo', () => {
    const r = itensNumerados([
      linha({ posicao: 1 }),
      linha({ posicao: 2, quantidade: 5, valorTotal: 24500 }),
      linha({ posicao: 3, numeroItem: 43, valorUnitario: 3500, quantidade: 2, valorTotal: 7000 }),
      linha({ posicao: 4, numeroItem: 43, valorUnitario: 3600, quantidade: 1, valorTotal: 3600 }),
      linha({ posicao: 5, numeroItem: null })
    ]);
    expect(r.map((i) => i.numeroItem)).toEqual([13, 43]);
    expect(r[0]).toMatchObject({ quantidade: 15, valorTotal: 73500, valorUnitario: 4900 });
    expect(r[1]).toMatchObject({ quantidade: 3, valorUnitario: null });
  });
});

describe('empenhadoPorItem', () => {
  it('soma só as notas com distribuição fechada e pode ignorar a nota em edição', () => {
    const ds = [
      mapDistribuicao({ contrato_empenho_id: 'a', empenho_id: '1', situacao: 'DISTRIBUIDA', parcelas: [{ numero_item: 13, valor: 100 }, { numero_item: 43, valor: 50 }] }),
      mapDistribuicao({ contrato_empenho_id: 'b', empenho_id: '2', situacao: 'DISTRIBUIDA', parcelas: [{ numero_item: 13, valor: 30 }] }),
      mapDistribuicao({ contrato_empenho_id: 'c', empenho_id: '3', situacao: 'REVISAR', parcelas: [{ numero_item: 13, valor: 999 }] })
    ];
    expect(empenhadoPorItem(ds).get(13)).toBe(130);
    expect(empenhadoPorItem(ds, 'b').get(13)).toBe(100);
    expect(empenhadoPorItem(ds).get(43)).toBe(50);
  });
});

describe('textos da distribuição', () => {
  it('sugestão por tipo', () => {
    expect(textoDaSugestao('TOTAL_DO_ITEM', [{ numeroItem: 43, quantidade: 342 }])).toBe('igual ao total do item 43');
    expect(textoDaSugestao('VARIAS_POSSIBILIDADES', [{ numeroItem: 43, quantidade: 7 }, { numeroItem: 45, quantidade: 7 }])).toBe('7 un do item 43 ou 7 un do item 45');
    expect(textoDaSugestao('SEM_SUGESTAO', [])).toBeNull();
  });

  it('rótulo da situação: vínculo automático e manual aparecem diferentes', () => {
    expect(rotuloDaSituacao(dist({ situacao: 'DISTRIBUIDA', origem: 'AUTO' })).label).toBe('Vinculada automaticamente');
    expect(rotuloDaSituacao(dist({ situacao: 'DISTRIBUIDA', origem: 'USUARIO' })).label).toBe('Vinculada');
    expect(rotuloDaSituacao(dist({ situacao: 'REVISAR' })).variant).toBe('danger');
  });

  it('motivo da revisão diz o valor antigo e o novo', () => {
    const d = mapDistribuicao({ contrato_empenho_id: 'c', empenho_id: 'e', situacao: 'REVISAR', motivo_revisao: 'VALOR_MUDOU', valor_nota: 150, valor_na_distribuicao: 100, parcelas: [] });
    expect(motivoDaRevisao(d)).toMatch(/mudou de R\$\s100,00 para R\$\s150,00/);
  });
});

describe('mapDistribuicao', () => {
  it('lê os números e as listas JSON da view', () => {
    const d = mapDistribuicao({
      contrato_empenho_id: 'c1', contract_key: 'k', empenho_id: 'e1', numero_oficial: '2024NE000337', valor_nota: '1197000.0000',
      itens_no_contrato: 3, situacao: 'A_DISTRIBUIR', sugestao_tipo: 'TOTAL_DO_ITEM', sugestao: [{ numero_item: 43, quantidade: 342 }],
      parcelas: [], valor_distribuido: 0
    });
    expect(d.valorNota).toBe(1197000);
    expect(d.sugestao).toEqual([{ numeroItem: 43, quantidade: 342 }]);
    expect(d.origem).toBeNull();
  });
});
