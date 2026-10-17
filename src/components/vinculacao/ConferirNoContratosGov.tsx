import React, { useMemo, useState } from 'react';
import { EmptyState } from '../../design-system/components/EmptyState';
import { ListaNaoCarregou } from '../fonte/ListaNaoCarregou';
import { ActionButton, AppButton, AppSelect, AppTextarea, Modal, NoticeBar, StatusBadge, useToast } from '../../design-system';
import type { StatusBadgeVariant } from '../../design-system/components/StatusBadge';
import { useNavigateWithOrigin } from '../../hooks/useDetailOrigin';
import { useAcoesCorrecaoDaNota } from '../../hooks/useConferenciaNota';
import {
  CORRECAO_SUGERIDA,
  ROTULO_DA_CONFERENCIA,
  ROTULO_DA_CORRECAO,
  type ConferenciaDaNota,
  type CorrecaoDaNota,
  type TipoDeConferenciaDaNota
} from '../../services/conferenciaNotaService';
import { CarteiraFilterButton } from '../carteira/CarteiraFilterButton';
import { CarteiraFilterBar, CarteiraGestorSelect, carteiraCounter } from '../carteira/CarteiraFilterBar';
import { CarteiraNoResults } from '../carteira/CarteiraNoResults';
import { CarteiraPagination } from '../carteira/CarteiraPagination';
import { CarteiraSortHeader } from '../carteira/CarteiraSortHeader';
import { CarteiraIdLink, abrirAoClicarNaLinha } from '../carteira/CarteiraRowLink';
import { CarteiraCellFilter } from '../carteira/CarteiraCellFilter';
import { carteiraFornecedor, carteiraTableShell, carteiraTd, carteiraTh } from '../carteira/carteiraStyles';
import { hasActiveCarteiraFilters, useCarteiraFilters, type CarteiraFilterSchema } from '../carteira/carteiraFilters';
import { TODOS_GESTORES, listGestores, matchesGestorFilter } from '../carteira/carteiraGestor';
import { formatCurrency } from '../carteira/carteiraFormat';
import { useCarteiraPagination } from '../carteira/useCarteiraPagination';
import { useCarteiraSort, type CarteiraSortColumn } from '../carteira/useCarteiraSort';
import { uasgDaChave } from '../financeiro/useContratosDoFinanceiro';
import { normalizarBusca } from '../financeiro/financeiroFormat';
import { abrirContratosGov } from './vinculacaoEmpenhos';
import { textoDaConferenciaDaNota, type ContratoDaConferenciaDaNota } from './conferenciaNota';

interface ContratoDaLinha extends ContratoDaConferenciaDaNota {
  gestorNome?: string;
  expirado?: boolean;
}

interface Filtros {
  marca: string;
  tipo: string;
  vigencia: string;
  uasg: string;
  gestor: string;
  busca: string;
}
const TODOS = 'TODOS';
const PAGE_SIZE = 20;
const SCHEMA: CarteiraFilterSchema<Filtros> = {
  marca: { param: 'marca', default: TODOS, values: [TODOS, 'A_CONFERIR', 'CORRIGINDO'] },
  tipo: { param: 'conferencia', default: TODOS },
  vigencia: { param: 'vigencia', default: 'VIGENTES', values: ['VIGENTES', 'ENCERRADOS', TODOS] },
  uasg: { param: 'uasg', default: TODOS },
  gestor: { param: 'gestor', default: TODOS_GESTORES },
  busca: { param: 'busca', default: '' }
};
const COR: Record<TipoDeConferenciaDaNota, StatusBadgeVariant> = {
  ITEM_FORA_DO_CONTRATO: 'danger',
  ITEM_COM_OUTRO_PRECO: 'warning',
  CONTRATO_SEM_ITENS: 'info',
  VINCULO_DIFERENTE_DA_NOTA: 'warning'
};
const subtle: React.CSSProperties = { fontSize: '0.75rem', color: '#64748b', fontWeight: 600 };
const rotulo: React.CSSProperties = { fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' };
const caso: React.CSSProperties = {
  fontSize: '0.86rem',
  lineHeight: 1.45,
  padding: '0.5rem 0.7rem',
  borderLeft: '3px solid var(--primary)',
  background: 'var(--surface-2, #f8fafc)',
  borderRadius: '0 6px 6px 0'
};
const OBS_MAX = 500;

/** Conferência de uma nota aberta na própria linha: o que aconteceu, o que fazer e os dados. */
export const PainelDaConferenciaDaNota: React.FC<{
  linha: ConferenciaDaNota;
  contrato: ContratoDaConferenciaDaNota;
  podeMarcar: boolean;
  onVouCorrigir: () => void;
}> = ({ linha, contrato, podeMarcar, onVouCorrigir }) => {
  const t = textoDaConferenciaDaNota(linha, contrato);
  return (
    <div
      data-testid={`vinc-nota-conferencia-${linha.numeroOficial}`}
      aria-label={`Conferência da nota ${linha.numeroOficial}`}
      style={{
        background: 'var(--surface, #fff)',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        padding: '1rem 1.1rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.85rem',
        width: '100%',
        boxSizing: 'border-box',
        textAlign: 'left',
        whiteSpace: 'normal'
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
        <span style={rotulo}>O que aconteceu</span>
        <p style={{ margin: 0, fontSize: '0.95rem', lineHeight: 1.5, fontWeight: 600, maxWidth: '75ch' }}>{t.frase}</p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
        <span style={rotulo}>{t.tituloFazer}</span>
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
          {t.fazer.map((f) => (
            <li key={f.se} style={caso}>
              <strong>{f.se}</strong> {f.faca}
            </li>
          ))}
        </ul>
      </div>
      {linha.situacao === 'CORRECAO_NAO_CHEGOU' && linha.correcao && (
        <NoticeBar tone="warning" testId="vinc-nota-nao-chegou">
          {linha.correcao.porNome || 'Alguém'} marcou que ia corrigir em {new Date(linha.correcao.em).toLocaleDateString('pt-BR')}, e a correção ainda não chegou pela
          sincronização. Confira no Contratos.gov.br.
        </NoticeBar>
      )}
      <div
        style={{
          fontSize: '0.78rem',
          color: 'var(--text-muted)',
          lineHeight: 1.55,
          display: 'flex',
          flexDirection: 'column',
          gap: '0.15rem',
          borderTop: '1px solid var(--border)',
          paddingTop: '0.65rem'
        }}
      >
        {t.dados.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', flexWrap: 'wrap' }}>
        <AppButton variant="outline" size="sm" onClick={abrirContratosGov} title="Abre o portal em outra aba">
          Abrir o Contratos.gov.br
        </AppButton>
        {podeMarcar && linha.situacao !== 'CORRIGINDO' && (
          <AppButton variant="primary" size="sm" onClick={onVouCorrigir} data-testid={`vinc-nota-vou-corrigir-${linha.numeroOficial}`}>
            Vou corrigir
          </AppButton>
        )}
      </div>
    </div>
  );
};

/** Janela "Vou corrigir": o gestor escolhe o que vai corrigir e marca a linha. */
const VouCorrigirNotaDialog: React.FC<{
  linha: ConferenciaDaNota;
  contrato: ContratoDaConferenciaDaNota;
  isLoading: boolean;
  erro?: string;
  onMarcar: (tipo: CorrecaoDaNota, observacao: string) => void;
  onFechar: () => void;
}> = ({ linha, contrato, isLoading, erro, onMarcar, onFechar }) => {
  const [tipo, setTipo] = useState<CorrecaoDaNota>(CORRECAO_SUGERIDA[linha.tipo]);
  const [obs, setObs] = useState('');
  const longa = obs.trim().length > OBS_MAX;
  const noPortal = tipo !== 'AVISAR_QUEM_EMITIU_A_NOTA' && tipo !== 'REVER_MEU_VINCULO';
  return (
    <Modal
      isOpen
      onClose={onFechar}
      dismissible={!isLoading}
      title="Vou corrigir"
      subtitle={`Contrato ${contrato.numero}${contrato.fornecedorNome ? ` · ${contrato.fornecedorNome}` : ''}`}
      size="md"
      testId="vinc-nota-vou-corrigir-modal"
      footer={
        <>
          <ActionButton action="cancelar" onClick={onFechar} disabled={isLoading} />
          <AppButton variant="primary" onClick={() => onMarcar(tipo, obs.trim())} disabled={isLoading || longa} isLoading={isLoading} data-testid="vinc-nota-vou-corrigir-confirmar">
            {noPortal ? 'Marcar e abrir o Contratos.gov.br' : 'Marcar'}
          </AppButton>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
        <p style={{ margin: 0, lineHeight: 1.5 }}>{textoDaConferenciaDaNota(linha, contrato).frase}</p>
        <NoticeBar tone="info">O sistema não corrige o contrato. Você corrige; a sincronização traz o resultado e a linha sai da fila sozinha.</NoticeBar>
        <AppSelect label="O que você vai corrigir" value={tipo} onChange={(e) => setTipo(e.target.value as CorrecaoDaNota)} data-testid="vinc-nota-tipo">
          {(Object.keys(ROTULO_DA_CORRECAO) as CorrecaoDaNota[]).map((t) => (
            <option key={t} value={t}>
              {ROTULO_DA_CORRECAO[t]}
            </option>
          ))}
        </AppSelect>
        <AppTextarea
          label="Observação (opcional)"
          hint={`A linha fica com seu nome e a data. Se a correção não chegar em 7 dias, ela volta a pedir conferência com um aviso. Até ${OBS_MAX} caracteres.`}
          error={longa ? `A observação tem no máximo ${OBS_MAX} caracteres.` : undefined}
          value={obs}
          rows={3}
          onChange={(e) => setObs(e.target.value)}
          data-testid="vinc-nota-observacao"
        />
        {erro && (
          <NoticeBar tone="danger" testId="vinc-nota-vou-corrigir-erro">
            {erro}
          </NoticeBar>
        )}
      </div>
    </Modal>
  );
};

/**
 * Segmento "Conferir no Contratos.gov.br" da fila Empenhos aos itens (migration 121): notas em que a nota no SIAFI e
 * o contrato não batem. A linha abre a conferência; o gestor marca "Vou corrigir" e corrige.
 */
export const ConferirNoContratosGov: React.FC<{
  linhas: ConferenciaDaNota[];
  contrato: (contractKey: string) => ContratoDaLinha;
  showGestorFilter: boolean;
  podeMarcar: boolean;
  /** A leitura das notas falhou sem leitura anterior: a lista vazia não quer dizer "nada a conferir". */
  naoCarregou?: boolean;
}> = ({ linhas, contrato, showGestorFilter, podeMarcar, naoCarregou = false }) => {
  const navigate = useNavigateWithOrigin();
  const toast = useToast();
  const acoes = useAcoesCorrecaoDaNota();
  const { filters, setFilter, resetFilters } = useCarteiraFilters(SCHEMA);
  const [abertas, setAbertas] = useState<Set<string>>(new Set());
  const [marcando, setMarcando] = useState<ConferenciaDaNota | null>(null);

  const uasgs = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of linhas) m.set(l.uasgEmitente || uasgDaChave(l.contractKey), (m.get(l.uasgEmitente || uasgDaChave(l.contractKey)) ?? 0) + 1);
    return m;
  }, [linhas]);
  const gestores = useMemo(() => listGestores(linhas.map((l) => contrato(l.contractKey).gestorNome)), [linhas, contrato]);

  const lista = useMemo(() => {
    const q = normalizarBusca(filters.busca);
    return linhas.filter((l) => {
      const c = contrato(l.contractKey);
      if (filters.marca === 'A_CONFERIR' && l.situacao === 'CORRIGINDO') return false;
      if (filters.marca === 'CORRIGINDO' && l.situacao !== 'CORRIGINDO') return false;
      if (filters.tipo !== TODOS && l.tipo !== filters.tipo) return false;
      if (filters.vigencia === 'VIGENTES' && c.expirado) return false;
      if (filters.vigencia === 'ENCERRADOS' && !c.expirado) return false;
      if (filters.uasg !== TODOS && (l.uasgEmitente || uasgDaChave(l.contractKey)) !== filters.uasg) return false;
      if (showGestorFilter && !matchesGestorFilter(c.gestorNome, filters.gestor)) return false;
      if (q && ![l.numeroOficial, c.numero, c.fornecedorNome ?? ''].some((t) => normalizarBusca(t).includes(q))) return false;
      return true;
    });
  }, [linhas, filters, contrato, showGestorFilter]);

  const colunas = useMemo<Record<string, CarteiraSortColumn<ConferenciaDaNota>>>(
    () => ({
      empenho: { value: (l) => l.numeroOficial },
      contrato: { value: (l) => contrato(l.contractKey).numero.split('/').reverse().join('/') },
      conferencia: { value: (l) => ROTULO_DA_CONFERENCIA[l.tipo] },
      valor: { value: (l) => l.valorNota, firstDir: 'desc' },
      gestor: { value: (l) => contrato(l.contractKey).gestorNome }
    }),
    [contrato]
  );
  const { sorted, sortKey, sortDir, toggle } = useCarteiraSort(lista, colunas);
  const sort = { activeKey: sortKey, activeDir: sortDir, onSort: toggle };
  const chave = React.useCallback((l: ConferenciaDaNota) => l.contratoEmpenhoId, []);
  const { currentPage, setPage, pageItems } = useCarteiraPagination(sorted, chave, PAGE_SIZE);

  const abrirContrato = (l: ConferenciaDaNota) => navigate(`/contratos/${encodeURIComponent(l.contractKey)}?aba=financeiro&abrir=${encodeURIComponent(l.numeroOficial)}`);
  const alternar = (id: string) =>
    setAbertas((atual) => {
      const nova = new Set(atual);
      if (nova.has(id)) nova.delete(id);
      else nova.add(id);
      return nova;
    });
  const marcar = (tipo: CorrecaoDaNota, observacao: string) => {
    if (!marcando) return;
    const alvo = marcando;
    // Abre o portal no próprio clique (depois de esperar o banco, o navegador bloquearia a nova aba).
    if (tipo !== 'AVISAR_QUEM_EMITIU_A_NOTA' && tipo !== 'REVER_MEU_VINCULO') abrirContratosGov();
    acoes.marcar.mutate(
      { contratoEmpenhoId: alvo.contratoEmpenhoId, tipo, observacao },
      {
        onSuccess: () => {
          setMarcando(null);
          toast.success(`${alvo.numeroOficial} marcada: você vai corrigir.`);
        }
      }
    );
  };
  const desfazer = (l: ConferenciaDaNota) =>
    acoes.desfazer.mutate(l.contratoEmpenhoId, {
      onSuccess: () => toast.success(`${l.numeroOficial} voltou a pedir conferência.`),
      onError: (err) => toast.error(err.message)
    });

  const hasActive = hasActiveCarteiraFilters(SCHEMA, filters);
  const tipos = Object.keys(ROTULO_DA_CONFERENCIA) as TipoDeConferenciaDaNota[];
  const colunasDaTabela = 5 + (showGestorFilter ? 1 : 0);

  return (
    <>
      <CarteiraFilterBar
        busca={filters.busca}
        searchPlaceholder="Buscar por empenho, contrato, fornecedor..."
        onChangeBusca={(v) => setFilter('busca', v)}
        hasActiveFilters={hasActive}
        onResetFilters={resetFilters}
        counter={carteiraCounter(lista.length, linhas.length, hasActive, 'nota', 'notas')}
        testIdPrefix="vinc-nota"
      >
        <CarteiraFilterButton
          label="Vigência"
          value={filters.vigencia}
          emptyValue={TODOS}
          options={[
            { value: 'VIGENTES', label: 'Vigentes' },
            { value: 'ENCERRADOS', label: 'Encerrados' }
          ]}
          onChange={(v) => setFilter('vigencia', v)}
          testId="vinc-nota-filter-vigencia"
        />
        <CarteiraFilterButton
          label="Conferência"
          value={filters.tipo}
          emptyValue={TODOS}
          options={tipos.map((t) => ({ value: t, label: ROTULO_DA_CONFERENCIA[t], count: linhas.filter((l) => l.tipo === t).length }))}
          onChange={(v) => setFilter('tipo', v)}
          testId="vinc-nota-filter-conferencia"
        />
        <CarteiraFilterButton
          label="Marca"
          value={filters.marca}
          emptyValue={TODOS}
          options={[
            { value: 'A_CONFERIR', label: 'A conferir', count: linhas.filter((l) => l.situacao !== 'CORRIGINDO').length },
            { value: 'CORRIGINDO', label: 'Corrigindo', count: linhas.filter((l) => l.situacao === 'CORRIGINDO').length }
          ]}
          onChange={(v) => setFilter('marca', v)}
          testId="vinc-nota-filter-marca"
        />
        <CarteiraFilterButton
          label="UASG"
          value={filters.uasg}
          emptyValue={TODOS}
          options={[...uasgs.keys()].sort().map((u) => ({ value: u, label: u, count: uasgs.get(u) }))}
          onChange={(v) => setFilter('uasg', v)}
          testId="vinc-nota-filter-uasg"
        />
        {showGestorFilter && <CarteiraGestorSelect value={filters.gestor} gestores={gestores} onChange={(v) => setFilter('gestor', v)} testId="vinc-nota-filter-gestor" />}
      </CarteiraFilterBar>

      {linhas.length === 0 && naoCarregou ? (
        <ListaNaoCarregou titulo="As notas a conferir não carregaram." testId="vinc-nota-nao-carregou" />
      ) : linhas.length === 0 ? (
        <EmptyState
          title="Nenhuma nota pede conferência no Contratos.gov.br."
          description="Quando a nota no SIAFI e o contrato não baterem, a nota aparece aqui com o que corrigir."
          testId="vinc-nota-vazio"
        />
      ) : lista.length === 0 ? (
        <CarteiraNoResults title="Nenhuma nota corresponde aos filtros." description="Altere os critérios ou limpe os filtros." onResetFilters={resetFilters} />
      ) : (
        <div data-testid="vinc-nota-table" className="carteira-shell" style={carteiraTableShell}>
          <div style={{ overflowX: 'auto' }}>
            <table className="carteira-stack" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <CarteiraSortHeader label="Empenho" sortKey="empenho" {...sort} />
                  <CarteiraSortHeader label="Contrato" sortKey="contrato" {...sort} />
                  <CarteiraSortHeader label="Conferência" sortKey="conferencia" {...sort} />
                  <CarteiraSortHeader label="Valor da nota" sortKey="valor" align="right" {...sort} />
                  {showGestorFilter && <CarteiraSortHeader label="Gestor" sortKey="gestor" {...sort} />}
                  <th style={{ ...carteiraTh, textAlign: 'right' }}>Ação</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((l) => {
                  const c = contrato(l.contractKey);
                  const aberta = abertas.has(l.contratoEmpenhoId);
                  return (
                    <React.Fragment key={l.contratoEmpenhoId}>
                      <tr
                        data-testid={`vinc-nota-row-${l.numeroOficial}`}
                        className="carteira-row-link"
                        onClick={abrirAoClicarNaLinha(() => alternar(l.contratoEmpenhoId))}
                        style={aberta ? { background: 'var(--primary-soft, #e0e7f5)' } : undefined}
                      >
                        <td data-role="id" style={{ ...carteiraTd, minWidth: '150px' }}>
                          <CarteiraIdLink onClick={() => abrirContrato(l)} label={`Ver ${l.numeroOficial} no contrato`} title="Abrir o contrato com esta nota aberta">
                            {l.numeroOficial}
                          </CarteiraIdLink>
                          {l.uasgEmitente && <div style={subtle}>UASG {l.uasgEmitente}</div>}
                        </td>
                        <td data-label="Contrato" style={{ ...carteiraTd, minWidth: '180px', maxWidth: '300px' }}>
                          <strong>{c.numero}</strong>
                          <div style={carteiraFornecedor} title={c.fornecedorNome}>
                            {c.fornecedorNome ?? '—'}
                          </div>
                          {c.expirado && <div style={subtle}>contrato encerrado</div>}
                        </td>
                        <td data-label="Conferência" style={carteiraTd}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', alignItems: 'flex-start' }}>
                            {l.situacao === 'CORRIGINDO' && l.correcao ? (
                              <StatusBadge
                                label={`Corrigindo · ${l.correcao.porNome || '—'}, ${new Date(l.correcao.em).toLocaleDateString('pt-BR')}`}
                                variant="info"
                                size="sm"
                                dot={false}
                                testId={`vinc-nota-corrigindo-${l.numeroOficial}`}
                              />
                            ) : (
                              <StatusBadge label={ROTULO_DA_CONFERENCIA[l.tipo]} variant={COR[l.tipo]} size="sm" dot={false} />
                            )}
                            {l.situacao === 'CORRECAO_NAO_CHEGOU' && <span style={{ fontSize: '0.75rem', color: 'var(--warning)' }}>A correção não chegou</span>}
                          </div>
                        </td>
                        <td data-label="Valor da nota" style={{ ...carteiraTd, textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 700 }}>{formatCurrency(l.valorNota)}</td>
                        {showGestorFilter && (
                          <td data-label="Gestor" style={{ ...carteiraTd, whiteSpace: 'nowrap' }}>
                            {c.gestorNome ? (
                              <CarteiraCellFilter descricao={`gestor ${c.gestorNome}`} onFilter={() => setFilter('gestor', c.gestorNome!)}>
                                <span>{c.gestorNome}</span>
                              </CarteiraCellFilter>
                            ) : (
                              <span style={{ color: '#94a3b8' }}>—</span>
                            )}
                          </td>
                        )}
                        <td data-role="action" style={{ ...carteiraTd, textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'inline-flex', gap: '0.4rem' }}>
                            <ActionButton
                              action={aberta ? 'fechar' : 'conferir'}
                              size="sm"
                              expanded={aberta}
                              onClick={() => alternar(l.contratoEmpenhoId)}
                              data-testid={`vinc-nota-conferir-${l.numeroOficial}`}
                            />
                            {podeMarcar && l.situacao === 'CORRIGINDO' && (
                              <ActionButton
                                action="desfazer"
                                label="Desfazer marca"
                                size="sm"
                                title="Tira a marca e devolve a linha à conferência"
                                onClick={() => desfazer(l)}
                                disabled={acoes.desfazer.isPending}
                                data-testid={`vinc-nota-desfazer-${l.numeroOficial}`}
                              />
                            )}
                          </div>
                        </td>
                      </tr>
                      {aberta && (
                        <tr data-testid={`vinc-nota-detalhe-${l.numeroOficial}`}>
                          <td colSpan={colunasDaTabela} style={{ padding: '0 0.6rem 1rem', background: 'var(--primary-soft, #e0e7f5)', borderBottom: '1px solid var(--border)' }}>
                            <PainelDaConferenciaDaNota
                              linha={l}
                              contrato={c}
                              podeMarcar={podeMarcar}
                              onVouCorrigir={() => {
                                acoes.marcar.reset();
                                setMarcando(l);
                              }}
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
          <CarteiraPagination page={currentPage} pageSize={PAGE_SIZE} total={sorted.length} onChange={setPage} testIdPrefix="vinc-nota" />
        </div>
      )}

      {marcando && (
        <VouCorrigirNotaDialog
          linha={marcando}
          contrato={contrato(marcando.contractKey)}
          isLoading={acoes.marcar.isPending}
          erro={acoes.marcar.error?.message}
          onMarcar={marcar}
          onFechar={() => setMarcando(null)}
        />
      )}
    </>
  );
};
