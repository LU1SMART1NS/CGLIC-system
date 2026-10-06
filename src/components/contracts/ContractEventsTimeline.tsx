import React, { useState, useMemo } from 'react';
import {
  Calendar,
  CheckCircle2,
  ExternalLink,
  FileText,
  FileQuestion,
  Building2,
  TrendingUp,
  TrendingDown,
  Layers,
  FileSignature,
  FileSpreadsheet,
  FileCheck2,
  FileX2,
  Clock,
  Filter
} from 'lucide-react';
import type {
  ContractDashboardRecord,
  ContractEvent,
  ContractEventType,
  ContractEventNature,
  ContractEventImpact
} from '../../types';
import { useContractEvents } from '../../hooks/useContractEvents';
import { formatDateBR } from '../../services/temporalEngineService';
import { formatCurrencyBRL } from '../../utils/ataGrouping';
import { buildContractValueEvolutionModel } from '../../services/contractValueEvolutionService';
import { AppButton, DataTable, EmptyState, ErrorState, SectionHeader, StatusBadge } from '../../design-system';
import { HealthTile, HealthTileGrid } from '../instrument360/HealthStripParts';

interface ContractEventsTimelineProps {
  contract: ContractDashboardRecord;
  eventsOverride?: ContractEvent[];
  isLoadingOverride?: boolean;
}

export type TimelineOficialidadeLevel =
  | 'FATO_OFICIAL'
  | 'DECISAO_INTERNA'
  | 'PROPOSTA_ADMINISTRATIVA'
  | 'DADO_INTERNO';

export type TimelineFilterType = 'TODOS' | 'OFICIAIS' | 'INTERNOS';

/**
 * 1. Avalia o grau de oficialidade formal do evento sem inferências arbitrárias.
 */
export function getOficialidadeInfo(event: ContractEvent): {
  level: TimelineOficialidadeLevel;
  label: string;
  bg: string;
  color: string;
  border: string;
  icon: React.ElementType;
} {
  const fonte = (event.fonteOrigem || '').toUpperCase();
  const desc = (event.descricao || '').toUpperCase();

  if (desc.includes('PROPOSTA') || desc.includes('ESTUDO PRELIMINAR') || desc.includes('MINUTA')) {
    return {
      level: 'PROPOSTA_ADMINISTRATIVA',
      label: 'Proposta administrativa',
      bg: 'var(--color-warning-bg)',
      color: 'var(--color-warning-text)',
      border: 'var(--color-warning-border)',
      icon: FileQuestion
    };
  }

  const hasOfficialEvidence =
    fonte === 'PNCP' ||
    fonte === 'CONTRATOS.GOV.BR' ||
    fonte === 'COMPRAS.GOV.BR' ||
    Boolean(event.numeroControlePncp || event.linkPncp || event.dataPublicacao);

  if (hasOfficialEvidence) {
    return {
      level: 'FATO_OFICIAL',
      label: 'Fato oficial',
      bg: 'var(--color-info-bg)',
      color: 'var(--color-info-text)',
      border: 'var(--color-info-border)',
      icon: CheckCircle2
    };
  }

  if (fonte === 'SEI' || Boolean(event.processoSeiNumero)) {
    return {
      level: 'DECISAO_INTERNA',
      label: 'Decisão interna',
      bg: '#f5f3ff',
      color: '#6d28d9',
      border: '#ddd6fe',
      icon: FileText
    };
  }

  return {
    level: 'DADO_INTERNO',
    label: 'Registro interno',
    bg: '#f8fafc',
    color: '#475569',
    border: '#cbd5e1',
    icon: Building2
  };
}

/**
 * 2. Rótulo e ícone amigável por Tipo de Evento.
 */
export function getEventTypeDisplay(tipo: ContractEventType): {
  label: string;
  icon: React.ElementType;
  color: string;
  dotColor: string;
} {
  switch (tipo) {
    case 'CELEBRACAO':
      return { label: 'Celebração Inicial', icon: FileSignature, color: 'var(--primary)', dotColor: 'var(--primary)' };
    case 'PRORROGACAO':
      return { label: 'Prorrogação de Vigência', icon: Clock, color: '#0284c7', dotColor: '#0284c7' };
    case 'REAJUSTE':
      return { label: 'Reajuste Contratual', icon: TrendingUp, color: 'var(--color-success)', dotColor: 'var(--color-success)' };
    case 'REPACTUACAO':
      return { label: 'Repactuação Salarial', icon: Layers, color: '#7c3aed', dotColor: '#7c3aed' };
    case 'ACRESCIMO':
      return { label: 'Acréscimo de Valor/Qtd', icon: TrendingUp, color: '#0d9488', dotColor: '#0d9488' };
    case 'SUPRESSAO':
      return { label: 'Supressão de Valor/Qtd', icon: TrendingDown, color: 'var(--color-warning)', dotColor: 'var(--color-warning)' };
    case 'APOSTILAMENTO':
      return { label: 'Apostilamento', icon: FileSpreadsheet, color: '#475569', dotColor: '#475569' };
    case 'ENCERRAMENTO':
      return { label: 'Encerramento Contratual', icon: FileCheck2, color: 'var(--color-success-solid)', dotColor: 'var(--color-success-solid)' };
    case 'RESCISAO':
      return { label: 'Rescisão Contratual', icon: FileX2, color: 'var(--color-danger)', dotColor: 'var(--color-danger)' };
    default:
      return { label: 'Evento Contratual', icon: FileText, color: '#64748b', dotColor: '#64748b' };
  }
}

/**
 * 3. Rótulo amigável do Instrumento Formal.
 */
export function getInstrumentoDisplay(natureza: ContractEventNature): string {
  switch (natureza) {
    case 'CONTRATO_INICIAL':
      return 'Contrato Inicial';
    case 'TERMO_ADITIVO':
      return 'Termo Aditivo';
    case 'TERMO_APOSTILAMENTO':
      return 'Termo de Apostilamento';
    case 'TERMO_RECEBIMENTO_DEFINITIVO':
      return 'Termo de Recebimento Definitivo';
    case 'NOTIFICACAO_RESCISAO':
      return 'Notificação de Rescisão';
    case 'REGISTRO_ADMINISTRATIVO':
      return 'Registro Administrativo';
    default:
      return String(natureza || 'Instrumento Não Informado');
  }
}

/**
 * 4. Rótulo e badge do Impacto Formal.
 */
export function getImpactoDisplay(impacto: ContractEventImpact): {
  label: string;
  bg: string;
  color: string;
  border: string;
} {
  switch (impacto) {
    case 'ALTERA_VIGENCIA':
      return { label: 'Altera Vigência', bg: '#f0f9ff', color: '#0369a1', border: '#bae6fd' };
    case 'ALTERA_VALOR':
      return { label: 'Altera Valor', bg: 'var(--color-success-bg)', color: 'var(--color-success-text)', border: 'var(--color-success-border)' };
    case 'ALTERA_QUANTITATIVO':
      return { label: 'Altera Quantitativo', bg: '#fdf4ff', color: '#86198f', border: '#f5d0fe' };
    case 'ATUALIZA_DADOS':
      return { label: 'Atualiza Dados', bg: '#f8fafc', color: '#334155', border: '#cbd5e1' };
    case 'EXTINGUE_CONTRATO':
      return { label: 'Extingue Contrato', bg: 'var(--color-danger-bg)', color: 'var(--color-danger-text-strong)', border: 'var(--color-danger-border)' };
    case 'SEM_IMPACTO_FINANCEIRO_TEMPORAL':
    default:
      return { label: 'Sem Impacto Financeiro/Temporal', bg: '#f1f5f9', color: '#475569', border: '#e2e8f0' };
  }
}

/**
 * 5. Extrai e ordena a data canônica do evento (mais recente primeiro).
 */
export function getEventCanonicalDate(event: ContractEvent): { dateStr: string; displayDate: string } {
  const dateStr =
    event.dataPublicacao ||
    event.dataVigenciaEfeito ||
    event.dataAssinatura ||
    (event.capturedAt ? event.capturedAt.split('T')[0] : '');

  return {
    dateStr,
    displayDate: dateStr ? formatDateBR(dateStr) : 'Data não informada'
  };
}

export function sortEventsChronologically(events: ContractEvent[]): ContractEvent[] {
  return [...events].sort((a, b) => {
    const dateA = getEventCanonicalDate(a).dateStr;
    const dateB = getEventCanonicalDate(b).dateStr;

    // Mais recente primeiro
    if (dateA !== dateB) {
      return dateB.localeCompare(dateA);
    }

    // Desempate por número sequencial (ex: 2º Termo Aditivo antes do 1º na mesma data)
    const seqA = typeof a.numeroSequencial === 'number' ? a.numeroSequencial : parseInt(String(a.numeroSequencial || '0'), 10) || 0;
    const seqB = typeof b.numeroSequencial === 'number' ? b.numeroSequencial : parseInt(String(b.numeroSequencial || '0'), 10) || 0;
    if (seqA !== seqB) {
      return seqB - seqA;
    }

    // Desempate por id determinístico
    return b.id.localeCompare(a.id);
  });
}

export const ContractEventsTimeline: React.FC<ContractEventsTimelineProps> = ({
  contract,
  eventsOverride,
  isLoadingOverride
}) => {
  const { data: queriedEvents = [], isLoading: loadingEvents, isError, error } = useContractEvents(contract);
  const [filter, setFilter] = useState<TimelineFilterType>('TODOS');

  const rawEvents = eventsOverride || queriedEvents;
  const isLoading = isLoadingOverride ?? loadingEvents;

  // Read Model da Evolução do Valor Contratual (Fase 7.5-C1)
  const valueEvolution = useMemo(() => {
    return buildContractValueEvolutionModel(contract, rawEvents);
  }, [contract, rawEvents]);

  // Mapa rápido de eventos auditados no Read Model
  const evolutionEventsMap = useMemo(() => {
    const map = new Map<string, (typeof valueEvolution.eventos)[0]>();
    for (const item of valueEvolution.eventos) {
      map.set(item.eventoId, item);
    }
    return map;
  }, [valueEvolution]);

  // Ordenação cronológica rigorosa e filtragem
  const sortedEvents = useMemo(() => {
    return sortEventsChronologically(rawEvents);
  }, [rawEvents]);

  const filteredEvents = useMemo(() => {
    if (filter === 'TODOS') return sortedEvents;

    return sortedEvents.filter((ev) => {
      const oficialidade = getOficialidadeInfo(ev).level;
      if (filter === 'OFICIAIS') {
        return oficialidade === 'FATO_OFICIAL';
      }
      if (filter === 'INTERNOS') {
        return oficialidade !== 'FATO_OFICIAL';
      }
      return true;
    });
  }, [sortedEvents, filter]);

  // 1. Estado de Carregamento
  if (isLoading) {
    return <DataTable columns={[]} data={[]} keyExtractor={() => ''} isLoading testId="contract-events-loading" />;
  }

  // 2. Estado de Erro
  if (isError && !eventsOverride) {
    return (
      <ErrorState
        title="Não foi possível carregar a linha do tempo contratual"
        message={error instanceof Error ? error.message : 'Ocorreu uma instabilidade ao recuperar o histórico formal de eventos.'}
        testId="contract-events-error"
      />
    );
  }

  return (
    <div>
      {/* Só aparece quando há aditamento com impacto no valor; sem isso, repetiria o valor global do cabeçalho */}
      {valueEvolution.totalEventosMonetarios > 0 && (
        <div
          data-testid="contract-value-evolution-section"
          style={{ background: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0', padding: '1rem 1.25rem', marginBottom: '1.5rem' }}
        >
          <SectionHeader
            title="Evolução do Valor Contratual"
            subtitle="Projeção jurídica determinística (Lei nº 14.133/2021) • Não substitui a execução financeira oficial"
            icon={<TrendingUp size={16} />}
            actions={
              <StatusBadge
                label={`${valueEvolution.totalEventosMonetarios} alteração(ões) com impacto monetário`}
                variant="info"
                size="sm"
                dot={false}
              />
            }
          />

          <HealthTileGrid>
            <HealthTile
              label="Valor original (celebração)"
              value={formatCurrencyBRL(valueEvolution.valorOriginal)}
              hint="Pactuação inicial do contrato"
              testId="evolution-valor-original"
            />
            <HealthTile
              label="Variação acumulada"
              value={`${valueEvolution.deltaAcumulado > 0 ? '+ ' : valueEvolution.deltaAcumulado < 0 ? '- ' : ''}${formatCurrencyBRL(Math.abs(valueEvolution.deltaAcumulado))}${
                valueEvolution.valorOriginal > 0 && valueEvolution.deltaAcumulado !== 0
                  ? ` (${valueEvolution.percentualVariacaoAcumulada >= 0 ? '+' : ''}${valueEvolution.percentualVariacaoAcumulada.toFixed(2)}%)`
                  : ''
              }`}
              hint={
                [
                  valueEvolution.totalReajustes > 0 && `Reajustes: +${formatCurrencyBRL(valueEvolution.totalReajustes)}`,
                  valueEvolution.totalRepactuacoes > 0 && `Repactuações: +${formatCurrencyBRL(valueEvolution.totalRepactuacoes)}`,
                  valueEvolution.totalAcrescimos > 0 && `Acréscimos: +${formatCurrencyBRL(valueEvolution.totalAcrescimos)}`,
                  valueEvolution.totalSupressoes > 0 && `Supressões: -${formatCurrencyBRL(valueEvolution.totalSupressoes)}`,
                  valueEvolution.totalReequilibrios !== 0 && `Reequilíbrio: +${formatCurrencyBRL(valueEvolution.totalReequilibrios)}`,
                  valueEvolution.totalOutrosAditivos !== 0 && `Outros: +${formatCurrencyBRL(valueEvolution.totalOutrosAditivos)}`
                ]
                  .filter(Boolean)
                  .join(' · ')
              }
              tone={valueEvolution.deltaAcumulado < 0 ? 'ATENCAO' : undefined}
              testId="evolution-delta-acumulado"
            />
            <HealthTile
              label="Valor vigente atualizado"
              value={formatCurrencyBRL(valueEvolution.valorVigente)}
              hint={
                valueEvolution.dataUltimoEventoRelevante
                  ? `Atualizado até ${formatDateBR(valueEvolution.dataUltimoEventoRelevante)}`
                  : 'Valor vigente atual'
              }
              testId="evolution-valor-vigente"
            />
          </HealthTileGrid>
        </div>
      )}

      {/* Estado Vazio de Eventos */}
      {sortedEvents.length === 0 ? (
        <EmptyState
          icon={<Calendar size={28} />}
          title="Ainda não há eventos contratuais registrados"
          description="Eventos oficiais como celebração, prorrogações, reajustes e aditamentos aparecerão aqui conforme sincronizados das fontes governamentais."
          testId="contract-events-empty"
        />
      ) : (
        <>
          {/* Barra de Filtros Simples */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '1.25rem',
              paddingBottom: '0.75rem',
              borderBottom: '1px solid #f1f5f9',
              flexWrap: 'wrap',
              gap: '0.75rem'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem', color: '#64748b', fontWeight: 600 }}>
              <Filter size={14} />
              <span>Filtrar eventos:</span>
            </div>

            <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
              {(
                [
                  { key: 'TODOS', label: `Todos (${sortedEvents.length})` },
                  {
                    key: 'OFICIAIS',
                    label: `Fatos Oficiais (${sortedEvents.filter((e) => getOficialidadeInfo(e).level === 'FATO_OFICIAL').length})`
                  },
                  {
                    key: 'INTERNOS',
                    label: `Internos (${sortedEvents.filter((e) => getOficialidadeInfo(e).level !== 'FATO_OFICIAL').length})`
                  }
                ] as const
              ).map((btn) => (
                <AppButton
                  key={btn.key}
                  type="button"
                  size="sm"
                  variant={filter === btn.key ? 'primary' : 'outline'}
                  onClick={() => setFilter(btn.key)}
                >
                  {btn.label}
                </AppButton>
              ))}
            </div>
          </div>

          {/* Lista / Timeline de Eventos */}
          {filteredEvents.length === 0 ? (
            <div style={{ padding: '1.5rem', textAlign: 'center', color: '#64748b', fontSize: '0.85rem' }}>
              Nenhum evento encontrado para o filtro selecionado.
            </div>
          ) : (
            <div className="timeline-track" style={{ position: 'relative', paddingLeft: '1.75rem' }}>
              {/* Linha Vertical Conectora */}
              <div
                style={{
                  position: 'absolute',
                  top: '12px',
                  bottom: '12px',
                  left: '9px',
                  width: '2px',
                  backgroundColor: '#e2e8f0'
                }}
              />

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {filteredEvents.map((event) => {
                  const { displayDate } = getEventCanonicalDate(event);
                  const oficialidade = getOficialidadeInfo(event);
                  const tipoDisplay = getEventTypeDisplay(event.tipoEvento);
                  const instrumentoLabel = getInstrumentoDisplay(event.naturezaInstrumento);
                  const impactoDisplay = getImpactoDisplay(event.impacto);
                  const evoItem = evolutionEventsMap.get(event.id);

                  const EventIcon = tipoDisplay.icon;
                  const OficialIcon = oficialidade.icon;

                  const hasExternalLink = Boolean(event.linkPncp);

                  return (
                    <div key={event.id} style={{ position: 'relative' }}>
                      {/* Marcador Circular da Timeline */}
                      <div
                        style={{
                          position: 'absolute',
                          left: '-1.75rem',
                          top: '6px',
                          width: '20px',
                          height: '20px',
                          borderRadius: '50%',
                          backgroundColor: '#ffffff',
                          border: `3px solid ${tipoDisplay.dotColor}`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          zIndex: 1,
                          boxShadow: '0 0 0 2px #ffffff'
                        }}
                      />

                      {/* Card do Evento */}
                      <div
                        className="timeline-card"
                        style={{
                          backgroundColor: '#ffffff',
                          borderRadius: '8px',
                          border: `1px ${oficialidade.level === 'FATO_OFICIAL' ? 'solid' : 'dashed'} ${oficialidade.level === 'FATO_OFICIAL' ? '#e2e8f0' : '#cbd5e1'}`,
                          padding: '1rem 1.25rem'
                        }}
                      >
                        {/* Cabeçalho do Evento: Data, Oficialidade e Tipo */}
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '0.75rem',
                            marginBottom: '0.45rem',
                            flexWrap: 'wrap'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                            {/* Data Canônica em Destaque */}
                            <span
                              style={{
                                fontSize: '0.85rem',
                                fontWeight: 800,
                                color: '#0f172a',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}
                            >
                              <Calendar size={13} style={{ color: '#64748b' }} />
                              {displayDate}
                            </span>

                            {/* Badge de Oficialidade com Texto Explícito */}
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                fontSize: '0.75rem',
                                fontWeight: 800,
                                padding: '0.15rem 0.5rem',
                                borderRadius: '4px',
                                backgroundColor: oficialidade.bg,
                                color: oficialidade.color,
                                border: `1px solid ${oficialidade.border}`
                              }}
                            >
                              <OficialIcon size={12} />
                              {oficialidade.label}
                            </span>

                            {/* Badge do Tipo de Evento */}
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                padding: '0.15rem 0.5rem',
                                borderRadius: '4px',
                                backgroundColor: '#f1f5f9',
                                color: tipoDisplay.color,
                                border: '1px solid #e2e8f0'
                              }}
                            >
                              <EventIcon size={12} />
                              {tipoDisplay.label}
                            </span>
                          </div>

                          {/* Link para Fonte Oficial (se existir) */}
                          {hasExternalLink && (
                            <a
                              href={event.linkPncp}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                color: 'var(--primary)',
                                backgroundColor: 'var(--color-info-bg)',
                                border: '1px solid var(--color-info-border)',
                                padding: '0.2rem 0.55rem',
                                borderRadius: '4px',
                                textDecoration: 'none'
                              }}
                              title="Abrir publicação oficial no PNCP"
                            >
                              <span>Ver fonte oficial</span>
                              <ExternalLink size={11} />
                            </a>
                          )}
                        </div>

                        {/* Título / Identificador Oficial e Descrição */}
                        <h4
                          style={{
                            fontSize: '0.96rem',
                            fontWeight: 700,
                            color: '#0f172a',
                            margin: '0 0 0.35rem 0',
                            lineHeight: '1.4'
                          }}
                        >
                          {event.identificadorOficial ? `${event.identificadorOficial} — ` : ''}
                          {event.descricao}
                        </h4>

                        {/* Metadados: Instrumento, Impacto e Variações Formais */}
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.6rem',
                            flexWrap: 'wrap',
                            marginTop: '0.5rem',
                            fontSize: '0.76rem'
                          }}
                        >
                          {/* Instrumento Formal */}
                          <span style={{ color: '#475569', backgroundColor: '#f1f5f9', padding: '0.15rem 0.45rem', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                            <strong>Instrumento:</strong> {instrumentoLabel}
                          </span>

                          {/* Impacto Formal */}
                          <span
                            style={{
                              backgroundColor: impactoDisplay.bg,
                              color: impactoDisplay.color,
                              border: `1px solid ${impactoDisplay.border}`,
                              padding: '0.15rem 0.45rem',
                              borderRadius: '4px',
                              fontWeight: 700
                            }}
                          >
                            {impactoDisplay.label}
                          </span>

                          {/* Delta Monetário Específico do Read Model (se houver impacto) */}
                          {evoItem && evoItem.impactoMonetario && (
                            <span
                              style={{
                                color: evoItem.deltaValor > 0 ? 'var(--color-success-text)' : 'var(--color-danger-text)',
                                backgroundColor: evoItem.deltaValor > 0 ? 'var(--color-success-bg)' : 'var(--color-danger-bg)',
                                padding: '0.15rem 0.45rem',
                                borderRadius: '4px',
                                border: `1px solid ${evoItem.deltaValor > 0 ? 'var(--color-success-border)' : 'var(--color-danger-border)'}`,
                                fontWeight: 800
                              }}
                            >
                              <strong>Delta:</strong> {evoItem.deltaValor > 0 ? '+' : '-'}{formatCurrencyBRL(Math.abs(evoItem.deltaValor))}
                            </span>
                          )}

                          {/* Impacto em Valor Formal (se houver) */}
                          {typeof event.valorPosterior === 'number' && event.valorPosterior > 0 && (
                            <span style={{ color: 'var(--color-success-text-strong)', backgroundColor: 'var(--color-success-bg)', padding: '0.15rem 0.45rem', borderRadius: '4px', border: '1px solid var(--color-success-border)' }}>
                              <strong>Valor Formal:</strong> {formatCurrencyBRL(event.valorPosterior)}
                            </span>
                          )}

                          {/* Impacto em Vigência (se houver) */}
                          {event.vigenciaPosterior && (
                            <span style={{ color: '#0369a1', backgroundColor: '#f0f9ff', padding: '0.15rem 0.45rem', borderRadius: '4px', border: '1px solid #bae6fd' }}>
                              <strong>Nova Vigência:</strong> {formatDateBR(event.vigenciaPosterior)}
                            </span>
                          )}

                          {/* Fonte da Informação */}
                          <span style={{ color: '#64748b', marginLeft: 'auto' }}>
                            Fonte: <strong>{event.fonteOrigem || 'Não Informada'}</strong>
                            {event.processoSeiNumero && ` • SEI ${event.processoSeiNumero}`}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
