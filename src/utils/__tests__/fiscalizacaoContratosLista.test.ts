import { describe, it, expect } from 'vitest';
import type { ContratoFiscalizacao, EntregaFiscalizacao } from '../../services/fiscalizacaoService';
import { linhaParaContrato, linhaParaEntrega } from '../../services/fiscalizacaoService';
import { passosComOFiscal } from '../fiscalizacaoContratosLista';

const contrato = (contractKey: string, p: Partial<ContratoFiscalizacao> = {}): ContratoFiscalizacao => ({
  ...linhaParaContrato({ contract_key: contractKey, uasg: '200331', numero: '00055/2026', situacao: 'SFC', fiscal_user_id: 'u1' }),
  processoNup: '08020.000259/2026-71',
  processoAutuadoEm: '2026-01-09',
  ...p
});
let n = 0;
const entrega = (p: Partial<EntregaFiscalizacao>): EntregaFiscalizacao => ({
  ...linhaParaEntrega({ id: `e${++n}`, contract_key: 'A', quantidade: 1, origem: 'EMENDA', responsavel: 'SFC', etapa: 'ORDEM', fiscalizacao: 'SFC' }),
  ...p
});

describe('passos com o fiscal', () => {
  it('sem os itens carregados, nenhum passo (a carga fica só pelos contratos)', () => {
    expect(passosComOFiscal([contrato('A')], undefined).size).toBe(0);
  });

  it('conta os passos da mesa com o fiscal; contrato sem NUP ganha o passo de autuar; área requisitante fica fora', () => {
    const passos = passosComOFiscal(
      [contrato('A', { processoNup: null }), contrato('B'), contrato('C', { situacao: 'AREA' })],
      [entrega({ contractKey: 'B', etapa: 'FINALIZADO' }), entrega({ contractKey: 'C' })]
    );
    expect(passos.get('A')).toBeGreaterThanOrEqual(1);
    expect(passos.has('B')).toBe(false);
    expect(passos.has('C')).toBe(false);
  });
});
