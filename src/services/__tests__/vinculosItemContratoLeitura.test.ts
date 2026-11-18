import { describe, it, expect, vi, beforeEach } from 'vitest';

const banco = vi.hoisted(() => ({ consultas: 0, colunas: [] as string[], soltar: null as null | (() => void) }));

vi.mock('../supabaseClient', () => {
  const linha = { id: 1, item_key: '00010/2024-200331-00001', contract_key: '200331-00002-2025', origem: 'MANUAL', quantidade_contratada_api: 5, quantidade_ajustada: null };
  return {
    isSupabaseConfigured: true,
    supabase: {
      from: () => {
        const consulta: any = {
          select: (cols: string) => (banco.colunas.push(cols), consulta),
          order: () => consulta,
          range: () => {
            banco.consultas++;
            return new Promise((ok) => {
              banco.soltar = () => ok({ data: [linha], error: null });
            });
          }
        };
        return consulta;
      }
    }
  };
});

import { lerVinculosItemContrato } from '../vinculosItemContratoLeitura';
import { fetchCarteiraItemLinks } from '../carteiraItensService';
import { fetchAllArpItemContractLinks } from '../arpContractLinkService';

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('leitura única dos vínculos item↔contrato', () => {
  beforeEach(() => {
    banco.consultas = 0;
    banco.colunas = [];
  });

  it('a carteira de itens e o escopo do gestor, começando juntos, dividem uma consulta só', async () => {
    const itens = fetchCarteiraItemLinks();
    const escopo = fetchAllArpItemContractLinks();
    await tick();
    expect(banco.consultas).toBe(1);
    banco.soltar!();
    expect(await itens).toEqual([{ itemKey: '00010/2024-200331-00001', contractKey: '200331-00002-2025', quantidadeContratada: 5 }]);
    expect((await escopo).map((p) => [p.ataKey, p.contractKey, p.origem])).toEqual([['00010/2024', '200331-00002-2025', 'MANUAL']]);
    // Uma consulta com as colunas dos dois.
    expect(banco.colunas).toEqual(['id, item_key, contract_key, origem, quantidade_contratada_api, quantidade_ajustada']);
  });

  it('terminada a leitura, a próxima chamada lê de novo (quem decide reler é o cache de cada tela)', async () => {
    const primeira = lerVinculosItemContrato();
    await tick();
    banco.soltar!();
    await primeira;
    const segunda = lerVinculosItemContrato();
    await tick();
    expect(banco.consultas).toBe(2);
    banco.soltar!();
    await segunda;
  });
});
