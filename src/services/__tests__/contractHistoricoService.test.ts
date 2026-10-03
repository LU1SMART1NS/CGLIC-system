import { describe, it, expect } from 'vitest';
import type { ContractDashboardRecord } from '../../types';
import type { ContratosGovHistoricoRecord } from '../../types/contractHistorico';
import { buildContractEventsFromHistorico, parseValorBR } from '../contractHistoricoService';

const contract = {
  id: '110099-00009-2024',
  numero: '00009',
  ano: 2024,
  numeroFormatado: '00009/2024',
  uasg: '110099',
  valorInicial: 1321492.8,
  dataAssinatura: '2024-08-13',
  dataVigenciaInicio: '2024-08-22',
  dataVigenciaFim: '2029-08-22',
  statusVigencia: 'Vigente',
  fonteDados: 'Contratos.gov.br'
} as ContractDashboardRecord;

/**
 * Registros reais do /historico do contrato 00009/2024 (AGU, UASG 110099), na ordem em que a API devolve.
 * O aditivo 00001/2026 foi cadastrado em 2026 e já traz o valor novo; quem reduziu o valor
 * foi o apostilamento 00002/2025.
 */
const HISTORICO: ContratosGovHistoricoRecord[] = [
  { id: 711424, tipo: 'Contrato', numero: '00009/2024', qualificacao_termo: null, observacao: 'CELEBRAÇÃO DO CONTRATO: 00009/2024', data_assinatura: '2024-08-13', data_publicacao: '2024-08-15', vigencia_inicio: '2024-08-22', vigencia_fim: '2029-08-22', valor_global: '1.321.492,80', novo_valor_global: '0,00', criado_em: '2024-08-14T10:00:00' },
  { id: 800001, tipo: 'Termo de Apostilamento', numero: '00001/2025', qualificacao_termo: null, observacao: '1º TERMO DE APOSTILAMENTO AO CONTRATO Nº 09/2024 - INCLUSÃO DE EMPENHO', data_assinatura: '2025-05-07', data_publicacao: '2025-05-09', vigencia_inicio: '2024-08-22', vigencia_fim: '2029-08-22', valor_global: '1.321.492,80', novo_valor_global: '1.321.492,80', criado_em: '2025-05-08T10:00:00' },
  { id: 800002, tipo: 'Termo de Apostilamento', numero: '00002/2025', qualificacao_termo: null, observacao: 'QUE SE PROCEDA À REPACTUAÇÃO DO VALOR MENSAL ESTIMADO DO CONTRATO', data_assinatura: '2025-12-18', data_publicacao: null, vigencia_inicio: '2024-08-22', vigencia_fim: '2029-08-22', valor_global: '1.270.002,00', novo_valor_global: '1.270.002,00', criado_em: '2025-12-30T10:00:00' },
  { id: 800003, tipo: 'Termo Aditivo', numero: '00001/2026', qualificacao_termo: [{ codigo: 4, descricao: 'REAJUSTE' }], observacao: 'REVISAR O CONTRATO PARA EXCLUIR CUSTOS FIXOS', data_assinatura: '2025-08-22', data_publicacao: '2026-04-14', vigencia_inicio: '2025-08-23', vigencia_fim: '2029-08-22', valor_global: '1.270.002,00', novo_valor_global: '0,00', criado_em: '2026-04-13T10:00:00' },
  { id: 800004, tipo: 'Termo Aditivo', numero: '00002/2026', qualificacao_termo: [{ codigo: 5, descricao: 'INFORMATIVO' }], observacao: 'REDUZIR A JORNADA DE TRABALHO DE 44 PARA 40 HORAS', data_assinatura: '2026-04-28', data_publicacao: '2026-05-01', vigencia_inicio: '2026-05-01', vigencia_fim: '2029-08-22', valor_global: '1.270.002,00', novo_valor_global: '0,00', criado_em: '2026-04-30T10:00:00' }
];

describe('parseValorBR', () => {
  it('lê valor em formato brasileiro, número e vazio', () => {
    expect(parseValorBR('1.270.002,00')).toBe(1270002);
    expect(parseValorBR('0,00')).toBe(0);
    expect(parseValorBR(1234.5)).toBe(1234.5);
    expect(parseValorBR(null)).toBeUndefined();
    expect(parseValorBR('')).toBeUndefined();
  });
});

describe('buildContractEventsFromHistorico (contrato real 00009/2024)', () => {
  const events = buildContractEventsFromHistorico(contract, HISTORICO);
  const byNumero = (n: string) => events.find((e) => e.numeroSequencial === n)!;

  it('não repete a celebração: só os 4 termos viram evento', () => {
    expect(events).toHaveLength(4);
    expect(events.some((e) => e.tipoEvento === 'CELEBRACAO')).toBe(false);
    expect(new Set(events.map((e) => e.id)).size).toBe(4);
  });

  it('apostilamento sem mudança de valor só atualiza dados', () => {
    expect(byNumero('00001/2025')).toMatchObject({
      tipoEvento: 'APOSTILAMENTO',
      naturezaInstrumento: 'TERMO_APOSTILAMENTO',
      impacto: 'ATUALIZA_DADOS',
      variacaoValor: 0
    });
  });

  it('atribui a redução de valor ao apostilamento que a fez, mesmo com o aditivo cadastrado depois', () => {
    expect(byNumero('00002/2025')).toMatchObject({
      tipoEvento: 'APOSTILAMENTO',
      impacto: 'ALTERA_VALOR',
      valorAnterior: 1321492.8,
      valorPosterior: 1270002,
      variacaoValor: -51490.8,
      percentualVariacaoValor: -3.9
    });
  });

  it('aditivo de reajuste e aditivo informativo não viram prorrogação', () => {
    expect(byNumero('00001/2026')).toMatchObject({ tipoEvento: 'REAJUSTE', naturezaInstrumento: 'TERMO_ADITIVO', variacaoValor: 0 });
    expect(byNumero('00002/2026')).toMatchObject({ tipoEvento: 'APOSTILAMENTO', naturezaInstrumento: 'TERMO_ADITIVO', impacto: 'ATUALIZA_DADOS' });
    expect(events.some((e) => e.tipoEvento === 'PRORROGACAO')).toBe(false);
  });

  it('preenche datas, identificação, descrição e fonte', () => {
    expect(byNumero('00001/2026')).toMatchObject({
      identificadorOficial: 'Termo Aditivo 00001/2026',
      descricao: 'REVISAR O CONTRATO PARA EXCLUIR CUSTOS FIXOS',
      dataAssinatura: '2025-08-22',
      dataPublicacao: '2026-04-14',
      dataVigenciaEfeito: '2025-08-23',
      fonteOrigem: 'Contratos.gov.br',
      contractKey: '110099-00009-2024'
    });
    expect(byNumero('00002/2025').dataPublicacao).toBeUndefined();
  });
});

describe('buildContractEventsFromHistorico (classificação)', () => {
  const base: ContratosGovHistoricoRecord = { id: 1, tipo: 'Contrato', numero: '00001/2025', data_assinatura: '2025-01-10', vigencia_fim: '2026-01-10', valor_global: '1.000,00', criado_em: '2025-01-11' };
  const termo = (over: Partial<ContratosGovHistoricoRecord>): ContratosGovHistoricoRecord => ({
    id: 2, tipo: 'Termo Aditivo', numero: '00001/2026', data_assinatura: '2026-01-05', vigencia_fim: '2026-01-10', valor_global: '1.000,00', novo_valor_global: '0,00', criado_em: '2026-01-06', ...over
  });
  const run = (t: ContratosGovHistoricoRecord) => buildContractEventsFromHistorico(contract, [base, t])[0];

  it('qualificação VIGÊNCIA é prorrogação', () => {
    expect(run(termo({ qualificacao_termo: [{ descricao: 'VIGÊNCIA' }], vigencia_fim: '2027-01-10' }))).toMatchObject({
      tipoEvento: 'PRORROGACAO',
      impacto: 'ALTERA_VIGENCIA',
      vigenciaAnterior: '2026-01-10',
      vigenciaPosterior: '2027-01-10'
    });
  });

  it('prorrogação com mudança de valor altera valor', () => {
    expect(run(termo({ qualificacao_termo: [{ descricao: 'VIGÊNCIA' }, { descricao: 'REAJUSTE' }], vigencia_fim: '2027-01-10', novo_valor_global: '1.100,00' }))).toMatchObject({
      tipoEvento: 'PRORROGACAO',
      impacto: 'ALTERA_VALOR',
      variacaoValor: 100
    });
  });

  it('acréscimo / supressão segue o sinal da variação', () => {
    expect(run(termo({ qualificacao_termo: [{ descricao: 'ACRÉSCIMO / SUPRESSÃO' }], novo_valor_global: '800,00' }))).toMatchObject({ tipoEvento: 'SUPRESSAO', variacaoValor: -200 });
    expect(run(termo({ qualificacao_termo: [{ descricao: 'ACRÉSCIMO / SUPRESSÃO' }], novo_valor_global: '1.250,00' }))).toMatchObject({ tipoEvento: 'ACRESCIMO', variacaoValor: 250 });
  });

  it('sem qualificação, a mudança de vigência define a prorrogação', () => {
    expect(run(termo({ qualificacao_termo: null, vigencia_fim: '2027-06-30' })).tipoEvento).toBe('PRORROGACAO');
  });

  it('rescisão segue o classificador geral', () => {
    expect(run(termo({ tipo: 'Termo de Rescisão' }))).toMatchObject({ tipoEvento: 'RESCISAO', impacto: 'EXTINGUE_CONTRATO' });
  });

  it('termos com o mesmo número não colidem', () => {
    const a = termo({ id: 10, numero: '00001/2026' });
    const b = termo({ id: 11, numero: '00001/2026', criado_em: '2026-01-07' });
    const ev = buildContractEventsFromHistorico(contract, [base, a, b]);
    expect(new Set(ev.map((e) => e.id)).size).toBe(2);
  });

  it('lista vazia ou inválida não gera evento', () => {
    expect(buildContractEventsFromHistorico(contract, [])).toEqual([]);
    expect(buildContractEventsFromHistorico(contract, undefined as unknown as ContratosGovHistoricoRecord[])).toEqual([]);
    expect(buildContractEventsFromHistorico(contract, [base])).toEqual([]);
  });
});
