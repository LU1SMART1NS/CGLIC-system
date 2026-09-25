import type { DashboardAttentionCategory, DashboardAttentionItem } from '../../types/managementDashboard';

/** Item de atenção enriquecido com a UASG de origem (a Gestão de Instrumentos consolida 200330 e 200331). */
export interface AttentionItemWithUasg extends DashboardAttentionItem {
  uasg: string;
}

/** Chave de correlação (fornecedor/responsável) resiliente a colisões entre UASGs distintas. */
export function getLookupKey(item: AttentionItemWithUasg): string {
  if (item.contractKey) return item.contractKey;
  if (item.numeroAta) return `${item.uasg}-${item.numeroAta}`;
  return item.id;
}

export interface InstrumentoInfo {
  tipo: 'ARP' | 'Contrato';
  label: string;
}

/**
 * Deriva o instrumento (Ata ou Contrato) e seu tipo a partir dos campos já existentes no item.
 *
 * `arpKey` tem prioridade sobre `contractKey`/`numeroContrato`: alguns itens de vigência de ARP
 * (categoria PRORROGACAO_PROXIMA) também carregam um `numeroContrato` textual (ex.: "ARP 00011/2026")
 * porque reaproveitam o mesmo campo de exibição do centralPrazosService — mas o instrumento em
 * atenção continua sendo a Ata, não um contrato.
 */
export function getInstrumentoInfo(item: DashboardAttentionItem): InstrumentoInfo {
  if (item.arpKey) {
    return { tipo: 'ARP', label: item.numeroContrato || (item.numeroAta ? `Ata ${item.numeroAta}` : item.title) };
  }
  if (item.numeroAta) {
    return { tipo: 'ARP', label: `Ata ${item.numeroAta}` };
  }
  if (item.contractKey || item.numeroContrato) {
    return { tipo: 'Contrato', label: item.numeroContrato || item.contractKey || '—' };
  }
  return { tipo: 'Contrato', label: item.title };
}

export interface MotivoInfo {
  label: string;
  color: string;
  bg: string;
  /** Referência legal só quando já documentada no domínio (não inventada). */
  referenciaLegal?: string;
}

const MOTIVO_POR_CATEGORIA: Record<DashboardAttentionCategory, MotivoInfo> = {
  PRORROGACAO_PROXIMA: { label: 'Vigência Próxima', color: '#1d4ed8', bg: '#eff6ff', referenciaLegal: 'Art. 106/107' },
  ATA_CRITICA: { label: 'Saldo em Atenção', color: '#059669', bg: '#ecfdf5' },
  PAGAMENTO_CRITICO: { label: 'Execução / Pagamento', color: '#dc2626', bg: '#fef2f2' },
  REAJUSTE_RADAR: { label: 'Reajuste / Repactuação', color: '#b45309', bg: '#fffbeb' },
  TAREFA_ATRASADA: { label: 'Tarefa Atrasada', color: '#991b1b', bg: '#fef2f2' },
  TAREFA_PROXIMA: { label: 'Tarefa Próxima', color: '#b45309', bg: '#fffbeb' }
};

export function getMotivoInfo(category: DashboardAttentionCategory): MotivoInfo {
  return MOTIVO_POR_CATEGORIA[category] || { label: 'Situação de Atenção', color: '#475569', bg: '#f1f5f9' };
}

/** Situação atual em texto curto, composta apenas de campos reais já calculados (badgeLabel/dataAlvo). */
export function getSituacaoAtual(item: DashboardAttentionItem): string {
  if (item.dataAlvo && (item.category === 'PRORROGACAO_PROXIMA' || item.category === 'REAJUSTE_RADAR')) {
    const formatted = formatDate(item.dataAlvo);
    if (formatted) return `Vence em ${formatted}`;
  }
  if (item.badgeLabel) return item.badgeLabel;
  if (typeof item.diasRelevantes === 'number') return `${item.diasRelevantes} dias`;
  return item.description || '—';
}

export function formatDate(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

export function getPrazoLabel(item: DashboardAttentionItem): string {
  const formatted = formatDate(item.dataAlvo);
  if (typeof item.diasRelevantes === 'number' && formatted) {
    return `${item.diasRelevantes}d · ${formatted}`;
  }
  if (formatted) return formatted;
  if (typeof item.diasRelevantes === 'number') return `${item.diasRelevantes} dias`;
  return '—';
}

export interface AcaoInfo {
  label: string;
  targetUrl: string;
}

/** Ação contextual em 1 clique, sempre apontando para um fluxo/rota já existente no sistema. */
export function getAcaoInfo(item: DashboardAttentionItem): AcaoInfo {
  switch (item.category) {
    case 'PRORROGACAO_PROXIMA':
      if (item.arpKey && !item.contractKey) {
        return { label: 'Prorrogar Vigência', targetUrl: '/atas' };
      }
      return { label: 'Prorrogar Vigência', targetUrl: item.contractKey ? `/contratos/${encodeURIComponent(item.contractKey)}` : '/contratos' };
    case 'ATA_CRITICA':
      return { label: 'Verificar Saldo', targetUrl: '/atas' };
    case 'PAGAMENTO_CRITICO':
      return { label: 'Abrir Pagamento', targetUrl: '/pagamentos' };
    case 'REAJUSTE_RADAR':
      return { label: 'Analisar Reajuste', targetUrl: item.contractKey ? `/contratos/${encodeURIComponent(item.contractKey)}` : '/contratos' };
    case 'TAREFA_ATRASADA':
    case 'TAREFA_PROXIMA':
      return { label: 'Abrir Tarefa', targetUrl: item.contractKey ? `/contratos/${encodeURIComponent(item.contractKey)}` : '/contratos' };
    default:
      return { label: 'Visualizar', targetUrl: item.targetUrl || '/contratos' };
  }
}
