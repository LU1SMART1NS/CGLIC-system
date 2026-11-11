import type React from 'react';

/** vencido: vermelho; eu: azul (é com quem vê); espera: contorno amarelo (com outra pessoa ou órgão). */
export type TomDaMesa = 'vencido' | 'eu' | 'espera';

export const COR_DO_TOM: Record<TomDaMesa, string> = {
  vencido: 'var(--color-danger)',
  eu: 'var(--primary)',
  espera: 'var(--color-warning)'
};

/** A caixa das listas da mesa e o espaço entre o título e a lista. */
export const listaDaMesa: React.CSSProperties = { border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' };
export const blocoDaMesa: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '0.4rem' };
