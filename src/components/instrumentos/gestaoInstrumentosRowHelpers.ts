import { buildAtaPath } from '../../hooks/useAta';
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

/** Rótulo único de contrato: tira o prefixo "Contrato " e converte a chave "UASG-número-ano" em "número/ano". */
export function normalizeContratoLabel(raw: string): string {
  const text = raw.trim().replace(/^contrato\s+/i, '');
  const key = text.match(/^\d{6}-(\d+)-(\d{4})$/);
  return key ? `${key[1]}/${key[2]}` : text;
}

/** Rótulo único de ata: "ARP 00011/2026" e "Ata 00011/2026 — Item 3" viram "Ata 00011/2026". */
export function normalizeAtaLabel(raw: string): string {
  const text = raw.trim().replace(/\s+[—-]\s+item\s+\S+$/i, '').replace(/^(arp|ata)\s+/i, '');
  return `Ata ${text}`;
}

/**
 * Deriva o instrumento (Ata ou Contrato) e seu tipo a partir dos campos já existentes no item.
 *
 * `arpKey` tem prioridade sobre `contractKey`/`numeroContrato`: itens de Ata também podem carregar
 * um `numeroContrato` textual (ex.: "ARP 00011/2026") por reaproveitarem o mesmo campo de exibição
 * do centralPrazosService — mas o instrumento em atenção continua sendo a Ata, não um contrato.
 */
export function getInstrumentoInfo(item: DashboardAttentionItem): InstrumentoInfo {
  if (item.arpKey) {
    return { tipo: 'ARP', label: item.numeroContrato || item.numeroAta ? normalizeAtaLabel(item.numeroContrato || item.numeroAta || '') : item.title };
  }
  if (item.numeroAta) {
    return { tipo: 'ARP', label: `Ata ${item.numeroAta}` };
  }
  if (item.contractKey || item.numeroContrato) {
    return { tipo: 'Contrato', label: normalizeContratoLabel(item.numeroContrato || item.contractKey || '—') };
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
  ATA_CRITICA: { label: 'Saldo em Atenção', color: '#059669', bg: '#ecfdf5' },
  PAGAMENTO_CRITICO: { label: 'Execução / Pagamento', color: '#dc2626', bg: '#fef2f2' },
  REAJUSTE_RADAR: { label: 'Reajuste / Repactuação', color: '#b45309', bg: '#fffbeb' },
  TAREFA_ATRASADA: { label: 'Tarefa Atrasada', color: '#991b1b', bg: '#fef2f2' },
  TAREFA_PROXIMA: { label: 'Tarefa Próxima', color: '#b45309', bg: '#fffbeb' },
  LEMBRETE: { label: 'Planejamento da Vigência', color: '#475569', bg: '#f1f5f9' }
};

export function getMotivoInfo(category: DashboardAttentionCategory): MotivoInfo {
  return MOTIVO_POR_CATEGORIA[category] || { label: 'Situação de Atenção', color: '#475569', bg: '#f1f5f9' };
}

/** Situação atual em texto curto, composta apenas de campos reais já calculados (badgeLabel/dataAlvo). */
export function getSituacaoAtual(item: DashboardAttentionItem): string {
  if (item.dataAlvo && item.category === 'REAJUSTE_RADAR') {
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

function contractItemUrl(item: DashboardAttentionItem): string {
  if (!item.contractKey) return '/contratos';
  return `/contratos/${encodeURIComponent(item.contractKey)}?item=${encodeURIComponent(item.id)}`;
}

/** Detalhe da Ata (Ata 360, aba Ações) quando o alerta é de Ata e a UASG é conhecida. */
function ataItemUrl(item: DashboardAttentionItem & { uasg?: string }): string {
  if (!item.numeroAta || !item.uasg) return '/atas';
  return buildAtaPath(item.numeroAta, item.uasg, 'acoes');
}

/** Ação contextual em 1 clique, sempre apontando para um fluxo/rota já existente no sistema. */
export function getAcaoInfo(item: DashboardAttentionItem & { uasg?: string }): AcaoInfo {
  if (item.arpKey && item.numeroAta && (item.category === 'TAREFA_ATRASADA' || item.category === 'TAREFA_PROXIMA')) {
    return { label: 'Abrir Tarefa', targetUrl: ataItemUrl(item) };
  }
  if (item.category === 'LEMBRETE') {
    return { label: 'Abrir Planejamento', targetUrl: item.numeroAta ? ataItemUrl(item) : contractItemUrl(item) };
  }
  switch (item.category) {
    case 'ATA_CRITICA':
      return { label: 'Verificar Saldo', targetUrl: ataItemUrl(item) };
    case 'PAGAMENTO_CRITICO':
      return { label: 'Abrir Pagamento', targetUrl: '/pagamentos' };
    case 'REAJUSTE_RADAR':
      return { label: 'Analisar Reajuste', targetUrl: contractItemUrl(item) };
    case 'TAREFA_ATRASADA':
    case 'TAREFA_PROXIMA':
      return { label: 'Abrir Tarefa', targetUrl: contractItemUrl(item) };
    default:
      return { label: 'Visualizar', targetUrl: item.targetUrl || '/contratos' };
  }
}
