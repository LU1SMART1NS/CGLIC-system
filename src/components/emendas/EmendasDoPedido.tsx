import React, { useState } from 'react';
import { InfoHint } from '../../design-system/components/InfoHint';
import { AppButton } from '../../design-system/components/AppButton';
import { useToast } from '../../design-system/components/Toast';
import { useRemoverEmendaDoPedido } from '../../hooks/useEmendas';
import { numeroDaEmendaEmTexto } from '../../utils/emendasPedidos';
import { dataBR } from '../../utils/emendasKits';
import { carteiraDetalhe, carteiraSubtitle } from '../carteira/carteiraStyles';
import type { PedidoEmenda } from '../../services/emendasService';
import { LigarEmendaModal } from './LigarEmendaModal';
import { pedidoEmTexto } from '../../utils/emendasNomeDoPedido';

const linha: React.CSSProperties = { display: 'flex', gap: '0.5rem', alignItems: 'flex-start', justifyContent: 'space-between', padding: '0.4rem 0.55rem', borderRadius: 6, border: '1px solid var(--color-border, #e2e8f0)' };

/**
 * Emendas do pedido (migration 211): a conferida com o ofício e as outras que completaram o pedido (a sobra de uma emenda
 * antiga do mesmo parlamentar). As notas de qualquer uma entram nos itens. A outra emenda só sai sem nota dela nos itens.
 */
export const EmendasDoPedido: React.FC<{ p: PedidoEmenda; podeGerir: boolean }> = ({ p, podeGerir }) => {
  const [adicionando, setAdicionando] = useState(false);
  const [tirando, setTirando] = useState<string | null>(null);
  const remover = useRemoverEmendaDoPedido();
  const toast = useToast();
  if (!p.siopEmenda) return null;

  const tirar = async (id: string, texto: string) => {
    try {
      await remover.mutateAsync({ id, versao: p.versao });
      toast.success(`Emenda ${texto} tirada do ${pedidoEmTexto(p)}.`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setTirando(null);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }} data-testid={`emendas-pedido-emendas-${p.id}`}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <span style={{ ...carteiraDetalhe, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{p.outrasEmendas.length ? 'Emendas do pedido' : 'Emenda do pedido'}</span>
        <span style={{ flex: 1 }} />
        {podeGerir && p.etapa !== 'CANCELADO' && (
          <AppButton size="xs" variant="link" onClick={() => setAdicionando(true)} data-testid={`emendas-pedido-emenda-adicionar-${p.id}`}>
            + Adicionar emenda
          </AppButton>
        )}
      </div>
      <div style={linha}>
        <span>
          <b style={{ fontVariantNumeric: 'tabular-nums' }}>
            {p.siopEmendaAno ? `${p.siopEmendaAno} · ` : ''}
            {numeroDaEmendaEmTexto(p.siopEmenda)}
          </b>
          <span style={{ ...carteiraSubtitle, display: 'block' }}>conferida com o ofício{p.siopGnd ? ` · ${p.siopGnd}` : ''}</span>
        </span>
      </div>
      {p.outrasEmendas.map((o) => {
        const texto = `${o.ano} · ${numeroDaEmendaEmTexto(o.numero)}`;
        return (
          <div key={o.id} style={{ ...linha, borderStyle: 'dashed' }} data-testid={`emendas-pedido-emenda-outra-${o.numero}`}>
            <span style={{ minWidth: 0 }}>
              <b style={{ fontVariantNumeric: 'tabular-nums' }}>{texto}</b>
              <span style={{ ...carteiraSubtitle, display: 'block' }}>
                outra emenda · ligada {o.criadoPorNome ? `por ${o.criadoPorNome} ` : ''}em {dataBR(o.criadoEm.slice(0, 10))}
                {o.documentoSei ? ` · SEI ${o.documentoSei}` : ''}
              </span>
            </span>
            {o.observacao && <InfoHint label="Ver a observação da ligação" content={o.observacao} testId={`emendas-pedido-emenda-observacao-${o.numero}`} />}
            {podeGerir &&
              (tirando === o.id ? (
                <span style={{ display: 'inline-flex', gap: '0.3rem', alignItems: 'center', whiteSpace: 'nowrap' }}>
                  <span style={carteiraDetalhe}>Tirar?</span>
                  <AppButton size="xs" variant="ghostDanger" onClick={() => void tirar(o.id, texto)} isLoading={remover.isPending} data-testid={`emendas-pedido-emenda-tirar-sim-${o.numero}`}>
                    Sim
                  </AppButton>
                  <AppButton size="xs" variant="link" onClick={() => setTirando(null)} disabled={remover.isPending}>
                    Não
                  </AppButton>
                </span>
              ) : (
                <AppButton size="xs" variant="link" onClick={() => setTirando(o.id)} data-testid={`emendas-pedido-emenda-tirar-${o.numero}`}>
                  Tirar
                </AppButton>
              ))}
          </div>
        );
      })}
      {adicionando && <LigarEmendaModal pedido={p} onClose={() => setAdicionando(false)} />}
    </div>
  );
};
