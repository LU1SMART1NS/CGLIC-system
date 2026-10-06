import React from 'react';
import { ActionButton } from '../../../design-system';
import { useToast } from '../../../design-system/components/Toast';
import { useRestaurarAta } from '../../../hooks/useDescartesAtaContrato';
import { carteiraTableShell } from '../../carteira/carteiraStyles';
import type { DescarteAta } from './contratosSemAta';

/** "Ver descartados (N)": atas que o coordenador descartou para o contrato, com Restaurar. */
export const DescartadosLista: React.FC<{ descartados: DescarteAta[]; podeRestaurar: boolean; testIdPrefix: string }> = ({ descartados, podeRestaurar, testIdPrefix }) => {
  const toast = useToast();
  const restaurar = useRestaurarAta();
  const [aberto, setAberto] = React.useState(false);
  if (descartados.length === 0) return null;

  const restaurarAta = async (d: DescarteAta) => {
    try {
      await restaurar.mutateAsync({ contractKey: d.contractKey, ataKey: d.ataKey });
      toast.success(`Ata ${d.numeroAta} voltou a ser sugerida para o contrato ${d.numero}.`);
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível restaurar a ata.');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <ActionButton
        action={aberto ? 'ocultar' : 'verDetalhes'}
        type="button"
        size="sm"
        onClick={() => setAberto((v) => !v)}
        expanded={aberto}
        data-testid={`${testIdPrefix}-ver-descartados`}
        style={{ alignSelf: 'flex-start' }}
      >
        {aberto ? 'Ocultar descartados' : 'Ver descartados'} ({descartados.length})
      </ActionButton>
      {aberto && (
        <div style={carteiraTableShell} data-testid={`${testIdPrefix}-descartados`}>
          {descartados.map((d) => (
            <div
              key={`${d.contractKey}|${d.ataKey}`}
              style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', padding: '0.55rem 0.85rem', borderBottom: '1px solid #e2e8f0', fontSize: '0.82rem' }}
            >
              <span>
                <strong>Contrato {d.numero}</strong> · Ata {d.numeroAta}
                {d.fornecedorNome && <span style={{ color: '#64748b' }}> · {d.fornecedorNome}</span>}
              </span>
              {podeRestaurar && (
                <span style={{ marginLeft: 'auto' }}>
                  <ActionButton action="restaurar" size="sm" onClick={() => restaurarAta(d)} disabled={restaurar.isPending} title="Voltar a sugerir esta ata" data-testid={`${testIdPrefix}-restaurar-${d.contractKey}-${d.numeroAta}`} />
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
