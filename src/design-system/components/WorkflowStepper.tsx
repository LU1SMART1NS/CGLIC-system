import React from 'react';
import { Check, AlertCircle, Clock } from 'lucide-react';
import { colors, shapes, typography, spacing } from '../tokens';

export type StepState = 'COMPLETED' | 'CURRENT' | 'PENDING' | 'BLOCKED';

export interface WorkflowStep {
  id: string;
  title: string;
  subtitle?: string;
  state: StepState;
  date?: string;
}

export interface WorkflowStepperProps {
  steps: WorkflowStep[];
  orientation?: 'horizontal' | 'vertical';
  testId?: string;
  className?: string;
}

export const WorkflowStepper: React.FC<WorkflowStepperProps> = ({
  steps,
  orientation = 'horizontal',
  testId = 'workflow-stepper',
  className = ''
}) => {
  const isHorizontal = orientation === 'horizontal';

  return (
    <div
      data-testid={testId}
      className={`workflow-stepper ${className}`.trim()}
      style={{
        display: 'flex',
        flexDirection: isHorizontal ? 'row' : 'column',
        alignItems: isHorizontal ? 'flex-start' : 'stretch',
        justifyContent: isHorizontal ? 'space-between' : 'flex-start',
        gap: spacing.md,
        width: '100%',
        overflowX: isHorizontal ? 'auto' : 'visible',
        padding: spacing.xs
      }}
    >
      {steps.map((step, idx) => {
        const isCompleted = step.state === 'COMPLETED';
        const isCurrent = step.state === 'CURRENT';
        const isBlocked = step.state === 'BLOCKED';
        const isPending = step.state === 'PENDING';

        const getStepColors = () => {
          if (isCompleted) {
            return {
              circleBg: colors.semantic.success.solid,
              circleColor: colors.text.inverse,
              borderColor: colors.semantic.success.solid,
              titleColor: colors.text.primary
            };
          }
          if (isCurrent) {
            return {
              circleBg: colors.brand.primaryLight,
              circleColor: colors.brand.primary,
              borderColor: colors.brand.primary,
              titleColor: colors.brand.primaryDark
            };
          }
          if (isBlocked) {
            return {
              circleBg: colors.semantic.danger.bg,
              circleColor: colors.semantic.danger.text,
              borderColor: colors.semantic.danger.solid,
              titleColor: colors.semantic.danger.text
            };
          }
          return {
            circleBg: colors.background.muted,
            circleColor: colors.text.muted,
            borderColor: colors.border.strong,
            titleColor: colors.text.muted
          };
        };

        const sc = getStepColors();

        return (
          <div
            key={step.id || idx}
            data-testid={`${testId}-step-${step.id || idx}`}
            style={{
              display: 'flex',
              flexDirection: isHorizontal ? 'column' : 'row',
              alignItems: isHorizontal ? 'center' : 'flex-start',
              textAlign: isHorizontal ? 'center' : 'left',
              gap: spacing.sm,
              flex: isHorizontal ? '1 1 0' : 'none',
              minWidth: isHorizontal ? '120px' : 'auto',
              position: 'relative'
            }}
          >
            {/* Step Icon / Circle */}
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                background: sc.circleBg,
                color: sc.circleColor,
                border: `2px solid ${sc.borderColor}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: typography.fontWeight.extrabold,
                fontSize: typography.fontSize.label,
                zIndex: 2,
                boxShadow: isCurrent ? shapes.shadow.focus : 'none'
              }}
              aria-hidden="true"
            >
              {isCompleted && <Check size={16} />}
              {isBlocked && <AlertCircle size={16} />}
              {isCurrent && <Clock size={16} />}
              {isPending && <span>{idx + 1}</span>}
            </div>

            {/* Labels */}
            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontSize: typography.fontSize.bodySm,
                  fontWeight: isCurrent ? typography.fontWeight.bold : typography.fontWeight.semibold,
                  color: sc.titleColor
                }}
              >
                {step.title}
              </div>

              {step.subtitle && (
                <div style={{ fontSize: typography.fontSize.caption, color: colors.text.muted, marginTop: spacing.xxs }}>
                  {step.subtitle}
                </div>
              )}

              {step.date && (
                <div style={{ fontSize: typography.fontSize.caption, color: colors.text.subtle, marginTop: spacing.xxs }}>
                  {step.date}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
