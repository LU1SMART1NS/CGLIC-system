import React, { useMemo, useState } from 'react';
import { SkeletonLoader } from '../../design-system/components/SkeletonLoader';
import { AppButton } from '../../design-system/components/AppButton';
import { NoticeBar } from '../../design-system/components/NoticeBar';
import { NumeroSeiEtiqueta } from '../../design-system/components/NumeroSeiEtiqueta';
import { hojeEmBrasilia, useItensCaep } from '../../hooks/useEmendas';
import { dataBR, diasEntre, curto } from '../../utils/emendasKits';
import { formatNumber } from '../../utils/format';
import type { EnvioParaContratar } from '../../utils/emendasCcga';
import type { EmendaAContratar } from '../../services/emendasService';
import { DevolverCcgaModal } from '../emendas/DevolverCcgaModal';

const linha: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: '0.5rem 1rem',
  padding: '0.7rem 0.2rem',
  borderTop: '1px solid var(--border)'
};
const detalhe: React.CSSProperties = { fontSize: '0.82rem', color: 'var(--text-muted)' };

/**
 * Gaveta "Emendas a contratar" do Início (migration 248, D1 e D2): cada pedido de emenda que a CAEP enviou à CCGA, só
 * com os itens da ata do gestor. Some sozinho quando o contrato aparece no Contratos.gov.br. O gestor pode devolver à
 * CAEP com o motivo; os envios que a CAEP desfez ficam 7 dias como aviso.
 */
export const GavetaEmendasAContratar: React.FC<{
  aContratar: EnvioParaContratar[];
  desfeitos: EmendaAContratar[];
  isLoading: boolean;
  erro: boolean;
  /** Coordenador sem gestor escolhido: a lista é das atas sem gestor. */
  semGestor: boolean;
  onAbrir: (destino: string) => void;
}> = ({ aContratar, desfeitos, isLoading, erro, semGestor, onAbrir }) => {
  const { data: itensCaep } = useItensCaep();
  const nomes = useMemo(() => new Map((itensCaep ?? []).map((i) => [i.itemKey, i.nomeCurto?.trim() || curto(i.descricao, 60)])), [itensCaep]);
  const nomeDoItem = (itemKey: string) => nomes.get(itemKey) ?? `item ${Number(itemKey.split('-')[2] ?? 0)}`;
  const [devolvendo, setDevolvendo] = useState<EnvioParaContratar | null>(null);
  const hoje = hojeEmBrasilia();

  if (isLoading) return <SkeletonLoader variant="text" count={2} />;
  if (erro)
    return (
      <NoticeBar tone="warning" testId="painel-emendas-a-contratar-erro">
        Não foi possível ler os pedidos de emenda enviados à CCGA. Tente de novo em instantes.
      </NoticeBar>
    );
  if (aContratar.length === 0 && desfeitos.length === 0)
    return <div style={detalhe}>{semGestor ? 'Nenhum pedido de emenda em ata sem gestor.' : 'Nenhum pedido de emenda a contratar.'}</div>;

  return (
    <div data-testid="painel-emendas-a-contratar">
      {desfeitos.map((d, i) => (
        <NoticeBar key={`${d.pedidoId}-${d.ataKey}-${i}`} tone="info" testId="painel-emendas-envio-desfeito">
          <b>Envio desfeito pela CAEP:</b> {d.pedidoNome} · ata {d.ataKey.split('-')[0]} · {d.quantidade === 1 ? '1 item' : `${d.quantidade} itens`} em {dataBR(d.data)}
          {d.motivo ? `: ${d.motivo}` : ''}. Não precisa contratar.
        </NoticeBar>
      ))}
      {aContratar.map((g) => {
        const dias = g.enviadoEm ? diasEntre(g.enviadoEm, hoje) : null;
        const notas = [...new Set(g.linhas.map((l) => l.nota).filter(Boolean))];
        return (
          <div key={`${g.pedidoId}-${g.ataKey}`} style={linha} data-testid={`painel-emendas-a-contratar-${g.pedidoId}-${g.ataKey.split('-')[0]}`}>
            <div style={{ minWidth: 0, flex: '1 1 320px', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
              <b>
                {g.pedidoNome}
                {g.autor ? ` · ${g.autor}` : ''}
              </b>
              <span style={{ fontSize: '0.88rem' }}>
                Ata {g.ataKey.split('-')[0]} · {g.linhas.map((l) => `${formatNumber(l.quantidade)}× ${l.itemKey ? nomeDoItem(l.itemKey) : 'item'}`).join(' · ')}
              </span>
              <span style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.3rem 0.5rem' }}>
                {g.documentosSei.map((n) => (
                  <NumeroSeiEtiqueta key={n} numero={n} testId="painel-emendas-a-contratar-sei" />
                ))}
                <span style={detalhe}>
                  {notas.length ? `${notas.join(', ')} · ` : ''}
                  {g.enviadoEm ? `enviado pela CAEP em ${dataBR(g.enviadoEm)}${dias != null ? ` · há ${dias} ${dias === 1 ? 'dia' : 'dias'}` : ''}` : 'enviado pela CAEP'}
                  {semGestor ? ' · ata sem gestor' : ''}
                </span>
              </span>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <AppButton size="sm" variant="outline" onClick={() => onAbrir(`/atas/detalhe/${encodeURIComponent(g.ataKey)}`)} data-testid="painel-emendas-abrir-ata">
                Abrir ata
              </AppButton>
              <AppButton size="sm" variant="ghostDanger" onClick={() => setDevolvendo(g)} data-testid="painel-emendas-devolver">
                Devolver à CAEP
              </AppButton>
            </div>
          </div>
        );
      })}
      {devolvendo && <DevolverCcgaModal envio={devolvendo} nomeDoItem={nomeDoItem} onClose={() => setDevolvendo(null)} />}
    </div>
  );
};
