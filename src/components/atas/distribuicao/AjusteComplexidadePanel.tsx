import React from 'react';
import { AnchoredPanel } from '../../../design-system/components/AnchoredPanel';
import { ActionButton } from '../../../design-system/components/ActionButton';
import { useRemoverComplexidadeAjuste, useSalvarComplexidadeAjuste } from '../../../hooks/useComplexidadeAjustes';
import { MOTIVOS_AJUSTE, ROTULO_COMPLEXIDADE, type NivelComplexidade } from './complexidade';
import type { DistribuicaoItem } from './distribuicaoEquipe';

const NIVEIS: NivelComplexidade[] = ['ALTA', 'MEDIA', 'BAIXA'];
const OUTRO = '__outro__';

interface AjusteComplexidadePanelProps {
  item: DistribuicaoItem;
  anchorRect: DOMRect;
  onClose: () => void;
}

/**
 * Ajuste manual da complexidade de um instrumento (só coordenador): escolhe a faixa e o motivo, ou volta à
 * automática. A carga dos gestores e o "Para quem atribuo?" passam a usar a faixa ajustada.
 */
export const AjusteComplexidadePanel: React.FC<AjusteComplexidadePanelProps> = ({ item, anchorRect, onClose }) => {
  const salvar = useSalvarComplexidadeAjuste();
  const remover = useRemoverComplexidadeAjuste();
  const ajustada = Boolean(item.complexidade.ajuste);
  const automatica = item.complexidade.ajuste?.automatica ?? { nivel: item.complexidade.nivel, motivo: item.complexidade.motivo };

  const motivoAtual = ajustada ? item.complexidade.motivo : '';
  const motivoNaLista = (MOTIVOS_AJUSTE as readonly string[]).includes(motivoAtual);
  const [nivel, setNivel] = React.useState<NivelComplexidade>(item.complexidade.nivel);
  const [motivoOpcao, setMotivoOpcao] = React.useState<string>(motivoAtual ? (motivoNaLista ? motivoAtual : OUTRO) : '');
  const [motivoTexto, setMotivoTexto] = React.useState<string>(motivoAtual && !motivoNaLista ? motivoAtual : '');

  const motivo = motivoOpcao === OUTRO ? motivoTexto.trim() : motivoOpcao;
  const igualAutomatica = nivel === automatica.nivel;
  const ocupado = salvar.isPending || remover.isPending;
  const podeSalvar = !ocupado && !igualAutomatica && Boolean(motivo);
  const erro = (salvar.error || remover.error) as Error | null;

  const handleSalvar = () => {
    if (!podeSalvar) return;
    salvar.mutate({ tipo: item.tipo, chave: item.chave, nivel, motivo }, { onSuccess: onClose });
  };
  const handleVoltar = () => remover.mutate({ tipo: item.tipo, chave: item.chave }, { onSuccess: onClose });

  return (
    <AnchoredPanel anchorRect={anchorRect} onClose={onClose} ariaLabel="Ajustar complexidade" testId="ajuste-complexidade-panel" width={340}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong style={{ fontSize: '0.85rem', color: '#0f172a' }}>
          Complexidade {item.tipo === 'ATA' ? 'da ata' : 'do contrato'} {item.numero}
        </strong>
        <ActionButton action="fechar" iconOnly onClick={onClose} type="button" size="xs" />
      </div>

      <div style={{ fontSize: '0.78rem', color: '#475569' }}>
        Automática: <strong>{ROTULO_COMPLEXIDADE[automatica.nivel]}</strong> · {automatica.motivo}
      </div>

      <div role="radiogroup" aria-label="Faixa de complexidade" style={{ display: 'flex', gap: '0.4rem' }}>
        {NIVEIS.map((n) => (
          <label
            key={n}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.3rem',
              minHeight: '40px',
              border: `1px solid ${nivel === n ? 'var(--primary)' : '#cbd5e1'}`,
              background: nivel === n ? 'var(--color-info-bg)' : '#ffffff',
              borderRadius: '6px',
              fontSize: '0.8rem',
              fontWeight: 700,
              color: '#0f172a',
              cursor: 'pointer'
            }}
          >
            <input type="radio" name="ajuste-nivel" checked={nivel === n} onChange={() => setNivel(n)} data-testid={`ajuste-nivel-${n}`} />
            {ROTULO_COMPLEXIDADE[n]}
          </label>
        ))}
      </div>

      {igualAutomatica ? (
        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
          {ajustada ? 'É a mesma faixa da regra automática: use "Voltar à automática".' : 'Escolha uma faixa diferente da automática para ajustar.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Motivo</span>
          <select
            value={motivoOpcao}
            onChange={(e) => setMotivoOpcao(e.target.value)}
            data-testid="ajuste-motivo"
            style={{ fontSize: '0.82rem', padding: '0.45rem 0.5rem', border: '1px solid var(--primary)', borderRadius: '6px', background: '#ffffff' }}
          >
            <option value="">Selecione o motivo...</option>
            {MOTIVOS_AJUSTE.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
            <option value={OUTRO}>Outro motivo...</option>
          </select>
          {motivoOpcao === OUTRO && (
            <input
              autoFocus
              type="text"
              maxLength={300}
              value={motivoTexto}
              onChange={(e) => setMotivoTexto(e.target.value)}
              placeholder="Descreva o motivo"
              data-testid="ajuste-motivo-texto"
              style={{ fontSize: '16px', padding: '0.45rem 0.5rem', border: '1px solid var(--primary)', borderRadius: '6px' }}
            />
          )}
        </div>
      )}

      {erro && (
        <div role="alert" style={{ fontSize: '0.75rem', color: 'var(--color-danger-text)', fontWeight: 600 }}>
          Erro ao salvar: {erro.message}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.4rem', flexWrap: 'wrap' }}>
        {ajustada ? (
          <ActionButton action="desfazer" type="button" size="sm" onClick={handleVoltar} disabled={ocupado} data-testid="ajuste-voltar-automatica">
            Voltar à automática
          </ActionButton>
        ) : (
          <span />
        )}
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          <ActionButton action="cancelar" type="button" size="sm" onClick={onClose} disabled={ocupado} />
          <ActionButton
            action="salvar"
            type="button"
            size="sm"
            onClick={handleSalvar}
            disabled={!podeSalvar}
            data-testid="ajuste-salvar"
            isLoading={salvar.isPending}
          />
        </div>
      </div>
    </AnchoredPanel>
  );
};
