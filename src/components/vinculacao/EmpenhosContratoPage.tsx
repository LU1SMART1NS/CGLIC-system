import React, { useMemo, useState } from 'react';
import { PageContainer } from '../../design-system/components/PageContainer';
import { SkeletonLoader } from '../../design-system/components/SkeletonLoader';
import { ErrorState } from '../../design-system/components/ErrorState';
import { EmptyState } from '../../design-system/components/EmptyState';
import { ActionButton, StatusBadge, useToast, AvisoCarregando } from '../../design-system';
import type { StatusBadgeVariant } from '../../design-system/components/StatusBadge';
import { useNavigateWithOrigin } from '../../hooks/useDetailOrigin';
import { useAuth } from '../../context/AuthContext';
import { useAcoesCorrecaoNaFonte, useEmpenhosForaDoContrato } from '../../hooks/useEmpenhosForaDoContrato';
import {
  ROTULO_DO_VEREDITO,
  type EmpenhoForaDoContrato,
  type TipoDeCorrecao,
  type VereditoForaDoContrato
} from '../../services/empenhosForaDoContratoService';
import { CarteiraFilterButton } from '../carteira/CarteiraFilterButton';
import { CarteiraFilterBar, CarteiraGestorSelect, carteiraCounter } from '../carteira/CarteiraFilterBar';
import { CarteiraNoResults } from '../carteira/CarteiraNoResults';
import { CarteiraPagination } from '../carteira/CarteiraPagination';
import { CarteiraSegmentTabs } from '../carteira/CarteiraSegmentTabs';
import { CarteiraSortHeader } from '../carteira/CarteiraSortHeader';
import { CarteiraIdLink, abrirAoClicarNaLinha } from '../carteira/CarteiraRowLink';
import { CarteiraCellFilter } from '../carteira/CarteiraCellFilter';
import { carteiraFornecedor, carteiraTableShell, carteiraTd, carteiraTh } from '../carteira/carteiraStyles';
import { hasActiveCarteiraFilters, useCarteiraFilters, type CarteiraFilterSchema } from '../carteira/carteiraFilters';
import { TODOS_GESTORES, listGestores, matchesGestorFilter } from '../carteira/carteiraGestor';
import { formatCurrency } from '../carteira/carteiraFormat';
import { useCarteiraPagination } from '../carteira/useCarteiraPagination';
import { useCarteiraSort, type CarteiraSortColumn } from '../carteira/useCarteiraSort';
import { useContratosDoFinanceiro, uasgDaChave } from '../financeiro/useContratosDoFinanceiro';
import { dataBR, normalizarBusca } from '../financeiro/financeiroFormat';
import { VinculacaoPageHeader } from './VinculacaoPageHeader';
import { PainelDaConferencia, VouCorrigirDialog } from './ConferenciaForaDoContrato';
import { abrirContratosGov, deixadaComoEsta, noSegmento, passaVigencia, pedeOGestor, type FiltroVigencia, type SegmentoForaDoContrato } from './vinculacaoEmpenhos';
import { MarcaDeixada, textoEncerrado, useDeixarComoEsta } from './DeixarComoEsta';
import { chaveAvisoDeixarFatura } from '../../services/avisosResolvidosService';

interface Filtros {
  situacao: SegmentoForaDoContrato;
  vigencia: string;
  veredito: string;
  uasg: string;
  gestor: string;
  busca: string;
}
const TODOS = 'TODOS';
const PAGE_SIZE = 20;
const SCHEMA: CarteiraFilterSchema<Filtros> = {
  situacao: { param: 'situacao', default: 'A_CONFERIR' },
  vigencia: { param: 'vigencia', default: 'VIGENTES', values: ['VIGENTES', 'ENCERRADOS', TODOS] },
  veredito: { param: 'conferencia', default: TODOS },
  uasg: { param: 'uasg', default: TODOS },
  gestor: { param: 'gestor', default: TODOS_GESTORES },
  busca: { param: 'busca', default: '' }
};
const subtle: React.CSSProperties = { fontSize: '0.75rem', color: '#64748b', fontWeight: 600 };
const COR_DO_VEREDITO: Record<VereditoForaDoContrato, StatusBadgeVariant> = {
  EM_OUTRO_CONTRATO: 'info',
  NOTA_EM_DOBRO: 'warning',
  FORA_DOS_CONTRATOS: 'danger'
};
const COLUNAS = 6;

/**
 * Vínculos → Empenhos ao contrato: notas que uma fatura cita e que o Contratos.gov.br não lista no contrato da
 * fatura. A correção é sempre lá, feita pelo próprio gestor; aqui ele confere o que aconteceu e marca "Vou corrigir".
 * A linha sai da fila quando a sincronização trouxer a correção (migration 117).
 */
export const EmpenhosContratoPage: React.FC = () => {
  const navigate = useNavigateWithOrigin();
  const { role } = useAuth();
  const podeMarcar = role === 'admin' || role === 'gestor';
  const toast = useToast();
  const consulta = useEmpenhosForaDoContrato();
  const acoes = useAcoesCorrecaoNaFonte();
  const { contrato, escopo, showGestorFilter, isLoading: carregandoContratos } = useContratosDoFinanceiro();
  const { filters, setFilter, resetFilters } = useCarteiraFilters(SCHEMA);
  const [abertas, setAbertas] = useState<Set<string>>(new Set());
  const [marcando, setMarcando] = useState<EmpenhoForaDoContrato | null>(null);

  // Contrato encerrado: se a correção na fonte não muda mais nada, o gestor deixa a linha como está (sai da fila e do menu).
  const deixar = useDeixarComoEsta(
    'A fatura continua citando a nota fora do contrato no Contratos.gov.br; só a fila e o número do menu deixam de cobrar. Se o contrato voltar a ficar vigente, a linha volta à fila. Dá para reexibir a qualquer momento.'
  );
  const marcaDe = (l: EmpenhoForaDoContrato) => deixar.porChave.get(chaveAvisoDeixarFatura(l.contractKey, l.idFatura, l.idEmpenhoGov));
  const deixada = (l: EmpenhoForaDoContrato) => deixadaComoEsta(contrato(l.contractKey).expirado, Boolean(marcaDe(l)));

  const noEscopo = useMemo(() => {
    const linhas = consulta.data ?? [];
    return escopo ? linhas.filter((l) => escopo.has(l.contractKey)) : linhas;
  }, [consulta.data, escopo]);
  // O filtro Vigência vale para todos os segmentos; as deixadas como está só aparecem em "Todas".
  const todas = useMemo(
    () => noEscopo.filter((l) => passaVigencia(contrato(l.contractKey).expirado, filters.vigencia as FiltroVigencia)),
    [noEscopo, contrato, filters.vigencia]
  );
  const doContrato = (l: EmpenhoForaDoContrato) => contrato(l.contractKey);
  const contagem = useMemo(
    () => ({
      A_CONFERIR: todas.filter((l) => noSegmento(l, 'A_CONFERIR') && !deixada(l)).length,
      CORRIGINDO: todas.filter((l) => noSegmento(l, 'CORRIGINDO') && !deixada(l)).length,
      TODAS: todas.length
    }),
    [todas, deixar.porChave, contrato] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const doSegmento = useMemo(
    () => todas.filter((l) => noSegmento(l, filters.situacao) && (filters.situacao === 'TODAS' || !deixada(l))),
    [todas, filters.situacao, deixar.porChave, contrato] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const uasgs = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of doSegmento) m.set(uasgDaChave(l.contractKey), (m.get(uasgDaChave(l.contractKey)) ?? 0) + 1);
    return m;
  }, [doSegmento]);
  const gestores = useMemo(() => listGestores(doSegmento.map((l) => contrato(l.contractKey).gestorNome)), [doSegmento, contrato]);

  const lista = useMemo(() => {
    const q = normalizarBusca(filters.busca);
    return doSegmento.filter((l) => {
      const c = contrato(l.contractKey);
      if (filters.veredito !== TODOS && l.veredito !== filters.veredito) return false;
      if (filters.uasg !== TODOS && uasgDaChave(l.contractKey) !== filters.uasg) return false;
      if (showGestorFilter && !matchesGestorFilter(c.gestorNome, filters.gestor)) return false;
      if (
        q &&
        ![l.numeroEmpenho, c.numero, l.fatura.numero ?? '', c.fornecedorNome ?? ''].some((t) => normalizarBusca(t).includes(q))
      )
        return false;
      return true;
    });
  }, [doSegmento, filters, contrato, showGestorFilter]);

  const colunas = useMemo<Record<string, CarteiraSortColumn<EmpenhoForaDoContrato>>>(
    () => ({
      empenho: { value: (l) => l.numeroEmpenho },
      fatura: { value: (l) => l.fatura.emissao, firstDir: 'desc' },
      contrato: { value: (l) => contrato(l.contractKey).numero.split('/').reverse().join('/') },
      conferencia: { value: (l) => ROTULO_DO_VEREDITO[l.veredito] },
      valor: { value: (l) => l.fatura.valorLiquido, firstDir: 'desc' },
      gestor: { value: (l) => contrato(l.contractKey).gestorNome }
    }),
    [contrato]
  );
  const { sorted, sortKey, sortDir, toggle } = useCarteiraSort(lista, colunas);
  const sort = { activeKey: sortKey, activeDir: sortDir, onSort: toggle };
  const { currentPage, setPage, pageItems } = useCarteiraPagination(sorted, React.useCallback((l: EmpenhoForaDoContrato) => l.chave, []), PAGE_SIZE);

  const abrirFatura = (l: EmpenhoForaDoContrato) => navigate(`/contratos/${encodeURIComponent(l.contractKey)}?aba=pagamentos&abrir=${l.idFatura}`);
  const alternar = (chave: string) =>
    setAbertas((atual) => {
      const nova = new Set(atual);
      if (nova.has(chave)) nova.delete(chave);
      else nova.add(chave);
      return nova;
    });

  const marcar = (tipo: TipoDeCorrecao, observacao: string) => {
    if (!marcando) return;
    const alvo = marcando;
    // Abre o portal no próprio clique (depois de esperar o banco, o navegador bloquearia a nova aba).
    abrirContratosGov();
    acoes.marcar.mutate(
      { idFatura: alvo.idFatura, idEmpenhoGov: alvo.idEmpenhoGov, tipo, observacao },
      {
        onSuccess: () => {
          setMarcando(null);
          toast.success(`${alvo.numeroEmpenho} marcada: corrigindo no Contratos.gov.br.`);
        }
      }
    );
  };
  const desfazer = (l: EmpenhoForaDoContrato) =>
    acoes.desfazer.mutate(
      { idFatura: l.idFatura, idEmpenhoGov: l.idEmpenhoGov },
      {
        onSuccess: () => toast.success(`${l.numeroEmpenho} voltou para "A conferir".`),
        onError: (err) => toast.error(err.message)
      }
    );

  if (consulta.error && !consulta.data) {
    return (
      <PageContainer style={{ padding: '2rem 0' }}>
        <ErrorState title="Erro ao carregar as notas" message={consulta.error.message} onRetry={() => void consulta.refetch()} />
      </PageContainer>
    );
  }
  const hasActive = hasActiveCarteiraFilters(SCHEMA, filters) && filters.situacao === SCHEMA.situacao.default;
  const isBusy = consulta.isLoading || carregandoContratos;
  const colunasDaTabela = COLUNAS + (showGestorFilter ? 1 : 0);

  return (
    <PageContainer style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <VinculacaoPageHeader
        title="Empenhos citados fora do contrato"
        subtitle="Notas que uma fatura cita, mas que o Contratos.gov.br não lista no contrato da fatura."
        hint={'Abra a conferência para ver o que aconteceu. A correção é sempre no Contratos.gov.br: incluir a nota no contrato, mudar a fatura de contrato ou corrigir o número. Marque "Vou corrigir" e corrija lá: a linha fica com seu nome e sai sozinha quando a sincronização trouxer a correção. Em contrato encerrado, se a correção não muda mais nada, deixe como está, com justificativa.'}
      />

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
            testIdPrefix="vinc-ne-contrato-situacao"
            ariaLabel="Situação da nota"
            active={filters.situacao}
            onSelect={(v) => setFilter('situacao', v)}
            segments={[
              { id: 'A_CONFERIR', label: 'A conferir', count: contagem.A_CONFERIR, dot: 'var(--color-warning)', title: 'Notas que pedem o gestor' },
              { id: 'CORRIGINDO', label: 'Corrigindo na fonte', count: contagem.CORRIGINDO, dot: 'var(--primary)', title: 'Marcadas como em correção há menos de 7 dias' },
              { id: 'TODAS', label: 'Todas', count: contagem.TODAS }
            ]}
          />

          <CarteiraFilterBar
            busca={filters.busca}
            searchPlaceholder="Buscar por empenho, contrato, fatura, fornecedor..."
            onChangeBusca={(v) => setFilter('busca', v)}
            hasActiveFilters={hasActive}
            onResetFilters={resetFilters}
            counter={carteiraCounter(lista.length, doSegmento.length, hasActive, 'nota', 'notas')}
            testIdPrefix="vinc-ne-contrato"
          >
            <CarteiraFilterButton
              label="Vigência"
              value={filters.vigencia}
              emptyValue={TODOS}
              options={[
                { value: 'VIGENTES', label: 'Vigentes' },
                { value: 'ENCERRADOS', label: 'Encerrados', count: noEscopo.filter((l) => pedeOGestor(l) && contrato(l.contractKey).expirado).length }
              ]}
              onChange={(v) => setFilter('vigencia', v)}
              testId="vinc-ne-contrato-filter-vigencia"
            />
            <CarteiraFilterButton
              label="Conferência"
              value={filters.veredito}
              emptyValue={TODOS}
              options={(Object.keys(ROTULO_DO_VEREDITO) as VereditoForaDoContrato[]).map((v) => ({
                value: v,
                label: ROTULO_DO_VEREDITO[v],
                count: doSegmento.filter((l) => l.veredito === v).length
              }))}
              onChange={(v) => setFilter('veredito', v)}
              testId="vinc-ne-contrato-filter-conferencia"
            />
            <CarteiraFilterButton label="UASG" value={filters.uasg} emptyValue={TODOS} options={[...uasgs.keys()].sort().map((u) => ({ value: u, label: u, count: uasgs.get(u) }))} onChange={(v) => setFilter('uasg', v)} testId="vinc-ne-contrato-filter-uasg" />
            {showGestorFilter && <CarteiraGestorSelect value={filters.gestor} gestores={gestores} onChange={(v) => setFilter('gestor', v)} testId="vinc-ne-contrato-filter-gestor" />}
          </CarteiraFilterBar>

          {todas.length === 0 ? (
            <EmptyState
              title="Nenhuma fatura cita empenho fora do contrato."
              description="Quando o Contratos.gov.br trouxer uma fatura com nota que não está no contrato, ela aparece aqui."
              testId="vinc-ne-contrato-vazio"
            />
          ) : lista.length === 0 ? (
            <CarteiraNoResults title="Nenhuma nota corresponde aos filtros." description="Altere os critérios ou limpe os filtros." onResetFilters={resetFilters} />
          ) : (
            <div data-testid="vinc-ne-contrato-table" className="carteira-shell" style={carteiraTableShell}>
              <div style={{ overflowX: 'auto' }}>
                <table className="carteira-stack" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <CarteiraSortHeader label="Empenho citado" sortKey="empenho" {...sort} />
                      <CarteiraSortHeader label="Fatura" sortKey="fatura" {...sort} />
                      <CarteiraSortHeader label="Contrato" sortKey="contrato" {...sort} />
                      <CarteiraSortHeader label="Conferência" sortKey="conferencia" {...sort} />
                      <CarteiraSortHeader label="Valor da fatura" sortKey="valor" align="right" {...sort} />
                      {showGestorFilter && <CarteiraSortHeader label="Gestor" sortKey="gestor" {...sort} />}
                      <th style={{ ...carteiraTh, textAlign: 'right' }}>Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems.map((l) => {
                      const c = doContrato(l);
                      const aberta = abertas.has(l.chave);
                      return (
                        <React.Fragment key={l.chave}>
                          <tr
                            data-testid={`vinc-ne-contrato-row-${l.chave}`}
                            className="carteira-row-link"
                            onClick={abrirAoClicarNaLinha(() => abrirFatura(l))}
                            style={aberta ? { background: 'var(--primary-soft, #e0e7f5)' } : undefined}
                          >
                            <td data-role="id" style={{ ...carteiraTd, minWidth: '150px' }}>
                              <CarteiraIdLink onClick={() => abrirFatura(l)} label={`Ver a fatura que cita ${l.numeroEmpenho}`} title="Abrir a fatura no contrato">
                                {l.numeroEmpenho}
                              </CarteiraIdLink>
                            </td>
                            <td data-label="Fatura" style={carteiraTd}>
                              <strong>{l.fatura.numero || l.idFatura}</strong>
                              <div style={subtle}>
                                {l.fatura.referencia ? `ref. ${l.fatura.referencia} · ` : ''}
                                {dataBR(l.fatura.emissao)}
                              </div>
                            </td>
                            <td data-label="Contrato" style={{ ...carteiraTd, minWidth: '180px', maxWidth: '300px' }}>
                              <strong>{c.numero}</strong>
                              <div style={carteiraFornecedor} title={c.fornecedorNome}>
                                {c.fornecedorNome ?? '—'}
                              </div>
                              {c.expirado && <div style={subtle}>{textoEncerrado(c.vigenciaFim)}</div>}
                            </td>
                            <td data-label="Conferência" style={carteiraTd}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', alignItems: 'flex-start' }}>
                                {deixada(l) ? (
                                  <MarcaDeixada marca={marcaDe(l)!} testId={`vinc-ne-contrato-deixada-${l.chave}`} />
                                ) : l.situacao === 'CORRIGINDO' && l.correcao ? (
                                  <StatusBadge
                                    label={`Corrigindo na fonte · ${l.correcao.porNome || '—'}, ${new Date(l.correcao.em).toLocaleDateString('pt-BR')}`}
                                    variant="info"
                                    size="sm"
                                    dot={false}
                                    testId={`vinc-ne-contrato-corrigindo-${l.chave}`}
                                  />
                                ) : (
                                  <StatusBadge label={ROTULO_DO_VEREDITO[l.veredito]} variant={COR_DO_VEREDITO[l.veredito]} size="sm" dot={false} />
                                )}
                                {!deixada(l) && l.situacao === 'CORRECAO_NAO_CHEGOU' && <span style={{ fontSize: '0.75rem', color: 'var(--warning)' }}>A correção não chegou</span>}
                              </div>
                            </td>
                            <td data-label="Valor da fatura" style={{ ...carteiraTd, textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 700 }}>{formatCurrency(l.fatura.valorLiquido)}</td>
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
                                  onClick={() => alternar(l.chave)}
                                  data-testid={`vinc-ne-contrato-conferir-${l.chave}`}
                                />
                                {podeMarcar && deixada(l) && (
                                  <ActionButton
                                    action="reexibir"
                                    size="sm"
                                    title="Tira a marca: a linha volta para a fila"
                                    onClick={() => deixar.reexibir(chaveAvisoDeixarFatura(l.contractKey, l.idFatura, l.idEmpenhoGov), l.numeroEmpenho)}
                                    disabled={deixar.reexibindo}
                                    data-testid={`vinc-ne-contrato-reexibir-${l.chave}`}
                                  />
                                )}
                                {podeMarcar && c.expirado && !deixada(l) && (
                                  <ActionButton
                                    action="deixarComoEsta"
                                    size="sm"
                                    title="Contrato encerrado: a linha sai da fila e do número do menu, com justificativa"
                                    onClick={() =>
                                      deixar.abrir({
                                        chave: chaveAvisoDeixarFatura(l.contractKey, l.idFatura, l.idEmpenhoGov),
                                        titulo: l.numeroEmpenho,
                                        contexto: `fatura ${l.fatura.numero || l.idFatura} · ${formatCurrency(l.fatura.valorLiquido)} · contrato ${c.numero}${c.fornecedorNome ? ` (${c.fornecedorNome})` : ''}, ${textoEncerrado(c.vigenciaFim)}`
                                      })
                                    }
                                    data-testid={`vinc-ne-contrato-deixar-${l.chave}`}
                                  />
                                )}
                                {podeMarcar && !deixada(l) && l.situacao === 'CORRIGINDO' && (
                                  <ActionButton
                                    action="desfazer"
                                    label="Desfazer marca"
                                    size="sm"
                                    title='Tira a marca e devolve a linha a "A conferir"'
                                    onClick={() => desfazer(l)}
                                    disabled={acoes.desfazer.isPending}
                                    data-testid={`vinc-ne-contrato-desfazer-${l.chave}`}
                                  />
                                )}
                              </div>
                            </td>
                          </tr>
                          {aberta && (
                            <tr data-testid={`vinc-ne-contrato-detalhe-${l.chave}`}>
                              <td colSpan={colunasDaTabela} style={{ padding: '0 0.6rem 1rem', background: 'var(--primary-soft, #e0e7f5)', borderBottom: '1px solid var(--border)' }}>
                                <PainelDaConferencia
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
              <CarteiraPagination page={currentPage} pageSize={PAGE_SIZE} total={sorted.length} onChange={setPage} testIdPrefix="vinc-ne-contrato" />
            </div>
          )}
        </>
      )}

      {deixar.dialog}
      {marcando && (
        <VouCorrigirDialog
          linha={marcando}
          contrato={doContrato(marcando)}
          isLoading={acoes.marcar.isPending}
          erro={acoes.marcar.error?.message}
          onMarcar={marcar}
          onFechar={() => setMarcando(null)}
        />
      )}
    </PageContainer>
  );
};
