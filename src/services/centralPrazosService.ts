/**
 * Serviço Agregador da Central de Prazos e Tarefas (SaldoARP — Fase 3)
 *
 * Responsável por:
 * 1. Unificar dados oficiais (Contratos.gov.br, Compras.gov.br, PNCP) com governança interna (gestores e tarefas);
 * 2. Gerar Gatilhos Operacionais em memória a partir do Motor Temporal (temporalEngineService);
 * 3. Vincular Tarefas Humanas persistidas no Supabase;
 * 4. Assegurar idempotência determinística em múltiplos ciclos (prorrogações, reajustes, vigências);
 * 5. Calcular KPIs executivos e aplicar filtros operacionais em tempo de execução.
 */

import type {
  CentralPrazosItem,
  CentralPrazosKPIs,
  CentralPrazosFilterParams,
  EntidadeOrigemTipo
} from '../types/centralPrazos';
import type {
  ContractDashboardRecord,
  ArpRecord,
  ContractManager,
  ContractTaskPlan
} from '../types';
import {
  parseDateBRT,
  differenceInDays,
  deriveTemporalStatus,
  deriveAtencaoNivel,
  calculateDeadline,
  REGRAS_OPERACIONAIS_PADRAO
} from './temporalEngineService';

/**
 * Gera chave lógica determinística e canônica de idempotência.
 * Formato: {tipoEntidade}::{idEntidade}::{eventoId}::{regraId}::{cicloRef}
 */
export function generateIdempotentItemId(params: {
  tipoEntidade: EntidadeOrigemTipo;
  idEntidade: string;
  eventoId: string;
  regraId: string;
  cicloRef: string;
}): string {
  const sanitize = (s: string) => s.replace(/\s+/g, '_').toUpperCase();
  return `${params.tipoEntidade}::${params.idEntidade}::${sanitize(params.eventoId)}::${sanitize(params.regraId)}::${sanitize(params.cicloRef)}`;
}

export interface BuildCentralPrazosOptions {
  contracts?: ContractDashboardRecord[];
  arps?: ArpRecord[];
  managers?: Record<string, ContractManager>;
  managersMap?: Record<string, ContractManager>;
  plans?: Record<string, ContractTaskPlan>;
  taskPlansMap?: Record<string, ContractTaskPlan>;
  currentDate?: Date;
}

/**
 * Constrói a lista agregada consolidada de itens da Central de Prazos (Gatilhos Operacionais + Tarefas Humanas).
 * Suporta chamada posicional ou via objeto de opções.
 */
export function buildCentralPrazosItems(
  contractsOrOptions: ContractDashboardRecord[] | BuildCentralPrazosOptions = [],
  arpsParam: ArpRecord[] = [],
  managersMapParam: Record<string, ContractManager> = {},
  taskPlansMapParam: Record<string, ContractTaskPlan> = {},
  currentDateParam?: Date
): CentralPrazosItem[] {
  let contracts: ContractDashboardRecord[] = [];
  let arps: ArpRecord[] = [];
  let managersMap: Record<string, ContractManager> = {};
  let taskPlansMap: Record<string, ContractTaskPlan> = {};
  let currentDate: Date | undefined;

  if (Array.isArray(contractsOrOptions)) {
    contracts = contractsOrOptions;
    arps = arpsParam;
    managersMap = managersMapParam;
    taskPlansMap = taskPlansMapParam;
    currentDate = currentDateParam;
  } else if (contractsOrOptions && typeof contractsOrOptions === 'object') {
    contracts = contractsOrOptions.contracts || [];
    arps = contractsOrOptions.arps || [];
    managersMap = contractsOrOptions.managers || contractsOrOptions.managersMap || {};
    taskPlansMap = contractsOrOptions.plans || contractsOrOptions.taskPlansMap || {};
    currentDate = contractsOrOptions.currentDate;
  }

  const items: CentralPrazosItem[] = [];
  const processedKeys = new Set<string>();

  // 1. Processar Contratos Administrativos
  for (const contract of contracts) {
    const contractKey = contract.id;
    const manager = managersMap[contractKey];
    const plan = taskPlansMap[contractKey];
    const gestorNome = manager?.gestorNome || undefined;
    const numDisplay = contract.numeroFormatado ? `Contrato ${contract.numeroFormatado}` : `Contrato ${contract.numero}/${contract.ano}`;

    // A) Tarefas Humanas Persistidas (do plano aplicado ao contrato)
    if (plan && plan.macrotarefas) {
      for (const macro of plan.macrotarefas) {
        for (const task of macro.tarefas) {
          if (!task.prazo) continue; // Tarefas sem prazo definido não entram como itens de agenda temporal direta

          const targetDate = parseDateBRT(task.prazo);
          if (!targetDate) continue;

          const isConcluido = task.status === 'CONCLUIDA' || task.status === 'NAO_APLICAVEL';
          const diasRestantes = differenceInDays(targetDate, currentDate);
          const estadoTemporal = deriveTemporalStatus(diasRestantes, isConcluido);
          const nivelAtencao = isConcluido ? 'NORMAL' : deriveAtencaoNivel(diasRestantes, estadoTemporal);

          const taskItemId = generateIdempotentItemId({
            tipoEntidade: 'CONTRATO',
            idEntidade: contractKey,
            eventoId: 'TAREFA_PLANO',
            regraId: `TASK_${task.id}`,
            cicloRef: task.prazo.replace(/\D/g, '')
          });

          if (!processedKeys.has(taskItemId)) {
            processedKeys.add(taskItemId);
            items.push({
              id: taskItemId,
              tipoItem: 'TAREFA_HUMANA',
              entidadeOrigem: 'CONTRATO',
              contractKey,
              identificadorFormatado: numDisplay,
              uasg: contract.uasg,
              objetoResumido: contract.objeto,
              fornecedorNome: contract.fornecedorNome,
              fornecedorCnpj: contract.fornecedorCnpjCpf,
              processoNumero: contract.processo,

              marcoEvento: macro.nome || 'Gestão Contratual',
              dataBase: task.criadoEm ? task.criadoEm.split('T')[0] : (contract.dataAssinatura || task.prazo),
              fonteDataBase: 'SaldoARP (Plano de Trabalho)',
              regraNome: 'Deadline Operacional de Tarefa',
              regraTipo: 'INTERNA',
              dataAlvo: task.prazo,
              diasRestantes,
              estadoTemporal,
              nivelAtencao,

              responsavelNome: task.responsavelNome || gestorNome || 'Não atribuído',
              isGestorContrato: !task.responsavelNome && !!gestorNome,
              acaoDescricao: task.nome,

              tarefaId: task.id,
              tarefaStatus: task.status,
              observacoes: task.observacao,

              explicabilidade: {
                dataBase: task.criadoEm ? task.criadoEm.split('T')[0] : (contract.dataAssinatura || task.prazo),
                fonteDataBase: 'SaldoARP (Plano de Trabalho)',
                regraNome: 'Deadline Operacional de Tarefa',
                regraTipo: 'INTERNA',
                unidadeContagem: 'DIAS_CORRIDOS',
                offsetDias: 0,
                dataCalculada: task.prazo,
                diasRestantes,
                statusTemporal: estadoTemporal,
                nivelAtencao,
                descricaoRegra: `Tarefa operacional "${task.nome}" com deadline estipulado em ${task.prazo}.`
              }
            });
          }
        }
      }
    }

    // B) Gatilhos Operacionais em Memória sobre Vigência Oficial (Prorrogação/Término)
    if (contract.dataVigenciaFim) {
      const cicloVigencia = contract.dataVigenciaFim.replace(/\D/g, '');

      // Gatilho 180d: Início do Planejamento de Prorrogação
      const calc180 = calculateDeadline({
        dataBase: contract.dataVigenciaFim,
        fonteDataBase: contract.fonteDados || 'Contratos.gov.br',
        regra: REGRAS_OPERACIONAIS_PADRAO.PRORROGACAO_180D,
        currentDate
      });

      if (calc180) {
        const trigger180Id = generateIdempotentItemId({
          tipoEntidade: 'CONTRATO',
          idEntidade: contractKey,
          eventoId: 'PRORROGACAO',
          regraId: 'GATILHO_180D',
          cicloRef: `VIG_${cicloVigencia}`
        });

        if (!processedKeys.has(trigger180Id)) {
          processedKeys.add(trigger180Id);
          items.push({
            id: trigger180Id,
            tipoItem: 'GATILHO_OPERACIONAL',
            entidadeOrigem: 'CONTRATO',
            contractKey,
            identificadorFormatado: numDisplay,
            uasg: contract.uasg,
            objetoResumido: contract.objeto,
            fornecedorNome: contract.fornecedorNome,
            fornecedorCnpj: contract.fornecedorCnpjCpf,
            processoNumero: contract.processo,

            marcoEvento: 'Término da Vigência',
            dataBase: contract.dataVigenciaFim,
            fonteDataBase: contract.fonteDados || 'Contratos.gov.br',
            regraNome: calc180.explicabilidade.regraNome,
            regraTipo: calc180.explicabilidade.regraTipo,
            dataAlvo: calc180.dataAlvo,
            diasRestantes: calc180.diasRestantes,
            estadoTemporal: calc180.statusTemporal,
            nivelAtencao: calc180.nivelAtencao,

            responsavelNome: gestorNome || 'Gestor não atribuído',
            isGestorContrato: !!gestorNome,
            acaoDescricao: 'Avaliar viabilidade de prorrogação contratual (Gatilho preventivo)',

            explicabilidade: calc180.explicabilidade
          });
        }
      }

      // Gatilho 60d: Remessa Jurídica / Urgência de Término
      const calc60 = calculateDeadline({
        dataBase: contract.dataVigenciaFim,
        fonteDataBase: contract.fonteDados || 'Contratos.gov.br',
        regra: REGRAS_OPERACIONAIS_PADRAO.REMESSA_JURIDICA_60D,
        currentDate
      });

      if (calc60) {
        const trigger60Id = generateIdempotentItemId({
          tipoEntidade: 'CONTRATO',
          idEntidade: contractKey,
          eventoId: 'VIGENCIA_FINAL',
          regraId: 'GATILHO_60D',
          cicloRef: `VIG_${cicloVigencia}`
        });

        if (!processedKeys.has(trigger60Id)) {
          processedKeys.add(trigger60Id);
          items.push({
            id: trigger60Id,
            tipoItem: 'GATILHO_OPERACIONAL',
            entidadeOrigem: 'CONTRATO',
            contractKey,
            identificadorFormatado: numDisplay,
            uasg: contract.uasg,
            objetoResumido: contract.objeto,
            fornecedorNome: contract.fornecedorNome,
            fornecedorCnpj: contract.fornecedorCnpjCpf,
            processoNumero: contract.processo,

            marcoEvento: 'Término da Vigência',
            dataBase: contract.dataVigenciaFim,
            fonteDataBase: contract.fonteDados || 'Contratos.gov.br',
            regraNome: calc60.explicabilidade.regraNome,
            regraTipo: calc60.explicabilidade.regraTipo,
            dataAlvo: calc60.dataAlvo,
            diasRestantes: calc60.diasRestantes,
            estadoTemporal: calc60.statusTemporal,
            nivelAtencao: calc60.nivelAtencao,

            responsavelNome: gestorNome || 'Gestor não atribuído',
            isGestorContrato: !!gestorNome,
            acaoDescricao: 'Instrução final de aditamento ou preparativos de encerramento',

            explicabilidade: calc60.explicabilidade
          });
        }
      }
    }
  }

  // 2. Processar Atas de Registro de Preços (ARP)
  for (const arp of arps) {
    if (!arp.dataVigenciaFinal) continue;

    const arpKey = `${arp.numeroAtaRegistroPreco}-${arp.codigoUnidadeGerenciadora}`;
    const cicloAta = arp.dataVigenciaFinal.replace(/\D/g, '');

    // Gatilho 90d: Alerta de Exaustão de Vigência da ARP
    const calcArp = calculateDeadline({
      dataBase: arp.dataVigenciaFinal,
      fonteDataBase: arp.linkAtaPNCP ? 'PNCP' : 'Compras.gov.br',
      regra: REGRAS_OPERACIONAIS_PADRAO.ARP_VIGENCIA_90D,
      currentDate
    });

    if (calcArp) {
      const arpTriggerId = generateIdempotentItemId({
        tipoEntidade: 'ARP',
        idEntidade: arpKey,
        eventoId: 'VIGENCIA_ARP',
        regraId: 'GATILHO_90D',
        cicloRef: `VIG_${cicloAta}`
      });

      if (!processedKeys.has(arpTriggerId)) {
        processedKeys.add(arpTriggerId);
        items.push({
          id: arpTriggerId,
          tipoItem: 'GATILHO_OPERACIONAL',
          entidadeOrigem: 'ARP',
          arpKey,
          identificadorFormatado: `ARP ${arp.numeroAtaRegistroPreco}`,
          uasg: arp.codigoUnidadeGerenciadora,
          objetoResumido: arp.objeto,
          fornecedorNome: undefined,
          processoNumero: arp.numeroCompra ? `${arp.numeroCompra}/${arp.anoCompra}` : undefined,

          marcoEvento: 'Vigência da Ata de Registro de Preços',
          dataBase: arp.dataVigenciaFinal,
          fonteDataBase: arp.linkAtaPNCP ? 'PNCP' : 'Compras.gov.br',
          regraNome: calcArp.explicabilidade.regraNome,
          regraTipo: calcArp.explicabilidade.regraTipo,
          dataAlvo: calcArp.dataAlvo,
          diasRestantes: calcArp.diasRestantes,
          estadoTemporal: calcArp.statusTemporal,
          nivelAtencao: calcArp.nivelAtencao,

          responsavelNome: 'Coordenação de Compras / Gestor da Ata',
          isGestorContrato: false,
          acaoDescricao: 'Planejar nova licitação ou contratações remanescentes antes da expiração da Ata',

          explicabilidade: calcArp.explicabilidade
        });
      }
    }
  }

  // Ordenação prioritária:
  // 1. Atrasadas primeiro (diasRestantes asc)
  // 2. Vence hoje e próximas (diasRestantes asc)
  // 3. Concluídas ao final
  items.sort((a, b) => {
    const isConcluidoA = a.estadoTemporal === 'CONCLUIDO';
    const isConcluidoB = b.estadoTemporal === 'CONCLUIDO';
    if (isConcluidoA !== isConcluidoB) return isConcluidoA ? 1 : -1;
    return a.diasRestantes - b.diasRestantes;
  });

  return items;
}

/**
 * Calcula os KPIs executivos agregados da Central de Prazos.
 */
export function calculateCentralPrazosKPIs(items: CentralPrazosItem[]): CentralPrazosKPIs {
  let atrasadas = 0;
  let venceHoje = 0;
  let proximos7Dias = 0;
  let proximos30Dias = 0;
  let futuras = 0;
  let concluidas = 0;

  for (const item of items) {
    if (item.estadoTemporal === 'CONCLUIDO') {
      concluidas++;
    } else if (item.estadoTemporal === 'ATRASADO') {
      atrasadas++;
    } else if (item.estadoTemporal === 'VENCE_HOJE') {
      venceHoje++;
    } else if (item.diasRestantes > 0 && item.diasRestantes <= 7) {
      proximos7Dias++;
    } else if (item.diasRestantes > 7 && item.diasRestantes <= 30) {
      proximos30Dias++;
    } else {
      futuras++;
    }
  }

  return {
    total: items.length,
    atrasadas,
    venceHoje,
    proximos7Dias,
    proximos30Dias,
    futuras,
    concluidas
  };
}

/**
 * Aplica os filtros selecionados pelo usuário à lista de itens da Central de Prazos.
 */
export function filterCentralPrazosItems(
  items: CentralPrazosItem[],
  filters: CentralPrazosFilterParams
): CentralPrazosItem[] {
  return items.filter(item => {
    // 1. Filtro de Aba Temporal
    if (filters.tab === 'ATRASADAS' && item.estadoTemporal !== 'ATRASADO') return false;
    if (filters.tab === 'HOJE' && item.estadoTemporal !== 'VENCE_HOJE') return false;
    if (filters.tab === 'SETE_DIAS') {
      if (item.estadoTemporal === 'CONCLUIDO' || item.estadoTemporal === 'ATRASADO') return false;
      if (item.diasRestantes < 0 || item.diasRestantes > 7) return false;
    }
    if (filters.tab === 'TRINTA_DIAS') {
      if (item.estadoTemporal === 'CONCLUIDO' || item.estadoTemporal === 'ATRASADO') return false;
      if (item.diasRestantes < 0 || item.diasRestantes > 30) return false;
    }
    if (filters.tab === 'FUTURAS') {
      if (item.estadoTemporal === 'CONCLUIDO' || item.diasRestantes <= 30) return false;
    }
    if (filters.tab === 'MINHAS') {
      if (!filters.usuarioAtual || !item.responsavelNome) return false;
      const q = filters.usuarioAtual.trim().toLowerCase();
      if (!item.responsavelNome.toLowerCase().includes(q)) return false;
    }

    // 2. Filtro de Busca Textual (Identificador, Objeto, Fornecedor, Ação, Responsável)
    if (filters.busca && filters.busca.trim()) {
      const q = filters.busca.trim().toLowerCase();
      const matchId = item.identificadorFormatado.toLowerCase().includes(q);
      const matchObj = item.objetoResumido ? item.objetoResumido.toLowerCase().includes(q) : false;
      const matchForn = item.fornecedorNome ? item.fornecedorNome.toLowerCase().includes(q) : false;
      const matchAcao = item.acaoDescricao.toLowerCase().includes(q);
      const matchResp = item.responsavelNome ? item.responsavelNome.toLowerCase().includes(q) : false;
      if (!matchId && !matchObj && !matchForn && !matchAcao && !matchResp) return false;
    }

    // 3. Filtro por Responsável específico
    if (filters.responsavel && filters.responsavel.trim()) {
      if (!item.responsavelNome || !item.responsavelNome.toLowerCase().includes(filters.responsavel.trim().toLowerCase())) {
        return false;
      }
    }

    // 4. Filtro por UASG
    if (filters.uasg && filters.uasg.trim()) {
      if (item.uasg !== filters.uasg.trim()) return false;
    }

    // 5. Filtro por Tipo de Entidade (CONTRATO ou ARP)
    if (filters.entidadeTipo !== 'TODOS') {
      if (item.entidadeOrigem !== filters.entidadeTipo) return false;
    }

    // 6. Filtro por Status da Tarefa
    if (filters.statusTarefa !== 'TODOS') {
      if (filters.statusTarefa === 'SEM_TAREFA' && item.tarefaId) return false;
      if (filters.statusTarefa !== 'SEM_TAREFA' && item.tarefaStatus !== filters.statusTarefa) return false;
    }

    // 7. Filtro por Nível de Atenção
    if (filters.nivelAtencao !== 'TODOS') {
      if (item.nivelAtencao !== filters.nivelAtencao) return false;
    }

    return true;
  });
}
