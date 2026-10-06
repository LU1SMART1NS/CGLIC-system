import { describe, it, expect } from 'vitest';
import { reconcileNormalizedEmpenhos, registroDaFonte } from '../empenhoReconciliationService';
import { normalizeFromContratosGov } from '../empenhoNormalizationService';
import { ordenarParaSincronizar, instanteDaFila, RECONSULTA_HORAS, RETENTATIVA_HORAS } from '../empenhosCarteiraService';

// Casos reais (06/10/2026): contrato 00009/2013, UASG emitente 200331. O Contratos.gov.br lista dois
// documentos, com ids diferentes, para o mesmo número depois de normalizado.
const doc = (id: number, numero: string, empenhado: string) =>
  normalizeFromContratosGov(
    { id, numero, unidade_gestora: '200331', data_emissao: '2024-07-01', empenhado, liquidado: '0,00', pago: empenhado } as any,
    { contractKey: '200331-00009-2013' }
  );

describe('colisão de chave entre documentos da mesma fonte', () => {
  const zero = doc(12112044, '2024ne000372', '0,00');
  const real = doc(12112047, '2024NE000372', '516,30');

  it('os dois documentos caem na mesma chave canônica', () => {
    expect(zero.canonical_key).toBe('200331-2024-2024NE372');
    expect(real.canonical_key).toBe(zero.canonical_key);
  });

  it('fica o de maior valor, qualquer que seja a ordem da resposta da fonte', () => {
    for (const ordem of [[zero, real], [real, zero]]) {
      const [r] = reconcileNormalizedEmpenhos(ordem);
      expect(r.valor_empenhado).toBe(516.3);
      expect(r.valor_pago).toBe(516.3);
      expect(r.numero_oficial).toBe('2024NE000372');
      expect(r.identificador_fonte).toBe('12112047');
    }
  });

  it('registra a colisão como conflito resolvido, com os dois valores', () => {
    const [r] = reconcileNormalizedEmpenhos([zero, real]);
    const c = r.conflitos.find((x) => x.tipo === 'IDENTIDADE');
    expect(c).toMatchObject({ campo: 'numero_oficial', resolvido_automaticamente: true, valor_primario: '2024NE000372' });
    expect(c?.descricao).toContain('2 documentos');
    expect(c?.descricao).toContain('R$ 516.30');
    expect(c?.descricao).toContain('R$ 0.00');
    expect(r.status_reconciliacao).toBe('CONFIRMADO');
  });

  it('o de valor zero que perde não vira o registro (caso 2024NE0248)', () => {
    const [r] = reconcileNormalizedEmpenhos([doc(11873048, '2024NE0248', '0,00'), doc(11873025, '2024NE000248', '24.597,62')]);
    expect(r.valor_empenhado).toBe(24597.62);
    expect(r.identificador_fonte).toBe('11873025');
  });

  it('empate de valor: fica o primeiro, sem depender de nada além da ordem', () => {
    const a = doc(1, '2024NE000010', '100,00');
    const b = doc(2, '2024ne000010', '100,00');
    expect(registroDaFonte([a, b], 'CONTRATOSNET')?.identificador_fonte).toBe('1');
    expect(registroDaFonte([b, a], 'CONTRATOSNET')?.identificador_fonte).toBe('2');
  });

  it('um registro só: nada muda e nenhum conflito é criado', () => {
    const conflitos: any[] = [];
    expect(registroDaFonte([real], 'CONTRATOSNET', conflitos)).toBe(real);
    expect(registroDaFonte([real], 'PNCP', conflitos)).toBeUndefined();
    expect(conflitos).toEqual([]);
    expect(reconcileNormalizedEmpenhos([real])[0].conflitos.filter((c) => c.tipo === 'IDENTIDADE')).toEqual([]);
  });
});

describe('fila de empenhos: falhas voltam antes', () => {
  const agora = new Date('2026-10-06T22:00:00Z').getTime();
  const ha = (h: number) => new Date(agora - h * 3600_000).toISOString();
  const c = (id: string) => ({ id, uasg: '200331', numero: '', ano: '' }) as any;

  it('instanteDaFila: sucesso conta pela data; ERRO e PARCIAL são recuados', () => {
    const t = ha(2);
    expect(instanteDaFila(t, 'OK')).toBe(t);
    expect(instanteDaFila(t, 'SEM_EMPENHOS')).toBe(t);
    expect(instanteDaFila(t, null)).toBe(t);
    expect(new Date(agora - 2 * 3600_000).getTime() - new Date(instanteDaFila(t, 'ERRO')).getTime()).toBe((RECONSULTA_HORAS - RETENTATIVA_HORAS) * 3600_000);
  });

  it('contrato PARCIAL de 2 h atrás é elegível; o OK da mesma hora ainda espera', () => {
    const tentativas = new Map([
      ['200331-00065-2021', instanteDaFila(ha(2), 'PARCIAL')],
      ['200331-00001-2026', instanteDaFila(ha(2), 'OK')],
      ['200331-00002-2026', instanteDaFila(ha(0.5), 'ERRO')]
    ]);
    const fila = ordenarParaSincronizar([c('200331-00065-2021'), c('200331-00001-2026'), c('200331-00002-2026')], tentativas, { agora });
    expect(fila.map((x) => x.id)).toEqual(['200331-00065-2021']);
  });

  it('a fila ordena pelo instante recuado: falha antiga passa à frente do sucesso de 21 h', () => {
    const tentativas = new Map([
      ['200331-00070-2024', instanteDaFila(ha(21), 'OK')],
      ['200331-00065-2021', instanteDaFila(ha(10), 'ERRO')]
    ]);
    const fila = ordenarParaSincronizar([c('200331-00070-2024'), c('200331-00065-2021')], tentativas, { agora });
    expect(fila.map((x) => x.id)).toEqual(['200331-00065-2021', '200331-00070-2024']);
  });

  it('forçar ignora a espera de qualquer situação', () => {
    const tentativas = new Map([['200331-00002-2026', instanteDaFila(ha(0.5), 'ERRO')]]);
    expect(ordenarParaSincronizar([c('200331-00002-2026')], tentativas, { agora, forcar: true })).toHaveLength(1);
  });
});
