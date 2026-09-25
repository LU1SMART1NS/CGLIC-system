import { describe, it, expect } from 'vitest';
import {
  generateIdempotentItemId,
  buildCentralPrazosItems,
  calculateCentralPrazosKPIs,
  filterCentralPrazosItems
} from '../centralPrazosService';
import type {
  ContractDashboardRecord,
  ArpRecord,
  ContractManager,
  ContractTaskPlan
} from '../../types';
import type { CentralPrazosFilterParams } from '../../types/centralPrazos';
import { parseDateBRT } from '../temporalEngineService';

describe('Fase 3.1 — Serviço Agregador da Central de Prazos (centralPrazosService)', () => {

  const sampleContract: ContractDashboardRecord = {
    id: '200331-00015-2026',
    numero: '15/2026',
    ano: 2026,
    numeroFormatado: '15/2026',
    uasg: '200331',
    nomeUnidadeGestora: 'SENASP',
    objeto: 'Prestação de serviços de apoio operacional',
    fornecedorNome: 'EMPRESA BRASIL LTDA',
    fornecedorCnpjCpf: '11222333000199',
    valorGlobal: 500000.0,
    dataVigenciaInicio: '2026-01-01',
    dataVigenciaFim: '2027-01-01',
    statusVigencia: 'Vigente',
    fonteDados: 'Contratos.gov.br'
  };

  const sampleArp: ArpRecord = {
    numeroAtaRegistroPreco: '00049/2025',
    codigoUnidadeGerenciadora: '200331',
    nomeUnidadeGerenciadora: 'SENASP',
    codigoOrgao: 0,
    nomeOrgao: 'SENASP',
    numeroCompra: '90005',
    anoCompra: '2025',
    codigoModalidadeCompra: '05',
    nomeModalidadeCompra: 'Pregão',
    dataAssinatura: '2025-08-26',
    dataVigenciaInicial: '2025-08-29',
    dataVigenciaFinal: '2027-08-29',
    valorTotal: 689604.0,
    statusAta: 'Vigente',
    objeto: 'Registro de preços para eventual aquisição de viaturas',
    quantidadeItens: 11,
    dataHoraAtualizacao: '2026-08-19',
    dataHoraInclusao: '2025-08-26',
    dataHoraExclusao: null,
    ataExcluido: false,
    numeroControlePncpAta: '00394494000136-1-000670/2025-000001',
    numeroControlePncpCompra: '',
    idCompra: '200331900052025'
  };

  const sampleManager: ContractManager = {
    contractKey: '200331-00015-2026',
    uasg: '200331',
    numero: '15/2026',
    ano: 2026,
    gestorNome: 'João da Silva',
    createdAt: '2026-01-10T10:00:00Z',
    updatedAt: '2026-01-10T10:00:00Z'
  };

  const samplePlan: ContractTaskPlan = {
    id: 'plan-1',
    contractKey: '200331-00015-2026',
    uasg: '200331',
    numero: '15/2026',
    ano: 2026,
    templateNome: 'Gestão Ordinária',
    appliedAt: '2026-01-15T10:00:00Z',
    macrotarefas: [
      {
        id: 'macro-1',
        planId: 'plan-1',
        nome: 'Fiscalização Mensal',
        ordem: 1,
        tarefas: [
          {
            id: 'task-101',
            macrotaskId: 'macro-1',
            nome: 'Verificar Relatório de Medição',
            ordem: 1,
            status: 'PENDENTE',
            responsavelNome: 'Maria Fiscal',
            prazo: '2026-09-20', // Data no passado (atrasada em relação a 23/09)
            criadoEm: '2026-09-01T10:00:00Z',
            atualizadoEm: '2026-09-01T10:00:00Z'
          },
          {
            id: 'task-102',
            macrotaskId: 'macro-1',
            nome: 'Atestar Nota Fiscal',
            ordem: 2,
            status: 'EM_ANDAMENTO',
            responsavelNome: undefined, // Sem responsável explícito (deve herdar gestor)
            prazo: '2026-09-23', // Vence hoje
            criadoEm: '2026-09-01T10:00:00Z',
            atualizadoEm: '2026-09-01T10:00:00Z'
          }
        ]
      }
    ],
    progresso: { total: 2, concluidas: 0, pendentes: 1, emAndamento: 1, naoAplicaveis: 0, atrasadas: 1, percentual: 0 }
  };

  describe('1. Idempotência e Geração de Chaves Lógicas', () => {
    it('generateIdempotentItemId gera chave canônica única e determinística', () => {
      const key1 = generateIdempotentItemId({
        tipoEntidade: 'CONTRATO',
        idEntidade: '200331-00015-2026',
        eventoId: 'PRORROGACAO',
        regraId: 'GATILHO_180D',
        cicloRef: 'VIG_20270101'
      });

      const key2 = generateIdempotentItemId({
        tipoEntidade: 'CONTRATO',
        idEntidade: '200331-00015-2026',
        eventoId: 'PRORROGACAO',
        regraId: 'GATILHO_180D',
        cicloRef: 'VIG_20270101'
      });

      expect(key1).toBe('CONTRATO::200331-00015-2026::PRORROGACAO::GATILHO_180D::VIG_20270101');
      expect(key1).toBe(key2);
    });

    it('diferencia múltiplos ciclos de prorrogação após alteração de vigência oficial', () => {
      const ciclo1 = generateIdempotentItemId({
        tipoEntidade: 'CONTRATO',
        idEntidade: '200331-00015-2026',
        eventoId: 'PRORROGACAO',
        regraId: 'GATILHO_180D',
        cicloRef: 'VIG_20261130'
      });

      const ciclo2 = generateIdempotentItemId({
        tipoEntidade: 'CONTRATO',
        idEntidade: '200331-00015-2026',
        eventoId: 'PRORROGACAO',
        regraId: 'GATILHO_180D',
        cicloRef: 'VIG_20271130'
      });

      expect(ciclo1).not.toBe(ciclo2);
      expect(ciclo1).toContain('VIG_20261130');
      expect(ciclo2).toContain('VIG_20271130');
    });
  });

  describe('2. Agregação de Contratos, ARPs e Tarefas', () => {
    const refDate = parseDateBRT('2026-09-23')!;

    it('agrega tarefas humanas e gatilhos operacionais de contratos e ARPs', () => {
      const items = buildCentralPrazosItems(
        [sampleContract],
        [sampleArp],
        { [sampleContract.id]: sampleManager },
        { [sampleContract.id]: samplePlan },
        refDate
      );

      expect(items.length).toBeGreaterThanOrEqual(4);

      // Tarefa 101 (Atrasada)
      const task101 = items.find(i => i.tarefaId === 'task-101');
      expect(task101).toBeDefined();
      expect(task101!.tipoItem).toBe('TAREFA_HUMANA');
      expect(task101!.responsavelNome).toBe('Maria Fiscal');
      expect(task101!.estadoTemporal).toBe('ATRASADO');
      expect(task101!.diasRestantes).toBe(-3);

      // Tarefa 102 (Vence hoje, herda gestor)
      const task102 = items.find(i => i.tarefaId === 'task-102');
      expect(task102).toBeDefined();
      expect(task102!.responsavelNome).toBe('João da Silva'); // Herdado do gestor
      expect(task102!.isGestorContrato).toBe(true);
      expect(task102!.estadoTemporal).toBe('VENCE_HOJE');
      expect(task102!.diasRestantes).toBe(0);

      // Gatilho 180d do contrato
      const trigger180 = items.find(i => i.id.includes('GATILHO_180D'));
      expect(trigger180).toBeDefined();
      expect(trigger180!.tipoItem).toBe('GATILHO_OPERACIONAL');
      expect(trigger180!.marcoEvento).toBe('Término da Vigência');
      expect(trigger180!.regraTipo).toBe('OPERACIONAL');

      // Gatilho da ARP
      const arpTrigger = items.find(i => i.entidadeOrigem === 'ARP');
      expect(arpTrigger).toBeDefined();
      expect(arpTrigger!.identificadorFormatado).toBe('ARP 00049/2025');
      expect(arpTrigger!.marcoEvento).toBe('Vigência da Ata de Registro de Preços');
    });

    it('funciona corretamente quando contrato não possui gestor nem tarefas cadastradas', () => {
      const contractNoManager: ContractDashboardRecord = {
        ...sampleContract,
        id: '200331-00099-2026',
        numero: '99/2026'
      };

      const items = buildCentralPrazosItems(
        [contractNoManager],
        [],
        {},
        {},
        refDate
      );

      expect(items.length).toBeGreaterThan(0);
      expect(items[0].responsavelNome).toBe('Gestor não atribuído');
      expect(items[0].isGestorContrato).toBe(false);
    });

    it('executar build múltiplas vezes não gera itens duplicados (Idempotência)', () => {
      const items1 = buildCentralPrazosItems([sampleContract], [sampleArp], { [sampleContract.id]: sampleManager }, {}, refDate);
      const items2 = buildCentralPrazosItems([sampleContract], [sampleArp], { [sampleContract.id]: sampleManager }, {}, refDate);

      expect(items1.length).toBe(items2.length);
      const ids1 = items1.map(i => i.id);
      const ids2 = items2.map(i => i.id);
      expect(ids1).toEqual(ids2);
    });
  });

  describe('3. Cálculo de KPIs da Central', () => {
    const refDate = parseDateBRT('2026-09-23')!;

    it('calcula corretamente os quantitativos por aba temporal', () => {
      const items = buildCentralPrazosItems(
        [sampleContract],
        [sampleArp],
        { [sampleContract.id]: sampleManager },
        { [sampleContract.id]: samplePlan },
        refDate
      );

      const kpis = calculateCentralPrazosKPIs(items);

      expect(kpis.total).toBe(items.length);
      expect(kpis.atrasadas).toBeGreaterThanOrEqual(1); // task-101
      expect(kpis.venceHoje).toBeGreaterThanOrEqual(1); // task-102
    });
  });

  describe('4. Filtros da Central de Prazos', () => {
    const refDate = parseDateBRT('2026-09-23')!;
    const items = buildCentralPrazosItems(
      [sampleContract],
      [sampleArp],
      { [sampleContract.id]: sampleManager },
      { [sampleContract.id]: samplePlan },
      refDate
    );

    const baseFilter: CentralPrazosFilterParams = {
      tab: 'TODAS',
      busca: '',
      responsavel: '',
      uasg: '',
      entidadeTipo: 'TODOS',
      statusTarefa: 'TODOS',
      nivelAtencao: 'TODOS'
    };

    it('filtra por aba ATRASADAS', () => {
      const filtered = filterCentralPrazosItems(items, { ...baseFilter, tab: 'ATRASADAS' });
      expect(filtered.every(i => i.estadoTemporal === 'ATRASADO')).toBe(true);
    });

    it('filtra por aba HOJE', () => {
      const filtered = filterCentralPrazosItems(items, { ...baseFilter, tab: 'HOJE' });
      expect(filtered.every(i => i.estadoTemporal === 'VENCE_HOJE')).toBe(true);
    });

    it('filtra por busca textual de fornecedor', () => {
      const filtered = filterCentralPrazosItems(items, { ...baseFilter, busca: 'EMPRESA BRASIL' });
      expect(filtered.length).toBeGreaterThan(0);
      expect(filtered.every(i => (i.fornecedorNome || '').includes('EMPRESA BRASIL'))).toBe(true);
    });

    it('filtra por tipo de entidade ARP', () => {
      const filtered = filterCentralPrazosItems(items, { ...baseFilter, entidadeTipo: 'ARP' });
      expect(filtered.every(i => i.entidadeOrigem === 'ARP')).toBe(true);
    });

    it('filtra por aba MINHAS com base no usuário atual', () => {
      const filtered = filterCentralPrazosItems(items, {
        ...baseFilter,
        tab: 'MINHAS',
        usuarioAtual: 'Maria Fiscal'
      });
      expect(filtered.length).toBeGreaterThan(0);
      expect(filtered.every(i => (i.responsavelNome || '').includes('Maria Fiscal'))).toBe(true);
    });
  });

  describe('5. Fase 6.6 — Integração Temporal de Atas e Instrumentos Substitutivos', () => {
    const refDate = parseDateBRT('2026-09-23')!;

    it('Ata em D-180: vigência a exatamente 180 dias atinge o marco operacional hoje (VENCE_HOJE)', () => {
      // 2026-09-23 + 180 dias = 2027-03-22
      const arpHot: ArpRecord = {
        ...sampleArp,
        numeroAtaRegistroPreco: '00180/2026',
        dataVigenciaFinal: '2027-03-22'
      };

      const items = buildCentralPrazosItems([], [arpHot], {}, {}, refDate);
      const trigger180 = items.find(i => i.id.includes('PRORROGACAO_ARP') && i.id.includes('GATILHO_180D'));

      expect(trigger180).toBeDefined();
      expect(trigger180!.diasRestantes).toBe(0);
      expect(trigger180!.estadoTemporal).toBe('VENCE_HOJE');
      expect(trigger180!.dataAlvo).toBe('2026-09-23');
      expect(trigger180!.acaoDescricao).toContain('Janela preventiva 180d');
      expect(trigger180!.regraNome).toBe('Planejamento de Prorrogação da Ata (180d)');
    });

    it('Ata em D-179: marco operacional de 180 dias já foi ultrapassado (diasRestantes < 0)', () => {
      // 2026-09-23 + 179 dias = 2027-03-21
      const arp179: ArpRecord = {
        ...sampleArp,
        numeroAtaRegistroPreco: '00179/2026',
        dataVigenciaFinal: '2027-03-21'
      };

      const items = buildCentralPrazosItems([], [arp179], {}, {}, refDate);
      const trigger180 = items.find(i => i.id.includes('PRORROGACAO_ARP') && i.id.includes('GATILHO_180D'));

      expect(trigger180).toBeDefined();
      expect(trigger180!.diasRestantes).toBe(-1);
      expect(trigger180!.estadoTemporal).toBe('ATRASADO');
    });

    it('Ata fora da janela de D-180: faltam 20 dias para o início da janela (diasRestantes === 20)', () => {
      // 2026-09-23 + 200 dias = 2027-04-11
      const arp200: ArpRecord = {
        ...sampleArp,
        numeroAtaRegistroPreco: '00200/2026',
        dataVigenciaFinal: '2027-04-11'
      };

      const items = buildCentralPrazosItems([], [arp200], {}, {}, refDate);
      const trigger180 = items.find(i => i.id.includes('PRORROGACAO_ARP') && i.id.includes('GATILHO_180D'));

      expect(trigger180).toBeDefined();
      expect(trigger180!.diasRestantes).toBe(20);
      expect(trigger180!.estadoTemporal).toBe('VENCE_EM_BREVE');
    });

    it('Ata vencida: NÃO gera gatilho prospectivo de planejamento de prorrogação D-180', () => {
      const arpVencida: ArpRecord = {
        ...sampleArp,
        numeroAtaRegistroPreco: '00001/2025',
        dataVigenciaFinal: '2026-08-01' // Vencida antes de 2026-09-23
      };

      const items = buildCentralPrazosItems([], [arpVencida], {}, {}, refDate);
      const trigger180 = items.find(i => i.id.includes('PRORROGACAO_ARP'));

      expect(trigger180).toBeUndefined(); // Não gera ação prospectiva de planejar prorrogação
    });

    it('Ata com saldo zero mas com vigência futura: NÃO é tratada como vencida e preserva cálculo cronológico', () => {
      const arpSaldoZero: ArpRecord = {
        ...sampleArp,
        numeroAtaRegistroPreco: '00777/2026',
        dataVigenciaFinal: '2027-03-22',
        valorTotal: 0 // Saldo exaurido no contexto
      };

      const arpSaldoPositivo: ArpRecord = {
        ...sampleArp,
        numeroAtaRegistroPreco: '00888/2026',
        dataVigenciaFinal: '2027-03-22',
        valorTotal: 500000
      };

      const itemsZero = buildCentralPrazosItems([], [arpSaldoZero], {}, {}, refDate);
      const itemsPos = buildCentralPrazosItems([], [arpSaldoPositivo], {}, {}, refDate);

      const triggerZero = itemsZero.find(i => i.id.includes('PRORROGACAO_ARP'))!;
      const triggerPos = itemsPos.find(i => i.id.includes('PRORROGACAO_ARP'))!;

      expect(triggerZero).toBeDefined();
      expect(triggerPos).toBeDefined();
      // O cálculo cronológico é 100% idêntico
      expect(triggerZero.dataAlvo).toBe(triggerPos.dataAlvo);
      expect(triggerZero.diasRestantes).toBe(triggerPos.diasRestantes);
      expect(triggerZero.estadoTemporal).toBe(triggerPos.estadoTemporal);
    });

    it('Instrumento substitutivo (Art. 95) de entrega imediata não entra no radar D-180 de prorrogação contínua', () => {
      const contratoNotaEmpenho: ContractDashboardRecord = {
        ...sampleContract,
        id: 'ne-imediata-01',
        tipoInstrumento: 'NOTA_EMPENHO',
        dataVigenciaInicio: '2026-09-23',
        dataVigenciaFim: '2026-09-23' // Entrega imediata em data única
      };

      const items = buildCentralPrazosItems([contratoNotaEmpenho], [], {}, {}, refDate);
      const trigger180 = items.find(i => i.id.includes('ne-imediata-01') && i.id.includes('GATILHO_180D'));

      expect(trigger180).toBeUndefined(); // Silenciado para instrumentos substitutivos sem obrigações futuras
    });

    it('Contrato ordinário (TERMO_CONTRATO ou legado sem tipoInstrumento) gera normalmente os gatilhos D-180 e D-60', () => {
      const contratoOrdinario: ContractDashboardRecord = {
        ...sampleContract,
        id: 'termo-contrato-01',
        tipoInstrumento: 'TERMO_CONTRATO',
        dataVigenciaInicio: '2026-01-01',
        dataVigenciaFim: '2027-01-01'
      };

      const items = buildCentralPrazosItems([contratoOrdinario], [], {}, {}, refDate);
      const trigger180 = items.find(i => i.id.includes('termo-contrato-01') && i.id.includes('GATILHO_180D'));
      const trigger60 = items.find(i => i.id.includes('termo-contrato-01') && i.id.includes('GATILHO_60D'));

      expect(trigger180).toBeDefined();
      expect(trigger60).toBeDefined();
    });
  });

});
