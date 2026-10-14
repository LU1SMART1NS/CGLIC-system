import { describe, it, expect } from 'vitest';
import {
  etapaDaFatura,
  GRUPO_DA_ETAPA,
  etapaDoCiclo,
  montarEmpenhosCarteira,
  montarPagamentosCarteira,
  situacaoDoSaldo,
  type EmpenhoResumoDb
} from '../financeiroCarteiraService';
import { descreverLinha } from '../../components/financeiro/pagamentoLinha';
import type { PaymentFollowUpCycle } from '../../types/paymentFollowUp';

const emp = (over: Partial<EmpenhoResumoDb>): EmpenhoResumoDb => ({
  empenho_id: 'e1',
  numero_oficial: '2026NE000027',
  ano_exercicio: 2026,
  uasg_emitente: '200331',
  data_emissao: '2026-01-07',
  valor_empenhado: 1000,
  credor_nome: 'X',
  credor_cnpj_cpf: null,
  identificador_fonte: '111',
  ...over
});

describe('montarEmpenhosCarteira', () => {
  const faturas = [
    { idFatura: 1, paga: true, cancelada: false },
    { idFatura: 2, paga: false, cancelada: false },
    { idFatura: 3, paga: true, cancelada: true }
  ];
  const fe = [
    { id_fatura: 1, id_empenho_gov: '111', valor: 300 },
    { id_fatura: 2, id_empenho_gov: '111', valor: 500 },
    { id_fatura: 3, id_empenho_gov: '111', valor: 200 }
  ];

  it('pago = só faturas pagas e não canceladas; saldo = empenhado − pago', () => {
    const [row] = montarEmpenhosCarteira([emp({})], [{ empenho_id: 'e1', contract_key: 'K' }], fe, faturas, new Set(['K']));
    expect(row.valorPago).toBe(300);
    expect(row.saldo).toBe(700);
    expect(situacaoDoSaldo(row)).toBe('COM_SALDO');
  });

  it('empenho todo pago fica sem saldo (nunca negativo)', () => {
    const [row] = montarEmpenhosCarteira([emp({ valor_empenhado: 250 })], [{ empenho_id: 'e1', contract_key: 'K' }], fe, faturas, new Set(['K']));
    expect(row.saldo).toBe(0);
    expect(situacaoDoSaldo(row)).toBe('SEM_SALDO');
  });

  it('sem faturas consultadas no contrato, o pago fica desconhecido', () => {
    const [row] = montarEmpenhosCarteira([emp({})], [{ empenho_id: 'e1', contract_key: 'K' }], fe, faturas, new Set());
    expect(row.valorPago).toBeNull();
    expect(situacaoDoSaldo(row)).toBe('SEM_CONSULTA');
  });

  it('com o saldo do Tesouro: pago e saldo vêm de lá; a soma das faturas fica ao lado', () => {
    const tesouro = new Map([['e1', { pagoTotal: 900, aLiquidar: 50, liquidadoAPagar: 30, atualizadoEm: '2026-10-14 14:55:14' }]]);
    const [row] = montarEmpenhosCarteira([emp({})], [{ empenho_id: 'e1', contract_key: 'K' }], fe, faturas, new Set(['K']), tesouro);
    expect(row).toMatchObject({ valorPago: 900, fontePago: 'TESOURO', valorPagoFaturas: 300, saldo: 80, liquidadoAPagar: 30, tesouroAtualizadoEm: '2026-10-14 14:55:14' });
    expect(situacaoDoSaldo(row)).toBe('COM_SALDO');
  });

  it('Tesouro sem saldo (todo pago ou cancelado) fica sem saldo, mesmo com empenhado maior que o pago', () => {
    const tesouro = new Map([['e1', { pagoTotal: 300, aLiquidar: 0, liquidadoAPagar: 0, atualizadoEm: null }]]);
    const [row] = montarEmpenhosCarteira([emp({})], [{ empenho_id: 'e1', contract_key: 'K' }], fe, faturas, new Set(['K']), tesouro);
    expect(row.saldo).toBe(0);
    expect(situacaoDoSaldo(row)).toBe('SEM_SALDO');
  });

  it('sem o Tesouro, vale a soma das faturas (fonte FATURAS)', () => {
    const [row] = montarEmpenhosCarteira([emp({})], [{ empenho_id: 'e1', contract_key: 'K' }], fe, faturas, new Set(['K']));
    expect(row).toMatchObject({ valorPago: 300, fontePago: 'FATURAS', valorPagoFaturas: 300, saldo: 700, liquidadoAPagar: null });
  });

  it('soma das faturas: partes que passam do valor da fatura são reduzidas na proporção', () => {
    // fatura de R$ 100 que cita dois empenhos com o valor inteiro de cada um (300 + 100): fica 75 + 25
    const fe2 = [
      { id_fatura: 9, id_empenho_gov: '111', valor: 300 },
      { id_fatura: 9, id_empenho_gov: '222', valor: 100 }
    ];
    const rows = montarEmpenhosCarteira(
      [emp({}), emp({ empenho_id: 'e2', identificador_fonte: '222', numero_oficial: '2026NE000028' })],
      [
        { empenho_id: 'e1', contract_key: 'K' },
        { empenho_id: 'e2', contract_key: 'K' }
      ],
      fe2,
      [{ idFatura: 9, paga: true, cancelada: false, valorLiquido: 100 }],
      new Set(['K'])
    );
    expect(rows.map((r) => r.valorPagoFaturas)).toEqual([75, 25]);
  });

  it('partes dentro do valor da fatura ficam como estão', () => {
    const fe2 = [
      { id_fatura: 9, id_empenho_gov: '111', valor: 60 },
      { id_fatura: 9, id_empenho_gov: '222', valor: 40 }
    ];
    const rows = montarEmpenhosCarteira(
      [emp({}), emp({ empenho_id: 'e2', identificador_fonte: '222' })],
      [
        { empenho_id: 'e1', contract_key: 'K' },
        { empenho_id: 'e2', contract_key: 'K' }
      ],
      fe2,
      [{ idFatura: 9, paga: true, cancelada: false, valorLiquido: 100 }],
      new Set(['K'])
    );
    expect(rows.map((r) => r.valorPagoFaturas)).toEqual([60, 40]);
  });

  it('empenho sem contrato não entra; vínculos repetidos não duplicam', () => {
    const rows = montarEmpenhosCarteira(
      [emp({}), emp({ empenho_id: 'e2' })],
      [
        { empenho_id: 'e1', contract_key: 'B' },
        { empenho_id: 'e1', contract_key: 'A' },
        { empenho_id: 'e1', contract_key: 'A' }
      ],
      [],
      [],
      new Set(['A'])
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].contractKeys).toEqual(['A', 'B']);
  });
});

describe('etapas do pagamento', () => {
  it('fatura: cancelada > paga > liquidada > erro > em andamento', () => {
    expect(etapaDaFatura({ cancelada: true, paga: true, dataLiquidacao: 'x', situacao: null, np: null })).toBe('CANCELADA');
    expect(etapaDaFatura({ cancelada: false, paga: true, dataLiquidacao: 'x', situacao: null, np: null })).toBe('PAGA');
    expect(etapaDaFatura({ cancelada: false, paga: false, dataLiquidacao: '2026-10-01', situacao: 'Siafi Apropriado', np: '2026NP000001' })).toBe('AGUARDANDO_OB');
    expect(etapaDaFatura({ cancelada: false, paga: false, dataLiquidacao: null, situacao: 'Siafi Erro', np: null })).toBe('ERRO_SIAFI');
    expect(etapaDaFatura({ cancelada: false, paga: false, dataLiquidacao: null, situacao: 'Pendente', np: null })).toBe('EM_ANDAMENTO');
  });

  it('liquidada sem NP ou com OB de outra despesa fica "sem como confirmar", no segmento A conferir', () => {
    expect(etapaDaFatura({ cancelada: false, paga: false, dataLiquidacao: '2024-01-31', situacao: 'Siafi Apropriado', np: null })).toBe('SEM_CONFIRMACAO');
    expect(
      etapaDaFatura({ cancelada: false, paga: false, dataLiquidacao: '2026-07-17', situacao: 'Siafi Apropriado', np: '2026NP000204', pagamentoAConferir: true })
    ).toBe('SEM_CONFIRMACAO');
    // a conferir sem liquidação também não é "não liquidada"
    expect(etapaDaFatura({ cancelada: false, paga: false, dataLiquidacao: null, situacao: 'Pendente', np: '2026NP000204', pagamentoAConferir: true })).toBe('SEM_CONFIRMACAO');
    expect(GRUPO_DA_ETAPA.SEM_CONFIRMACAO).toBe('CONFERIR');
    // paga continua paga, com ou sem NP
    expect(etapaDaFatura({ cancelada: false, paga: true, dataLiquidacao: '2024-01-31', situacao: 'Pago', np: null })).toBe('PAGA');
  });

  it('ciclo: conferência na CGLIC, devolvido em correção, enviado na CGOFI, liquidado aguardando OB; pago e cancelado saem', () => {
    expect(etapaDoCiclo({ status: 'RECEBIDO' })).toBe('NA_CGLIC');
    expect(etapaDoCiclo({ status: 'COM_PENDENCIA' })).toBe('DEVOLVIDO_CORRECAO');
    expect(etapaDoCiclo({ status: 'LIQUIDADO' })).toBe('AGUARDANDO_OB');
    expect(etapaDoCiclo({ status: 'DEVOLVIDO' })).toBe('NA_CGLIC');
    expect(etapaDoCiclo({ status: 'ENVIADO_CGOFI' })).toBe('NA_CGOFI');
    const fechados = [{ status: 'PAGO' }, { status: 'CANCELADO' }] as unknown as PaymentFollowUpCycle[];
    expect(montarPagamentosCarteira(fechados, [])).toHaveLength(0);
  });

  it('fatura ligada a ciclo em aberto aparece dentro do ciclo, não duplicada', () => {
    const fatura = {
      idFatura: 7, contractKey: 'K', numero: '231', tipo: 'Nota Fiscal', emissao: '2026-09-01', vencimento: null, valorLiquido: 10,
      dataLiquidacao: null, situacao: 'Pendente', cancelada: false, np: null, referencia: '09/2026', ordensBancarias: null,
      obEmissao: null, paga: false, npContratos: 0, empenhos: '2026NE000412', empenhosSemVinculo: 0, empenhosSemVinculoNumeros: null
    };
    const ciclo = { id: 'c1', cycleKey: 'C1', contractKey: 'K', status: 'ENVIADO_CGOFI', input: { valorAtesto: 10 } } as unknown as PaymentFollowUpCycle;
    const rows = montarPagamentosCarteira([ciclo], [fatura], [{ cycle_id: 'c1', id_fatura: 7 }]);
    expect(rows).toHaveLength(1);
    expect(rows[0].tipo).toBe('CICLO');
    expect(descreverLinha(rows[0]).documento).toBe('NF 231');
  });

  it('fatura liquidada conta os dias aguardando OB', () => {
    const [row] = montarPagamentosCarteira([], [
      {
        idFatura: 9, contractKey: 'K', numero: '1', tipo: 'Nota Fiscal', emissao: '2026-09-01', vencimento: null, valorLiquido: 10,
        dataLiquidacao: '2026-10-01', situacao: 'Siafi Apropriado', cancelada: false, np: '2026NP000001', referencia: null,
        ordensBancarias: null, obEmissao: null, paga: false, npContratos: 2, empenhos: null, empenhosSemVinculo: 0, empenhosSemVinculoNumeros: null
      }
    ]);
    const linha = descreverLinha(row, new Date(2026, 9, 7));
    expect(linha.prazo.detalhe).toBe('aguardando OB há 6 dias');
    expect(linha.prazo.atrasado).toBe(true);
    expect(linha.etapa.detalhe).toContain('2026NP000001 · paga também 1 outro(s) contrato(s)');
  });
});
