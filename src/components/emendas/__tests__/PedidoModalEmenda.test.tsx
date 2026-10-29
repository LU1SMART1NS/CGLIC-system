import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { AutorEmenda, EmendaSiop, ItemCaep, PedidoEmenda } from '../../../services/emendasService';

const emendas: EmendaSiop[] = [];
const pedidos: PedidoEmenda[] = [];
vi.mock('../../../hooks/useEmendas', () => ({
  useEmendasSiop: () => ({ data: emendas }),
  usePedidosEmendas: () => ({ data: pedidos }),
  usePodeGerirEmendas: () => true,
  useSalvarPedido: () => ({ isPending: false, mutateAsync: vi.fn() })
}));
vi.mock('../../../hooks/useEmendasQuadro', () => ({ usePrecosParaEmenda: () => ({ precos: undefined, ipca: null, semPrevisao: false }) }));
vi.mock('../../../design-system/components/Toast', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));
vi.mock('../../../design-system/components/Modal', () => ({
  Modal: ({ title, children, footer }: { title: string; children: React.ReactNode; footer: React.ReactNode }) => (
    <div>
      <h2>{title}</h2>
      {children}
      {footer}
    </div>
  )
}));
vi.mock('../QuadroGabinete', () => ({ QuadroGabinete: () => null }));
vi.mock('../BeneficiarioModal', () => ({ BeneficiarioModal: () => null }));

import { PedidoModal } from '../PedidoModal';

const autor = { id: 'A1', nome: 'Marcel van Hattem', tipo: 'DEPUTADO', uf: 'RS', partido: 'NOVO' } as AutorEmenda;
const itens: ItemCaep[] = [];
const emenda = (id: string, numero: string, valor: number | null): EmendaSiop => ({ id, numero, ano: 2026, autorId: 'A1', valor, gnd: null, vistaEm: '2026-10-28' }) as EmendaSiop;
const abrir = (pedido: PedidoEmenda | null = null) =>
  renderToStaticMarkup(
    <PedidoModal
      pedido={pedido}
      autores={[autor]}
      itens={itens}
      kits={[]}
      beneficiarios={[]}
      reservadoFora={new Map()}
      ultimoContato={new Map()}
      hoje="2026-10-29"
      autorInicial={pedido ? null : 'A1'}
      onClose={() => {}}
    />
  );

describe('reserva com a emenda (migration 243, protótipo aprovado em 29/10/2026)', () => {
  it('lista as emendas do parlamentar com o valor a indicar, abre escolhida a única e oferece outra emenda; sem reserva para órgão', () => {
    emendas.splice(0, emendas.length, emenda('e1', '41160011', 1918117));
    const html = abrir();
    expect(html).toContain('data-testid="emendas-pedido-emenda"');
    expect(html).toContain('4116 0011 / 2026');
    expect(html).toContain('A indicar: R$');
    expect(html).toMatch(/data-testid="emendas-pedido-emenda-e1"[^>]*checked=""/);
    expect(html).toContain('data-testid="emendas-pedido-emenda-nova"');
    expect(html).toContain('data-testid="emendas-pedido-teto"');
    expect(html).not.toContain('Órgão (parlamentar a definir)');
  });

  it('emenda registrada sem o valor: limite fica para a conferência; com duas emendas nenhuma vem escolhida', () => {
    emendas.splice(0, emendas.length, emenda('e1', '41160011', null), emenda('e2', '41160012', 500000));
    const html = abrir();
    expect(html).toContain('Sem o valor, o limite fica para a conferência com o SIOP');
    expect(html).not.toMatch(/data-testid="emendas-pedido-emenda-e\d"[^>]*checked=""/);
    expect(html).not.toContain('data-testid="emendas-pedido-teto"');
  });

  it('pedido antigo sem emenda pede a emenda; pedido com emenda não mostra a escolha', () => {
    emendas.splice(0, emendas.length, emenda('e1', '41160011', 1918117));
    const antigo = { id: 'p1', versao: 2, autorId: 'A1', etapa: 'RESERVADO', origem: 'PLANILHA', reservadoEm: '2026-10-23', linhas: [], emendaId: null, siopEmenda: null, siopEmendaAno: null, outrasEmendas: [] } as unknown as PedidoEmenda;
    expect(abrir(antigo)).toContain('data-testid="emendas-pedido-emenda"');
    expect(abrir({ ...antigo, emendaId: 'e1', siopEmenda: '41160011', siopEmendaAno: 2026 })).not.toContain('data-testid="emendas-pedido-emenda"');
  });
});
