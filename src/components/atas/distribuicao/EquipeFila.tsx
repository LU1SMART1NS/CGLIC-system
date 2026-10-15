import React from 'react';
import { CarteiraFilterBar } from '../../carteira/CarteiraFilterBar';
import { CarteiraNoResults } from '../../carteira/CarteiraNoResults';
import { CarteiraSortHeader } from '../../carteira/CarteiraSortHeader';
import { CARTEIRA_EXPANDED_CELL_STYLE } from '../../carteira/CarteiraDetailLabel';
import { ActionButton } from '../../../design-system/components/ActionButton';
import { carteiraTableShell, carteiraTd, carteiraTh } from '../../carteira/carteiraStyles';
import { hasActiveCarteiraFilters, useCarteiraFilters, type CarteiraFilterSchema } from '../../carteira/carteiraFilters';
import { useCarteiraSort, type CarteiraSortColumn } from '../../carteira/useCarteiraSort';
import { formatCurrencyCompact } from '../../carteira/carteiraFormat';
import type { ManagerTarget } from '../../../services/managerAssignmentService';
import { DistribuicaoItens } from './DistribuicaoItens';
import type { DistribuicaoLinha } from './distribuicaoEquipe';
import type { ContratoAVincular } from './contratosSemAta';
import { PESO_COMPLEXIDADE, ROTULO_COMPLEXIDADE, type NivelComplexidade } from './complexidade';
import { contemBusca } from './filaComum';
import { AlterarNivelModal } from './AlterarNivelModal';
import { NivelPainel } from './NivelPainel';
import { ROTULO_NIVEL, avaliarSubida, mesAno, percentual, type AvaliacaoSubida, type NivelGestor, type NivelRegistrado } from './nivelGestor';

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

const RELACAO_ROTULO = { ACIMA: 'Acima da média', NA_MEDIA: 'Na média', ABAIXO: 'Abaixo da média' } as const;

/**
 * Ocupação e complexidade numa coluna só: a barra tem o tamanho da ocupação (carga ÷ capacidade do nível), dividida
 * pelo peso de cada complexidade; o tracejado marca a média da equipe. Sem número: a palavra já diz a situação.
 */
const OcupacaoCell: React.FC<{ l: DistribuicaoLinha; escala: number; media: number | null }> = ({ l, escala, media }) => {
  const largura = escala > 0 ? Math.min(l.ocupacao / escala, 1) * 100 : 0;
  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', minWidth: '190px' }}
      title={`A barra mostra a ocupação (carga ÷ capacidade do nível ${percentual(l.capacidade)}), dividida pelo peso de cada complexidade. O tracejado é a média da equipe.`}
    >
      {l.relacaoEquipe && (
        <span
          data-testid={`distribuicao-relacao-${l.gestorNome}`}
          style={{ fontSize: '0.78rem', fontWeight: 800, color: l.relacaoEquipe === 'ACIMA' ? 'var(--color-danger-text)' : '#475569', whiteSpace: 'nowrap' }}
        >
          {RELACAO_ROTULO[l.relacaoEquipe]}
        </span>
      )}
      <div style={{ position: 'relative', height: '10px', background: '#f1f5f9', borderRadius: '3px' }} aria-hidden="true">
        <div style={{ display: 'flex', gap: '1px', height: '100%', width: `${largura}%`, borderRadius: '3px', overflow: 'hidden' }}>
          {NIVEIS.map((n) => (
            <div key={n} style={{ flex: l.complexidade[n] * PESO_COMPLEXIDADE[n], background: COR_COMPLEXIDADE[n] }} />
          ))}
        </div>
        {media !== null && escala > 0 && (
          <span style={{ position: 'absolute', top: '-3px', bottom: '-3px', left: `${Math.min(media / escala, 1) * 100}%`, borderLeft: '2px dashed #64748b' }} />
        )}
      </div>
      <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', whiteSpace: 'nowrap' }}>
        {NIVEIS.map((n) => `${l.complexidade[n]} ${ROTULO_COMPLEXIDADE[n]}`).join(' · ')}
      </div>
    </div>
  );
};

const COR_NIVEL: Record<NivelGestor, { bg: string; fg: string }> = {
  INICIANTE: { bg: 'var(--color-warning-bg-strong)', fg: 'var(--color-warning-text)' },
  INTERMEDIARIO: { bg: 'var(--color-info-bg)', fg: 'var(--color-info-text-strong)' },
  AVANCADO: { bg: 'var(--color-success-bg-strong)', fg: 'var(--color-success-text)' }
};

const seloStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', fontSize: '0.75rem', fontWeight: 800, padding: '0.15rem 0.5rem', borderRadius: '4px', whiteSpace: 'nowrap' };

export const SeloNivel: React.FC<{ nivel: NivelGestor | null | undefined }> = ({ nivel }) =>
  nivel ? (
    <span style={{ ...seloStyle, background: COR_NIVEL[nivel].bg, color: COR_NIVEL[nivel].fg }}>{ROTULO_NIVEL[nivel]}</span>
  ) : (
    <span style={{ ...seloStyle, background: '#f1f5f9', color: '#475569' }} title="Até o coordenador informar, a ocupação usa a capacidade de Intermediário.">
      Não informado
    </span>
  );

const NivelCell: React.FC<{ registro: NivelRegistrado | null; avaliacao: AvaliacaoSubida | null }> = ({ registro, avaliacao }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', alignItems: 'flex-start' }}>
    <SeloNivel nivel={registro?.nivel} />
    {registro && <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', whiteSpace: 'nowrap' }}>desde {mesAno(registro.desde)}</span>}
    {avaliacao?.pronto && (
      <span style={{ ...seloStyle, background: '#ffffff', color: 'var(--color-success-text)', border: '1px dashed var(--color-success-text)' }}>
        ↑ Pronto para {ROTULO_NIVEL[avaliacao.proximo]}
      </span>
    )}
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
  ocupacao: { value: (l) => l.ocupacao, firstDir: 'desc' }
};

const TITULO_OCUPACAO =
  `Carga ajustada ao nível. Pesos: Alta ${PESO_COMPLEXIDADE.ALTA} (serviço/TIC com 12+ meses, obra ou engenharia; ata com 6+ itens), ` +
  `Média ${PESO_COMPLEXIDADE.MEDIA}, Baixa ${PESO_COMPLEXIDADE.BAIXA} (compra de até 12 meses; ata com 1 item). ` +
  `Capacidade: Iniciante 60%, Intermediário 85%, Avançado 100%.`;

/** Nível de um gestor da linha: conta (para alterar) e nível gravado. */
export interface NivelDoGestor {
  userId: string | null;
  registro: NivelRegistrado | null;
}

interface EquipeFilaProps {
  /** Linhas com gestor (a carteira sem gestor fica nas filas). */
  linhas: DistribuicaoLinha[];
  mediaOcupacao: number | null;
  canAssign: boolean;
  canAjustar: boolean;
  aVincularDe: (gestorNome: string) => ContratoAVincular[];
  /** Abre o "Para quem atribuo?" (carteira inteira ou itens marcados de um gestor). */
  onTransfer: (targets: ManagerTarget[], origem: string, done?: () => void) => void;
  /** Nível de cada gestor (migration 140). */
  nivelDe: (gestorNome: string) => NivelDoGestor;
  /** Desde quando o gestor atual cuida do instrumento (para os critérios de subida). */
  gestorDesde: (tipo: 'ATA' | 'CONTRATO', chave: string) => string | undefined;
}

/** Carga de cada gestor: nível, carteira vigente, ocupação (com a complexidade) e pressão do momento. */
export const EquipeFila: React.FC<EquipeFilaProps> = ({ linhas, mediaOcupacao, canAssign, canAjustar, aVincularDe, onTransfer, nivelDe, gestorDesde }) => {
  const [expanded, setExpanded] = React.useState<string | null>(null);
  const [alterando, setAlterando] = React.useState<{ nome: string; userId: string; sugerido?: NivelGestor; motivo?: string } | null>(null);
  const { filters, setFilter, resetFilters } = useCarteiraFilters(SCHEMA);
  const hasActive = hasActiveCarteiraFilters(SCHEMA, filters);
  const filtradas = React.useMemo(() => linhas.filter((l) => contemBusca(filters.busca, l.gestorNome)), [linhas, filters.busca]);
  const { sorted, sortKey, sortDir, toggle } = useCarteiraSort(filtradas, COLUNAS);
  const sort = { activeKey: sortKey, activeDir: sortDir, onSort: toggle };

  // Mesma régua para todas as barras: a maior ocupação da equipe ocupa quase toda a largura.
  const escala = React.useMemo(() => Math.max(0, ...linhas.map((l) => l.ocupacao), mediaOcupacao ?? 0) * 1.1, [linhas, mediaOcupacao]);
  const avaliacoes = React.useMemo(() => {
    const map = new Map<string, AvaliacaoSubida | null>();
    for (const l of linhas) {
      if (!l.gestorNome) continue;
      map.set(
        l.gestorNome,
        avaliarSubida({
          nivel: nivelDe(l.gestorNome).registro,
          atrasadas: l.pendencias.atrasadas,
          itens: l.itens.map((i) => ({
            rotulo: `${i.tipo === 'ATA' ? 'Ata' : 'Contrato'} ${i.numero}`,
            complexidade: i.complexidade.nivel,
            gestorDesde: gestorDesde(i.tipo, i.chave)
          }))
        })
      );
    }
    return map;
  }, [linhas, nivelDe, gestorDesde]);
  const media = mediaOcupacao !== null ? ' · o tracejado na barra é a média da equipe' : '';
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
                  <th style={carteiraTh}>Nível</th>
                  <CarteiraSortHeader label="Carteira" sortKey="carteira" {...sort} />
                  <CarteiraSortHeader label="Ocupação" sortKey="ocupacao" hint={TITULO_OCUPACAO} {...sort} />
                  <th style={carteiraTh}>Pressão agora</th>
                  <th style={{ ...carteiraTh, textAlign: 'right' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((l) => {
                  const nome = l.gestorNome as string;
                  const isExpanded = expanded === nome;
                  const nivel = nivelDe(nome);
                  const avaliacao = avaliacoes.get(nome) ?? null;
                  return (
                    <React.Fragment key={nome}>
                      <tr data-testid={`distribuicao-row-${nome}`}>
                        <td data-role="expand" style={{ ...carteiraTd, padding: '0.7rem 0.4rem', textAlign: 'center' }}>
                          <ActionButton
                            action={isExpanded ? 'recolher' : 'expandir'}
                            iconOnly
                            type="button"
                            size="xs"
                            onClick={() => setExpanded(isExpanded ? null : nome)}
                            expanded={isExpanded}
                            label={isExpanded ? 'Recolher atas e contratos' : 'Ver atas e contratos'}
                            data-testid={`distribuicao-expand-${nome}`}
                          />
                        </td>
                        <td style={{ ...carteiraTd, minWidth: '160px' }}>
                          <span style={{ fontWeight: 800 }}>{nome}</span>
                        </td>
                        <td data-label="Nível" style={carteiraTd}>
                          <NivelCell registro={nivel.registro} avaliacao={avaliacao} />
                        </td>
                        <td data-label="Carteira" style={{ ...carteiraTd, whiteSpace: 'nowrap' }}>
                          <CarteiraCell l={l} />
                        </td>
                        <td data-label="Ocupação" style={carteiraTd} data-testid={`distribuicao-ocupacao-${nome}`}>
                          <OcupacaoCell l={l} escala={escala} media={mediaOcupacao} />
                        </td>
                        <td data-label="Pressão agora" style={carteiraTd}>
                          <PressaoCell l={l} aVincular={aVincularDe(nome).length} />
                        </td>
                        <td data-role="action" style={{ ...carteiraTd, textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'inline-flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
                            {canAssign && (l.ataKeys.length > 0 || l.contractKeys.length > 0) && (
                              <ActionButton action="transferir"
                                type="button"
                                size="sm"
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
                               />
                            )}
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="carteira-expanded" data-testid={`distribuicao-expanded-${nome}`}>
                          <td colSpan={7} style={CARTEIRA_EXPANDED_CELL_STYLE}>
                            <NivelPainel
                              nome={nome}
                              nivel={nivel}
                              avaliacao={avaliacao}
                              capacidade={l.capacidade}
                              podeAlterar={canAjustar}
                              onAlterar={(sugerido, motivo) => nivel.userId && setAlterando({ nome, userId: nivel.userId, sugerido, motivo })}
                            />
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

      {alterando && (
        <AlterarNivelModal
          userId={alterando.userId}
          nome={alterando.nome}
          atual={nivelDe(alterando.nome).registro}
          sugerido={alterando.sugerido}
          motivoInicial={alterando.motivo}
          carga={linhas.find((l) => l.gestorNome === alterando.nome)?.equivalente ?? 0}
          onClose={() => setAlterando(null)}
        />
      )}
    </section>
  );
};
