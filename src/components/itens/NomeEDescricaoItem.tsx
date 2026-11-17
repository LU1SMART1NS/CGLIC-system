import React from 'react';
import { descricaoItemEmFrase, toSentenceCaseIfAllCaps } from '../../utils/textCase';

const clamp = (lines: number): React.CSSProperties => ({ display: '-webkit-box', WebkitLineClamp: lines, WebkitBoxOrient: 'vertical', overflow: 'hidden' });

/**
 * Nome e descrição do item nas listas de Atas e Contratos, como na tela de Itens das Emendas: com nome curto (o da CAEP
 * ou, sem ele, o da tabela da ata assinada), o nome em negrito e a descrição do catálogo em cinza numa linha; sem nome,
 * a descrição fica como linha principal (duas linhas), sem aviso.
 */
export const NomeEDescricaoItem: React.FC<{ nome?: string | null; descricao?: string | null; testId?: string }> = ({ nome, descricao, testId }) => {
  const texto = descricaoItemEmFrase(descricao) || '—';
  if (!nome?.trim()) {
    return (
      <div title={descricao ?? undefined} style={{ fontSize: '0.8rem', color: '#0f172a', marginTop: '0.15rem', ...clamp(2) }}>
        {texto}
      </div>
    );
  }
  return (
    <>
      <div title={nome.trim()} data-testid={testId} style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a', marginTop: '0.15rem', ...clamp(2) }}>
        {toSentenceCaseIfAllCaps(nome.trim())}
      </div>
      <div title={descricao ?? undefined} style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.1rem', ...clamp(1) }}>
        {texto}
      </div>
    </>
  );
};
