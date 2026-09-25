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
  AlertCircle,
  FileSignature,
  FileSpreadsheet,
  FileCheck2,
  FileX2,
  Clock,
  Filter,
  Loader2
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
      bg: '#fffbeb',
      color: '#b45309',
      border: '#fde68a',
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
      bg: '#eff6ff',
      color: '#1d4ed8',
      border: '#bfdbfe',
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
      return { label: 'Celebração Inicial', icon: FileSignature, color: '#0c326f', dotColor: '#0c326f' };
    case 'PRORROGACAO':
      return { label: 'Prorrogação de Vigência', icon: Clock, color: '#0284c7', dotColor: '#0284c7' };
    case 'REAJUSTE':
      return { label: 'Reajuste Contratual', icon: TrendingUp, color: '#059669', dotColor: '#059669' };
    case 'REPACTUACAO':
      return { label: 'Repactuação Salarial', icon: Layers, color: '#7c3aed', dotColor: '#7c3aed' };
    case 'ACRESCIMO':
      return { label: 'Acréscimo de Valor/Qtd', icon: TrendingUp, color: '#0d9488', dotColor: '#0d9488' };
    case 'SUPRESSAO':
      return { label: 'Supressão de Valor/Qtd', icon: TrendingDown, color: '#d97706', dotColor: '#d97706' };
    case 'APOSTILAMENTO':
      return { label: 'Apostilamento', icon: FileSpreadsheet, color: '#475569', dotColor: '#475569' };
    case 'ENCERRAMENTO':
      return { label: 'Encerramento Contratual', icon: FileCheck2, color: '#16a34a', dotColor: '#16a34a' };
    case 'RESCISAO':
      return { label: 'Rescisão Contratual', icon: FileX2, color: '#dc2626', dotColor: '#dc2626' };
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
      return { label: 'Altera Valor', bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0' };
    case 'ALTERA_QUANTITATIVO':
      return { label: 'Altera Quantitativo', bg: '#fdf4ff', color: '#86198f', border: '#f5d0fe' };
    case 'ATUALIZA_DADOS':
      return { label: 'Atualiza Dados', bg: '#f8fafc', color: '#334155', border: '#cbd5e1' };
    case 'EXTINGUE_CONTRATO':
      return { label: 'Extingue Contrato', bg: '#fef2f2', color: '#991b1b', border: '#fecaca' };
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
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
        <Loader2 size={24} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 0.5rem auto', color: '#0c326f' }} />
        <p style={{ fontSize: '0.88rem', margin: 0 }}>Carregando linha do tempo de eventos formais do contrato...</p>
      </div>
    );
  }

  // 2. Estado de Erro
  if (isError && !eventsOverride) {
    return (
      <div
        style={{
          background: '#fef2f2',
          borderRadius: '8px',
          border: '1px solid #fecaca',
          padding: '1.5rem',
          textAlign: 'center',
          color: '#991b1b'
        }}
      >
        <AlertCircle size={24} style={{ margin: '0 auto 0.5rem auto', color: '#dc2626' }} />
        <h4 style={{ fontSize: '0.98rem', fontWeight: 700, margin: '0 0 0.25rem 0' }}>
          Não foi possível carregar a linha do tempo contratual
        </h4>
        <p style={{ fontSize: '0.82rem', color: '#7f1d1d', margin: 0 }}>
          {error instanceof Error ? error.message : 'Ocorreu uma instabilidade ao recuperar o histórico formal de eventos.'}
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Síntese Executiva de Evolução do Valor Contratual (Fase 7.5-C2) */}
      <div
        data-testid="contract-value-evolution-section"
        style={{
          background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
          borderRadius: '10px',
          border: '1px solid #e2e8f0',
          padding: '1.25rem',
          marginBottom: '1.5rem',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.02)'
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '1rem',
            flexWrap: 'wrap',
            gap: '0.5rem'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                backgroundColor: '#0c326f',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <TrendingUp size={18} />
            </div>
            <div>
              <h4 style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                Evolução do Valor Contratual
              </h4>
              <p style={{ fontSize: '0.78rem', color: '#64748b', margin: 0 }}>
                Projeção jurídica determinística (Lei nº 14.133/2021) • Não substitui a execução financeira oficial
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            {valueEvolution.totalEventosMonetarios > 0 ? (
              <span
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  padding: '0.2rem 0.6rem',
                  borderRadius: '4px',
                  backgroundColor: '#eff6ff',
                  color: '#1d4ed8',
                  border: '1px solid #bfdbfe',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <CheckCircle2 size={12} />
                {valueEvolution.totalEventosMonetarios} alteração(ões) com impacto monetário
              </span>
            ) : (
              <span
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  padding: '0.2rem 0.6rem',
                  borderRadius: '4px',
                  backgroundColor: '#f8fafc',
                  color: '#64748b',
                  border: '1px solid #e2e8f0'
                }}
              >
                Sem aditamentos de valor registrados
              </span>
            )}
          </div>
        </div>

        {/* Grade de 3 Cards: Valor Original -> Variação Acumulada -> Valor Vigente */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '1rem'
          }}
        >
          {/* Card 1: Valor Original */}
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '8px',
              padding: '0.85rem 1rem',
              border: '1px solid #e2e8f0',
              boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
            }}
          >
            <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#64748b', display: 'block', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
              Valor Original (Celebração)
            </span>
            <div data-testid="evolution-valor-original" style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0f172a', margin: '0.25rem 0' }}>
              {formatCurrencyBRL(valueEvolution.valorOriginal)}
            </div>
            <span style={{ fontSize: '0.74rem', color: '#64748b' }}>
              Pactuação inicial do contrato
            </span>
          </div>

          {/* Card 2: Variação Acumulada Aditada */}
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '8px',
              padding: '0.85rem 1rem',
              border: '1px solid #e2e8f0',
              boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
            }}
          >
            <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#64748b', display: 'block', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
              Variação Acumulada
            </span>
            <div
              data-testid="evolution-delta-acumulado"
              style={{
                fontSize: '1.2rem',
                fontWeight: 800,
                color: valueEvolution.deltaAcumulado > 0 ? '#15803d' : (valueEvolution.deltaAcumulado < 0 ? '#b91c1c' : '#475569'),
                margin: '0.25rem 0',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem'
              }}
            >
              <span>
                {valueEvolution.deltaAcumulado > 0 ? '+ ' : (valueEvolution.deltaAcumulado < 0 ? '- ' : '')}
                {formatCurrencyBRL(Math.abs(valueEvolution.deltaAcumulado))}
              </span>
              {valueEvolution.valorOriginal > 0 && valueEvolution.deltaAcumulado !== 0 && (
                <span style={{ fontSize: '0.76rem', fontWeight: 700, opacity: 0.9 }}>
                  ({valueEvolution.percentualVariacaoAcumulada >= 0 ? '+' : ''}{valueEvolution.percentualVariacaoAcumulada.toFixed(2)}%)
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', fontSize: '0.72rem', color: '#64748b' }}>
              {valueEvolution.totalReajustes > 0 && <span>Reajustes: +{formatCurrencyBRL(valueEvolution.totalReajustes)}</span>}
              {valueEvolution.totalRepactuacoes > 0 && <span>Repactuações: +{formatCurrencyBRL(valueEvolution.totalRepactuacoes)}</span>}
              {valueEvolution.totalAcrescimos > 0 && <span>Acréscimos: +{formatCurrencyBRL(valueEvolution.totalAcrescimos)}</span>}
              {valueEvolution.totalSupressoes > 0 && <span>Supressões: -{formatCurrencyBRL(valueEvolution.totalSupressoes)}</span>}
              {valueEvolution.totalReequilibrios !== 0 && <span>Reequilíbrio: +{formatCurrencyBRL(valueEvolution.totalReequilibrios)}</span>}
              {valueEvolution.totalOutrosAditivos !== 0 && <span>Outros: +{formatCurrencyBRL(valueEvolution.totalOutrosAditivos)}</span>}
              {valueEvolution.totalEventosMonetarios === 0 && <span>Sem alterações monetárias</span>}
            </div>
          </div>

          {/* Card 3: Valor Vigente Projetado */}
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '8px',
              padding: '0.85rem 1rem',
              border: '1px solid #bfdbfe',
              background: 'linear-gradient(180deg, #ffffff 0%, #eff6ff 100%)',
              boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
            }}
          >
            <span style={{ fontSize: '0.74rem', fontWeight: 800, color: '#1d4ed8', display: 'block', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
              Valor Vigente Atualizado
            </span>
            <div data-testid="evolution-valor-vigente" style={{ fontSize: '1.2rem', fontWeight: 900, color: '#0c326f', margin: '0.25rem 0' }}>
              {formatCurrencyBRL(valueEvolution.valorVigente)}
            </div>
            <span style={{ fontSize: '0.74rem', color: '#3b82f6', fontWeight: 600 }}>
              {valueEvolution.dataUltimoEventoRelevante
                ? `Atualizado até ${formatDateBR(valueEvolution.dataUltimoEventoRelevante)}`
                : 'Valor vigente atual'}
            </span>
          </div>
        </div>
      </div>

      {/* Estado Vazio de Eventos */}
      {sortedEvents.length === 0 ? (
        <div
          style={{
            background: '#f8fafc',
            borderRadius: '8px',
            border: '1px dashed #cbd5e1',
            padding: '2rem 1.5rem',
            textAlign: 'center',
            color: '#64748b'
          }}
        >
          <Calendar size={28} style={{ margin: '0 auto 0.75rem auto', color: '#94a3b8' }} />
          <h4 style={{ fontSize: '0.96rem', fontWeight: 700, color: '#334155', margin: '0 0 0.25rem 0' }}>
            Ainda não há eventos contratuais registrados
          </h4>
          <p style={{ fontSize: '0.82rem', color: '#64748b', maxWidth: '450px', margin: '0 auto' }}>
            Eventos oficiais como celebração, prorrogações, reajustes e aditamentos aparecerão aqui conforme sincronizados das fontes governamentais.
          </p>
        </div>
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
                <button
                  key={btn.key}
                  type="button"
                  onClick={() => setFilter(btn.key)}
                  style={{
                    padding: '0.3rem 0.65rem',
                    fontSize: '0.76rem',
                    fontWeight: 700,
                    borderRadius: '6px',
                    border: filter === btn.key ? '1px solid #0c326f' : '1px solid #e2e8f0',
                    backgroundColor: filter === btn.key ? '#0c326f' : '#ffffff',
                    color: filter === btn.key ? '#ffffff' : '#475569',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {btn.label}
                </button>
              ))}
            </div>
          </div>

          {/* Lista / Timeline de Eventos */}
          {filteredEvents.length === 0 ? (
            <div style={{ padding: '1.5rem', textAlign: 'center', color: '#64748b', fontSize: '0.85rem' }}>
              Nenhum evento encontrado para o filtro selecionado.
            </div>
          ) : (
            <div style={{ position: 'relative', paddingLeft: '1.75rem' }}>
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
                        style={{
                          backgroundColor: oficialidade.level === 'FATO_OFICIAL' ? '#ffffff' : '#f8fafc',
                          borderRadius: '8px',
                          border: `1px solid ${oficialidade.level === 'FATO_OFICIAL' ? '#e2e8f0' : '#cbd5e1'}`,
                          padding: '1rem 1.25rem',
                          boxShadow: '0 1px 2px rgba(0, 0, 0, 0.03)'
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
                                fontSize: '0.72rem',
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
                                fontSize: '0.72rem',
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
                                fontSize: '0.74rem',
                                fontWeight: 700,
                                color: '#0c326f',
                                backgroundColor: '#eff6ff',
                                border: '1px solid #bfdbfe',
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
                          <span style={{ color: '#475569', backgroundColor: '#f8fafc', padding: '0.15rem 0.45rem', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
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
                                color: evoItem.deltaValor > 0 ? '#15803d' : '#b91c1c',
                                backgroundColor: evoItem.deltaValor > 0 ? '#f0fdf4' : '#fef2f2',
                                padding: '0.15rem 0.45rem',
                                borderRadius: '4px',
                                border: `1px solid ${evoItem.deltaValor > 0 ? '#bbf7d0' : '#fecaca'}`,
                                fontWeight: 800
                              }}
                            >
                              <strong>Delta:</strong> {evoItem.deltaValor > 0 ? '+' : '-'}{formatCurrencyBRL(Math.abs(evoItem.deltaValor))}
                            </span>
                          )}

                          {/* Impacto em Valor Formal (se houver) */}
                          {typeof event.valorPosterior === 'number' && event.valorPosterior > 0 && (
                            <span style={{ color: '#166534', backgroundColor: '#f0fdf4', padding: '0.15rem 0.45rem', borderRadius: '4px', border: '1px solid #bbf7d0' }}>
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
