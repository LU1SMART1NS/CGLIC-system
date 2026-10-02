import { describe, it, expect } from 'vitest';
import { summarizeParticipantes } from '../participantesSummary';

const unidades = [
  { codigoUnidade: '200331', nomeUnidade: 'SENASP', tipoUnidade: 'GERENCIADORA', quantidadeRegistrada: 801, saldoRemanejamentoEmpenho: 801 },
  { codigoUnidade: '200109', nomeUnidade: 'PRF', tipoUnidade: 'PARTICIPANTE', quantidadeRegistrada: 70, saldoRemanejamentoEmpenho: 50 },
  { codigoUnidade: '452984', nomeUnidade: 'SSPDS-CE', tipoUnidade: 'PARTICIPANTE', quantidadeRegistrada: 50, saldoRemanejamentoEmpenho: null }
];

describe('summarizeParticipantes', () => {
  const r = summarizeParticipantes(unidades, { ugUasg: '200331', contratadoUG: 690 });

  it('o gerenciador consome o contratado nos contratos vinculados', () => {
    expect(r.rows[0]).toMatchObject({ gerenciadora: true, registrado: 801, consumido: 690, saldo: 111, fonte: 'CONTRATOS' });
  });

  it('os participantes consomem o que o Compras.gov registra', () => {
    expect(r.rows[1]).toMatchObject({ gerenciadora: false, consumido: 20, saldo: 50, fonte: 'COMPRASGOV' });
    expect(r.rows[2]).toMatchObject({ consumido: 0, saldo: 50, fonte: 'COMPRASGOV' });
  });

  it('soma os totais', () => {
    expect(r).toMatchObject({ registrado: 921, consumido: 710, saldo: 211 });
  });

  it('o quantitativo SENASP considera só as UASGs do CGLIC', () => {
    expect(r.senasp).toEqual({ registrado: 801, consumido: 690, saldo: 111 });
  });

  it('outra unidade marcada como gerenciadora segue o Compras.gov', () => {
    const r2 = summarizeParticipantes(
      [{ codigoUnidade: '200330', nomeUnidade: 'SENASP 2', tipoUnidade: 'GERENCIADORA', quantidadeRegistrada: 10, saldoRemanejamentoEmpenho: 4 }],
      { ugUasg: '200331', contratadoUG: 690 }
    );
    expect(r2.rows[0]).toMatchObject({ gerenciadora: true, consumido: 6, fonte: 'COMPRASGOV' });
  });
});
