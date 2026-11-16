import { describe, expect, it } from 'vitest';
import { situacaoDaCobranca, situacaoDaNotificacao, situacaoDaSubstituicao, textoDoVencimento, type OcorrenciasDoItem } from '../fiscalizacaoOcorrencias';

const vazio: OcorrenciasDoItem = { ultimaCobranca: null, cobrancas: 0, notificacao: null, pedido: null, substituicao: null };
const hoje = '2026-11-13';

describe('cobrança do item atrasado', () => {
  it('sem cobrança registrada: é do fiscal', () => {
    expect(situacaoDaCobranca({ prevista: '2026-10-01', ocorrencias: vazio }, hoje).estado).toBe('SEM_COBRANCA');
    expect(situacaoDaCobranca({ prevista: '2026-10-01' }, hoje).estado).toBe('SEM_COBRANCA');
  });
  it('cobrado há menos de 10 dias espera o fornecedor; depois, cobrar de novo', () => {
    expect(situacaoDaCobranca({ prevista: '2026-10-01', ocorrencias: { ...vazio, ultimaCobranca: '2026-11-08', cobrancas: 1 } }, hoje)).toEqual({ estado: 'COBRADO', desde: '2026-11-08', cobrarEm: '2026-11-18' });
    expect(situacaoDaCobranca({ prevista: '2026-10-01', ocorrencias: { ...vazio, ultimaCobranca: '2026-10-20', cobrancas: 2 } }, hoje).estado).toBe('COBRAR_DE_NOVO');
  });
  it('cobrança de antes do prazo atual (antes da prorrogação) não conta', () => {
    expect(situacaoDaCobranca({ prevista: '2026-11-01', ocorrencias: { ...vazio, ultimaCobranca: '2026-10-20', cobrancas: 1 } }, hoje).estado).toBe('SEM_COBRANCA');
  });
});

describe('notificação e substituição', () => {
  it('notificação vence no prazo dado nela', () => {
    expect(situacaoDaNotificacao({ ...vazio, notificacao: { em: '2026-11-03', ate: '2026-11-10', sei: '35000001' } }, hoje)).toMatchObject({ vencida: true, dias: -3 });
    expect(situacaoDaNotificacao(vazio, hoje)).toBeNull();
  });
  it('substituição vence no prazo do TR contado da notificação', () => {
    const s = { recusadoEm: '2026-11-01', notificadoEm: '2026-11-03', ate: '2026-12-03', motivo: 'tamanho errado' };
    expect(situacaoDaSubstituicao({ ...vazio, substituicao: s }, hoje)).toMatchObject({ vencida: false, dias: 20 });
  });
  it('texto do vencimento', () => {
    expect(textoDoVencimento(-1)).toBe('venceu há 1 dia');
    expect(textoDoVencimento(0)).toBe('vence hoje');
    expect(textoDoVencimento(5)).toBe('vence em 5 dias');
  });
});
