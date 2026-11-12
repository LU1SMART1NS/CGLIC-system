import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../../hooks/useDetailOrigin', () => ({ useNavigateWithOrigin: () => vi.fn() }));
import { linhaParaContrato } from '../../../services/fiscalizacaoService';
import { ContratosFiscalizacaoTabela } from '../ContratosFiscalizacaoTabela';

const contrato = (o: Record<string, unknown>) =>
  linhaParaContrato({ contract_key: 'k1', uasg: '200331', numero: '00332/2026', fornecedor: 'FORNECEDOR LTDA', emendas: [], atas: [], ...o });

const tabela = (props: Partial<React.ComponentProps<typeof ContratosFiscalizacaoTabela>>, c = contrato({ situacao: 'SFC' })) =>
  renderToStaticMarkup(
    <MemoryRouter>
      <ContratosFiscalizacaoTabela contratos={[c]} testId="t" {...props} />
    </MemoryRouter>
  );

describe('colunas da tabela da Distribuição por aba', () => {
  it('Todos: mostra todas as colunas', () => {
    const html = tabela({});
    expect(html).toContain('>Fiscalização<');
    for (const h of ['Fiscal SFC/CGLIC', 'SEI do contrato', 'Vigência']) expect(html).toContain(h);
  });

  it('SFC/CGLIC: sem a coluna Fiscalização e o motivo sob o fiscal', () => {
    const html = tabela({ ocultas: { situacao: true } }, contrato({ situacao: 'SFC', fiscal_nome: 'Fulana', motivo: 'Entrega para vários estados' }));
    expect(html).not.toContain('>Fiscalização<');
    expect(html).toContain('Fulana');
    expect(html).toContain('Entrega para vários estados');
  });

  it('Área requisitante: "Unidade da área" sem fiscal nem SEI', () => {
    const html = tabela({ ocultas: { fiscal: true, processo: true }, rotuloSituacao: 'Unidade da área' }, contrato({ situacao: 'AREA', unidade_area: 'CAEP' }));
    expect(html).toContain('Unidade da área');
    expect(html).toContain('CAEP');
    expect(html).not.toContain('Fiscal SFC/CGLIC');
    expect(html).not.toContain('SEI do contrato');
  });

  it('A definir: origem no lugar da situação, com o motivo', () => {
    const html = tabela({ comOrigem: true, ocultas: { situacao: true, fiscal: true, processo: true } }, contrato({ situacao: 'A_DEFINIR', emendas: ['4321'], motivo: 'Pedido da área' }));
    expect(html).toContain('Emenda 4321');
    expect(html).toContain('Pedido da área');
    expect(html).not.toContain('>Fiscalização<');
  });
});
