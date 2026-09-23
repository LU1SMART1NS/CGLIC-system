import React from 'react';
import { Check, Clock, CircleDot } from 'lucide-react';
import type { WorkflowMacrostepItem } from '../../hooks/useContractWorkflows';

interface ContractWorkflowStepperProps {
  macroetapas: WorkflowMacrostepItem[];
}

export const ContractWorkflowStepper: React.FC<ContractWorkflowStepperProps> = ({ macroetapas }) => {
  if (!macroetapas || macroetapas.length === 0) {
    return null;
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        position: 'relative',
        width: '100%',
        margin: '1.25rem 0 0.5rem 0',
        padding: '0 0.5rem'
      }}
      aria-label="Progresso das macroetapas do workflow"
    >
      {macroetapas.map((step, idx) => {
        const isCompleted = step.status === 'CONCLUIDA';
        const isCurrent = step.status === 'ATUAL';
        const isLast = idx === macroetapas.length - 1;

        // Estilos dos marcadores
        let circleBg = '#e2e8f0';
        let circleBorder = '#cbd5e1';
        let iconColor = '#64748b';
        let textColor = '#64748b';
        let fontWeight = 500;

        if (isCompleted) {
          circleBg = '#ecfdf5';
          circleBorder = '#10b981';
          iconColor = '#059669';
          textColor = '#065f46';
          fontWeight = 600;
        } else if (isCurrent) {
          circleBg = '#eff6ff';
          circleBorder = '#2563eb';
          iconColor = '#1d4ed8';
          textColor = '#1e40af';
          fontWeight = 700;
        }

        return (
          <div
            key={step.id || idx}
            style={{
              flex: 1,
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center'
            }}
          >
            {/* Linha conectora entre os círculos */}
            {!isLast && (
              <div
                style={{
                  position: 'absolute',
                  top: '14px',
                  left: '50%',
                  width: '100%',
                  height: '2px',
                  backgroundColor: isCompleted ? '#10b981' : '#e2e8f0',
                  zIndex: 0,
                  transition: 'background-color 0.2s ease'
                }}
              />
            )}

            {/* Círculo do Step */}
            <div
              style={{
                width: '30px',
                height: '30px',
                borderRadius: '50%',
                backgroundColor: circleBg,
                border: `2px solid ${circleBorder}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1,
                boxShadow: isCurrent ? '0 0 0 4px rgba(37, 99, 235, 0.15)' : 'none',
                transition: 'all 0.2s ease'
              }}
              title={`${step.label} (${step.status})`}
            >
              {isCompleted ? (
                <Check size={16} color={iconColor} strokeWidth={2.5} />
              ) : isCurrent ? (
                <CircleDot size={16} color={iconColor} strokeWidth={2.5} />
              ) : (
                <Clock size={14} color={iconColor} strokeWidth={2} />
              )}
            </div>

            {/* Texto do Step */}
            <div style={{ marginTop: '0.5rem', padding: '0 0.25rem' }}>
              <span
                style={{
                  fontSize: '0.78rem',
                  color: textColor,
                  fontWeight,
                  lineHeight: 1.25,
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden'
                }}
              >
                {step.label}
              </span>
              {isCurrent && (
                <div style={{ marginTop: '0.2rem' }}>
                  <span
                    style={{
                      display: 'inline-block',
                      fontSize: '0.68rem',
                      fontWeight: 700,
                      color: '#1d4ed8',
                      backgroundColor: '#dbeafe',
                      padding: '0.1rem 0.4rem',
                      borderRadius: '4px'
                    }}
                  >
                    Em andamento
                  </span>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
