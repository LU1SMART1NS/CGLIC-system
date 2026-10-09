import { buildAtaPath } from '../../hooks/useAta';
import type { AlvoResolucao } from '../avisos/ResolverAviso';
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
  tipo: 'ARP' | 'Contrato' | 'Pagamentos';
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
  if (item.category === 'PAGAMENTO_PREVISTO' && !item.contractKey) {
    return { tipo: 'Pagamentos', label: 'Previsão mensal' };
  }
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
  ATA_CRITICA: { label: 'Saldo em Atenção', color: 'var(--color-success)', bg: '#ecfdf5' },
  UNIDADE_PENDENTE: { label: 'Unidades do Contratado', color: 'var(--color-info-text)', bg: 'var(--color-info-bg)' },
  FORNECEDOR_PNCP: { label: 'Fornecedor da Ata', color: 'var(--color-info-text)', bg: 'var(--color-info-bg)' },
  PAGAMENTO_CRITICO: { label: 'Execução / Pagamento', color: 'var(--color-danger)', bg: 'var(--color-danger-bg)' },
  PAGAMENTO_PREVISTO: { label: 'Pagamento Previsto', color: 'var(--color-warning-text)', bg: 'var(--color-warning-bg)' },
  REAJUSTE_RADAR: { label: 'Reajuste / Repactuação', color: 'var(--color-warning-text)', bg: 'var(--color-warning-bg)' },
  TAREFA_ATRASADA: { label: 'Tarefa Atrasada', color: 'var(--color-danger-text-strong)', bg: 'var(--color-danger-bg)' },
  TAREFA_PROXIMA: { label: 'Tarefa Próxima', color: 'var(--color-warning-text)', bg: 'var(--color-warning-bg)' },
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

/**
 * Detalhe da Ata (Ata 360, aba Ações) quando o alerta é de Ata e a UASG é conhecida. A UASG da ata vem da chave do
 * alerta ("NÚMERO-UASG[-ITEM]"); `item.uasg` é a carteira do painel, que nas atas de outros órgãos não é a UASG da
 * ata (migration 106) e só vale quando o alerta não traz a chave.
 */
function ataItemUrl(item: DashboardAttentionItem & { uasg?: string }): string {
  const uasgDaChave = /^\d{5}\/\d{4}-(\d{6})/.exec(String(item.arpKey ?? ''))?.[1];
  const uasg = uasgDaChave || item.uasg;
  if (!item.numeroAta || !uasg) return '/atas';
  return buildAtaPath(item.numeroAta, uasg, 'acoes');
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
    case 'UNIDADE_PENDENTE':
      return { label: 'Informar Unidades', targetUrl: item.targetUrl || ataItemUrl(item) };
    case 'FORNECEDOR_PNCP':
      return { label: item.badgeLabel === 'conferir itens' ? 'Conferir Fornecedor' : 'Indicar Fornecedor', targetUrl: item.targetUrl || ataItemUrl(item) };
    case 'PAGAMENTO_CRITICO':
      return { label: 'Abrir Pagamento', targetUrl: '/pagamentos' };
    case 'PAGAMENTO_PREVISTO':
      return { label: item.contractKey ? 'Abrir Pagamentos do Contrato' : 'Abrir Previsão', targetUrl: item.targetUrl || '/pagamentos' };
    case 'REAJUSTE_RADAR':
      return { label: 'Analisar Reajuste', targetUrl: contractItemUrl(item) };
    case 'TAREFA_ATRASADA':
    case 'TAREFA_PROXIMA':
      return { label: 'Abrir Tarefa', targetUrl: contractItemUrl(item) };
    default:
      return { label: 'Visualizar', targetUrl: item.targetUrl || '/contratos' };
  }
}

/**
 * O que o ✓ da linha resolve: saldo, reajuste e lembrete pela chave do aviso; tarefa, concluindo-a.
 * Pagamento não tem Resolvido (some ao registrar a etapa): null.
 */
export function getAlvoResolucao(item: AttentionItemWithUasg): AlvoResolucao | null {
  const instrumento = getInstrumentoInfo(item);
  const titulo = item.objetoItem || item.title;
  const contexto = `${instrumento.label} · UASG ${item.uasg}`;
  if (item.avisoChave) return { tipo: 'AVISO', chave: item.avisoChave, titulo, contexto };
  if ((item.category === 'TAREFA_ATRASADA' || item.category === 'TAREFA_PROXIMA') && item.taskId) {
    return { tipo: item.id.startsWith('ATT-ATA-TASK-') ? 'TAREFA_ATA' : 'TAREFA_CONTRATO', taskId: item.taskId, titulo, contexto };
  }
  return null;
}
