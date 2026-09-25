/**
 * SaldoARP 3.0 — Design Tokens
 * 
 * Camada centralizada de design tokens para garantir consistência visual,
 * contraste WCAG 2.1 AA, responsividade e separação semântica de domínios.
 */

export const colors = {
  // Fundos e Superfícies
  background: {
    base: '#f8fafc',
    surface: '#ffffff',
    subtle: '#f1f5f9',
    muted: '#e2e8f0',
    overlay: 'rgba(15, 23, 42, 0.6)'
  },

  // Textos
  text: {
    primary: '#0f172a',
    secondary: '#475569',
    muted: '#64748b',
    subtle: '#94a3b8',
    inverse: '#ffffff'
  },

  // Bordas e Divisores
  border: {
    subtle: '#f1f5f9',
    default: '#e2e8f0',
    strong: '#cbd5e1',
    interactive: '#94a3b8',
    focus: '#0284c7'
  },

  // Cores de Marca / Ação Principal
  brand: {
    primary: '#0284c7', // Sky-600
    primaryHover: '#0369a1',
    primaryLight: '#e0f2fe',
    primaryDark: '#075985',
    secondary: '#6366f1', // Indigo-500
    secondaryLight: '#ede9fe',
    secondaryDark: '#4338ca'
  },

  // Semântica de Feedback e Severidade (Contraste AA testado)
  semantic: {
    success: {
      bg: '#f0fdf4',
      border: '#bbf7d0',
      text: '#15803d',
      solid: '#16a34a'
    },
    warning: {
      bg: '#fffbeb',
      border: '#fde68a',
      text: '#b45309',
      solid: '#f59e0b'
    },
    danger: {
      bg: '#fef2f2',
      border: '#fecaca',
      text: '#b91c1c',
      solid: '#ef4444'
    },
    info: {
      bg: '#eff6ff',
      border: '#bfdbfe',
      text: '#1d4ed8',
      solid: '#3b82f6'
    },
    neutral: {
      bg: '#f8fafc',
      border: '#e2e8f0',
      text: '#475569',
      solid: '#64748b'
    },
    purple: {
      bg: '#faf5ff',
      border: '#e9d5ff',
      text: '#7e22ce',
      solid: '#a855f7'
    }
  }
} as const;

// Severidades do Funil Único de Atenção
export type SeverityLevel = 'CRITICA' | 'URGENTE' | 'ATENCAO' | 'INFO';

export const severityTokens: Record<SeverityLevel, {
  label: string;
  badgeBg: string;
  badgeBorder: string;
  badgeText: string;
  borderLeft: string;
  iconColor: string;
}> = {
  CRITICA: {
    label: 'CRÍTICA',
    badgeBg: '#fef2f2',
    badgeBorder: '#fecaca',
    badgeText: '#b91c1c',
    borderLeft: '#ef4444',
    iconColor: '#dc2626'
  },
  URGENTE: {
    label: 'URGENTE',
    badgeBg: '#fffbeb',
    badgeBorder: '#fde68a',
    badgeText: '#b45309',
    borderLeft: '#f59e0b',
    iconColor: '#d97706'
  },
  ATENCAO: {
    label: 'ATENÇÃO',
    badgeBg: '#eff6ff',
    badgeBorder: '#bfdbfe',
    badgeText: '#1d4ed8',
    borderLeft: '#3b82f6',
    iconColor: '#2563eb'
  },
  INFO: {
    label: 'INFO',
    badgeBg: '#f8fafc',
    badgeBorder: '#e2e8f0',
    badgeText: '#475569',
    borderLeft: '#94a3b8',
    iconColor: '#64748b'
  }
};

// Semântica Operacional do SaldoARP (Fases 1–9)
export type OperationalCategory =
  | 'FATO_OFICIAL'
  | 'ALERTA'
  | 'TAREFA'
  | 'WORKFLOW'
  | 'ACAO'
  | 'CONFIRMACAO';

export const operationalCategoryTokens: Record<OperationalCategory, {
  label: string;
  bg: string;
  border: string;
  text: string;
  description: string;
}> = {
  FATO_OFICIAL: {
    label: 'Fato Oficial',
    bg: '#f8fafc',
    border: '#cbd5e1',
    text: '#0f172a',
    description: 'Informação canônica soberana proveniente de base oficial'
  },
  ALERTA: {
    label: 'Alerta Operacional',
    bg: '#fffbeb',
    border: '#fde68a',
    text: '#b45309',
    description: 'Situação de risco ou temporalidade projetada que demanda atenção'
  },
  TAREFA: {
    label: 'Tarefa Humana',
    bg: '#eff6ff',
    border: '#bfdbfe',
    text: '#1d4ed8',
    description: 'Obrigação persistida com responsável e prazo determinado'
  },
  WORKFLOW: {
    label: 'Fluxo Processual',
    bg: '#faf5ff',
    border: '#e9d5ff',
    text: '#7e22ce',
    description: 'Sequência regulatória de etapas e governança'
  },
  ACAO: {
    label: 'Ação Disponível',
    bg: '#ecfeff',
    border: '#a5f3fc',
    text: '#0e7490',
    description: 'Comando operacional ou administrativo executável'
  },
  CONFIRMACAO: {
    label: 'Confirmação',
    bg: '#f0fdf4',
    border: '#bbf7d0',
    text: '#15803d',
    description: 'Registro de validação ou efetivação operacional confirmada'
  }
};

// Escala de Espaçamento Consistente (4px base)
export const spacing = {
  none: '0',
  xxs: '0.125rem', // 2px
  xs: '0.25rem',   // 4px
  sm: '0.5rem',    // 8px
  md: '0.75rem',   // 12px
  lg: '1rem',      // 16px
  xl: '1.25rem',   // 20px
  '2xl': '1.5rem', // 24px
  '3xl': '2rem',   // 32px
  '4xl': '2.5rem', // 40px
  '5xl': '3rem'    // 48px
} as const;

// Escala Tipográfica
export const typography = {
  fontFamily: {
    sans: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    mono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
  },
  fontSize: {
    display: '1.875rem', // 30px
    kpi: '1.625rem',     // 26px
    h1: '1.5rem',        // 24px
    h2: '1.25rem',       // 20px
    h3: '1.125rem',      // 18px
    h4: '1rem',          // 16px
    body: '0.875rem',    // 14px
    bodySm: '0.8125rem', // 13px
    label: '0.75rem',    // 12px
    caption: '0.6875rem' // 11px
  },
  fontWeight: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
    extrabold: 800
  },
  lineHeight: {
    none: 1,
    tight: 1.25,
    snug: 1.375,
    normal: 1.5,
    relaxed: 1.625
  }
} as const;

// Bordas, Sombras e Raios
export const shapes = {
  radius: {
    none: '0',
    sm: '4px',
    md: '6px',
    lg: '8px',
    xl: '10px',
    '2xl': '12px',
    full: '9999px'
  },
  shadow: {
    none: 'none',
    sm: '0 1px 2px rgba(0, 0, 0, 0.04)',
    md: '0 2px 4px rgba(0, 0, 0, 0.06)',
    lg: '0 4px 6px -1px rgba(0, 0, 0, 0.08), 0 2px 4px -1px rgba(0, 0, 0, 0.04)',
    focus: '0 0 0 3px rgba(2, 132, 199, 0.25)'
  },
  transition: {
    fast: 'all 0.15s ease-in-out',
    normal: 'all 0.2s ease-in-out',
    slow: 'all 0.3s ease-in-out'
  }
} as const;
