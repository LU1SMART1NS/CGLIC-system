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

/** Primeira linha da célula de identificação (número da ata, do contrato, nome do kit...): forte e azul, igual em todas as carteiras. */
export const carteiraIdentificacao: React.CSSProperties = { fontWeight: 800, color: 'var(--primary)' };

/** Descrição do item sob a identificação (ata · item), como na lista de itens da ata: até 2 linhas. */
export const carteiraDescricaoItem: React.CSSProperties = {
  fontSize: '0.8rem',
  color: '#0f172a',
  marginTop: '0.15rem',
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
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

/** Largura das barras de consumo e de GTI nas carteiras: as duas iguais, lado a lado na mesma linha. */
export const LARGURA_BARRA_CARTEIRA = '150px';

/**
 * Consumo e GTI lado a lado: as duas células alinham pelo topo, com a mesma altura de linha acima da barra e o mesmo
 * espaço até ela, para que as barras fiquem na mesma altura.
 */
export const carteiraTdBarra: React.CSSProperties = { ...carteiraTd, verticalAlign: 'top' };
export const LINHA_ACIMA_DA_BARRA: React.CSSProperties = { display: 'block', lineHeight: '1.25rem', height: '1.25rem' };
export const ESPACO_ATE_A_BARRA = '0.3rem';
