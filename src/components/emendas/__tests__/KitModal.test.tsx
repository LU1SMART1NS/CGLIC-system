import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ItemCaep, KitEmenda } from '../../../services/emendasService';

vi.mock('../../../hooks/useEmendas', () => ({ useSalvarKit: () => ({ isPending: false, mutateAsync: vi.fn() }) }));
vi.mock('../../../hooks/useEmendasQuadro', () => ({ usePrecosParaEmenda: () => ({ precos: new Map() }) }));
vi.mock('../../../design-system/components/Toast', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));
vi.mock('../../../design-system/components/Modal', () => ({
  Modal: ({ title, children, footer }: { title: string; children: React.ReactNode; footer: React.ReactNode }) => (
    <div>
      <h2>{title}</h2>
      {children}
      <footer>{footer}</footer>
    </div>
  )
}));

import { KitModal } from '../KitModal';

const item = (itemKey: string, valorUnitario: number): ItemCaep => ({
  itemKey, numeroAta: '00064/2024', codigoUasg: '200331', numeroItem: '00023', descricao: 'Computador de mergulho', codigoPdm: null,
  valorUnitario, vigenciaFinal: '2027-12-27', ataEncerrada: false, alocado: 60
});
const ITENS = [item('a', 7884.79), item('b', 2079.06)];

describe('Montagem do kit', () => {
  it('mostra o valor de cada item e o valor do kit no topo e no rodapé', () => {
    const kit = { id: 'k1', nome: 'Kit Mergulho', descricao: null, ativo: true, versao: 1, itens: [{ itemKey: 'a', quantidade: 2 }, { itemKey: 'b', quantidade: 1 }] } as unknown as KitEmenda;
    const html = renderToStaticMarkup(<KitModal kit={kit} itens={ITENS} nomesExistentes={[]} hoje="2026-10-29" onClose={() => {}} />);
    const texto = html.replace(/<[^>]+>/g, '').replace(/ /g, ' ');
    expect(texto).toContain('2 × R$ 7.884,79R$ 15.769,58');
    expect(texto).toContain('1 × R$ 2.079,06R$ 2.079,06');
    expect(texto.match(/Valor do kit: R\$ 17\.848,64/g)).toHaveLength(2);
    expect(texto).toContain('2 itens · dá para');
  });

  it('kit vazio não mostra valor', () => {
    const html = renderToStaticMarkup(<KitModal kit={null} itens={ITENS} nomesExistentes={[]} hoje="2026-10-29" onClose={() => {}} />);
    expect(html).not.toContain('Valor do kit');
  });
});
