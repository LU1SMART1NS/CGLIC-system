import React from 'react';
import type { EntregaFiscalizacao } from '../../services/fiscalizacaoService';
import { passoDoItem, passosDoItem } from '../../utils/fiscalizacaoEntregas';

/** Régua do item: feito com ✓ em verde, o atual em negrito azul (vermelho se parado no Exército), o que falta em cinza. */
export const ReguaDoItem: React.FC<{ e: EntregaFiscalizacao; testId?: string }> = ({ e, testId }) => {
  if (e.responsavel === 'AREA') return <span style={{ color: '#64748b', fontSize: '0.78rem' }}>Com a área requisitante · sem acompanhamento</span>;
  const { passo, parado, fim } = passoDoItem(e);
  return (
    <span className="regua-item" data-testid={testId}>
      {passosDoItem(e).map((nome, i) => {
        const feito = i < passo || (fim && i === passo);
        const atual = i === passo && !fim;
        const longe = i < passo || i > passo + 1;
        const cor = atual && e.etapa === 'CONTROLADO' ? 'var(--color-danger-text)' : feito ? 'var(--color-success-text)' : atual ? 'var(--primary)' : '#94a3b8';
        return (
          <span key={nome} className={`regua-item__passo${longe && !(fim && i === passo) ? ' regua-item__passo--longe' : ''}${atual || (fim && i === passo) ? ' regua-item__passo--atual' : ''}`} style={{ color: cor, fontWeight: atual ? 700 : 400 }}>
            {i > 0 && <span className="regua-item__sep" aria-hidden="true">› </span>}
            {feito ? '✓ ' : ''}
            {atual && parado ? parado : nome}
          </span>
        );
      })}
    </span>
  );
};
