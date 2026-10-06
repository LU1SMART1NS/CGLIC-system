import React from 'react';
import { ArrowLeftRight, ChevronDown, ChevronRight } from 'lucide-react';
import { CarteiraFilterBar } from '../../carteira/CarteiraFilterBar';
import { CarteiraNoResults } from '../../carteira/CarteiraNoResults';
import { CarteiraSortHeader } from '../../carteira/CarteiraSortHeader';
import { CARTEIRA_EXPANDED_CELL_STYLE } from '../../carteira/CarteiraDetailLabel';
import { carteiraButton, carteiraTableShell, carteiraTd, carteiraTh } from '../../carteira/carteiraStyles';
import { hasActiveCarteiraFilters, useCarteiraFilters, type CarteiraFilterSchema } from '../../carteira/carteiraFilters';
import { useCarteiraSort, type CarteiraSortColumn } from '../../carteira/useCarteiraSort';
import { formatCurrencyCompact } from '../../carteira/carteiraFormat';
import type { ManagerTarget } from '../../../services/managerAssignmentService';
import { DistribuicaoItens } from './DistribuicaoItens';
import { FAIXA_MEDIA_EQUIPE, type DistribuicaoLinha } from './distribuicaoEquipe';
import type { ContratoAVincular } from './contratosSemAta';
import { PESO_COMPLEXIDADE, ROTULO_COMPLEXIDADE, type NivelComplexidade } from './complexidade';
import { contemBusca } from './filaComum';

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** Cores das faixas de complexidade (barra empilhada e legenda). */
export const COR_COMPLEXIDADE: Record<NivelComplexidade, string> = { ALTA: 'var(--primary)', MEDIA: '#5b8bd6', BAIXA: '#c7d7f0' };
const NIVEIS: NivelComplexidade[] = ['ALTA', 'MEDIA', 'BAIXA'];

const CarteiraCell: React.FC<{ l: DistribuicaoLinha }> = ({ l }) => (
  <div title={`Valor registrado das atas: ${formatCurrencyCompact(l.atas.valor)} · Valor vigente dos contratos: ${formatCurrencyCompact(l.contratos.valor)}`}>
    <div style={{ fontWeight: 800 }}>
      {plural(l.atas.vigentes, 'ata', 'atas')} · {plural(l.contratos.vigentes, 'contrato', 'contratos')}
    </div>
  </div>
);

/** Composição da carteira por complexidade: barra empilhada e "3 A · 6 M · 4 B". */
const ComplexidadeCell: React.FC<{ l: DistribuicaoLinha }> = ({ l }) => {
  const total = l.complexidade.ALTA + l.complexidade.MEDIA + l.complexidade.BAIXA;
  return (
    <div style={{ minWidth: '130px' }}>
      <div style={{ display: 'flex', height: '8px', borderRadius: '4px', overflow: 'hidden', background: '#f1f5f9' }} aria-hidden="true">
        {total > 0 && NIVEIS.map((n) => <div key={n} style={{ width: `${(l.complexidade[n] / total) * 100}%`, background: COR_COMPLEXIDADE[n] }} />)}
      </div>
      <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginTop: '0.25rem', whiteSpace: 'nowrap' }}>
        {NIVEIS.map((n) => `${l.complexidade[n]} ${ROTULO_COMPLEXIDADE[n].charAt(0)}`).join(' · ')}
      </div>
    </div>
  );
};

const RELACAO_ROTULO = { ACIMA: 'Acima da média', NA_MEDIA: 'Na média', ABAIXO: 'Abaixo da média' } as const;

/** Carga equivalente e posição neutra em relação à equipe (sem ranking, sem cor de alerta). */
const CargaEquivalenteCell: React.FC<{ l: DistribuicaoLinha }> = ({ l }) => (
  <div title={`Soma dos pesos: Baixa = ${PESO_COMPLEXIDADE.BAIXA}, Média = ${PESO_COMPLEXIDADE.MEDIA}, Alta = ${PESO_COMPLEXIDADE.ALTA}`}>
    <div style={{ fontWeight: 800 }}>{l.equivalente}</div>
    {l.relacaoEquipe && <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', whiteSpace: 'nowrap' }}>{RELACAO_ROTULO[l.relacaoEquipe]}</div>}
  </div>
);

/** Pressão do momento: o que aperta agora (não muda a carga estrutural). */
const PressaoCell: React.FC<{ l: DistribuicaoLinha; aVincular?: number }> = ({ l, aVincular = 0 }) => {
  const vencendo = l.atas.criticos + l.atas.atencao + l.contratos.criticos + l.contratos.atencao;
  const partes: Array<{ texto: string; cor: string }> = [];
  if (l.pendencias.urgentes > 0) partes.push({ texto: plural(l.pendencias.urgentes, 'urgente', 'urgentes'), cor: 'var(--color-danger-text)' });
  if (l.pendencias.atrasadas > 0) partes.push({ texto: plural(l.pendencias.atrasadas, 'tarefa atrasada', 'tarefas atrasadas'), cor: 'var(--color-danger-text)' });
  if (l.pendencias.acompanhar > 0) partes.push({ texto: `${l.pendencias.acompanhar} a acompanhar`, cor: 'var(--color-warning-text)' });
  if (vencendo > 0) partes.push({ texto: `${vencendo} ${vencendo === 1 ? 'vence' : 'vencem'} em até 90 dias`, cor: 'var(--color-warning-text)' });
  if (aVincular > 0) partes.push({ texto: `${aVincular} ${aVincular === 1 ? 'contrato' : 'contratos'} a vincular`, cor: 'var(--color-info-text-strong)' });
  if (partes.length === 0) return <span style={{ color: '#94a3b8' }}>—</span>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem', fontSize: '0.75rem', fontWeight: 700 }}>
      {partes.map((p) => (
        <span key={p.texto} style={{ color: p.cor, whiteSpace: 'nowrap' }}>{p.texto}</span>
      ))}
    </div>
  );
};

const SCHEMA: CarteiraFilterSchema<{ busca: string }> = { busca: { param: 'busca', default: '' } };

const COLUNAS: Record<string, CarteiraSortColumn<DistribuicaoLinha>> = {
  gestor: { value: (l) => l.gestorNome },
  carteira: { value: (l) => l.atas.vigentes + l.contratos.vigentes, firstDir: 'desc' },
  carga: { value: (l) => l.equivalente, firstDir: 'desc' }
};

const TITULO_COMPLEXIDADE =
  `Alta (peso ${PESO_COMPLEXIDADE.ALTA}): serviço/TIC com 12+ meses, obra ou engenharia; ata com 6+ itens. ` +
  `Baixa (peso ${PESO_COMPLEXIDADE.BAIXA}): compra de até 12 meses; ata com 1 item. Média (peso ${PESO_COMPLEXIDADE.MEDIA}): o resto.`;

interface EquipeFilaProps {
  /** Linhas com gestor (a carteira sem gestor fica nas filas). */
  linhas: DistribuicaoLinha[];
  mediaEquivalente: number | null;
  canAssign: boolean;
  canAjustar: boolean;
  aVincularDe: (gestorNome: string) => ContratoAVincular[];
  /** Abre o "Para quem atribuo?" (carteira inteira ou itens marcados de um gestor). */
  onTransfer: (targets: ManagerTarget[], origem: string, done?: () => void) => void;
}

/** Carga de cada gestor: carteira vigente, complexidade, carga equivalente e pressão do momento. */
export const EquipeFila: React.FC<EquipeFilaProps> = ({ linhas, mediaEquivalente, canAssign, canAjustar, aVincularDe, onTransfer }) => {
  const [expanded, setExpanded] = React.useState<string | null>(null);
  const { filters, setFilter, resetFilters } = useCarteiraFilters(SCHEMA);
  const hasActive = hasActiveCarteiraFilters(SCHEMA, filters);
  const filtradas = React.useMemo(() => linhas.filter((l) => contemBusca(filters.busca, l.gestorNome)), [linhas, filters.busca]);
  const { sorted, sortKey, sortDir, toggle } = useCarteiraSort(filtradas, COLUNAS);
  const sort = { activeKey: sortKey, activeDir: sortDir, onSort: toggle };

  const media = mediaEquivalente !== null ? ` · média da equipe: ${mediaEquivalente.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}` : '';
  const counter = hasActive ? `Exibindo ${filtradas.length} de ${plural(linhas.length, 'gestor', 'gestores')}` : `${plural(linhas.length, 'gestor', 'gestores')}${media}`;

  return (
    <section data-testid="distribuicao-equipe" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <CarteiraFilterBar
        busca={filters.busca}
        searchPlaceholder="Buscar gestor..."
        onChangeBusca={(v) => setFilter('busca', v)}
        hasActiveFilters={hasActive}
        onResetFilters={resetFilters}
        counter={counter}
        testIdPrefix="equipe"
      />

      {linhas.length === 0 ? (
        <div style={{ ...carteiraTableShell, padding: '1.25rem', fontSize: '0.85rem', color: '#64748b' }}>
          Nenhum gestor com atas ou contratos vigentes. Comece pela fila "Atas sem gestor".
        </div>
      ) : filtradas.length === 0 ? (
        <CarteiraNoResults title="Nenhum gestor encontrado" description="Nenhum gestor atende à busca." onResetFilters={resetFilters} />
      ) : (
        <div data-testid="distribuicao-table" style={carteiraTableShell}>
          <div style={{ overflowX: 'auto', containerType: 'inline-size' }}>
            <table className="carteira-stack" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ ...carteiraTh, width: '32px', padding: '0.65rem 0.4rem' }} aria-label="Expandir" />
                  <CarteiraSortHeader label="Gestor" sortKey="gestor" {...sort} />
                  <CarteiraSortHeader label="Carteira" sortKey="carteira" {...sort} />
                  <th style={carteiraTh} title={TITULO_COMPLEXIDADE}>Complexidade</th>
                  <CarteiraSortHeader label="Carga" sortKey="carga" {...sort} />
                  <th style={carteiraTh}>Pressão agora</th>
                  <th style={{ ...carteiraTh, textAlign: 'right' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((l) => {
                  const nome = l.gestorNome as string;
                  const isExpanded = expanded === nome;
                  return (
                    <React.Fragment key={nome}>
                      <tr data-testid={`distribuicao-row-${nome}`}>
                        <td data-role="expand" style={{ ...carteiraTd, padding: '0.7rem 0.4rem', textAlign: 'center' }}>
                          <button
                            type="button"
                            onClick={() => setExpanded(isExpanded ? null : nome)}
                            aria-expanded={isExpanded}
                            aria-label={isExpanded ? 'Recolher atas e contratos' : 'Ver atas e contratos'}
                            data-testid={`distribuicao-expand-${nome}`}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', display: 'flex', padding: '0.2rem' }}
                          >
                            {isExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                          </button>
                        </td>
                        <td style={{ ...carteiraTd, minWidth: '160px' }}>
                          <span style={{ fontWeight: 800 }}>{nome}</span>
                        </td>
                        <td data-label="Carteira" style={{ ...carteiraTd, whiteSpace: 'nowrap' }}>
                          <CarteiraCell l={l} />
                        </td>
                        <td data-label="Complexidade" style={carteiraTd}>
                          <ComplexidadeCell l={l} />
                        </td>
                        <td
                          data-label="Carga"
                          style={{ ...carteiraTd, whiteSpace: 'nowrap' }}
                          title={`Comparada à média da equipe (±${FAIXA_MEDIA_EQUIPE * 100}%)`}
                        >
                          <CargaEquivalenteCell l={l} />
                        </td>
                        <td data-label="Pressão agora" style={carteiraTd}>
                          <PressaoCell l={l} aVincular={aVincularDe(nome).length} />
                        </td>
                        <td data-role="action" style={{ ...carteiraTd, textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'inline-flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
                            {canAssign && (l.ataKeys.length > 0 || l.contractKeys.length > 0) && (
                              <button
                                type="button"
                                onClick={() =>
                                  onTransfer(
                                    [
                                      ...l.ataKeys.map((ataKey) => ({ tipo: 'ATA' as const, ataKey })),
                                      ...l.contractKeys.map((contractKey) => ({ tipo: 'CONTRATO' as const, contractKey }))
                                    ],
                                    nome
                                  )
                                }
                                data-testid={`distribuicao-transferir-${nome}`}
                                title="Passar toda a carteira vigente deste gestor para outra pessoa"
                                style={{ ...carteiraButton, color: 'var(--color-success-text)', borderColor: 'var(--color-success-border)', background: 'var(--color-success-bg)' }}
                              >
                                <ArrowLeftRight size={13} /> Transferir
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="carteira-expanded" data-testid={`distribuicao-expanded-${nome}`}>
                          <td colSpan={7} style={CARTEIRA_EXPANDED_CELL_STYLE}>
                            <DistribuicaoItens
                              linha={l}
                              canAssign={canAssign}
                              canAjustar={canAjustar}
                              aVincular={aVincularDe(nome)}
                              onTransfer={(targets, done) => onTransfer(targets, nome, done)}
                            />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
};
