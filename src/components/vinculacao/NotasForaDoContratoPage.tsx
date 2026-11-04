import React, { useMemo, useState } from 'react';
import { PageContainer } from '../../design-system/components/PageContainer';
import { SkeletonLoader } from '../../design-system/components/SkeletonLoader';
import { EmptyState } from '../../design-system/components/EmptyState';
import { ActionButton, AppButton, AppSelect, AppTextarea, AvisoCarregando, NoticeBar, StatusBadge, useToast } from '../../design-system';
import { FontesComFalhaAviso } from '../fonte/FontesComFalhaAviso';
import { naoCarregou, useLeiturasComFalha } from '../fonte/useLeiturasComFalha';
import { ListaNaoCarregou } from '../fonte/ListaNaoCarregou';
import { useAuth } from '../../context/AuthContext';
import { useNavigateWithOrigin } from '../../hooks/useDetailOrigin';
import { useAcoesInclusaoNaFonte, useNotasForaDoContrato } from '../../hooks/useNotasForaDoContrato';
import { useEmpenhosForaDoContrato } from '../../hooks/useEmpenhosForaDoContrato';
import type { NotaForaDoContrato } from '../../services/notasForaDoContratoService';
import { numeroDaChave } from '../../utils/contractKeyUtils';
import { CarteiraFilterButton } from '../carteira/CarteiraFilterButton';
import { CarteiraFilterBar, CarteiraGestorSelect, carteiraCounter } from '../carteira/CarteiraFilterBar';
import { CarteiraNoResults } from '../carteira/CarteiraNoResults';
import { CarteiraPagination } from '../carteira/CarteiraPagination';
import { CarteiraSegmentTabs } from '../carteira/CarteiraSegmentTabs';
import { CarteiraSortHeader } from '../carteira/CarteiraSortHeader';
import { CarteiraIdLink, abrirAoClicarNaLinha } from '../carteira/CarteiraRowLink';
import { carteiraFornecedor, carteiraTableShell, carteiraTd, carteiraTh } from '../carteira/carteiraStyles';
import { hasActiveCarteiraFilters, useCarteiraFilters, type CarteiraFilterSchema } from '../carteira/carteiraFilters';
import { TODOS_GESTORES, listGestores, matchesGestorFilter } from '../carteira/carteiraGestor';
import { formatCurrency } from '../carteira/carteiraFormat';
import { useCarteiraPagination } from '../carteira/useCarteiraPagination';
import { useCarteiraSort, type CarteiraSortColumn } from '../carteira/useCarteiraSort';
import { useContratosDoFinanceiro } from '../financeiro/useContratosDoFinanceiro';
import { dataBR, normalizarBusca } from '../financeiro/financeiroFormat';
import { VinculacaoPageHeader } from './VinculacaoPageHeader';
import { abrirContratosGov } from './vinculacaoEmpenhos';
import {
  PRAZO_DA_MARCA_DIAS,
  contratoIndicado,
  contratosSugeridos,
  fraseDaNota,
  motivosDoContrato,
  naCarteira,
  notaNoSegmento,
  semNotasCitadasEmFatura,
  situacaoDaNota,
  type SegmentoNotaFora
} from './notasForaDoContrato';

interface Filtros {
  situacao: SegmentoNotaFora;
  carteira: string;
  ano: string;
  gestor: string;
  busca: string;
}
const TODOS = 'TODOS';
const PAGE_SIZE = 20;
const SCHEMA: CarteiraFilterSchema<Filtros> = {
  situacao: { param: 'situacao', default: 'A_INCLUIR' },
  carteira: { param: 'carteira', default: TODOS },
  ano: { param: 'ano', default: TODOS },
  gestor: { param: 'gestor', default: TODOS_GESTORES },
  busca: { param: 'busca', default: '' }
};
const OBS_MAX = 500;
const subtle: React.CSSProperties = { fontSize: '0.75rem', color: '#64748b', fontWeight: 600 };
const rotulo: React.CSSProperties = { fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' };

/**
 * Vínculos → Notas fora do contrato: notas que o Contratos.gov.br não lista em contrato nenhum (migration 256). O sistema
 * não vincula à mão (decisão de 04/11/2026): indica o contrato onde incluir a nota lá e guarda a marca "Vou incluir". A
 * linha sai sozinha quando a sincronização trouxer a nota num contrato.
 */
export const NotasForaDoContratoPage: React.FC<{ alternador?: React.ReactNode }> = ({ alternador }) => {
  const navigate = useNavigateWithOrigin();
  const { role } = useAuth();
  const podeMarcar = role === 'admin' || role === 'gestor';
  const toast = useToast();
  const consulta = useNotasForaDoContrato();
  // A nota que uma fatura já cita fica só em "Citadas em fatura" (não aparece duas vezes).
  const citadas = useEmpenhosForaDoContrato();
  const acoes = useAcoesInclusaoNaFonte();
  const { contrato, escopo, showGestorFilter, isLoading: carregandoContratos, leituras: leiturasContratos, contratosNaoCarregaram } = useContratosDoFinanceiro();
  const { filters, setFilter, resetFilters } = useCarteiraFilters(SCHEMA);
  const [aberta, setAberta] = useState<string | null>(null);
  const leituras = useLeiturasComFalha([{ rotulo: 'notas fora do contrato', query: consulta }, ...leiturasContratos]);

  const numero = React.useCallback((key: string) => contrato(key).numero || numeroDaChave(key), [contrato]);
  const gestorDe = React.useCallback((n: NotaForaDoContrato) => {
    const k = contratoIndicado(n);
    return k ? contrato(k).gestorNome : undefined;
  }, [contrato]);

  // Gestor: só as notas cujo contrato indicado é dele.
  const noEscopo = useMemo(() => {
    // Mais recentes primeiro (ordem padrão, antes de escolher no cabeçalho).
    const linhas = semNotasCitadasEmFatura(consulta.data ?? [], citadas.data ?? []).sort((a, b) => (b.dataEmissao ?? '').localeCompare(a.dataEmissao ?? ''));
    if (!escopo) return linhas;
    return linhas.filter((n) => {
      const k = contratoIndicado(n);
      return k !== null && escopo.has(k);
    });
  }, [consulta.data, citadas.data, escopo]);

  const contagem = useMemo(
    () => ({
      A_INCLUIR: noEscopo.filter((n) => notaNoSegmento(n, 'A_INCLUIR')).length,
      INCLUINDO: noEscopo.filter((n) => notaNoSegmento(n, 'INCLUINDO')).length,
      TODAS: noEscopo.length
    }),
    [noEscopo]
  );
  const doSegmento = useMemo(() => noEscopo.filter((n) => notaNoSegmento(n, filters.situacao)), [noEscopo, filters.situacao]);
  const anos = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of doSegmento) m.set(String(n.ano), (m.get(String(n.ano)) ?? 0) + 1);
    return m;
  }, [doSegmento]);
  const gestores = useMemo(() => listGestores(doSegmento.map(gestorDe)), [doSegmento, gestorDe]);

  const lista = useMemo(() => {
    const q = normalizarBusca(filters.busca);
    return doSegmento.filter((n) => {
      if (filters.carteira !== TODOS && naCarteira(n) !== filters.carteira) return false;
      if (filters.ano !== TODOS && String(n.ano) !== filters.ano) return false;
      if (showGestorFilter && !matchesGestorFilter(gestorDe(n), filters.gestor)) return false;
      if (q) {
        const k = contratoIndicado(n);
        const textos = [n.numero, n.credorNome ?? '', ...n.pedidos.map((p) => `${p.numero} ${p.emenda ?? ''}`), k ? numero(k) : ''];
        if (!textos.some((t) => normalizarBusca(t).includes(q))) return false;
      }
      return true;
    });
  }, [doSegmento, filters, showGestorFilter, gestorDe, numero]);

  const colunas = useMemo<Record<string, CarteiraSortColumn<NotaForaDoContrato>>>(
    () => ({
      nota: { value: (n) => n.dataEmissao, firstDir: 'desc' },
      credor: { value: (n) => n.credorNome },
      pedido: { value: (n) => n.pedidos[0]?.numero ?? null },
      valor: { value: (n) => n.valorEmpenhado, firstDir: 'desc' },
      contrato: { value: (n) => {
        const k = contratoIndicado(n);
        return k ? numero(k).split('/').reverse().join('/') : null;
      } },
      gestor: { value: gestorDe }
    }),
    [numero, gestorDe]
  );
  const { sorted, sortKey, sortDir, toggle } = useCarteiraSort(lista, colunas);
  const sort = { activeKey: sortKey, activeDir: sortDir, onSort: toggle };
  const { currentPage, setPage, pageItems } = useCarteiraPagination(sorted, React.useCallback((n: NotaForaDoContrato) => n.empenhoId, []), PAGE_SIZE);

  const abrirContrato = (key: string) => navigate(`/contratos/${encodeURIComponent(key)}?aba=financeiro`);

  const marcar = (n: NotaForaDoContrato, contractKey: string, observacao: string) => {
    // Abre o portal no próprio clique (depois de esperar o banco, o navegador bloquearia a nova aba).
    abrirContratosGov();
    acoes.marcar.mutate(
      { empenhoId: n.empenhoId, contractKey, observacao },
      {
        onSuccess: () => {
          setAberta(null);
          toast.success(`${n.numero}: incluindo no contrato ${numero(contractKey)}.`);
        }
      }
    );
  };
  const desfazer = (n: NotaForaDoContrato) =>
    acoes.desfazer.mutate(
      { empenhoId: n.empenhoId },
      {
        onSuccess: () => toast.success(`${n.numero} voltou para "A incluir".`),
        onError: (err) => toast.error(err.message)
      }
    );

  const hasActive = hasActiveCarteiraFilters(SCHEMA, filters) && filters.situacao === SCHEMA.situacao.default;
  const isBusy = consulta.isLoading || carregandoContratos;
  const colunasDaTabela = 7 + (showGestorFilter ? 1 : 0);

  return (
    <PageContainer style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <VinculacaoPageHeader
        title="Empenhos ao contrato"
        subtitle="Sem contrato: notas que o Contratos.gov.br não lista em nenhum contrato. A correção é incluir a nota no contrato, lá."
        actions={alternador}
        hint={`Sem contrato: o sistema não vincula a nota à mão: indica o contrato onde incluí-la no Contratos.gov.br. Com pedido de emenda, é o contrato do pedido; sem ele, os contratos do fornecedor na ordem: item do pedido, assinado depois da nota, sem notas da fonte e data mais próxima. Marque "Vou incluir" e inclua lá: a linha fica com seu nome e sai sozinha quando a sincronização trouxer a nota. Se não chegar em ${PRAZO_DA_MARCA_DIAS} dias, volta para "A incluir".`}
      />

      <FontesComFalhaAviso falhas={leituras.falhas} onTentar={() => void leituras.tentarDeNovo()} tentando={leituras.tentando} onde="da fila" testIdPrefix="vinc-notas-fora-fontes" />

      {isBusy ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }} aria-busy="true" aria-label="Carregando notas...">
          <AvisoCarregando label="Carregando notas" />
          <SkeletonLoader variant="rectangular" height="40px" count={1} />
          <SkeletonLoader variant="rectangular" height="46px" count={1} />
          <SkeletonLoader variant="rectangular" height="300px" count={1} />
        </div>
      ) : (
        <>
          <CarteiraSegmentTabs
            testIdPrefix="vinc-notas-fora-situacao"
            ariaLabel="Situação da nota"
            active={filters.situacao}
            onSelect={(v) => setFilter('situacao', v)}
            segments={[
              { id: 'A_INCLUIR', label: 'A incluir', count: contagem.A_INCLUIR, dot: 'var(--color-warning)', title: 'Notas que pedem o gestor' },
              { id: 'INCLUINDO', label: 'Incluindo na fonte', count: contagem.INCLUINDO, dot: 'var(--primary)', title: `Marcadas "Vou incluir" há menos de ${PRAZO_DA_MARCA_DIAS} dias` },
              { id: 'TODAS', label: 'Todas', count: contagem.TODAS }
            ]}
          />

          <CarteiraFilterBar
            busca={filters.busca}
            searchPlaceholder="Buscar nota, credor, pedido ou contrato..."
            onChangeBusca={(v) => setFilter('busca', v)}
            hasActiveFilters={hasActive}
            onResetFilters={resetFilters}
            counter={carteiraCounter(lista.length, doSegmento.length, hasActive, 'nota', 'notas')}
            testIdPrefix="vinc-notas-fora"
          >
            <CarteiraFilterButton
              label="Na Carteira"
              value={filters.carteira}
              emptyValue={TODOS}
              options={[
                { value: 'SEM_CONTRATO', label: 'Sem contrato', count: doSegmento.filter((n) => naCarteira(n) === 'SEM_CONTRATO').length },
                { value: 'PELO_PEDIDO', label: 'Pelo pedido de emenda', count: doSegmento.filter((n) => naCarteira(n) === 'PELO_PEDIDO').length }
              ]}
              onChange={(v) => setFilter('carteira', v)}
              testId="vinc-notas-fora-filter-carteira"
            />
            <CarteiraFilterButton
              label="Ano"
              value={filters.ano}
              emptyValue={TODOS}
              options={[...anos.keys()].sort().reverse().map((a) => ({ value: a, label: a, count: anos.get(a) }))}
              onChange={(v) => setFilter('ano', v)}
              testId="vinc-notas-fora-filter-ano"
            />
            {showGestorFilter && <CarteiraGestorSelect value={filters.gestor} gestores={gestores} onChange={(v) => setFilter('gestor', v)} testId="vinc-notas-fora-filter-gestor" />}
          </CarteiraFilterBar>

          {noEscopo.length === 0 && (naoCarregou(consulta) || (Boolean(escopo) && contratosNaoCarregaram)) ? (
            <ListaNaoCarregou titulo="As notas fora do contrato não carregaram." testId="vinc-notas-fora-nao-carregou" />
          ) : noEscopo.length === 0 ? (
            <EmptyState
              title="Nenhuma nota fora do contrato."
              description="Quando o Contratos.gov.br trouxer uma nota que não está em contrato nenhum, ela aparece aqui."
              testId="vinc-notas-fora-vazio"
            />
          ) : lista.length === 0 ? (
            <CarteiraNoResults title="Nenhuma nota corresponde aos filtros." description="Altere os critérios ou limpe os filtros." onResetFilters={resetFilters} />
          ) : (
            <div data-testid="vinc-notas-fora-table" className="carteira-shell" style={carteiraTableShell}>
              <div style={{ overflowX: 'auto' }}>
                <table className="carteira-stack" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <CarteiraSortHeader label="Nota" sortKey="nota" {...sort} />
                      <CarteiraSortHeader label="Credor" sortKey="credor" {...sort} />
                      <CarteiraSortHeader label="Pedido · emenda" sortKey="pedido" {...sort} />
                      <CarteiraSortHeader label="Valor" sortKey="valor" align="right" {...sort} />
                      <CarteiraSortHeader label="Incluir no contrato" sortKey="contrato" {...sort} />
                      {showGestorFilter && <CarteiraSortHeader label="Gestor" sortKey="gestor" {...sort} />}
                      <th style={carteiraTh}>Na Carteira</th>
                      <th style={{ ...carteiraTh, textAlign: 'right' }}>Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems.map((n) => {
                      const k = contratoIndicado(n);
                      const situacao = situacaoDaNota(n);
                      const estaAberta = aberta === n.empenhoId;
                      const alternar = () => setAberta(estaAberta ? null : n.empenhoId);
                      const pedido = n.pedidos[0];
                      return (
                        <React.Fragment key={n.empenhoId}>
                          <tr
                            data-testid={`vinc-notas-fora-row-${n.numero}`}
                            className="carteira-row-link"
                            onClick={abrirAoClicarNaLinha(alternar)}
                            style={estaAberta ? { background: 'var(--primary-soft, #e0e7f5)' } : undefined}
                          >
                            <td data-role="id" style={{ ...carteiraTd, minWidth: '140px' }}>
                              <CarteiraIdLink onClick={alternar} label={`Conferir a nota ${n.numero}`} title="Abrir a conferência">
                                {n.numero}
                              </CarteiraIdLink>
                              <div style={subtle}>
                                UG {n.uasgEmitente}
                                {n.dataEmissao ? ` · ${dataBR(n.dataEmissao)}` : ''}
                              </div>
                            </td>
                            <td data-label="Credor" style={{ ...carteiraTd, maxWidth: '240px' }}>
                              <div style={carteiraFornecedor} title={n.credorNome ?? undefined}>
                                {n.credorNome ?? '—'}
                              </div>
                            </td>
                            <td data-label="Pedido · emenda" style={carteiraTd}>
                              {pedido ? (
                                <>
                                  <strong>
                                    Pedido {n.pedidos.map((p) => p.numero).join(', ')}
                                  </strong>
                                  {pedido.emenda && <div style={subtle}>Emenda {pedido.emenda}</div>}
                                </>
                              ) : (
                                <span style={{ color: '#94a3b8' }}>—</span>
                              )}
                            </td>
                            <td data-label="Valor" style={{ ...carteiraTd, textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 700 }}>{formatCurrency(n.valorEmpenhado)}</td>
                            <td data-label="Incluir no contrato" style={{ ...carteiraTd, whiteSpace: 'nowrap' }}>
                              {k ? <strong>{numero(k)}</strong> : <span style={{ color: '#94a3b8' }}>—</span>}
                              <div style={subtle}>
                                {situacao === 'INCLUINDO' && n.marca
                                  ? `Incluindo · ${n.marca.porNome || '—'}`
                                  : n.marca
                                    ? 'A inclusão não chegou'
                                    : n.contratoPeloPedido
                                      ? 'contrato do pedido'
                                      : n.contratosDoFornecedor.length > 1
                                        ? `sugestão · mais ${n.contratosDoFornecedor.length - 1} do fornecedor`
                                        : n.contratosDoFornecedor.length === 1
                                          ? 'único do fornecedor'
                                          : 'fornecedor sem contrato'}
                              </div>
                            </td>
                            {showGestorFilter && (
                              <td data-label="Gestor" style={{ ...carteiraTd, whiteSpace: 'nowrap' }}>
                                {gestorDe(n) ?? <span style={{ color: '#94a3b8' }}>—</span>}
                              </td>
                            )}
                            <td data-label="Na Carteira" style={carteiraTd}>
                              {n.contratoPeloPedido ? (
                                <StatusBadge label={`Pelo pedido · ${numero(n.contratoPeloPedido)}`} variant="info" size="sm" dot={false} />
                              ) : n.pedidoDeOutroFornecedor.length > 0 ? (
                                <StatusBadge label="Sem contrato · credor ≠ pedido" variant="danger" size="sm" dot={false} />
                              ) : (
                                <StatusBadge label="Sem contrato" variant="warning" size="sm" dot={false} />
                              )}
                            </td>
                            <td data-role="action" style={{ ...carteiraTd, textAlign: 'right', whiteSpace: 'nowrap' }}>
                              <ActionButton action={estaAberta ? 'fechar' : 'conferir'} size="sm" expanded={estaAberta} onClick={alternar} data-testid={`vinc-notas-fora-conferir-${n.numero}`} />
                            </td>
                          </tr>
                          {estaAberta && (
                            <tr data-testid={`vinc-notas-fora-detalhe-${n.numero}`}>
                              <td colSpan={colunasDaTabela} style={{ padding: '0 0.6rem 1rem', background: 'var(--primary-soft, #e0e7f5)', borderBottom: '1px solid var(--border)' }}>
                                <PainelDaNota
                                  nota={n}
                                  numero={numero}
                                  podeMarcar={podeMarcar}
                                  noAlcance={(key) => !escopo || escopo.has(key)}
                                  marcando={acoes.marcar.isPending}
                                  erro={acoes.marcar.error?.message}
                                  desfazendo={acoes.desfazer.isPending}
                                  onMarcar={(key, obs) => marcar(n, key, obs)}
                                  onDesfazer={() => desfazer(n)}
                                  onAbrirContrato={abrirContrato}
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
              <CarteiraPagination page={currentPage} pageSize={PAGE_SIZE} total={sorted.length} onChange={setPage} testIdPrefix="vinc-notas-fora" />
            </div>
          )}
        </>
      )}
    </PageContainer>
  );
};

/** Conferência da nota, aberta na linha: o que aconteceu, o que fazer no Contratos.gov.br, o contrato e a marca. */
const PainelDaNota: React.FC<{
  nota: NotaForaDoContrato;
  numero: (key: string) => string;
  podeMarcar: boolean;
  noAlcance: (contractKey: string) => boolean;
  marcando: boolean;
  erro?: string;
  desfazendo: boolean;
  onMarcar: (contractKey: string, observacao: string) => void;
  onDesfazer: () => void;
  onAbrirContrato: (contractKey: string) => void;
}> = ({ nota: n, numero, podeMarcar, noAlcance, marcando, erro, desfazendo, onMarcar, onDesfazer, onAbrirContrato }) => {
  const sugeridos = contratosSugeridos(n);
  const outros = n.contratosDoFornecedor.filter((c) => !sugeridos.includes(c));
  const [escolhido, setEscolhido] = useState<string>(contratoIndicado(n) ?? '');
  const [obs, setObs] = useState(n.marca?.observacao ?? '');
  const situacao = situacaoDaNota(n);
  const longa = obs.trim().length > OBS_MAX;
  const nome = 'contrato-' + n.empenhoId;

  return (
    <div
      data-testid={`vinc-notas-fora-conferencia-${n.numero}`}
      aria-label={`Conferência da nota ${n.numero}`}
      style={{ background: 'var(--surface, #fff)', border: '1px solid var(--border)', borderRadius: '8px', padding: '1rem 1.1rem', display: 'flex', flexDirection: 'column', gap: '0.9rem', textAlign: 'left', whiteSpace: 'normal' }}
    >
      {situacao === 'INCLUINDO' && n.marca ? (
        <NoticeBar tone="success" testId="vinc-notas-fora-marcada">
          {n.marca.porNome || 'Alguém'} vai incluir a nota no contrato {numero(n.marca.contractKey)} no Contratos.gov.br (marcado em{' '}
          {new Date(n.marca.em).toLocaleDateString('pt-BR')}){n.marca.observacao ? `. Observação: "${n.marca.observacao}"` : ''}. A linha sai sozinha quando a
          sincronização trouxer a nota no contrato.
        </NoticeBar>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <span style={rotulo}>O que aconteceu</span>
            <p style={{ margin: 0, fontSize: '0.95rem', lineHeight: 1.5, fontWeight: 600, maxWidth: '85ch' }}>{fraseDaNota(n, numero)}</p>
          </div>
          {situacao === 'INCLUSAO_NAO_CHEGOU' && n.marca && (
            <NoticeBar tone="warning" testId="vinc-notas-fora-nao-chegou">
              {n.marca.porNome || 'Alguém'} marcou que ia incluir no contrato {numero(n.marca.contractKey)} em {new Date(n.marca.em).toLocaleDateString('pt-BR')}, e a nota
              ainda não chegou pela sincronização. Confira no Contratos.gov.br.
            </NoticeBar>
          )}
          {n.pedidoDeOutroFornecedor.length > 0 && (
            <NoticeBar tone="warning" testId="vinc-notas-fora-outro-fornecedor">
              O pedido {n.pedidos.map((p) => p.numero).join(', ')} aponta{' '}
              {n.pedidoDeOutroFornecedor.map((c) => `o contrato ${c.numero}${c.fornecedor ? ` (${c.fornecedor})` : ''}`).join(' e ')}, de outro fornecedor. O credor da
              nota é {n.credorNome ?? 'outro'}. Confira no SEI se a nota é deste pedido.
            </NoticeBar>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <span style={rotulo}>O que fazer no Contratos.gov.br</span>
            <ol style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.88rem', lineHeight: 1.55 }}>
              {n.pedidoDeOutroFornecedor.length > 0 && <li>Confira no SEI se a nota é deste pedido e corrija o contrato no pedido de emenda, se for o caso.</li>}
              <li>Abra o contrato escolhido abaixo e inclua a nota {n.numero} em Empenhos.</li>
              <li>
                Na próxima leitura do contrato a nota aparece nele e sai desta fila
                {n.contratoPeloPedido ? '; a etiqueta "Falta incluir no Contratos.gov.br" some da Carteira' : ''}.
              </li>
            </ol>
          </div>
          {n.contratosDoFornecedor.length > 0 && (
            <fieldset style={{ border: 0, margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
              <legend style={{ ...rotulo, padding: 0, marginBottom: '0.45rem' }}>{n.contratoPeloPedido ? 'Contrato' : 'Contratos sugeridos'}</legend>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 250px), 1fr))', gap: '0.6rem' }}>
                {sugeridos.map((c, i) => {
                  const marcado = escolhido === c.contractKey;
                  return (
                    <label
                      key={c.contractKey}
                      style={{
                        border: `1px solid ${marcado ? 'var(--primary)' : 'var(--border)'}`,
                        background: marcado ? 'var(--primary-soft, #e0e7f5)' : 'var(--surface, #fff)',
                        borderRadius: '8px',
                        padding: '0.65rem 0.75rem',
                        display: 'flex',
                        gap: '0.55rem',
                        cursor: 'pointer',
                        minWidth: 0
                      }}
                    >
                      <input type="radio" name={nome} value={c.contractKey} checked={marcado} onChange={() => setEscolhido(c.contractKey)} style={{ marginTop: '0.2rem', accentColor: 'var(--primary)' }} />
                      <span style={{ minWidth: 0 }}>
                        <strong>{c.numero}</strong>{' '}
                        {c.contractKey === n.contratoPeloPedido ? (
                          <StatusBadge label="Contrato do pedido" variant="info" size="sm" dot={false} />
                        ) : i === 0 ? (
                          <StatusBadge label="1ª sugestão" variant="success" size="sm" dot={false} />
                        ) : null}
                        <ul style={{ margin: '0.3rem 0 0', padding: 0, listStyle: 'none', fontSize: '0.76rem', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                          {motivosDoContrato(n, c).map((m) => (
                            <li key={m.texto}>
                              <span aria-hidden="true" style={{ color: m.aFavor ? 'var(--success, #008821)' : undefined, fontWeight: 800 }}>
                                {m.aFavor ? '✓ ' : '· '}
                              </span>
                              {m.texto}
                            </li>
                          ))}
                        </ul>
                      </span>
                    </label>
                  );
                })}
              </div>
              {outros.length > 0 && (
                <div style={{ maxWidth: '420px' }}>
                  <AppSelect
                    label={`Outro contrato do mesmo fornecedor (${outros.length})`}
                    value={outros.some((c) => c.contractKey === escolhido) ? escolhido : ''}
                    onChange={(e) => e.target.value && setEscolhido(e.target.value)}
                    data-testid="vinc-notas-fora-outro-contrato"
                  >
                    <option value="">Escolher…</option>
                    {outros.map((c) => (
                      <option key={c.contractKey} value={c.contractKey}>
                        {c.numero}
                        {c.assinatura ? ` · assinado em ${dataBR(c.assinatura)}` : ''}
                      </option>
                    ))}
                  </AppSelect>
                </div>
              )}
            </fieldset>
          )}
          {podeMarcar && escolhido && (
            <AppTextarea
              label="Observação (opcional)"
              placeholder="Ex.: incluo amanhã, depois de conferir no SEI"
              error={longa ? `A observação tem no máximo ${OBS_MAX} caracteres.` : undefined}
              value={obs}
              rows={2}
              onChange={(e) => setObs(e.target.value)}
              data-testid="vinc-notas-fora-observacao"
            />
          )}
        </>
      )}

      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.55, display: 'flex', flexWrap: 'wrap', gap: '0.2rem 1.2rem', borderTop: '1px solid var(--border)', paddingTop: '0.65rem' }}>
        {n.dataEmissao && <span>Emitida em {dataBR(n.dataEmissao)}</span>}
        <span>Empenhado {formatCurrency(n.valorEmpenhado)}</span>
        {n.credorCnpjCpf && <span>Credor {n.credorCnpjCpf}</span>}
        {n.pedidos.length > 0 ? (
          <span>
            {n.pedidos.map((p) => `Pedido ${p.numero}${p.emenda ? ` · emenda ${p.emenda}` : ''}`).join('; ')}
          </span>
        ) : (
          <span>Sem pedido de emenda</span>
        )}
      </div>

      {erro && (
        <NoticeBar tone="danger" testId="vinc-notas-fora-erro">
          {erro}
        </NoticeBar>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', flexWrap: 'wrap' }}>
        {escolhido && (
          <AppButton variant="outline" size="sm" onClick={() => onAbrirContrato(n.marca && situacao === 'INCLUINDO' ? n.marca.contractKey : escolhido)}>
            Ver o contrato
          </AppButton>
        )}
        {podeMarcar && situacao === 'INCLUINDO' && n.marca ? (
          noAlcance(n.marca.contractKey) && (
            <ActionButton action="desfazer" label="Desfazer marca" size="sm" title='Tira a marca e devolve a nota a "A incluir"' onClick={onDesfazer} disabled={desfazendo} data-testid="vinc-notas-fora-desfazer" />
          )
        ) : podeMarcar && escolhido ? (
          <AppButton
            variant="primary"
            size="sm"
            onClick={() => onMarcar(escolhido, obs.trim())}
            disabled={marcando || longa || !noAlcance(escolhido)}
            isLoading={marcando}
            title={noAlcance(escolhido) ? 'Marca a nota com seu nome e abre o Contratos.gov.br em outra aba' : 'Este contrato é de outro gestor'}
            data-testid="vinc-notas-fora-vou-incluir"
          >
            Vou incluir no Contratos.gov.br
          </AppButton>
        ) : null}
      </div>
    </div>
  );
};
