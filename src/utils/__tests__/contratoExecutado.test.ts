import { describe, it, expect } from 'vitest';
import { conferirExecucao, pendenciasDoFechamento, type ExecucaoDoContrato } from '../contratoExecutado';
import { matchesStatusFilter } from '../../components/carteira/carteiraPrazo';
import { buildCentralPrazosItems } from '../../services/centralPrazosService';
import { calculateDeadlinesSummary } from '../../services/dashboardService';
import { mapExecucao } from '../../services/contratoExecucaoService';
import type { ContractDashboardRecord } from '../../types';

const base: ExecucaoDoContrato = {
  contractKey: '200331-00105-2026',
  valorGlobal: 1000,
  faturado: 1000,
  faturasAbertas: 0,
  saldoEmpenho: 0,
  fiscalizacao: 'SEM',
  estado: 'SUGERIDO',
  decisaoSuperada: false
};

describe('escopo cumprido do contrato (migration 314)', () => {
  it('conferência: tudo cumprido não deixa pendência de fechamento', () => {
    expect(conferirExecucao(base).every((c) => c.resultado === 'ok')).toBe(true);
    expect(pendenciasDoFechamento(base)).toEqual([]);
  });

  it('saldo de empenho acima de 1% vira pendência de fechamento, sem impedir', () => {
    const e = { ...base, saldoEmpenho: 200 };
    expect(pendenciasDoFechamento(e).map((c) => c.id)).toEqual(['SALDO_EMPENHO']);
    expect(conferirExecucao(e).some((c) => c.resultado === 'bloqueia')).toBe(false);
  });

  it('faturado fora de 99% a 101%, fatura aberta ou fiscalização em curso aparecem como impedimento', () => {
    const r = (e: Partial<ExecucaoDoContrato>) => conferirExecucao({ ...base, ...e }).filter((c) => c.resultado === 'bloqueia').map((c) => c.id);
    expect(r({ faturado: 980 })).toEqual(['FATURADO']);
    expect(r({ faturado: 3000 })).toEqual(['FATURADO']);
    expect(r({ faturasAbertas: 1 })).toEqual(['FATURAS_ABERTAS']);
    expect(r({ fiscalizacao: 'EM_CURSO' })).toEqual(['FISCALIZACAO']);
  });

  it('leitura da visão: confirmação só no estado EXECUTADO', () => {
    const exec = mapExecucao({ contract_key: 'K', valor_global: '1000', faturado: '1000', faturas_abertas: 0, saldo_empenho: '0', fiscalizacao: 'FINALIZADA', estado: 'EXECUTADO', decisao_superada: false, documento_sei: '34152364', data_recebimento: '2026-11-10', decidido_por_nome: 'Gestor A', decidido_em: '2026-11-12T10:00:00Z' });
    expect(exec.confirmado).toEqual({ em: '2026-11-12T10:00:00Z', por: 'Gestor A', sei: '34152364', dataRecebimento: '2026-11-10' });
    const sug = mapExecucao({ contract_key: 'K', valor_global: 1000, faturado: 1000, estado: 'SUGERIDO', decisao_superada: true, fiscalizacao: null });
    expect(sug.confirmado).toBeUndefined();
    expect(sug.fiscalizacao).toBe('SEM');
    expect(sug.decisaoSuperada).toBe(true);
    expect(mapExecucao({ contract_key: 'K', estado: null }).estado).toBeNull();
  });

  it('Carteira: executado sai de Vigentes, Atenção e Crítico e fica em Executados; vencido vai para Encerrados', () => {
    expect(matchesStatusFilter('REGULAR', 'VIGENTES', true)).toBe(false);
    expect(matchesStatusFilter('CRITICO', 'CRITICO', true)).toBe(false);
    expect(matchesStatusFilter('ATENCAO', 'ATENCAO', true)).toBe(false);
    expect(matchesStatusFilter('CRITICO', 'EXECUTADOS', true)).toBe(true);
    expect(matchesStatusFilter('REGULAR', 'TODOS', true)).toBe(true);
    expect(matchesStatusFilter('EXPIRADO', 'EXECUTADOS', true)).toBe(false);
    expect(matchesStatusFilter('EXPIRADO', 'HISTORICO', true)).toBe(true);
    expect(matchesStatusFilter('REGULAR', 'VIGENTES')).toBe(true);
    expect(matchesStatusFilter('REGULAR', 'EXECUTADOS')).toBe(false);
  });

  const contrato: ContractDashboardRecord = {
    id: '200331-00105-2026',
    numero: '00105',
    ano: 2026,
    numeroFormatado: '00105/2026',
    uasg: '200331',
    valorGlobal: 1000,
    dataVigenciaInicio: '2026-01-01',
    dataVigenciaFim: '2026-12-31',
    statusVigencia: 'Vigente',
    fonteDados: 'Contratos.gov.br'
  };
  const hoje = new Date('2026-11-16T12:00:00-03:00');

  it('Início: executado não gera os gatilhos de prorrogação e término da vigência', () => {
    const gatilhos = (executados?: Set<string>) =>
      buildCentralPrazosItems({ contracts: [contrato], contratosExecutados: executados, currentDate: hoje }).filter((i) => i.tipoItem === 'GATILHO_OPERACIONAL');
    expect(gatilhos().length).toBeGreaterThan(0);
    expect(gatilhos(new Set([contrato.id]))).toEqual([]);
  });

  it('Início: executado sai das contas de vencimento', () => {
    expect(calculateDeadlinesSummary([contrato], hoje).itensVencendo).toHaveLength(1);
    const sem = calculateDeadlinesSummary([contrato], hoje, new Set([contrato.id]));
    expect(sem.itensVencendo).toHaveLength(0);
    expect(sem.vencendo30Dias + sem.vencendo60Dias + sem.vencendo90Dias).toBe(0);
  });
});
