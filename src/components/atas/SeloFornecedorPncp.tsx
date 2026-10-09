import React from 'react';
import { AlertTriangle, UserCheck } from 'lucide-react';
import { ActionButton } from '../../design-system/components/ActionButton';
import { formatDateBR } from '../../services/temporalEngineService';
import type { RegistroFornecedorPncp } from '../../services/fornecedorAtaPncpService';

interface SeloFornecedorPncpProps {
  registro: RegistroFornecedorPncp;
  itensNoBanco: number;
  /** Só o coordenador: abre a janela de indicação. */
  onIndicar?: () => void;
}

const chip = (tom: 'aviso' | 'info'): React.CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.35rem',
  fontSize: '0.75rem',
  fontWeight: 700,
  padding: '0.2rem 0.6rem',
  borderRadius: tom === 'aviso' ? '6px' : '999px',
  color: tom === 'aviso' ? 'var(--color-warning-text)' : 'var(--color-info-text-strong)',
  background: tom === 'aviso' ? 'var(--color-warning-bg)' : 'var(--color-info-bg)',
  border: `1px solid ${tom === 'aviso' ? 'var(--color-warning-border)' : 'var(--color-info-border)'}`
});

/** Trilha da indicação, para a dica do selo. */
export function descreverIndicacao(r: RegistroFornecedorPncp): string {
  const partes = [
    r.indicadoPorNome ? `Indicado por ${r.indicadoPorNome}` : 'Indicado pelo coordenador',
    r.indicadoEm ? `em ${formatDateBR(r.indicadoEm.slice(0, 10))}` : '',
    r.comoConfirmou ? `· ${r.comoConfirmou}` : '',
    r.estado === 'CONFERIDO' ? '· conferido com o Compras.gov.br' : r.estado === 'INDICADO' ? '· será conferido quando o Compras.gov.br publicar a ata' : ''
  ];
  return partes.filter(Boolean).join(' ');
}

/**
 * Selo do cartão da Ata 360 para a ata que o PNCP publicou sem fornecedor: pendente (com o botão do coordenador),
 * indicado (com a trilha na dica) ou divergente do Compras.gov.br. Conferido não precisa de selo.
 */
export const SeloFornecedorPncp: React.FC<SeloFornecedorPncpProps> = ({ registro, itensNoBanco, onIndicar }) => {
  if (registro.estado === 'CONFERIDO') return null;
  if (registro.estado === 'PENDENTE') {
    return (
      <span data-testid="ata-fornecedor-pendente" style={{ display: 'inline-flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem' }}>
        <span style={chip('aviso')}>
          <AlertTriangle size={13} /> Fornecedor não informado pelo PNCP
        </span>
        {onIndicar && <ActionButton action="indicarFornecedor" size="xs" onClick={onIndicar} data-testid="ata-indicar-fornecedor" />}
      </span>
    );
  }
  if (registro.estado === 'DIVERGENTE') {
    return (
      <span data-testid="ata-fornecedor-divergente" style={{ display: 'inline-flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem' }}>
        <strong style={{ color: '#0f172a' }}>{registro.fonteFornecedorNome || registro.fonteFornecedorIdentificador}</strong>
        <span style={chip('aviso')} title={descreverIndicacao(registro)}>
          <AlertTriangle size={13} /> Indicado {registro.fornecedorNome || registro.fornecedorIdentificador}, mas o Compras.gov.br publicou outro fornecedor
        </span>
      </span>
    );
  }
  return (
    <span data-testid="ata-fornecedor-indicado" style={{ display: 'inline-flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem' }}>
      <strong style={{ color: '#0f172a' }}>{registro.fornecedorNome || registro.fornecedorIdentificador}</strong>
      <span style={{ ...chip('info'), cursor: 'help' }} title={descreverIndicacao(registro)}>
        <UserCheck size={13} /> {itensNoBanco > 0 ? 'Fornecedor indicado pelo coordenador' : 'Indicado pelo coordenador · aguardando sincronização'}
      </span>
    </span>
  );
};
