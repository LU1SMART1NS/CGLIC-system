import React from 'react';
import {
  GitBranch,
  Calendar,
  User,
  FileText,
  AlertTriangle,
  Clock,
  ArrowRight
} from 'lucide-react';
import type { ContractWorkflowPresentationItem } from '../../hooks/useContractWorkflows';
import { ContractWorkflowStepper } from './ContractWorkflowStepper';

interface ContractWorkflowCardProps {
  workflow: ContractWorkflowPresentationItem;
}

export const ContractWorkflowCard: React.FC<ContractWorkflowCardProps> = ({ workflow }) => {
  // Configuração visual de cores por statusVariant
  const getBadgeStyle = (variant: ContractWorkflowPresentationItem['statusVariant']) => {
    switch (variant) {
      case 'success':
        return { bg: '#ecfdf5', text: '#065f46', border: '#a7f3d0' };
      case 'warning':
        return { bg: '#fffbeb', text: '#92400e', border: '#fde68a' };
      case 'danger':
        return { bg: '#fef2f2', text: '#991b1b', border: '#fecaca' };
      case 'neutral':
        return { bg: '#f8fafc', text: '#475569', border: '#cbd5e1' };
      case 'info':
      default:
        return { bg: '#eff6ff', text: '#1e40af', border: '#bfdbfe' };
    }
  };

  const badgeStyle = getBadgeStyle(workflow.statusVariant);

  return (
    <article
      style={{
        backgroundColor: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '10px',
        padding: '1.25rem',
        marginBottom: '1rem',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
        transition: 'border-color 0.15s ease'
      }}
      aria-label={`Workflow: ${workflow.tipoNomeAmigavel}`}
    >
      {/* 1. Cabeçalho do Card */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: '0.75rem',
          borderBottom: '1px solid #f1f5f9',
          paddingBottom: '0.85rem'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <div
            style={{
              padding: '0.4rem',
              backgroundColor: '#f1f5f9',
              borderRadius: '6px',
              color: '#334155',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <GitBranch size={18} />
          </div>
          <div>
            <h4
              style={{
                fontSize: '1rem',
                fontWeight: 700,
                color: '#0f172a',
                margin: 0,
                letterSpacing: '-0.01em'
              }}
            >
              {workflow.tipoNomeAmigavel}
            </h4>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.2rem' }}>
              <span
                style={{
                  fontSize: '0.72rem',
                  color: '#64748b',
                  fontFamily: 'monospace'
                }}
              >
                {workflow.id}
              </span>
            </div>
          </div>
        </div>

        {/* Badges de Status e Atividade */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
          {workflow.hasAttention && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.25rem',
                fontSize: '0.72rem',
                fontWeight: 700,
                padding: '0.2rem 0.5rem',
                borderRadius: '6px',
                backgroundColor: '#fff7ed',
                color: '#c2410c',
                border: '1px solid #ffedd5'
              }}
            >
              <AlertTriangle size={12} />
              Atenção
            </span>
          )}

          {/* Badge de Ativo / Concluído */}
          <span
            style={{
              fontSize: '0.72rem',
              fontWeight: 600,
              padding: '0.2rem 0.5rem',
              borderRadius: '6px',
              backgroundColor: workflow.isActive ? '#ecfdf5' : '#f1f5f9',
              color: workflow.isActive ? '#047857' : '#475569',
              border: `1px solid ${workflow.isActive ? '#d1fae5' : '#e2e8f0'}`
            }}
          >
            {workflow.isActive ? 'Em Andamento' : workflow.isCompleted ? 'Concluído' : 'Inativo'}
          </span>

          {/* Badge do Status Canônico */}
          <span
            style={{
              fontSize: '0.75rem',
              fontWeight: 700,
              padding: '0.25rem 0.6rem',
              borderRadius: '6px',
              backgroundColor: badgeStyle.bg,
              color: badgeStyle.text,
              border: `1px solid ${badgeStyle.border}`
            }}
          >
            {workflow.statusLabel}
          </span>
        </div>
      </div>

      {/* 2. Corpo do Card: Etapa Atual e Stepper */}
      <div style={{ marginTop: '1rem' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '0.5rem',
            flexWrap: 'wrap',
            gap: '0.5rem'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ fontSize: '0.82rem', color: '#475569' }}>Etapa atual:</span>
            <strong style={{ fontSize: '0.85rem', color: '#0f172a' }}>{workflow.etapaAtual}</strong>
          </div>
          <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600 }}>
            {workflow.progresso.concluidas} de {workflow.progresso.total} macroetapas (
            {workflow.progresso.percentual}%)
          </span>
        </div>

        {/* Barra de Progresso visual discreta */}
        <div
          style={{
            width: '100%',
            height: '6px',
            backgroundColor: '#f1f5f9',
            borderRadius: '999px',
            overflow: 'hidden',
            marginBottom: '1rem'
          }}
        >
          <div
            style={{
              width: `${workflow.progresso.percentual}%`,
              height: '100%',
              backgroundColor: workflow.isCompleted ? '#10b981' : '#2563eb',
              borderRadius: '999px',
              transition: 'width 0.3s ease'
            }}
          />
        </div>

        {/* Stepper de Macroetapas */}
        <ContractWorkflowStepper macroetapas={workflow.macroetapas} />

        {/* Metadados Operacionais (Responsável, SEI, Prazos) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '0.75rem',
            marginTop: '1.25rem',
            padding: '0.75rem 1rem',
            backgroundColor: '#f8fafc',
            borderRadius: '8px',
            border: '1px solid #edf2f7'
          }}
        >
          {workflow.responsavelNome && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <User size={14} color="#64748b" />
              <span style={{ fontSize: '0.78rem', color: '#475569' }}>Responsável:</span>
              <strong style={{ fontSize: '0.78rem', color: '#1e293b' }}>
                {workflow.responsavelNome}
              </strong>
            </div>
          )}

          {workflow.processoSeiNumero && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <FileText size={14} color="#64748b" />
              <span style={{ fontSize: '0.78rem', color: '#475569' }}>Processo SEI:</span>
              <strong style={{ fontSize: '0.78rem', color: '#1e293b', fontFamily: 'monospace' }}>
                {workflow.processoSeiNumero}
              </strong>
            </div>
          )}

          {workflow.prazoLimite && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Calendar size={14} color="#64748b" />
              <span style={{ fontSize: '0.78rem', color: '#475569' }}>Prazo limite:</span>
              <strong style={{ fontSize: '0.78rem', color: '#1e293b' }}>
                {workflow.prazoLimite}
              </strong>
            </div>
          )}

          {workflow.proximaAcao && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', gridColumn: '1 / -1' }}>
              <Clock size={14} color="#2563eb" />
              <span style={{ fontSize: '0.78rem', color: '#1e40af' }}>Próxima ação:</span>
              <span style={{ fontSize: '0.78rem', color: '#1e293b', fontWeight: 600 }}>
                {workflow.proximaAcao}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* 3. Rodapé: Próxima Tarefa Operacional Vinculada */}
      {workflow.proximaTarefa && (
        <div
          style={{
            marginTop: '1rem',
            padding: '0.75rem 1rem',
            backgroundColor: '#f0fdf4',
            borderRadius: '8px',
            border: '1px solid #bbf7d0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '0.5rem'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <ArrowRight size={16} color="#15803d" />
            <div>
              <span
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  color: '#166534',
                  letterSpacing: '0.04em'
                }}
              >
                Próxima Tarefa do Plano
              </span>
              <p
                style={{
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  color: '#14532d',
                  margin: '0.1rem 0 0 0'
                }}
              >
                {workflow.proximaTarefa.nome}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {workflow.proximaTarefa.responsavelNome && (
              <span style={{ fontSize: '0.75rem', color: '#166534' }}>
                Resp: <strong>{workflow.proximaTarefa.responsavelNome}</strong>
              </span>
            )}
            {workflow.proximaTarefa.prazo && (
              <span
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  padding: '0.15rem 0.5rem',
                  borderRadius: '4px',
                  backgroundColor: '#ffffff',
                  color:
                    workflow.proximaTarefa.atencaoNivel === 'VENCIDA'
                      ? '#b91c1c'
                      : workflow.proximaTarefa.atencaoNivel === 'URGENTE'
                      ? '#c2410c'
                      : '#15803d',
                  border: '1px solid #86efac'
                }}
              >
                Prazo: {workflow.proximaTarefa.prazo}
              </span>
            )}
          </div>
        </div>
      )}
    </article>
  );
};
