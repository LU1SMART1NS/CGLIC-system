import React from 'react';
import { 
  FileText, 
  Package, 
  HelpCircle, 
  CheckCircle2, 
  Clock, 
  User 
} from 'lucide-react';
import type { CentralPrazosItem } from '../../types/centralPrazos';
import { formatDateBR } from '../../services/temporalEngineService';

interface CentralPrazosTableProps {
  items: CentralPrazosItem[];
  isLoading: boolean;
  onOpenExplicabilidade: (item: CentralPrazosItem) => void;
}

export const CentralPrazosTable: React.FC<CentralPrazosTableProps> = ({
  items,
  isLoading,
  onOpenExplicabilidade
}) => {
  if (isLoading) {
    return (
      <div style={{
        background: '#ffffff',
        borderRadius: '10px',
        border: '1px solid #e2e8f0',
        padding: '3rem',
        textAlign: 'center',
        color: '#64748b'
      }}>
        <Clock size={32} className="spin-animation" style={{ margin: '0 auto 1rem auto', color: '#0c326f' }} />
        <p style={{ fontWeight: 600, fontSize: '0.9rem' }}>Carregando prazos, contratos, ARPs e tarefas...</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div style={{
        background: '#ffffff',
        borderRadius: '10px',
        border: '1px solid #e2e8f0',
        padding: '3rem 2rem',
        textAlign: 'center',
        color: '#64748b'
      }}>
        <CheckCircle2 size={40} color="#16a34a" style={{ margin: '0 auto 1rem auto' }} />
        <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a', margin: '0 0 0.5rem 0' }}>
          Nenhuma obrigação ou prazo encontrado
        </h3>
        <p style={{ fontSize: '0.85rem', color: '#64748b', maxWidth: '500px', margin: '0 auto' }}>
          Não há itens correspondentes aos filtros selecionados. Altere os critérios ou selecione outra aba de visão temporal.
        </p>
      </div>
    );
  }

  const getTipoItemBadge = (tipo: string) => {
    if (tipo === 'TAREFA_HUMANA') {
      return {
        bg: '#eff6ff',
        text: '#1e40af',
        border: '#bfdbfe',
        label: 'Tarefa Humana'
      };
    }
    return {
      bg: '#f8fafc',
      text: '#475569',
      border: '#cbd5e1',
      label: 'Gatilho Operacional'
    };
  };

  const getDiasRestantesBadge = (dias: number, estado: string) => {
    if (estado === 'CONCLUIDO') {
      return { bg: '#dcfce7', text: '#15803d', label: 'Concluído' };
    }
    if (dias < 0) {
      return { bg: '#fee2e2', text: '#991b1b', label: `${Math.abs(dias)}d atrasado` };
    }
    if (dias === 0) {
      return { bg: '#ffedd5', text: '#c2410c', label: 'Vence Hoje' };
    }
    if (dias <= 7) {
      return { bg: '#fef3c7', text: '#b45309', label: `${dias} dias` };
    }
    if (dias <= 30) {
      return { bg: '#e0f2fe', text: '#0369a1', label: `${dias} dias` };
    }
    return { bg: '#f1f5f9', text: '#475569', label: `${dias} dias` };
  };

  return (
    <div style={{
      background: '#ffffff',
      borderRadius: '10px',
      border: '1px solid #e2e8f0',
      overflow: 'hidden',
      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)'
    }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: '0.82rem',
          textAlign: 'left'
        }}>
          <thead>
            <tr style={{
              background: '#f8fafc',
              borderBottom: '2px solid #e2e8f0',
              color: '#475569',
              fontWeight: 700,
              fontSize: '0.75rem',
              textTransform: 'uppercase',
              letterSpacing: '0.03em'
            }}>
              <th style={{ padding: '0.85rem 1rem' }}>Tipo</th>
              <th style={{ padding: '0.85rem 1rem' }}>Identificador & Objeto</th>
              <th style={{ padding: '0.85rem 1rem' }}>Marco / Ação Requerida</th>
              <th style={{ padding: '0.85rem 1rem' }}>Regra & Fundamento</th>
              <th style={{ padding: '0.85rem 1rem' }}>Data-Alvo & Prazo</th>
              <th style={{ padding: '0.85rem 1rem' }}>Responsável</th>
              <th style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>Explicabilidade</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => {
              const tipoBadge = getTipoItemBadge(item.tipoItem);
              const prazoBadge = getDiasRestantesBadge(item.diasRestantes, item.estadoTemporal);

              return (
                <tr
                  key={item.id || idx}
                  style={{
                    borderBottom: '1px solid #f1f5f9',
                    backgroundColor: idx % 2 === 0 ? '#ffffff' : '#fafafa',
                    transition: 'background-color 0.15s'
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#f1f5f9'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = idx % 2 === 0 ? '#ffffff' : '#fafafa'; }}
                >
                  {/* Tipo de Item */}
                  <td style={{ padding: '0.85rem 1rem', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                    <span style={{
                      background: tipoBadge.bg,
                      color: tipoBadge.text,
                      border: `1px solid ${tipoBadge.border}`,
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      padding: '0.2rem 0.5rem',
                      borderRadius: '4px',
                      display: 'inline-block'
                    }}>
                      {tipoBadge.label}
                    </span>
                    {item.tarefaStatus && (
                      <div style={{ fontSize: '0.68rem', color: '#64748b', marginTop: '0.25rem', fontWeight: 600 }}>
                        Status: {item.tarefaStatus}
                      </div>
                    )}
                  </td>

                  {/* Identificador & Objeto */}
                  <td style={{ padding: '0.85rem 1rem', verticalAlign: 'top', minWidth: '220px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      {item.entidadeOrigem === 'CONTRATO' ? (
                        <FileText size={15} color="#0c326f" />
                      ) : (
                        <Package size={15} color="#059669" />
                      )}
                      <strong style={{ color: '#0f172a', fontSize: '0.88rem' }}>
                        {item.identificadorFormatado}
                      </strong>
                    </div>
                    {item.fornecedorNome && (
                      <div style={{ fontSize: '0.74rem', color: '#475569', marginTop: '0.15rem', fontWeight: 500 }}>
                        {item.fornecedorNome}
                      </div>
                    )}
                    {item.objetoResumido && (
                      <div style={{
                        fontSize: '0.72rem',
                        color: '#64748b',
                        marginTop: '0.25rem',
                        lineHeight: 1.3,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden'
                      }}>
                        {item.objetoResumido}
                      </div>
                    )}
                  </td>

                  {/* Marco / Ação Requerida */}
                  <td style={{ padding: '0.85rem 1rem', verticalAlign: 'top', minWidth: '200px' }}>
                    <div style={{ fontWeight: 700, color: '#1e293b' }}>
                      {item.marcoEvento}
                    </div>
                    <div style={{ fontSize: '0.76rem', color: '#475569', marginTop: '0.2rem' }}>
                      {item.acaoDescricao}
                    </div>
                  </td>

                  {/* Regra & Fundamento */}
                  <td style={{ padding: '0.85rem 1rem', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                    <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#334155' }}>
                      {item.regraNome}
                    </div>
                    <span style={{
                      fontSize: '0.68rem',
                      fontWeight: 700,
                      color: item.regraTipo === 'LEGAL' ? '#15803d' : item.regraTipo === 'CONTRATUAL' ? '#0369a1' : '#64748b',
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      padding: '0.1rem 0.35rem',
                      borderRadius: '4px',
                      display: 'inline-block',
                      marginTop: '0.2rem'
                    }}>
                      {item.regraTipo}
                    </span>
                  </td>

                  {/* Data-Alvo & Prazo */}
                  <td style={{ padding: '0.85rem 1rem', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                    <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.88rem' }}>
                      {formatDateBR(item.dataAlvo)}
                    </div>
                    <div style={{ marginTop: '0.25rem' }}>
                      <span style={{
                        background: prazoBadge.bg,
                        color: prazoBadge.text,
                        fontWeight: 800,
                        fontSize: '0.72rem',
                        padding: '0.2rem 0.5rem',
                        borderRadius: '999px',
                        display: 'inline-block'
                      }}>
                        {prazoBadge.label}
                      </span>
                    </div>
                  </td>

                  {/* Responsável */}
                  <td style={{ padding: '0.85rem 1rem', verticalAlign: 'top', minWidth: '140px' }}>
                    {item.responsavelNome ? (
                      <div>
                        <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                          <User size={13} color="#64748b" /> {item.responsavelNome}
                        </div>
                        {item.isGestorContrato && (
                          <span style={{ fontSize: '0.65rem', color: '#0c326f', fontWeight: 700 }}>
                            Gestor do Contrato
                          </span>
                        )}
                      </div>
                    ) : (
                      <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontStyle: 'italic' }}>
                        Não atribuído
                      </span>
                    )}
                  </td>

                  {/* Explicabilidade */}
                  <td style={{ padding: '0.85rem 1rem', verticalAlign: 'middle', textAlign: 'center' }}>
                    <button
                      type="button"
                      onClick={() => onOpenExplicabilidade(item)}
                      title="Ver memória de cálculo e regras oficiais do prazo"
                      style={{
                        background: '#eff6ff',
                        color: '#0c326f',
                        border: '1px solid #bfdbfe',
                        borderRadius: '6px',
                        padding: '0.4rem 0.65rem',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.3rem',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <HelpCircle size={14} /> Explicar
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
