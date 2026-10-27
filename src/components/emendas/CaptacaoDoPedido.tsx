import React from 'react';
import { ChevronDown } from 'lucide-react';
import { ActionButton } from '../../design-system';
import { GtiCelulaAta, GtiFatiaBar, GtiTag } from '../gti/GtiVisual';
import { CarteiraGtiSelect } from '../gti/CarteiraGtiSelect';
import { GRUPO_GTI_INFO, type FatiasDaAta, type FiltroGti, type GrupoPrincipal, type ModoFiltroGti } from '../../config/gruposGti';
import { GRUPOS_CAPTACAO, MODO_CAPTACAO_LABEL, type BeneficiariosDaFatia } from '../../config/captacaoEmendas';
import { nomeESigla, type BeneficiarioEmenda } from '../../services/emendasService';
import { formatCurrency } from '../../utils/format';

/**
 * Peças da Captação principal (migration 218) nas três visões de Pedidos: a célula (a mesma da coluna Interesse
 * principal das carteiras de Atas e Itens), o filtro ?captacao=&captacaoConta= e a gaveta do pedido aberto.
 */

const SEM_BENEFICIARIO = { texto: 'Sem beneficiário', title: 'Nenhuma linha deste pedido tem beneficiário: não há grupo para mostrar' };

export const CelulaCaptacao: React.FC<{ fatias: FatiasDaAta; testId?: string }> = ({ fatias, testId }) => (
  <GtiCelulaAta fatias={fatias} testId={testId} semDados={SEM_BENEFICIARIO} tituloDetalhe="Captação por grupo" />
);

/** Filtro "Captação" (grupo) e, com ele escolhido, "Contar" (Captação principal, ≥50%, ≥20%, qualquer participação). */
export const FiltroCaptacao: React.FC<{
  gti: FiltroGti;
  modo: ModoFiltroGti;
  counts: Partial<Record<GrupoPrincipal, number>>;
  mudarUrl: (mudar: (p: URLSearchParams) => void) => void;
  testIdPrefix: string;
}> = ({ gti, modo, counts, mudarUrl, testIdPrefix }) => (
  <CarteiraGtiSelect
    gti={gti}
    modo={modo}
    counts={counts}
    grupos={GRUPOS_CAPTACAO}
    label="Captação"
    rotuloModo={MODO_CAPTACAO_LABEL}
    onChangeGti={(v) =>
      mudarUrl((p) => {
        if (v === 'TODOS') {
          p.delete('captacao');
          p.delete('captacaoConta');
        } else p.set('captacao', v);
      })
    }
    onChangeModo={(m) =>
      mudarUrl((p) => {
        if (m === 'PRINCIPAL') p.delete('captacaoConta');
        else p.set('captacaoConta', m);
      })
    }
    testIdPrefix={`${testIdPrefix}-captacao`}
  />
);

const pequeno: React.CSSProperties = { fontSize: '0.75rem', color: 'var(--text-muted, #64748b)' };

type FatiasComBeneficiarios = FatiasDaAta & { porBeneficiario?: BeneficiariosDaFatia[] };

/** "Captação principal:" no cartão do Pedido 360, no padrão do "Interesse por GTI:" da Ata 360 (botão de gaveta). */
export const CaptacaoBotao: React.FC<{ fatias: FatiasDaAta; aberto: boolean; onToggle: () => void }> = ({ fatias, aberto, onToggle }) => {
  if (fatias.fatias.length === 0) return null;
  return (
    <div className="pn-gavetas" role="group" aria-label="Captação principal" data-testid="captacao-botoes" style={{ marginTop: '12px' }}>
      <span className="pn-gavetas-lbl">Captação principal:</span>
      <button
        type="button"
        className="pn-gaveta-btn"
        aria-expanded={aberto}
        aria-controls="gaveta-captacao"
        onClick={onToggle}
        aria-label={`Captação por grupo: ${fatias.fatias.map((f) => `${GRUPO_GTI_INFO[f.grupo].rotulo} ${f.pct}%`).join(', ')}`}
        title={aberto ? 'Fechar a captação por grupo' : 'Abrir a captação por grupo'}
        data-testid="captacao-btn"
      >
        <span style={{ display: 'inline-flex', background: '#ffffff', borderRadius: 6, padding: '3px 8px', fontWeight: 400, textAlign: 'left' }}>
          <GtiCelulaAta fatias={fatias} testId="captacao-resumo" detalheAoPassar={false} semDados={SEM_BENEFICIARIO} />
        </span>
        <ChevronDown size={16} className="pn-gaveta-seta" aria-hidden="true" />
      </button>
    </div>
  );
};

/** A gaveta entre o cartão do topo e as abas do Pedido 360: some junto com o cartão quando ele encolhe ao rolar. */
export const CaptacaoNoTopo: React.FC<{ fatias: FatiasComBeneficiarios; beneficiarios: Map<string, BeneficiarioEmenda>; aberto: boolean; onFechar: () => void }> = ({
  fatias,
  beneficiarios,
  aberto,
  onFechar
}) => {
  if (!aberto || fatias.fatias.length === 0) return null;
  return (
    <div className="i360-fold" data-i360-fold="">
      <div className="i360-fold-in">
        <div style={{ marginBottom: '1.5rem' }}>
          <section id="gaveta-captacao" className="pn-gaveta" aria-labelledby="gaveta-captacao-titulo" data-testid="captacao-gaveta">
            <div className="pn-gaveta-head">
              <h2 id="gaveta-captacao-titulo">Captação por grupo</h2>
              <span className="pn-gaveta-sub">
                Quanto cada grupo recebe neste pedido, em valor: quantidade × preço previsto de cada linha, pelo grupo do beneficiário. Linhas sem
                beneficiário ficam fora.
              </span>
              <ActionButton action="fechar" size="sm" onClick={onFechar} data-testid="captacao-fechar" />
            </div>
            <GavetaCaptacao fatias={fatias} beneficiarios={beneficiarios} />
          </section>
        </div>
      </div>
    </div>
  );
};

/**
 * Captação por grupo: a barra e, por grupo, o valor, a fatia e os beneficiários (os 5 maiores).
 * Sem beneficiário em nenhuma linha, não aparece.
 */
export const GavetaCaptacao: React.FC<{
  fatias: FatiasComBeneficiarios;
  beneficiarios: Map<string, BeneficiarioEmenda>;
  testId?: string;
}> = ({ fatias, beneficiarios, testId }) => {
  if (fatias.fatias.length === 0) return null;
  const porGrupo = new Map((fatias.porBeneficiario ?? []).map((f) => [f.grupo, f.beneficiarios]));
  return (
    <div data-testid={testId} style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
      <GtiFatiaBar fatias={fatias} altura={8} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: '0.5rem' }}>
        {fatias.fatias.map((f) => {
          const lista = porGrupo.get(f.grupo) ?? [];
          return (
            <div key={f.grupo} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '0.5rem 0.65rem', display: 'flex', flexDirection: 'column', gap: '0.3rem', minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', alignItems: 'center' }}>
                <GtiTag grupo={f.grupo} />
                <b style={{ fontSize: '0.8rem', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                  {formatCurrency(f.quantidade)} · {f.pct}%
                </b>
              </div>
              <span style={pequeno}>
                {f.grupo === 'A_CONFIRMAR' ? 'Grupo ainda não confirmado' : GRUPO_GTI_INFO[f.grupo].descricao} · {lista.length} {lista.length === 1 ? 'beneficiário' : 'beneficiários'}
              </span>
              <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.78rem', color: '#475569' }}>
                {lista.slice(0, 5).map((x) => {
                  const b = beneficiarios.get(x.id);
                  return (
                    <li key={x.id} style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {b ? nomeESigla(b) : 'Beneficiário'} <span style={pequeno}>· {formatCurrency(x.valor)}</span>
                    </li>
                  );
                })}
                {lista.length > 5 && <li style={pequeno}>e mais {lista.length - 5}</li>}
              </ul>
            </div>
          );
        })}
      </div>
      {fatias.orgaosAConfirmar > 0 && (
        <span style={pequeno}>
          {fatias.orgaosAConfirmar} {fatias.orgaosAConfirmar === 1 ? 'beneficiário ainda sem grupo confirmado' : 'beneficiários ainda sem grupo confirmado'}: confirme em
          Ajustes › Grupos dos beneficiários.
        </span>
      )}
    </div>
  );
};
