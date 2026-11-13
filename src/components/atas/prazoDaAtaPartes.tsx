import React from 'react';
import { StatusBadge } from '../../design-system/components/StatusBadge';
import { AppButton } from '../../design-system/components/AppButton';
import { carteiraDetalhe } from '../carteira/carteiraStyles';
import type { AtaActionItem } from '../../services/ataActionQueueService';
import type { PrazoDaAta } from '../../services/ataPrazoEntregaService';
import { textoDaRegra } from '../../utils/fiscalizacaoPrazo';

/** Item da aba Ações enquanto o prazo do TR não foi confirmado (migration 301). */
export function itemDoPrazoDaAta(p: PrazoDaAta | null, temContratos = false, ataKey = ''): AtaActionItem | null {
  // Ata fora da leitura dos editais (ata nova): com contrato, o gestor informa o prazo.
  if (!p) {
    return temContratos && ataKey
      ? { id: `prazo-${ataKey}`, kind: 'PRAZO', severity: 'ATENCAO', title: 'Informar o prazo de entrega', description: 'os contratos da ata herdam o prazo do TR', badgeLabel: 'informar' }
      : null;
  }
  if (p.confirmadoEm) return null;
  const sugerido = p.sugeridoDias && p.sugeridoInicio ? textoDaRegra({ dias: p.sugeridoDias, contagem: p.sugeridoContagem ?? 'CORRIDOS', inicio: p.sugeridoInicio }) : null;
  return {
    id: `prazo-${p.ataKey}`,
    kind: 'PRAZO',
    severity: p.leitura === 'CLARO' ? 'INFO' : 'ATENCAO',
    title: p.leitura === 'CLARO' ? 'Confirmar o prazo de entrega lido do TR' : p.leitura === 'CONFERIR' ? 'Conferir o prazo de entrega no TR' : 'Informar o prazo de entrega',
    description: p.leitura === 'CLARO' ? sugerido ?? undefined : p.leitura === 'CONFERIR' ? p.leituraMotivo ?? undefined : 'o TR publicado no PNCP não traz a cláusula',
    badgeLabel: p.leitura === 'SEM_CLAUSULA' || !p.leitura ? 'informar' : undefined
  };
}

/** Campo "Prazo de entrega" no cartão da Ata 360. */
export const PrazoNoCartaoDaAta: React.FC<{ prazo: PrazoDaAta | null; carregando?: boolean; podeConfirmar: boolean; onAbrir: () => void }> = ({ prazo: p, carregando, podeConfirmar, onAbrir }) => {
  if (carregando) return <span style={carteiraDetalhe}>…</span>;
  const corrigir = podeConfirmar ? (
    <AppButton variant="link" size="xs" onClick={onAbrir} data-testid="ata-prazo-corrigir">
      {p?.confirmadoEm ? 'Corrigir' : p ? 'Conferir' : 'Informar'}
    </AppButton>
  ) : null;
  if (!p) return podeConfirmar ? corrigir : <span style={carteiraDetalhe}>não informado</span>;
  if (p.confirmadoEm) {
    const quando = new Date(p.confirmadoEm).toLocaleDateString('pt-BR');
    const itens = Object.keys(p.porItem).length;
    return (
      <span data-testid="ata-prazo-cartao">
        {p.semPrazo ? 'Sem prazo de entrega' : textoDaRegra({ dias: p.dias!, contagem: p.contagem ?? 'CORRIDOS', inicio: p.inicio ?? 'OF_RECEBIMENTO' })}
        <span style={{ ...carteiraDetalhe, display: 'block', marginTop: 0 }}>
          {p.leitura ? 'do TR, ' : ''}confirmado por {p.confirmadoPorNome ?? '—'} em {quando}
          {itens ? ` · ${itens} ${itens === 1 ? 'item' : 'itens'} com prazo próprio` : ''} {corrigir}
        </span>
      </span>
    );
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }} data-testid="ata-prazo-cartao">
      {p.sugeridoDias && p.sugeridoInicio ? textoDaRegra({ dias: p.sugeridoDias, contagem: p.sugeridoContagem ?? 'CORRIDOS', inicio: p.sugeridoInicio }) : 'não achado no TR'}
      <StatusBadge label={p.leitura === 'SEM_CLAUSULA' ? 'a informar' : 'a confirmar'} variant="warning" size="sm" dot={false} />
    </span>
  );
};
