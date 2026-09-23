import { describe, it, expect } from 'vitest';
import { 
  mergeOfficialAndInternalContractData, 
  calculateStatusVigencia 
} from '../contractService';
import { resolveContractKey } from '../../utils/contractKeyUtils';
import { OFFICIAL_CONTRACT_FIELDS, INTERNAL_CONTRACT_FIELDS } from '../../types';
import type { ContractDashboardRecord } from '../../types';

describe('Fase 1 — Fundação do Modelo Gerencial, Data Lineage e Sincronização Não-Destrutiva', () => {

  const sampleOfficialContract: ContractDashboardRecord = {
    id: '200331-00015-2026',
    numero: '15/2026',
    ano: 2026,
    numeroFormatado: '15/2026',
    uasg: '200331',
    nomeUnidadeGestora: 'SENASP',
    objeto: 'Aquisição de viaturas operacionais',
    fornecedorNome: 'FORNECEDOR OFICIAL S.A.',
    fornecedorCnpjCpf: '12345678000199',
    valorGlobal: 1500000.00,
    valorInicial: 1500000.00,
    dataAssinatura: '2026-01-10',
    dataVigenciaInicio: '2026-01-15',
    dataVigenciaFim: '2027-01-15',
    statusVigencia: 'Vigente',
    numeroControlePncp: '00394494000136-2-000015/2026',
    contratoId: 10452,
    fonteDados: 'Contratos.gov.br',
    sourceSystem: 'Contratos.gov.br',
    sourceRecordId: 10452,
    sourceUpdatedAt: '2026-01-10',
    lastSyncedAt: '2026-09-23T08:00:00.000Z',
    origem: 'API'
  };

  describe('1. Idempotência e Zero Duplicidade na Identidade Canônica', () => {
    it('resolveContractKey gera chave canônica idêntica para múltiplos formatos do mesmo contrato', () => {
      const k1 = resolveContractKey('200331', '15/2026');
      const k2 = resolveContractKey('200331', '00015/2026');
      const k3 = resolveContractKey('200331', '  15/2026  ');
      const k4 = resolveContractKey('200331', '15/26');

      expect(k1.tipo).toBe('CONTRATO');
      expect(k1.key).toBe('200331-00015-2026');
      expect(k2.key).toBe(k1.key);
      expect(k3.key).toBe(k1.key);
      expect(k4.key).toBe(k1.key);
    });

    it('executar múltiplas inserções em mapa de sincronização não cria registros duplicados (Idempotência)', () => {
      const syncMap = new Map<string, ContractDashboardRecord>();

      // Sincronização 1
      const res1 = resolveContractKey(sampleOfficialContract.uasg, sampleOfficialContract.numero, sampleOfficialContract.ano);
      syncMap.set(res1.key, sampleOfficialContract);

      expect(syncMap.size).toBe(1);

      // Sincronização 2 (mesmo contrato retornado na segunda execução)
      const res2 = resolveContractKey(sampleOfficialContract.uasg, '00015/2026', sampleOfficialContract.ano);
      syncMap.set(res2.key, sampleOfficialContract);

      expect(syncMap.size).toBe(1);
      expect(Array.from(syncMap.keys())).toEqual(['200331-00015-2026']);
    });
  });

  describe('2. Preservação de Dados Operacionais Internos (Regra Não-Destrutiva)', () => {
    it('merge preserva intactos gestor, plano de tarefas e observações internas após atualização oficial', () => {
      const internalManager = {
        gestorNome: 'João da Silva',
        updatedAt: '2026-09-20T14:30:00.000Z'
      };

      const internalPlan = {
        id: 'plan-xyz',
        progresso: { total: 5, concluidas: 2, percentual: 40 }
      };

      const internalMeta = {
        observacoes: 'Processo em análise junto à assessoria jurídica'
      };

      // Realiza o merge da API com os dados cadastrados pela equipe
      const merged = mergeOfficialAndInternalContractData(
        sampleOfficialContract,
        internalManager,
        internalPlan,
        internalMeta
      );

      // Dados Oficiais intactos da API
      expect(merged.numero).toBe('15/2026');
      expect(merged.fornecedorNome).toBe('FORNECEDOR OFICIAL S.A.');
      expect(merged.valorGlobal).toBe(1500000.00);
      expect(merged.fonteDados).toBe('Contratos.gov.br');

      // Dados Internos preservados rigorosamente
      expect(merged.gestorNome).toBe('João da Silva');
      expect(merged.gestorUpdatedAt).toBe('2026-09-20T14:30:00.000Z');
      expect(merged.hasTaskPlan).toBe(true);
      expect(merged.observacoesInternas).toBe('Processo em análise junto à assessoria jurídica');
    });

    it('merge lida corretamente quando não há dados internos cadastrados sem gerar erros', () => {
      const merged = mergeOfficialAndInternalContractData(
        sampleOfficialContract,
        null,
        null,
        null
      );

      expect(merged.numero).toBe('15/2026');
      expect(merged.gestorNome).toBeUndefined();
      expect(merged.hasTaskPlan).toBe(false);
      expect(merged.observacoesInternas).toBeUndefined();
    });
  });

  describe('3. Atualização de Dados Oficiais da API', () => {
    it('atualização oficial reflete novo valor e vigência sem perder metadados de linhagem', () => {
      const updatedApiRecord: ContractDashboardRecord = {
        ...sampleOfficialContract,
        valorGlobal: 1850000.00, // Aditivo de valor registrado na fonte oficial
        dataVigenciaFim: '2027-07-15', // Prorrogação oficial
        sourceUpdatedAt: '2026-09-22',
        lastSyncedAt: '2026-09-23T09:00:00.000Z'
      };

      const internalManager = {
        gestorNome: 'João da Silva',
        updatedAt: '2026-09-20T14:30:00.000Z'
      };

      const merged = mergeOfficialAndInternalContractData(
        updatedApiRecord,
        internalManager
      );

      // Campos oficiais atualizados
      expect(merged.valorGlobal).toBe(1850000.00);
      expect(merged.dataVigenciaFim).toBe('2027-07-15');
      expect(merged.sourceUpdatedAt).toBe('2026-09-22');
      expect(merged.lastSyncedAt).toBe('2026-09-23T09:00:00.000Z');

      // Dado interno preservado
      expect(merged.gestorNome).toBe('João da Silva');
    });
  });

  describe('4. Campos Derivados vs Campos Manuais', () => {
    it('calculateStatusVigencia deriva status correto sem depender de digitação manual', () => {
      // Data futura distante (> 60 dias)
      const dataFutura = new Date();
      dataFutura.setDate(dataFutura.getDate() + 120);
      expect(calculateStatusVigencia(dataFutura.toISOString().split('T')[0])).toBe('Vigente');

      // Data próxima (<= 60 dias)
      const dataProxima = new Date();
      dataProxima.setDate(dataProxima.getDate() + 25);
      expect(calculateStatusVigencia(dataProxima.toISOString().split('T')[0])).toBe('A Vencer (60d)');

      // Data passada (< 0 dias)
      const dataPassada = new Date();
      dataPassada.setDate(dataPassada.getDate() - 10);
      expect(calculateStatusVigencia(dataPassada.toISOString().split('T')[0])).toBe('Expirado');

      // Indefinida
      expect(calculateStatusVigencia(undefined)).toBe('Não Informado');
    });
  });

  describe('5. Auditoria de Separação de Campos Oficiais e Internos', () => {
    it('constantes de campos cobrem a separação de autoridade do domínio', () => {
      expect(OFFICIAL_CONTRACT_FIELDS).toContain('numero');
      expect(OFFICIAL_CONTRACT_FIELDS).toContain('fornecedorNome');
      expect(OFFICIAL_CONTRACT_FIELDS).toContain('fornecedorCnpjCpf');
      expect(OFFICIAL_CONTRACT_FIELDS).toContain('valorGlobal');
      expect(OFFICIAL_CONTRACT_FIELDS).toContain('dataVigenciaFim');
      expect(OFFICIAL_CONTRACT_FIELDS).toContain('fonteDados');

      expect(INTERNAL_CONTRACT_FIELDS).toContain('gestorNome');
      expect(INTERNAL_CONTRACT_FIELDS).toContain('planoTarefas');
      expect(INTERNAL_CONTRACT_FIELDS).toContain('observacoes');
      expect(INTERNAL_CONTRACT_FIELDS).toContain('processoSeiId');

      // Garantir não-intersecção (nenhum campo pode ser oficial e interno ao mesmo tempo)
      const officialSet = new Set<string>(OFFICIAL_CONTRACT_FIELDS as readonly string[]);
      for (const internalField of INTERNAL_CONTRACT_FIELDS) {
        expect(officialSet.has(internalField)).toBe(false);
      }
    });
  });

});
