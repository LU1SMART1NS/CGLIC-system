import { describe, expect, it } from 'vitest';
import { cobrancaDaComissao, datasDoRecebimento, origemDoRecebimento, prazoDoRecebimento, textoDaRegraDeRecebimento, trdAte, trpAte, type RegraDoRecebimento } from '../fiscalizacaoRecebimento';

// Modelo da AGU: TRP no ato da entrega; TRD em 10 dias úteis do recebimento da nota (que chega com a entrega).
const AGU: RegraDoRecebimento = { trpDias: 0, trpContagem: 'CORRIDOS', trdDias: 10, trdContagem: 'UTEIS', trdInicio: 'ENTREGA', origem: 'TR', ata: '00047/2024' };

describe('prazos de recebimento', () => {
  it('TRP no ato da entrega vence no próprio dia', () => {
    expect(trpAte('2026-11-10', AGU)).toBe('2026-11-10');
    expect(trpAte('2026-11-10', { ...AGU, trpDias: 5 })).toBe('2026-11-16'); // 15/11 é domingo e feriado
  });

  it('TRD em dias úteis pula fim de semana e feriados (15 e 20/11)', () => {
    expect(trdAte('2026-11-10', null, AGU)).toBe('2026-11-25');
  });

  it('TRD contado do TRP usa a data do TRP', () => {
    expect(trdAte('2026-11-03', '2026-11-10', { ...AGU, trdInicio: 'TRP' })).toBe('2026-11-25');
  });

  it('só a data da etapa atual é calculada; o envio conta 5 dias úteis do TRD', () => {
    expect(datasDoRecebimento({ etapa: 'ENTREGUE', entregueEm: '2026-11-10', etapaEm: '2026-11-10' }, AGU).trpAte).toBe('2026-11-10');
    expect(datasDoRecebimento({ etapa: 'TRP', entregueEm: '2026-11-10', etapaEm: '2026-11-10' }, AGU)).toEqual({ trpAte: null, trdAte: '2026-11-25', envioAte: null });
    expect(datasDoRecebimento({ etapa: 'TRD', entregueEm: '2026-11-10', etapaEm: '2026-11-25' }, null).envioAte).toBe('2026-12-02');
    expect(datasDoRecebimento({ etapa: 'TRP', entregueEm: '2026-11-10', etapaEm: '2026-11-10' }, null).trdAte).toBeNull();
  });

  it('texto da regra', () => {
    expect(textoDaRegraDeRecebimento(AGU)).toMatch(/^TRP no ato da entrega · TRD em 10 dias úteis da entrega/);
  });
});

describe('situação do recebimento', () => {
  const hoje = '2026-11-13';
  it('vencido, vence hoje, em atenção e no prazo', () => {
    expect(prazoDoRecebimento({ etapa: 'TRP', entregueEm: '2026-07-01', trdAte: '2026-07-15' }, hoje)).toMatchObject({ texto: 'TRD vencido há 121 dias', tom: 'danger' });
    expect(prazoDoRecebimento({ etapa: 'ENTREGUE', entregueEm: hoje, trpAte: hoje }, hoje)).toMatchObject({ texto: 'TRP vence hoje', tom: 'warning' });
    expect(prazoDoRecebimento({ etapa: 'TRD', entregueEm: '2026-11-01', envioAte: '2026-11-16' }, hoje)).toMatchObject({ tom: 'warning' });
    expect(prazoDoRecebimento({ etapa: 'TRP', entregueEm: '2026-11-10', trdAte: '2026-11-25' }, hoje)).toMatchObject({ texto: 'TRD até 25/11/2026', tom: 'neutral' });
  });

  it('sem data da entrega, sem regra e fora do recebimento', () => {
    expect(prazoDoRecebimento({ etapa: 'ENTREGUE', entregueEm: null }, hoje)?.texto).toBe('Data da entrega a registrar');
    expect(prazoDoRecebimento({ etapa: 'TRP', entregueEm: '2026-11-10', regraDeRecebimento: false }, hoje)?.texto).toBe('Prazo de recebimento a informar');
    expect(prazoDoRecebimento({ etapa: 'PRODUCAO', entregueEm: null }, hoje)).toBeNull();
  });
});

describe('comissão de recebimento', () => {
  it('cobra 10 dias depois do envio e conta de novo da última cobrança', () => {
    expect(cobrancaDaComissao({ etapa: 'ENTREGUE', comissaoEnviadaEm: '2026-11-05' }, '2026-11-13')).toMatchObject({ cobrarEm: '2026-11-15', vencida: false, dias: 8 });
    expect(cobrancaDaComissao({ etapa: 'ENTREGUE', comissaoEnviadaEm: '2026-10-20' }, '2026-11-13')).toMatchObject({ cobrarEm: '2026-10-30', vencida: true, dias: 24 });
    expect(cobrancaDaComissao({ etapa: 'ENTREGUE', comissaoEnviadaEm: '2026-10-20', comissaoCobradaEm: '2026-11-06' }, '2026-11-13')).toMatchObject({ cobrarEm: '2026-11-16', vencida: false });
  });
  it('fora da comissão: sem envio ou já com TRP', () => {
    expect(cobrancaDaComissao({ etapa: 'ENTREGUE' }, '2026-11-13')).toBeNull();
    expect(cobrancaDaComissao({ etapa: 'TRD', comissaoEnviadaEm: '2026-10-20' }, '2026-11-13')).toBeNull();
  });
});

describe('comissão de recebimento no TRD', () => {
  it('depois do TRP, a comissão deve o TRD: a conta recomeça do TRP', () => {
    expect(cobrancaDaComissao({ etapa: 'TRP', etapaEm: '2026-11-06', comissaoEnviadaEm: '2026-10-20' }, '2026-11-13')).toMatchObject({ passo: 'TRD', desde: '2026-11-06', cobrarEm: '2026-11-16', vencida: false, dias: 7 });
    expect(cobrancaDaComissao({ etapa: 'TRP', etapaEm: '2026-10-25', comissaoEnviadaEm: '2026-10-20' }, '2026-11-13')).toMatchObject({ passo: 'TRD', vencida: true, dias: 19 });
  });
  it('a cobrança do TRP não vale para o TRD; a do TRD conta de novo', () => {
    const doTrp = { etapa: 'TRP' as const, etapaEm: '2026-10-25', comissaoEnviadaEm: '2026-10-10', comissaoCobradaEm: '2026-10-21', comissaoCobrancas: 2 };
    expect(cobrancaDaComissao(doTrp, '2026-11-13')).toMatchObject({ cobrarEm: '2026-11-04', cobrancas: 0 });
    expect(cobrancaDaComissao({ ...doTrp, comissaoCobradaEm: '2026-11-08', comissaoCobrancas: 1 }, '2026-11-13')).toMatchObject({ cobrarEm: '2026-11-18', vencida: false, cobrancas: 1 });
  });
  it('item no TRP sem passar pela comissão segue o prazo do TR', () => {
    expect(cobrancaDaComissao({ etapa: 'TRP', etapaEm: '2026-11-06' }, '2026-11-13')).toBeNull();
  });
});

describe('leitura automática do TR (migration 309)', () => {
  it('diz que a regra foi lida do TR sem confirmação', () => {
    expect(origemDoRecebimento({ ...AGU, automatico: true })).toBe('lido do TR da ata 00047/2024 (leitura automática)');
    expect(origemDoRecebimento({ ...AGU, confirmadoPor: 'Fulana' })).toBe('do TR da ata 00047/2024, confirmado por Fulana');
  });
});
