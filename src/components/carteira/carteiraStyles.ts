import type React from 'react';

export const carteiraTh: React.CSSProperties = {
  textAlign: 'left',
  padding: '0.65rem 0.6rem',
  fontSize: '0.75rem',
  fontWeight: 800,
  textTransform: 'uppercase',
  letterSpacing: '0.03em',
  color: '#64748b',
  borderBottom: '1px solid #e2e8f0',
  whiteSpace: 'nowrap'
};

export const carteiraTd: React.CSSProperties = {
  padding: '0.7rem 0.6rem',
  fontSize: '0.82rem',
  color: '#0f172a',
  borderBottom: '1px solid #f1f5f9',
  verticalAlign: 'middle'
};

export const carteiraTableShell: React.CSSProperties = {
  background: '#ffffff',
  border: '1px solid #e2e8f0',
  borderRadius: '10px',
  overflow: 'hidden'
};

/** Segunda linha da célula de identificação (fornecedor/objeto), limitada a 2 linhas: igual em todas as carteiras. */
export const carteiraSubtitle: React.CSSProperties = {
  fontSize: '0.78rem',
  fontWeight: 600,
  color: '#475569',
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden'
};

/** Subtítulo com o nome do fornecedor: sempre em maiúsculas, como o PNCP traz (só exibição; o dado não muda). */
export const carteiraFornecedor: React.CSSProperties = {
  ...carteiraSubtitle,
  textTransform: 'uppercase'
};
