import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import type { ItemCaep } from '../../../services/emendasService';
import { resumirFatias, type FatiasDaAta } from '../../../config/gruposGti';

const item = (itemKey: string, numeroItem: string): ItemCaep => ({
  itemKey, numeroAta: '00031/2025', codigoUasg: '200331', numeroItem, descricao: 'Viatura', codigoPdm: 1,
  valorUnitario: 100, vigenciaFinal: '2027-06-25', ataEncerrada: false, alocado: 100
});
const ITENS = [item('a', '00001'), item('b', '00002')];
// Só o item 1 tem órgãos participantes: a fatia vem pela mesma chave da Carteira › Itens.
const FATIAS = new Map<string, FatiasDaAta>([
  ['00031/2025-200331-00001', resumirFatias([{ grupo: 'CNCG', quantidade: 70, orgaos: 3 }, { grupo: 'LIGABOM', quantidade: 30, orgaos: 1 }])]
]);

vi.mock('../../../hooks/useEmendas', () => ({
  hojeEmBrasilia: () => '2026-10-28',
  useItensCaep: () => ({ data: ITENS, isLoading: false, isFetching: false, isError: false, error: null, refetch: vi.fn(), dataUpdatedAt: 0 }),
  usePedidosEmendas: () => ({ data: [], refetch: vi.fn() }),
  usePodeGerirEmendas: () => false
}));
vi.mock('../../../hooks/useEmendasQuadro', () => ({ usePrecosParaEmenda: () => ({ precos: undefined, ipca: null, semPrevisao: false }) }));
vi.mock('../../../hooks/useGruposGti', () => ({
  ROTULO_GTI_ITENS: 'participação dos GTIs nos itens',
  useFatiasItensGtiLeitura: () => ({ fatias: FATIAS, consulta: { isError: false, error: null, refetch: vi.fn(), isFetching: false } })
}));

import { EmendasPorItemPage } from '../EmendasPorItemPage';

const render = () => renderToStaticMarkup(<MemoryRouter>{<EmendasPorItemPage />}</MemoryRouter>);

describe('Emendas › Itens: coluna Interesse principal', () => {
  it('mostra o GTI principal do item, como na Carteira › Itens', () => {
    const html = render();
    expect(html).toContain('Interesse principal');
    const celula = html.split('data-testid="emendas-itens-gti-a"')[1]?.slice(0, 600) ?? '';
    expect(celula).toContain('CNCG');
  });

  it('item sem órgãos participantes fica sem dados', () => {
    const html = render();
    expect(html).toMatch(/data-testid="emendas-itens-gti-b"[^>]*>Sem dados dos órgãos/);
  });
});
