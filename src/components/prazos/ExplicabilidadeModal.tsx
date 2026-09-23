import React from 'react';
import { X, HelpCircle, Database, Scale, Clock, CheckCircle2, AlertTriangle, AlertCircle } from 'lucide-react';
import type { CentralPrazosItem } from '../../types/centralPrazos';
import { formatDateBR } from '../../services/temporalEngineService';

interface ExplicabilidadeModalProps {
  item: CentralPrazosItem | null;
  onClose: () => void;
}

export const ExplicabilidadeModal: React.FC<ExplicabilidadeModalProps> = ({ item, onClose }) => {
  if (!item) return null;

  const { explicabilidade } = item;

  const getTipoBadge = (tipo: string) => {
    switch (tipo) {
      case 'LEGAL':
        return { bg: '#dcfce7', text: '#15803d', label: 'Fundamento Legal (Lei / Norma)' };
      case 'CONTRATUAL':
        return { bg: '#e0f2fe', text: '#0369a1', label: 'Cláusula Contratual' };
      case 'EDITAL':
        return { bg: '#fef3c7', text: '#b45309', label: 'Editalício' };
      case 'OPERACIONAL':
        return { bg: '#f1f5f9', text: '#475569', label: 'Regra Operacional Prática' };
      default:
        return { bg: '#f3e8ff', text: '#7e22ce', label: 'Regra Interna / Planejamento' };
    }
  };

  const tipoBadge = getTipoBadge(item.regraTipo);

  const getAtencaoBadge = (nivel: string) => {
    switch (nivel) {
      case 'CRITICO':
        return { bg: '#fee2e2', text: '#991b1b', label: 'Crítico', icon: AlertTriangle };
      case 'ATENCAO':
        return { bg: '#fef3c7', text: '#92400e', label: 'Atenção', icon: AlertCircle };
      default:
        return { bg: '#f0fdf4', text: '#166534', label: 'Normal / Planejado', icon: CheckCircle2 };
    }
  };

  const atencaoBadge = getAtencaoBadge(item.nivelAtencao);
  const AtencaoIcon = atencaoBadge.icon;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(15, 23, 42, 0.65)',
      backdropFilter: 'blur(3px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '1.5rem'
    }}>
      <div style={{
        background: '#ffffff',
        borderRadius: '12px',
        width: '100%',
        maxWidth: '680px',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
        border: '1px solid #e2e8f0',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        maxHeight: '90vh'
      }}>
        {/* Header */}
        <div style={{
          background: 'linear-gradient(135deg, #0c326f 0%, #1e40af 100%)',
          color: '#ffffff',
          padding: '1.25rem 1.75rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{
              background: 'rgba(255, 255, 255, 0.15)',
              borderRadius: '8px',
              padding: '0.5rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <HelpCircle size={22} color="#ffffff" />
            </div>
            <div>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0, letterSpacing: '-0.01em' }}>
                Ficha de Explicabilidade Transparente
              </h2>
              <p style={{ fontSize: '0.78rem', margin: '0.2rem 0 0 0', opacity: 0.9 }}>
                Rastreabilidade e memória de cálculo do prazo temporal
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'rgba(255, 255, 255, 0.1)',
              border: 'none',
              borderRadius: '6px',
              color: '#ffffff',
              cursor: 'pointer',
              padding: '0.4rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 0.2s'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div style={{ padding: '1.5rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          
          {/* Identificação do Objeto */}
          <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                  {item.entidadeOrigem === 'CONTRATO' ? 'Contrato Administrativo' : 'Ata de Registro de Preços'}
                </span>
                <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>
                  {item.identificadorFormatado}
                </div>
              </div>
              <span style={{
                background: tipoBadge.bg,
                color: tipoBadge.text,
                fontSize: '0.75rem',
                fontWeight: 700,
                padding: '0.25rem 0.6rem',
                borderRadius: '999px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem'
              }}>
                <Scale size={13} /> {tipoBadge.label}
              </span>
            </div>
            {item.objetoResumido && (
              <p style={{ fontSize: '0.82rem', color: '#475569', margin: '0.5rem 0 0 0', lineHeight: 1.4 }}>
                {item.objetoResumido}
              </p>
            )}
            {item.fornecedorNome && (
              <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '0.35rem' }}>
                <strong>Fornecedor:</strong> {item.fornecedorNome} {item.fornecedorCnpj ? `(${item.fornecedorCnpj})` : ''}
              </div>
            )}
          </div>

          {/* Memória de Cálculo Temporal */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <h3 style={{ fontSize: '0.88rem', fontWeight: 700, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Clock size={16} color="#0c326f" /> Memória de Cálculo e Rastreabilidade
            </h3>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '0.75rem'
            }}>
              {/* Data Base */}
              <div style={{ background: '#f8fafc', padding: '0.75rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>1. Data-Base Oficial</span>
                <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0f172a', marginTop: '0.2rem' }}>
                  {formatDateBR(item.dataBase)}
                </div>
                <span style={{ fontSize: '0.68rem', color: '#475569', display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.2rem' }}>
                  <Database size={11} /> {item.fonteDataBase}
                </span>
              </div>

              {/* Regra Aplicada */}
              <div style={{ background: '#f8fafc', padding: '0.75rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>2. Regra / Antecedência</span>
                <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0f172a', marginTop: '0.2rem' }}>
                  {explicabilidade.offsetDias !== 0 ? `${explicabilidade.offsetDias} dias` : 'No dia do marco'}
                </div>
                <span style={{ fontSize: '0.68rem', color: '#475569', marginTop: '0.2rem', display: 'block' }}>
                  {explicabilidade.unidadeContagem === 'DIAS_UTEIS' ? 'Dias Úteis (feriados nacionais)' : 'Dias Corridos'}
                </span>
              </div>

              {/* Data Alvo Calculada */}
              <div style={{ background: '#eff6ff', padding: '0.75rem', borderRadius: '8px', border: '1px solid #bfdbfe' }}>
                <span style={{ fontSize: '0.72rem', color: '#1e40af', fontWeight: 700 }}>3. Data-Alvo / Deadline</span>
                <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#1e3a8a', marginTop: '0.2rem' }}>
                  {formatDateBR(item.dataAlvo)}
                </div>
                <span style={{ fontSize: '0.68rem', color: '#1e40af', marginTop: '0.2rem', display: 'block' }}>
                  Fuso America/Sao_Paulo
                </span>
              </div>
            </div>
          </div>

          {/* Status & Dias Restantes */}
          <div style={{
            background: atencaoBadge.bg,
            border: `1px solid ${atencaoBadge.text}33`,
            borderRadius: '8px',
            padding: '1rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
              <AtencaoIcon size={22} color={atencaoBadge.text} />
              <div>
                <div style={{ fontSize: '0.85rem', fontWeight: 800, color: atencaoBadge.text }}>
                  Nível de Atenção: {atencaoBadge.label}
                </div>
                <div style={{ fontSize: '0.78rem', color: atencaoBadge.text, opacity: 0.9 }}>
                  Estado temporal: <strong>{item.estadoTemporal}</strong>
                </div>
              </div>
            </div>

            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: atencaoBadge.text, textTransform: 'uppercase' }}>
                {item.diasRestantes < 0 ? 'Tempo Vencido' : item.diasRestantes === 0 ? 'Vence Hoje' : 'Prazo Restante'}
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 900, color: atencaoBadge.text }}>
                {item.diasRestantes < 0
                  ? `${Math.abs(item.diasRestantes)} dias atrasado`
                  : item.diasRestantes === 0
                  ? 'Hoje'
                  : `${item.diasRestantes} dias`}
              </div>
            </div>
          </div>

          {/* Racional e Descrição da Ação */}
          <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>
              Ação Requerida & Racional Operacional
            </span>
            <p style={{ fontSize: '0.85rem', color: '#1e293b', margin: '0.35rem 0 0 0', fontWeight: 600 }}>
              {item.acaoDescricao}
            </p>
            <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0.35rem 0 0 0', lineHeight: 1.4 }}>
              {explicabilidade.descricaoRegra}
            </p>
            {item.responsavelNome && (
              <div style={{ marginTop: '0.75rem', paddingTop: '0.5rem', borderTop: '1px solid #e2e8f0', fontSize: '0.78rem', color: '#475569' }}>
                <strong>Responsável Atribuído:</strong> {item.responsavelNome} {item.isGestorContrato ? '(Gestor Formal do Contrato)' : ''}
              </div>
            )}
          </div>

        </div>

        {/* Modal Footer */}
        <div style={{
          background: '#f8fafc',
          borderTop: '1px solid #e2e8f0',
          padding: '0.85rem 1.5rem',
          display: 'flex',
          justifyContent: 'flex-end'
        }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: '#0c326f',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              padding: '0.5rem 1.25rem',
              fontWeight: 700,
              fontSize: '0.82rem',
              cursor: 'pointer'
            }}
          >
            Fechar
          </button>
        </div>

      </div>
    </div>
  );
};
