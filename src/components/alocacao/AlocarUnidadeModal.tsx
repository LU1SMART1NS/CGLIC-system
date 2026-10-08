import React from 'react';
import { Link } from 'react-router-dom';
import { ActionButton, AlertCard, AppButton, Modal } from '../../design-system';
import { useDepartments } from '../../hooks/useDepartments';
import { useItemAllocations } from '../../hooks/useItemAllocations';
import { useItemEmpenhoLinks } from '../../hooks/useItemEmpenhoLinks';
import { useItemEmpenhoVinculos } from '../../hooks/useItemEmpenhoVinculos';
import { useSaveAllocations } from '../../hooks/useSaveAllocations';
import { useSaveEmpenhoLinks } from '../../hooks/useSaveEmpenhoLinks';
import { summarizeAllocationExecution } from '../../utils/allocationExecution';
import { avaliarEdicao, linhasIniciais, listaParaGravar, normUnidade, vinculosSemRemovidas, type LinhaAlocacao } from '../../utils/alocacaoEdicao';
import { normalizeItemKey } from '../../utils/itemKeyUtils';
import { formatNumber } from '../item-balances/itemBalanceUtils';

export interface ItemParaAlocar {
  numeroAta: string;
  uasg: string;
  numeroItem: string;
  descricao?: string;
  /** Quantitativo SENASP do item: o teto da soma das alocações. */
  quantitativoSenasp: number;
}

interface AlocarUnidadeModalProps {
  /** Item a alocar; nulo fecha a janela. */
  item: ItemParaAlocar | null;
  onFechar: () => void;
  onAlocado?: () => void;
  /** Alocação cuja quantidade recebe o foco ao abrir (lápis da tabela do Item 360). */
  focoId?: string | null;
  /** Alocação que já abre marcada para remover (lixeira da tabela do Item 360); só vale se puder ser removida. */
  removerId?: string | null;
}

/** Cores das fatias da régua, na ordem das unidades. */
const CORES = ['#1351b4', '#168821', '#c2850c', '#7b3fa0', '#0f7b8a', '#c4161c', '#5992ed', '#636363'];
const CINZA = '#64748b';
const secaoStyle: React.CSSProperties = { margin: '0 0 0.4rem', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: CINZA };
const thStyle: React.CSSProperties = { textAlign: 'left', fontSize: '0.75rem', fontWeight: 700, color: CINZA, padding: '0.4rem 0.5rem', borderBottom: '1px solid #e2e8f0' };
const tdStyle: React.CSSProperties = { padding: '0.5rem', borderBottom: '1px solid #e2e8f0', verticalAlign: 'middle' };
const qtdStyle: React.CSSProperties = { width: '120px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: '0.85rem', padding: '0.4rem 0.6rem', border: '1px solid #cbd5e1', borderRadius: '6px' };
const FUNDO_LINHA = { alterada: 'var(--color-warning-bg)', removida: 'var(--color-danger-bg)', adicionada: 'var(--color-success-bg)' };

/** Catálogo de Unidades Internas vazio: não há a quem alocar. */
export const CatalogoVazioAviso: React.FC = () => (
  <div data-testid="allocation-unavailable" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.88rem', color: '#334155' }}>
    <p style={{ margin: 0 }}>O catálogo de Unidades Internas está vazio. Cadastre as unidades para poder alocar quantitativo.</p>
    <Link to="/admin/departamentos" style={{ fontWeight: 700, color: 'var(--primary)', textDecoration: 'none' }}>
      Abrir Unidades Internas
    </Link>
  </div>
);

/**
 * Janela "Alocação do item", a mesma na fila Itens às unidades e na aba Alocação interna do Item 360: lista as
 * unidades já alocadas com o empenhado de cada uma, edita a quantidade na linha, remove (só sem empenho vinculado)
 * e acrescenta unidades; tudo é gravado de uma vez (save_allocations_atomic, versionado). Regras em alocacaoEdicao.
 */
export const AlocarUnidadeModal: React.FC<AlocarUnidadeModalProps> = ({ item, ...rest }) =>
  item ? <JanelaAlocacao key={`${item.numeroAta}-${item.uasg}-${item.numeroItem}`} item={item} {...rest} /> : null;

const JanelaAlocacao: React.FC<Omit<AlocarUnidadeModalProps, 'item'> & { item: ItemParaAlocar }> = ({ item, onFechar, onAlocado, focoId, removerId }) => {
  const itemKey = normalizeItemKey(item.numeroAta, item.uasg, item.numeroItem);
  const { data: departments = [], isLoading: departmentsLoading } = useDepartments();
  const { data: estado, isLoading: alocacoesLoading } = useItemAllocations(item.numeroAta, item.uasg, item.numeroItem);
  const { data: linksState, isLoading: linksLoading } = useItemEmpenhoLinks(item.numeroAta, item.uasg, item.numeroItem);
  const { data: vinculos = [], isLoading: vinculosLoading } = useItemEmpenhoVinculos(itemKey);
  const salvarAlocacoes = useSaveAllocations();
  const salvarLinks = useSaveEmpenhoLinks();
  const carregando = departmentsLoading || alocacoesLoading || linksLoading || vinculosLoading;
  const salvando = salvarAlocacoes.isPending || salvarLinks.isPending;

  // Linhas gravadas (derivadas das alocações e dos empenhos); a primeira edição passa a valer no lugar delas.
  const iniciais = React.useMemo(() => {
    if (carregando) return null;
    const gravadas = estado?.allocations ?? [];
    const exec = summarizeAllocationExecution(gravadas, vinculos, linksState?.links ?? {});
    return linhasIniciais(gravadas, exec.porAlocacao).map((l) => (l.id === removerId && l.vinculados === 0 ? { ...l, removida: true } : l));
  }, [carregando, estado, vinculos, linksState, removerId]);
  const [editadas, setEditadas] = React.useState<LinhaAlocacao[] | null>(null);
  const linhas = editadas ?? iniciais;
  const setLinhas = (f: (ls: LinhaAlocacao[]) => LinhaAlocacao[]) => setEditadas((prev) => f(prev ?? iniciais ?? []));
  const [novaUnidade, setNovaUnidade] = React.useState('');
  const [novaQtd, setNovaQtd] = React.useState('');
  const [erro, setErro] = React.useState<string | null>(null);

  const lista = linhas ?? [];
  const aval = avaliarEdicao(lista, item.quantitativoSenasp);
  const ocupadas = new Set(lista.filter((l) => !l.removida).map((l) => normUnidade(l.unitName)));
  const livres = departments.filter((d) => !ocupadas.has(normUnidade(d.sigla)));
  const unidadeEscolhida = livres.some((d) => d.sigla === novaUnidade) ? novaUnidade : (livres[0]?.sigla ?? '');
  const catalogoVazio = !departmentsLoading && departments.length === 0;
  const nomeDe = (sigla: string) => departments.find((d) => normUnidade(d.sigla) === normUnidade(sigla))?.nomeCompleto;

  const alterar = (id: string, mudanca: Partial<LinhaAlocacao>) => setLinhas((ls) => ls.map((l) => (l.id === id ? { ...l, ...mudanca } : l)));
  const remover = (l: LinhaAlocacao) => (l.adicionada ? setLinhas((ls) => ls.filter((x) => x.id !== l.id)) : alterar(l.id, { removida: true }));
  const desfazer = (l: LinhaAlocacao) => alterar(l.id, { removida: false, qtd: l.original });

  const adicionar = () => {
    const n = Number(novaQtd);
    if (!unidadeEscolhida) return;
    if (!Number.isFinite(n) || n <= 0) return setErro('Informe a quantidade da nova unidade (maior que zero).');
    // Unidade removida nesta edição e acrescentada de novo: volta a linha original com a nova quantidade.
    const antiga = lista.find((l) => l.removida && normUnidade(l.unitName) === normUnidade(unidadeEscolhida));
    if (antiga) alterar(antiga.id, { removida: false, qtd: n });
    else setLinhas((ls) => [...ls, { id: Date.now().toString(), unitName: unidadeEscolhida, original: 0, qtd: n, empenhado: 0, vinculados: 0, removida: false, adicionada: true }]);
    setNovaQtd('');
    setErro(null);
  };

  const salvar = async () => {
    if (!aval.podeSalvar || !linhas) return;
    setErro(null);
    try {
      await salvarAlocacoes.mutateAsync({ itemKey, allocations: listaParaGravar(linhas, estado?.allocations ?? []), expectedVersion: estado?.version });
    } catch (err: any) {
      if (err?.code === 'CONCURRENT_MODIFICATION_ERROR' || err?.sqlState === '40001') {
        setErro('As alocações deste item mudaram por outro usuário. Feche e abra de novo antes de salvar.');
      } else if (err?.code === 'UNAUTHORIZED' || err?.sqlState === '42501') {
        setErro('Só o coordenador e o gestor de saldos alocam quantitativo.');
      } else {
        setErro(err?.message || 'Não foi possível gravar as alocações.');
      }
      return;
    }
    // Vínculos antigos que ainda apontem para unidade removida (empenho que saiu do item) são limpos.
    const links = vinculosSemRemovidas(linksState?.links ?? {}, linhas);
    if (links) {
      try {
        await salvarLinks.mutateAsync({ itemKey, links, expectedVersion: linksState?.version ?? 1 });
      } catch {
        onAlocado?.();
        return setErro('As alocações foram salvas, mas não deu para limpar vínculos antigos de empenho das unidades removidas. Feche e abra de novo para conferir.');
      }
    }
    onAlocado?.();
    onFechar();
  };

  const base = Math.max(item.quantitativoSenasp, aval.totalAlocado, 1);
  const ativas = lista.filter((l) => !l.removida);
  const corDe = (id: string) => CORES[lista.findIndex((l) => l.id === id) % CORES.length];

  return (
    <Modal
      isOpen
      onClose={onFechar}
      title="Alocação do item"
      subtitle={`Ata ${item.numeroAta} · item ${item.numeroItem}${item.descricao ? ` · ${item.descricao}` : ''}`}
      size="lg"
      dismissible={!salvando}
      testId="alocar-unidade-modal"
      footer={
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.6rem', width: '100%', justifyContent: 'space-between' }}>
          <span data-testid="alocar-unidade-resumo" style={{ fontSize: '0.8rem', color: CINZA, flex: '1 1 260px', minWidth: 0 }}>
            {aval.mudancas.length === 0 ? (
              'Nenhuma alteração.'
            ) : (
              <>
                <strong style={{ color: '#1e293b' }}>{aval.mudancas.length} {aval.mudancas.length === 1 ? 'alteração' : 'alterações'}:</strong> {aval.mudancas.join(' · ')}
              </>
            )}
          </span>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <ActionButton action={catalogoVazio ? 'fechar' : 'cancelar'} type="button" size="sm" onClick={onFechar} disabled={salvando} />
            {!catalogoVazio && (
              <AppButton type="button" variant="primary" size="sm" onClick={() => void salvar()} isLoading={salvando} disabled={salvando || carregando || !aval.podeSalvar} data-testid="alocar-unidade-salvar">
                Salvar alterações
              </AppButton>
            )}
          </div>
        </div>
      }
    >
      {catalogoVazio ? (
        <CatalogoVazioAviso />
      ) : carregando || !linhas ? (
        <p style={{ margin: 0, fontSize: '0.85rem', color: CINZA }}>Carregando as alocações do item…</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
          {/* Régua: quantitativo SENASP, fatia de cada unidade e o que falta alocar */}
          <div data-testid="alocar-unidade-regua">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem 1.25rem', fontSize: '0.82rem', color: '#334155', marginBottom: '0.45rem', fontVariantNumeric: 'tabular-nums' }}>
              <span>Quantitativo SENASP <strong>{formatNumber(item.quantitativoSenasp)}</strong></span>
              <span>Alocado <strong>{formatNumber(aval.totalAlocado)}</strong></span>
              <span>
                A alocar <strong style={{ color: aval.aAlocar < 0 ? 'var(--color-danger-text)' : undefined }}>{formatNumber(aval.aAlocar)}</strong>
              </span>
            </div>
            <div aria-hidden="true" style={{ display: 'flex', height: '10px', borderRadius: '5px', overflow: 'hidden', background: '#e2e8f0' }}>
              {ativas.map((l) => (
                <span key={l.id} title={`${l.unitName} ${formatNumber(Number(l.qtd) || 0)}`} style={{ width: `${((Number(l.qtd) || 0) / base) * 100}%`, background: corDe(l.id) }} />
              ))}
              {aval.aAlocar < 0 && <span style={{ width: `${(-aval.aAlocar / base) * 100}%`, background: 'var(--color-danger-solid)' }} />}
            </div>
            {ativas.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.2rem 0.9rem', marginTop: '0.4rem', fontSize: '0.75rem', color: CINZA }}>
                {ativas.map((l) => (
                  <span key={l.id}>
                    <i style={{ display: 'inline-block', width: '9px', height: '9px', borderRadius: '2px', background: corDe(l.id), marginRight: '0.3rem', verticalAlign: '-1px' }} />
                    {l.unitName} {formatNumber(Number(l.qtd) || 0)}
                  </span>
                ))}
              </div>
            )}
          </div>

          {(erro || aval.erros.length > 0) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {erro && <AlertCard severity="CRITICA" title={erro} testId="alocar-unidade-erro" />}
              {aval.erros.map((e) => (
                <p key={e} role="alert" data-testid="alocar-unidade-regra" style={{ margin: 0, fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-danger-text)' }}>
                  {e}
                </p>
              ))}
            </div>
          )}

          <div>
            <p style={secaoStyle}>Unidades com alocação</p>
            {lista.length === 0 ? (
              <p style={{ margin: 0, fontSize: '0.85rem', color: CINZA }}>Nenhuma unidade alocada neste item ainda.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table data-testid="alocar-unidade-lista" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Unidade interna</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Empenhado</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Alocado</th>
                      <th style={thStyle} aria-label="Ações" />
                    </tr>
                  </thead>
                  <tbody>
                    {lista.map((l) => {
                      const a = aval.porLinha.get(l.id)!;
                      const fundo = l.removida ? FUNDO_LINHA.removida : l.adicionada ? FUNDO_LINHA.adicionada : a.alterada ? FUNDO_LINHA.alterada : undefined;
                      const td = { ...tdStyle, background: fundo };
                      const riscado: React.CSSProperties = l.removida ? { textDecoration: 'line-through', color: CINZA } : {};
                      return (
                        <tr key={l.id} data-testid={`alocar-unidade-linha-${l.unitName}`}>
                          <td style={td}>
                            <strong style={{ display: 'block', ...riscado }}>{l.unitName}</strong>
                            {nomeDe(l.unitName) && <small style={{ color: CINZA, fontSize: '0.75rem' }}>{nomeDe(l.unitName)}</small>}
                          </td>
                          <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', ...riscado }}>{formatNumber(l.empenhado)}</td>
                          <td style={{ ...td, textAlign: 'right' }}>
                            {l.removida ? (
                              <span style={{ fontVariantNumeric: 'tabular-nums', ...riscado }}>{formatNumber(l.original)}</span>
                            ) : (
                              <>
                                <input
                                  type="number"
                                  min={a.minimo}
                                  value={l.qtd}
                                  autoFocus={l.id === focoId}
                                  onChange={(e) => alterar(l.id, { qtd: e.target.value === '' ? '' : Number(e.target.value) })}
                                  disabled={salvando}
                                  aria-label={`Quantidade alocada para ${l.unitName}`}
                                  aria-invalid={a.abaixoDoMinimo || undefined}
                                  data-testid={`alocar-unidade-qtd-${l.unitName}`}
                                  style={{ ...qtdStyle, borderColor: a.abaixoDoMinimo ? 'var(--color-danger-solid)' : '#cbd5e1' }}
                                />
                                {a.alterada && <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--color-warning-text)', marginTop: '0.15rem' }}>antes {formatNumber(l.original)}</span>}
                                {a.abaixoDoMinimo && <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--color-danger-text)', marginTop: '0.15rem' }}>mínimo {formatNumber(a.minimo)}{l.empenhado > 0 ? ' (empenhado)' : ''}</span>}
                              </>
                            )}
                          </td>
                          <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                            {l.removida || a.alterada ? (
                              <ActionButton action="desfazer" iconOnly label={`Desfazer a mudança em ${l.unitName}`} onClick={() => desfazer(l)} disabled={salvando} />
                            ) : (
                              <ActionButton
                                action="remover"
                                iconOnly
                                label={a.podeRemover ? `Remover a alocação de ${l.unitName}` : `${l.unitName} tem ${l.vinculados} ${l.vinculados === 1 ? 'empenho vinculado' : 'empenhos vinculados'}. Para remover, desvincule os empenhos na aba Contratos e empenhos.`}
                                onClick={() => remover(l)}
                                disabled={salvando || !a.podeRemover}
                                data-testid={`alocar-unidade-remover-${l.unitName}`}
                              />
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div>
            <p style={secaoStyle}>Alocar a outra unidade</p>
            {livres.length === 0 ? (
              <p style={{ margin: 0, fontSize: '0.82rem', color: CINZA }}>
                Todas as unidades do catálogo já têm alocação neste item. Para alocar a outra, cadastre-a em{' '}
                <Link to="/admin/departamentos" style={{ fontWeight: 700, color: 'var(--primary)', textDecoration: 'none' }}>Unidades Internas</Link>.
              </p>
            ) : (
              <>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center', padding: '0.6rem', border: '1px dashed #cbd5e1', borderRadius: '8px', background: '#f8fafc' }}>
                  <select
                    className="form-input"
                    value={unidadeEscolhida}
                    onChange={(e) => setNovaUnidade(e.target.value)}
                    disabled={salvando}
                    aria-label="Unidade interna"
                    data-testid="alocar-unidade-select"
                    style={{ flex: '1 1 240px', minWidth: 0, fontWeight: 700, color: 'var(--primary)', fontSize: '0.85rem', padding: '0.45rem 0.6rem', border: '1px solid #cbd5e1', borderRadius: '6px' }}
                  >
                    {livres.map((d) => (
                      <option key={d.id} value={d.sigla}>
                        {d.sigla} — {d.nomeCompleto}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min="1"
                    placeholder="Quantidade"
                    value={novaQtd}
                    onChange={(e) => setNovaQtd(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); adicionar(); } }}
                    disabled={salvando}
                    aria-label="Quantidade da nova unidade"
                    data-testid="alocar-unidade-qtd"
                    style={qtdStyle}
                  />
                  <ActionButton action="adicionar" size="sm" onClick={adicionar} disabled={salvando} data-testid="alocar-unidade-adicionar" />
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '0.5rem', marginTop: '0.4rem' }}>
                  <AppButton type="button" variant="link" size="sm" onClick={() => setNovaQtd(String(Math.max(0, aval.aAlocar)))} disabled={salvando || aval.aAlocar <= 0}>
                    Usar todo o saldo a alocar ({formatNumber(Math.max(0, aval.aAlocar))})
                  </AppButton>
                  <Link to="/admin/departamentos" style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--primary)', textDecoration: 'none' }}>
                    Gerenciar Unidades Internas
                  </Link>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
};
