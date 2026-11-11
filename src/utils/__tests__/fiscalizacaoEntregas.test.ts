import { describe, it, expect } from 'vitest';
import type { EntregaFiscalizacao } from '../../services/fiscalizacaoService';
import { linhaParaEntrega } from '../../services/fiscalizacaoService';
import { bloqueioDaEtapa, ETAPAS_ENTREGA, etapaDef, foiEntregue, nomeDoItem, prazoDaEntrega, rotuloDoBeneficiario } from '../fiscalizacaoEntregas';

const base = linhaParaEntrega({ id: 'e1', contract_key: '200331-00055-2026', contrato_numero: '00055/2026', quantidade: 10, origem: 'EMENDA', responsavel: 'SFC', etapa: 'ORDEM', fiscalizacao: 'SFC' });
const e = (p: Partial<EntregaFiscalizacao>): EntregaFiscalizacao => ({ ...base, ...p });

describe('etapas da entrega', () => {
  it('13 etapas na ordem do fluxo da SFC/CGLIC, SEI só onde há documento', () => {
    expect(ETAPAS_ENTREGA.map((x) => x.id)).toEqual(['INFO_PEDIDA', 'INFO_ENVIADA', 'ORDEM', 'PRODUCAO', 'CONTROLADO', 'TRANSITO', 'RETIRADA', 'ENTREGUE', 'TRP', 'TRD', 'PAGAMENTO', 'SAL', 'FINALIZADO']);
    expect(ETAPAS_ENTREGA.filter((x) => x.sei).map((x) => x.id)).toEqual(['INFO_ENVIADA', 'ORDEM', 'TRP', 'TRD', 'PAGAMENTO', 'SAL']);
    expect(etapaDef('SAL').nome).toBe('Ofício à SAL');
  });

  it('entregue a partir de Entregue', () => {
    expect(foiEntregue(e({ etapa: 'RETIRADA' }))).toBe(false);
    expect(foiEntregue(e({ etapa: 'TRP' }))).toBe(true);
  });
});

describe('prazo pela data prevista', () => {
  const hoje = '2026-11-11';
  it('vencida, vence em breve, no prazo e sem data', () => {
    expect(prazoDaEntrega(e({ prevista: '2026-11-01' }), hoje)).toMatchObject({ tom: 'danger', texto: 'Vencida há 10 dias' });
    expect(prazoDaEntrega(e({ prevista: '2026-11-12' }), hoje)).toMatchObject({ tom: 'warning', texto: 'Vence em 1 dia' });
    expect(prazoDaEntrega(e({ prevista: '2027-01-30' }), hoje).tom).toBe('neutral');
    expect(prazoDaEntrega(e({ prevista: null }), hoje).texto).toBe('Sem data prevista');
  });
  it('entregue com e sem atraso; área requisitante sem acompanhamento', () => {
    expect(prazoDaEntrega(e({ etapa: 'ENTREGUE', prevista: '2026-02-28', entregueEm: '2026-03-03' }), hoje)).toMatchObject({ tom: 'warning', texto: 'Entregue com 3 dias de atraso' });
    expect(prazoDaEntrega(e({ etapa: 'TRD', prevista: '2026-02-28', entregueEm: '2026-02-20' }), hoje).tom).toBe('success');
    expect(prazoDaEntrega(e({ responsavel: 'AREA', prevista: '2026-01-01' }), hoje).texto).toBe('Sem acompanhamento');
  });
});

describe('regras da mudança de etapa (as mesmas da RPC)', () => {
  it('área requisitante não tem etapa', () => {
    expect(bloqueioDaEtapa([e({ responsavel: 'AREA' })], 'PRODUCAO')).toMatch(/área requisitante/);
  });
  it('pagamento e doação só depois de entregue', () => {
    expect(bloqueioDaEtapa([e({})], 'PAGAMENTO')).toMatch(/Registre a entrega/);
    expect(bloqueioDaEtapa([e({ entregueEm: '2026-06-01' })], 'PAGAMENTO')).toBeNull();
  });
  it('Ofício à SAL só em emenda e depois de pago', () => {
    expect(bloqueioDaEtapa([e({ entregueEm: '2026-06-01' })], 'SAL')).toMatch(/pagamento/);
    expect(bloqueioDaEtapa([e({ entregueEm: '2026-06-01', pagoEm: '2026-07-01' })], 'SAL')).toBeNull();
    expect(bloqueioDaEtapa([e({ entregueEm: '2026-06-01', origem: 'CARGA' })], 'SAL')).toMatch(/só em entrega de emenda/);
  });
});

describe('nomes', () => {
  it('beneficiário: sigla em cima e o nome embaixo; sem cadastro, a informar', () => {
    expect(rotuloDoBeneficiario(e({ beneficiarioSigla: 'PMERJ', beneficiarioNome: 'Polícia Militar do Estado do Rio de Janeiro' }))).toEqual({ principal: 'PMERJ', detalhe: 'Polícia Militar do Estado do Rio de Janeiro' });
    expect(rotuloDoBeneficiario(e({})).principal).toBe('Beneficiário a informar');
  });
  it('entrega da planilha: item e destinatário em texto', () => {
    expect(nomeDoItem(e({ itemTexto: 'Drone tipo II' }))).toBe('Drone tipo II');
    expect(rotuloDoBeneficiario(e({ beneficiarioTexto: 'Unidade Aérea Pública - DF' })).principal).toBe('Unidade Aérea Pública - DF');
    expect(linhaParaEntrega({ id: 'x', quantidade: 1, origem: 'CARGA', programa_texto: 'Projeto Pegasus', carga_linha: 1483 })).toMatchObject({ programaTexto: 'Projeto Pegasus', cargaLinha: 1483 });
  });

  it('item pelo nome curto, depois a descrição', () => {
    expect(nomeDoItem(e({ itemDescricao: 'Carabina 5,56' }))).toBe('Carabina 5,56');
    expect(nomeDoItem(e({ itemNome: 'Carabina', itemDescricao: 'Carabina 5,56' }))).toBe('Carabina');
  });
});
