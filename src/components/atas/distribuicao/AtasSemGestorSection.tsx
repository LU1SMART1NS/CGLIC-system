import React from 'react';
import { ArrowRight, UserPlus } from 'lucide-react';
import { CarteiraPrazoPill } from '../../carteira/CarteiraPrazoPill';
import { carteiraButton, carteiraTableShell } from '../../carteira/carteiraStyles';
import { ROTULO_COMPLEXIDADE } from './complexidade';
import type { AtaSemGestor } from './contratosSemAta';

const PAGE_SIZE = 10;
const MORE_SIZE = 20;
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

const listar = (numeros: string[]) => (numeros.length <= 3 ? numeros.join(', ') : `${numeros.slice(0, 3).join(', ')} e mais ${numeros.length - 3}`);

interface AtasSemGestorSectionProps {
  atas: AtaSemGestor[];
  /** Só o coordenador atribui; o leitor só consulta. */
  podeAtribuir: boolean;
  /** Abre o "Para quem atribuo?" para a ata (os contratos vinculados vão junto). */
  onAtribuir: (ata: AtaSemGestor) => void;
}

/**
 * Atas sem gestor: o trabalho principal do coordenador. Atribuir a ata leva junto os contratos já vinculados; os
 * prováveis (mesma compra e fornecedor) serão vinculados pelo servidor e herdam o gestor no vínculo.
 */
export const AtasSemGestorSection: React.FC<AtasSemGestorSectionProps> = ({ atas, podeAtribuir, onAtribuir }) => {
  const [visible, setVisible] = React.useState(PAGE_SIZE);
  const shown = atas.slice(0, visible);

  return (
    <section id="distribuicao-atas-sem-gestor" data-testid="distribuicao-atas-sem-gestor" style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', scrollMarginTop: '1rem' }}>
      <div>
        <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>
          Atas sem gestor <span style={{ color: atas.length ? '#b45309' : '#15803d' }}>({atas.length})</span>
        </h2>
        <p style={{ margin: '0.25rem 0 0', fontSize: '0.82rem', color: '#64748b' }}>
          Ao atribuir a ata, o servidor recebe também os contratos vinculados a ela. Os contratos prováveis (mesma compra e mesmo
          fornecedor) o servidor vincula na Ata 360, e eles passam a ser dele no momento do vínculo.
        </p>
      </div>

      <div style={{ ...carteiraTableShell, padding: '0 0.9rem' }}>
        {shown.length === 0 ? (
          <div style={{ padding: '1rem 0', fontSize: '0.85rem', color: '#64748b' }}>Todas as atas com algo a distribuir já têm gestor.</div>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {shown.map((ata) => (
              <li
                key={`${ata.numeroAta}-${ata.uasg}`}
                data-testid={`ata-sem-gestor-${ata.numeroAta}`}
                style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', padding: '0.65rem 0', borderTop: '1px solid #e2e8f0' }}
              >
                <div style={{ flex: '1 1 240px', minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.45rem', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 800, fontSize: '0.85rem' }}>Ata {ata.numeroAta}</span>
                    <span
                      title={`Complexidade ${ROTULO_COMPLEXIDADE[ata.complexidade.nivel]}: ${ata.complexidade.motivo}`}
                      style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}
                    >
                      {ROTULO_COMPLEXIDADE[ata.complexidade.nivel]} · {ata.complexidade.motivo}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{ata.fornecedorNome || '—'}</div>
                  <div title={ata.objeto} style={{ fontSize: '0.78rem', color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {ata.objeto || '—'}
                  </div>
                </div>

                <CarteiraPrazoPill faixa={ata.faixa} diasRestantes={ata.dias} />

                <div style={{ flex: '1 1 200px', minWidth: 0, fontSize: '0.78rem', display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
                  <span title={ata.vinculados.length ? `Vinculados: ${ata.vinculados.join(', ')}` : undefined} style={{ fontWeight: 700, color: ata.vinculados.length ? '#0f172a' : '#94a3b8' }}>
                    {ata.vinculados.length ? `${plural(ata.vinculados.length, 'contrato vinculado', 'contratos vinculados')} (vão junto)` : 'Nenhum contrato vinculado'}
                  </span>
                  {ata.provaveis.length > 0 && (
                    <span title={`Prováveis: ${ata.provaveis.join(', ')}`} style={{ color: '#b45309', fontWeight: 700 }}>
                      {plural(ata.provaveis.length, 'contrato provável', 'contratos prováveis')} a vincular: {listar(ata.provaveis)}
                    </span>
                  )}
                </div>

                {podeAtribuir && (
                  <button
                    type="button"
                    onClick={() => onAtribuir(ata)}
                    data-testid={`ata-sem-gestor-atribuir-${ata.numeroAta}`}
                    style={{ ...carteiraButton, color: '#15803d', borderColor: '#bbf7d0', background: '#f0fdf4' }}
                  >
                    <UserPlus size={13} /> Atribuir
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', padding: '0.6rem 0', borderTop: '1px solid #e2e8f0', fontSize: '0.78rem', color: '#64748b' }}>
          <span>Mostrando {shown.length} de {plural(atas.length, 'ata', 'atas')}</span>
          {shown.length < atas.length && (
            <button type="button" onClick={() => setVisible((v) => v + MORE_SIZE)} style={carteiraButton}>
              Mostrar mais {Math.min(MORE_SIZE, atas.length - shown.length)} <ArrowRight size={13} />
            </button>
          )}
        </div>
      </div>
    </section>
  );
};
