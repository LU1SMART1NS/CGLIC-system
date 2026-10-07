/**
 * Avisos da expectativa de pagamento (fase C da previsão mensal):
 *   PREVISAO_NAO_ENVIADA    a previsão do mês (Portaria DGFNSP 50/2025, art. 5º, § 2º, III) perto do prazo e não enviada;
 *   NOTA_MENSAL_NAO_CHEGOU  contrato marcado como mensal sem nota da competência anterior depois do dia combinado;
 *   ENTREGA_SEM_NOTA        entrega prevista que passou da data (mais a tolerância) sem nota.
 * "A nota chegou" = fatura no Contratos.gov.br da competência (ou emitida depois do marco) ou ciclo com a competência
 * ou recebido depois do marco: a CGLIC só cadastra a fatura depois de conferir, então o ciclo é o primeiro sinal.
 */
import { PAGAMENTO_RULES } from '../config/alertRules';
import { addBusinessDays, differenceInBusinessDays, parseDateBRT } from './temporalEngineService';
import type { DashboardAttentionSeverity } from '../types/managementDashboard';
import type { EntregaPrevista, ExpectativaPagamento } from './expectativaPagamentoService';

export type TipoAvisoPagamento = 'PREVISAO_NAO_ENVIADA' | 'NOTA_MENSAL_NAO_CHEGOU' | 'ENTREGA_SEM_NOTA';

export interface AvisoPagamento {
  id: string;
  tipo: TipoAvisoPagamento;
  severity: DashboardAttentionSeverity;
  title: string;
  description: string;
  badgeLabel: string;
  contractKey?: string;
  dataAlvo?: string;
  diasRelevantes?: number;
  targetUrl: string;
}

/** O mínimo de fatura e de ciclo que os avisos precisam. */
export interface FaturaParaAviso {
  contractKey: string;
  emissao: string | null;
  referencia: string | null;
  cancelada: boolean;
}
export interface CicloParaAviso {
  contractKey: string;
  competencia?: string | null;
  dataRecebimento?: string | null;
  dataAssinaturaAtesto?: string | null;
  status: string;
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const br = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}`;

export function calcularAvisosPagamento(input: {
  hoje?: Date;
  /** Previsão a informar (AAAA-MM), o prazo dela e se já foi enviada. Omitido na tela de um contrato. */
  previsao?: { mes: string; prazo: string; enviada: boolean };
  marcas: Map<string, ExpectativaPagamento>;
  entregas: EntregaPrevista[];
  faturas: FaturaParaAviso[];
  ciclos: CicloParaAviso[];
  /** Contratos vigentes no escopo (os avisos de contrato só valem para eles). */
  contratosVigentes: Set<string>;
  numeroDoContrato?: (contractKey: string) => string;
}): AvisoPagamento[] {
  const hoje = new Date(input.hoje ?? new Date());
  hoje.setHours(0, 0, 0, 0);
  const numero = input.numeroDoContrato ?? ((k: string) => k);
  const avisos: AvisoPagamento[] = [];

  // 1. Previsão do mês.
  if (input.previsao && !input.previsao.enviada) {
    const prazo = parseDateBRT(input.previsao.prazo);
    const dias = prazo ? differenceInBusinessDays(prazo, hoje) : 0;
    const passou = Boolean(prazo && prazo.getTime() < hoje.getTime());
    if (passou || dias <= PAGAMENTO_RULES.previsaoAvisoAntesDiasUteis) {
      const nomeMes = MESES[Number(input.previsao.mes.slice(5, 7)) - 1];
      avisos.push({
        id: `AVISO-PREVISAO-${input.previsao.mes}`,
        tipo: 'PREVISAO_NAO_ENVIADA',
        severity: passou ? 'CRITICA' : dias <= 1 ? 'URGENTE' : 'ATENCAO',
        title: `Enviar a previsão de pagamentos de ${nomeMes}`,
        description: 'Portaria 50, art. 5º, § 2º, III: informar à DGFNSP até o último dia útil do mês.',
        badgeLabel: passou ? `Previsão de ${nomeMes} atrasada` : `Previsão de ${nomeMes} a enviar`,
        dataAlvo: input.previsao.prazo,
        diasRelevantes: passou ? -Math.abs(dias) : dias,
        targetUrl: '/pagamentos/previsao'
      });
    }
  }

  // Sinais de nota por contrato.
  const faturasPorContrato = new Map<string, FaturaParaAviso[]>();
  for (const f of input.faturas) if (!f.cancelada) faturasPorContrato.set(f.contractKey, [...(faturasPorContrato.get(f.contractKey) ?? []), f]);
  const ciclosPorContrato = new Map<string, CicloParaAviso[]>();
  for (const c of input.ciclos) if (c.status !== 'CANCELADO') ciclosPorContrato.set(c.contractKey, [...(ciclosPorContrato.get(c.contractKey) ?? []), c]);
  /** competencia em MM/AAAA, como vem a referência da fatura no Contratos.gov.br. */
  const chegouDesde = (contractKey: string, desdeISO: string, competencia?: string) => {
    const digitos = competencia ? [competencia.replace('/', ''), `${competencia.slice(3)}${competencia.slice(0, 2)}`] : [];
    return (
      (faturasPorContrato.get(contractKey) ?? []).some((f) => (f.emissao ?? '') >= desdeISO || Boolean(competencia && f.referencia?.includes(competencia))) ||
      (ciclosPorContrato.get(contractKey) ?? []).some(
        (c) => (c.dataRecebimento ?? '') >= desdeISO || (c.dataAssinaturaAtesto ?? '') >= desdeISO || digitos.includes((c.competencia ?? '').replace(/\D/g, ''))
      )
    );
  };

  // 2. Nota mensal da competência anterior.
  const diaLimite = PAGAMENTO_RULES.notaMensalAteDia;
  if (hoje.getDate() > diaLimite) {
    const inicioMes = iso(new Date(hoje.getFullYear(), hoje.getMonth(), 1));
    const anterior = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
    const competencia = `${String(anterior.getMonth() + 1).padStart(2, '0')}/${anterior.getFullYear()}`;
    const esperadaAte = iso(new Date(hoje.getFullYear(), hoje.getMonth(), diaLimite));
    for (const [contractKey, marca] of input.marcas) {
      if (marca.tipo !== 'MENSAL' || !input.contratosVigentes.has(contractKey)) continue;
      // Nota do mês anterior: fatura ou ciclo da competência, ou que chegou desde o dia 1º deste mês.
      if (chegouDesde(contractKey, inicioMes, competencia)) continue;
      const atraso = hoje.getDate() - diaLimite;
      avisos.push({
        id: `AVISO-NOTA-MENSAL-${contractKey}-${competencia}`,
        tipo: 'NOTA_MENSAL_NAO_CHEGOU',
        severity: atraso > 10 ? 'URGENTE' : 'ATENCAO',
        title: `Nota de ${MESES[anterior.getMonth()]} ainda não chegou`,
        description: `Contrato ${numero(contractKey)} é pago todo mês e não tem fatura nem ciclo da competência ${competencia}.`,
        badgeLabel: `Nota de ${MESES[anterior.getMonth()]} não chegou`,
        contractKey,
        dataAlvo: esperadaAte,
        diasRelevantes: -atraso,
        targetUrl: `/contratos/${encodeURIComponent(contractKey)}?aba=pagamentos`
      });
    }
  }

  // 3. Entregas previstas que passaram da data sem nota.
  for (const e of input.entregas) {
    if (e.situacao !== 'PREVISTA' || !input.contratosVigentes.has(e.contractKey)) continue;
    const data = parseDateBRT(e.dataPrevista);
    if (!data) continue;
    const limite = addBusinessDays(data, PAGAMENTO_RULES.entregaToleranciaDiasUteis);
    if (limite.getTime() >= hoje.getTime()) continue;
    const desde = iso(new Date(data.getFullYear(), data.getMonth(), data.getDate() - 30));
    if (chegouDesde(e.contractKey, desde)) continue;
    const dias = differenceInBusinessDays(hoje, data);
    avisos.push({
      id: `AVISO-ENTREGA-${e.id}`,
      tipo: 'ENTREGA_SEM_NOTA',
      severity: dias > 20 ? 'URGENTE' : 'ATENCAO',
      title: `Entrega prevista sem nota: ${e.descricao}`,
      description: `Contrato ${numero(e.contractKey)}: entrega prevista para ${br(e.dataPrevista)} e nenhuma nota desde então. Confirme a entrega ou corrija a data.`,
      badgeLabel: `Entrega de ${br(e.dataPrevista)} sem nota`,
      contractKey: e.contractKey,
      dataAlvo: e.dataPrevista,
      diasRelevantes: -dias,
      targetUrl: `/contratos/${encodeURIComponent(e.contractKey)}?aba=pagamentos`
    });
  }

  return avisos;
}
