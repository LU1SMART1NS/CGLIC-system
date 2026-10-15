import React from 'react';
import { ChevronDown } from 'lucide-react';
import { ActionButton } from '../../design-system';
import { formatNumber } from './itemBalanceUtils';
import { isUasgCglic } from '../../config/unidadesGestoras';
import { useGruposDasUasgs } from '../../hooks/useGruposGti';
import { GtiCelulaAta, GtiFatiaBar, GtiTag } from '../gti/GtiVisual';
import { GRUPO_GTI_INFO, resumirFatias, type FatiasDaAta, type GrupoDaFatia } from '../../config/gruposGti';
import type { QuantitativosDoItem } from '../../services/quantitativosService';
import type { UnidadeItemRecord } from '../../types';

const digitos = (v: unknown) => String(v ?? '').replace(/\D/g, '');
const pequeno: React.CSSProperties = { fontSize: '0.8rem', color: 'var(--text-muted)' };

/**
 * Interesse por GTI do item: quantidade registrada dos órgãos participantes, somada pelo grupo confirmado de cada UASG
 * (migration 139). Ficam fora a SENASP, a gerenciadora e as adesões. Com a ata assinada informada, vale a lista dela;
 * sem ela, a lista de órgãos do Compras.gov.br.
 */
export function useInteresseGti(input: { unidades: UnidadeItemRecord[]; quantitativos: QuantitativosDoItem; ataDaCglic: boolean }): FatiasDaAta {
  const { unidades, quantitativos: q, ataDaCglic } = input;
  const linhas = React.useMemo(
    () =>
      q.informado
        ? q.orgaos.map((o) => ({ uasg: o.uasg, conta: !o.ehSenasp, registrado: o.quantidadeRegistrada ?? 0 }))
        : unidades.map((u) => {
            const uasg = digitos(u.codigoUnidade);
            const gerenciadora = u.tipoUnidade === 'GERENCIADORA' || (ataDaCglic && isUasgCglic(uasg));
            return { uasg, conta: !isUasgCglic(uasg) && !gerenciadora, registrado: Number(u.quantidadeRegistrada) || 0 };
          }),
    [q.informado, q.orgaos, unidades, ataDaCglic]
  );
  const grupos = useGruposDasUasgs(linhas.map((l) => l.uasg));
  return React.useMemo(() => {
    const porGrupo = new Map<GrupoDaFatia, { quantidade: number; orgaos: number }>();
    for (const l of linhas) {
      if (!l.conta) continue;
      const g = grupos.get(l.uasg) ?? 'A_CONFIRMAR';
      const atual = porGrupo.get(g) ?? { quantidade: 0, orgaos: 0 };
      porGrupo.set(g, { quantidade: atual.quantidade + Math.max(0, l.registrado), orgaos: atual.orgaos + 1 });
    }
    return resumirFatias([...porGrupo].map(([grupo, v]) => ({ grupo, ...v })));
  }, [linhas, grupos]);
}

/**
 * "Interesse por GTI:" com um botão no padrão dos botões de gaveta do Início. Fica no cartão do topo do item e mostra a
 * mesma célula da coluna GTI das carteiras (principal em destaque, a segunda fatia em cinza e a barra).
 */
export const InteresseGtiBotao: React.FC<{ fatias: FatiasDaAta; aberto: boolean; onToggle: () => void }> = ({ fatias, aberto, onToggle }) => {
  if (fatias.fatias.length === 0) return null;
  return (
    <div className="pn-gavetas" role="group" aria-label="Mais sobre o item" data-testid="interesse-gti-botoes" style={{ marginTop: '12px' }}>
      <span className="pn-gavetas-lbl">Interesse por GTI:</span>
      <button
        type="button"
        className="pn-gaveta-btn"
        aria-expanded={aberto}
        aria-controls="gaveta-interesse-gti"
        onClick={onToggle}
        aria-label={`Interesse por GTI: ${fatias.fatias.map((f) => `${GRUPO_GTI_INFO[f.grupo].rotulo} ${f.pct}%`).join(', ')}`}
        title={aberto ? 'Fechar o interesse por GTI' : 'Abrir o interesse por GTI'}
        data-testid="interesse-gti-btn"
      >
        <span style={{ display: 'inline-flex', background: '#ffffff', borderRadius: 6, padding: '3px 8px', fontWeight: 400, textAlign: 'left' }}>
          <GtiCelulaAta fatias={fatias} testId="interesse-gti-resumo" />
        </span>
        <ChevronDown size={16} className="pn-gaveta-seta" aria-hidden="true" />
      </button>
    </div>
  );
};

/** Gaveta aberta: fica fora do cartão do topo (que encolhe ao rolar), logo acima das abas do item. */
export const InteresseGtiGaveta: React.FC<{ fatias: FatiasDaAta; onFechar: () => void }> = ({ fatias, onFechar }) => {
  if (fatias.fatias.length === 0) return null;
  return (
    <section id="gaveta-interesse-gti" className="pn-gaveta" aria-labelledby="gaveta-interesse-gti-titulo" data-testid="interesse-gti">
      <div className="pn-gaveta-head">
        <h2 id="gaveta-interesse-gti-titulo">Interesse por GTI</h2>
        <span className="pn-gaveta-sub">
          Quanto cada grupo pediu neste item: a soma da quantidade registrada dos órgãos participantes. Não entram a SENASP, o órgão que gerencia a ata
          nem os órgãos que aderiram depois.
        </span>
        <ActionButton action="fechar" size="sm" onClick={onFechar} data-testid="interesse-gti-fechar" />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <GtiFatiaBar fatias={fatias} />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem 1rem' }}>
          {fatias.fatias.map((f) => (
            <span key={f.grupo} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem' }}>
              <GtiTag grupo={f.grupo} />
              <b style={{ fontVariantNumeric: 'tabular-nums' }}>{f.pct}%</b>
              <span style={pequeno}>
                {formatNumber(f.quantidade)} · {f.orgaos} {f.orgaos === 1 ? 'órgão' : 'órgãos'}
              </span>
            </span>
          ))}
        </div>
        {fatias.orgaosAConfirmar > 0 && (
          <span style={pequeno}>
            {fatias.orgaosAConfirmar} {fatias.orgaosAConfirmar === 1 ? 'órgão ainda sem grupo confirmado' : 'órgãos ainda sem grupo confirmado'}: o coordenador
            confirma em Ajustes › Grupos das UASGs.
          </span>
        )}
        {fatias.principal && (
          <span style={{ ...pequeno, color: 'var(--text-secondary)' }}>
            Interesse principal: <b>{GRUPO_GTI_INFO[fatias.principal.grupo].rotulo}</b> ({GRUPO_GTI_INFO[fatias.principal.grupo].descricao}).
          </span>
        )}
      </div>
    </section>
  );
};
