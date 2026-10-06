/**
 * CGLIC 3.0 — Design Tokens
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
    focus: 'var(--color-focus)'
  },

  // Cores de Marca / Ação Principal
  brand: {
    primary: 'var(--primary)',
    primaryHover: 'var(--primary-hover)',
    primaryLight: 'var(--primary-light)',
    primaryDark: 'var(--primary-hover)',
    secondary: '#6366f1', // Indigo-500
    secondaryLight: '#ede9fe',
    secondaryDark: '#4338ca'
  },

  // Semântica de Feedback e Severidade (Contraste AA testado)
  semantic: {
    success: {
      bg: 'var(--color-success-bg)',
      border: 'var(--color-success-border)',
      text: 'var(--color-success-text)',
      solid: 'var(--color-success-solid)'
    },
    warning: {
      bg: 'var(--color-warning-bg)',
      border: 'var(--color-warning-border)',
      text: 'var(--color-warning-text)',
      solid: 'var(--color-warning-solid)'
    },
    danger: {
      bg: 'var(--color-danger-bg)',
      border: 'var(--color-danger-border)',
      text: 'var(--color-danger-text)',
      solid: 'var(--color-danger-solid)'
    },
    info: {
      bg: 'var(--color-info-bg)',
      border: 'var(--color-info-border)',
      text: 'var(--color-info-text)',
      solid: 'var(--color-info-solid)'
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
    badgeBg: 'var(--color-danger-bg)',
    badgeBorder: 'var(--color-danger-border)',
    badgeText: 'var(--color-danger-text)',
    borderLeft: 'var(--color-danger-solid)',
    iconColor: 'var(--color-danger)'
  },
  URGENTE: {
    label: 'URGENTE',
    badgeBg: 'var(--color-warning-bg)',
    badgeBorder: 'var(--color-warning-border)',
    badgeText: 'var(--color-warning-text)',
    borderLeft: 'var(--color-warning-solid)',
    iconColor: 'var(--color-warning)'
  },
  ATENCAO: {
    label: 'ATENÇÃO',
    badgeBg: 'var(--color-info-bg)',
    badgeBorder: 'var(--color-info-border)',
    badgeText: 'var(--color-info-text)',
    borderLeft: 'var(--color-info-solid)',
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

// Semântica Operacional do CGLIC (Fases 1–9)
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
    bg: 'var(--color-warning-bg)',
    border: 'var(--color-warning-border)',
    text: 'var(--color-warning-text)',
    description: 'Situação de risco ou temporalidade projetada que demanda atenção'
  },
  TAREFA: {
    label: 'Tarefa Humana',
    bg: 'var(--color-info-bg)',
    border: 'var(--color-info-border)',
    text: 'var(--color-info-text)',
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
    bg: 'var(--color-success-bg)',
    border: 'var(--color-success-border)',
    text: 'var(--color-success-text)',
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
    caption: '0.75rem'   // 12px (mínimo legível em mobile)
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

/**
 * Responsividade (mobile-first). Os valores espelham os @media de src/index.css,
 * que não aceita var() — mantenha os dois lados em sincronia.
 * Regra: estilo (padding, fonte, quebra) vai em CSS; useBreakpoint/useMediaQuery
 * só para decisões estruturais (drawer x sidebar, cartões x tabela).
 */
export const breakpoints = {
  sm: 480,
  md: 768,
  lg: 1024,
  xl: 1280
} as const;

export type Breakpoint = 'xs' | keyof typeof breakpoints;

export const touchTarget = { min: '44px' } as const;

/** Inputs com fonte menor que 16px provocam zoom automático no iOS Safari. */
export const inputFontSizeMobile = '16px';

export const pageGutter = {
  mobile: '1rem',
  tablet: '1.5rem',
  desktop: '2rem'
} as const;

/**
 * Grid auto-ajustável que nunca ultrapassa a largura do contêiner.
 * Use no lugar de `repeat(auto-fit, minmax(Npx, 1fr))`, que estoura abaixo de N px.
 */
export const responsiveGrid = (minPx: number, mode: 'fit' | 'fill' = 'fit'): string =>
  `repeat(auto-${mode}, minmax(min(100%, ${minPx}px), 1fr))`;
