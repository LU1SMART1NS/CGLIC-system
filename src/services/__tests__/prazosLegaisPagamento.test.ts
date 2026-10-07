import { describe, it, expect } from 'vitest';
import { calcularPrazosLegais, diasUteisComContratado } from '../prazosLegaisPagamento';
import { montarChecklist, resumoChecklist, CHECKLIST_PAGAMENTO } from '../../components/contracts/payment/checklistPagamento';
import { empenhosSemSaldo, faturasSugeridas, textoDoPagamento } from '../../components/contracts/payment/cicloPagamentoShared';
import type { PaymentFollowUpCycle } from '../../types/paymentFollowUp';

const ciclo = (over: Partial<PaymentFollowUpCycle> = {}, input: Partial<PaymentFollowUpCycle['input']> = {}): PaymentFollowUpCycle =>
  ({
    id: 'c1',
    cycleKey: 'C1',
    contractKey: 'K',
    competencia: '2026-10',
    status: 'RECEBIDO',
    alerts: [],
    criadoEm: '',
    atualizadoEm: '',
    eventos: [],
    itens: [],
    checklist: [],
    input: {
      contractKey: 'K',
      competencia: '2026-10',
      dataAssinaturaAtesto: '2026-10-01',
      dataRecebimento: '2026-10-05',
      dataVencimentoFatura: '2026-10-09',
      documentoAtestoSei: '777',
      valorAtesto: 500000,
      ...input
    },
    ...over
  }) as unknown as PaymentFollowUpCycle;

// Quinta-feira, 15/10/2026. 12/10 é feriado nacional (Nossa Senhora Aparecida) e não conta como dia útil.
const hoje = new Date(2026, 9, 15);

describe('prazos legais (Portaria 50 e IN 77)', () => {
  it('chegada com menos de 8 dias úteis antes do vencimento fica fora do prazo', () => {
    const p = calcularPrazosLegais(ciclo(), { valorContrato: 1_000_000, hoje });
    expect(p.chegada.diasUteisAteVencimento).toBe(4);
    expect(p.chegada.fora).toBe(true);
  });

  it('liquidação corre do atesto e estoura depois de 10 dias úteis', () => {
    const p = calcularPrazosLegais(ciclo(), { valorContrato: 1_000_000, hoje });
    expect(p.liquidacao.diasUteis).toBe(9);
    expect(p.liquidacao.teto).toBe(10);
    expect(p.liquidacao.estourou).toBe(false);
    expect(calcularPrazosLegais(ciclo(), { valorContrato: 1_000_000, hoje: new Date(2026, 9, 16) }).liquidacao.estourou).toBe(false);
    expect(calcularPrazosLegais(ciclo(), { valorContrato: 1_000_000, hoje: new Date(2026, 9, 19) }).liquidacao.estourou).toBe(true);
  });

  it('pequeno valor reduz os prazos à metade; prorrogação dobra o de liquidação', () => {
    expect(calcularPrazosLegais(ciclo(), { valorContrato: 10_000, hoje }).liquidacao.teto).toBe(5);
    expect(calcularPrazosLegais(ciclo({}, { liquidacaoProrrogada: true }), { valorContrato: 1_000_000, hoje }).liquidacao.teto).toBe(20);
  });

  it('o tempo com o contratado não conta na liquidação', () => {
    const c = ciclo({
      eventos: [
        { id: '1', tipo: 'PENDENCIA', origemPendencia: 'FORNECEDOR', dataEvento: '2026-10-06', criadoEm: '1' },
        { id: '2', tipo: 'RETORNO', dataEvento: '2026-10-09', criadoEm: '2' }
      ] as PaymentFollowUpCycle['eventos']
    });
    expect(diasUteisComContratado(c, hoje)).toBe(3);
    expect(calcularPrazosLegais(c, { valorContrato: 1_000_000, hoje }).liquidacao.diasUteis).toBe(6);
  });

  it('devolução à área não pausa o prazo legal', () => {
    const c = ciclo({ eventos: [{ id: '1', tipo: 'PENDENCIA', origemPendencia: 'FISCAL', dataEvento: '2026-10-06', criadoEm: '1' }] as PaymentFollowUpCycle['eventos'] });
    expect(diasUteisComContratado(c, hoje)).toBe(0);
  });

  it('pagamento conta da liquidação até a OB', () => {
    const p = calcularPrazosLegais(ciclo({ status: 'PAGO' }, { dataLiquidacao: '2026-10-08', dataOrdemBancaria: '2026-10-13' }), { valorContrato: 1_000_000, hoje });
    expect(p.liquidacao.concluido).toBe(true);
    expect(p.pagamento).toMatchObject({ diasUteis: 2, concluido: true, estourou: false });
  });

  it('mais de 2 meses desde o atesto sem pagamento é risco de extinção (IN 77, art. 11)', () => {
    expect(calcularPrazosLegais(ciclo(), { hoje: new Date(2026, 11, 2) }).riscoExtincao).toBe(true);
    expect(calcularPrazosLegais(ciclo({ status: 'PAGO' }), { hoje: new Date(2026, 11, 2) }).riscoExtincao).toBe(false);
  });
});

describe('checklist do Anexo I', () => {
  it('tem os 16 itens da Portaria e vem marcado no que o sistema conhece', () => {
    expect(CHECKLIST_PAGAMENTO).toHaveLength(16);
    const c = ciclo({ itens: [{ id: 'i', notaFiscal: '231', notaFiscalSei: '555', atestoSei: '777', empenhoCanonicalKey: 'E', valorBruto: 1, jurosMulta: 0, glosa: 0, desconto: 0, valorAPagar: 1 }] });
    const linhas = montarChecklist(c, { contratoVigente: true, empenhosComSaldo: false });
    const por = (item: string) => linhas.find((l) => l.item === item)!;
    expect(por('CONTRATO_VIGENTE')).toMatchObject({ resposta: 'SIM', sugeridoPeloSistema: 'vigente' });
    expect(por('NOTA_EMPENHO').resposta).toBe('NAO');
    expect(por('NOTA_FISCAL')).toMatchObject({ resposta: 'SIM', sei: '555' });
    expect(por('ATESTO')).toMatchObject({ resposta: 'SIM', sei: '777' });
    expect(resumoChecklist(linhas)).toEqual({ faltam: 12, nao: 1 });
  });

  it('respostas já dadas (devolução anterior) prevalecem', () => {
    const c = ciclo({ checklist: [{ item: 'CONTRATO_VIGENTE', resposta: 'NA' }] });
    expect(montarChecklist(c, { contratoVigente: true }).find((l) => l.item === 'CONTRATO_VIGENTE')!.resposta).toBe('NA');
  });
});

describe('apoio do ciclo', () => {
  it('aponta o empenho cujo saldo não cobre o que os itens pedem', () => {
    const empenhos = [
      { canonicalKey: 'A', numero: '2026NE1', valorEmpenhado: 100, valorPago: 0, saldo: 100, naturezaDespesa: null, naturezaDescricao: null },
      { canonicalKey: 'B', numero: '2026NE2', valorEmpenhado: 100, valorPago: 90, saldo: 10, naturezaDespesa: null, naturezaDescricao: null }
    ];
    expect(empenhosSemSaldo([{ empenho: 'A', valor: 60 }, { empenho: 'A', valor: 40 }, { empenho: 'B', valor: 11 }], empenhos)).toEqual(['2026NE2']);
  });

  it('sugere só a única fatura livre com o valor do ciclo', () => {
    const f = (idFatura: number, valorLiquido: number, cicloId: string | null = null) =>
      ({ idFatura, numero: String(idFatura), referencia: null, emissao: null, valorLiquido, situacao: null, empenhos: null, liquidada: false, cicloId });
    const c = ciclo({}, { valorAtesto: 100 });
    expect(faturasSugeridas([f(1, 100), f(2, 50)], c)).toEqual([1]);
    expect(faturasSugeridas([f(1, 100), f(2, 100)], c)).toEqual([]);
    expect(faturasSugeridas([f(1, 100, 'outro'), f(2, 50)], c)).toEqual([]);
  });

  it('monta a tabela "DO PAGAMENTO" para colar no SEI', () => {
    const texto = textoDoPagamento([
      { id: 'i', notaFiscal: '231', notaFiscalSei: '555', atestoSei: '777', empenhoCanonicalKey: '200331-2026-2026NE412', subelemento: '52', valorBruto: 1000, jurosMulta: 0, glosa: 10, desconto: 0, valorAPagar: 990 }
    ]);
    const linhas = texto.split('\n');
    expect(linhas[0].split('\t')).toHaveLength(10);
    expect(linhas[1]).toBe(['231', '555', '777', '2026NE412', '52', '1.000,00', '0,00', '10,00', '0,00', '990,00'].join('\t'));
    expect(linhas[2]).toContain('VALOR TOTAL');
  });
});
