import React, { useMemo, useState } from 'react';
import { FileText } from 'lucide-react';
import { PageContainer } from '../../design-system/components/PageContainer';
import { PageHeader } from '../../design-system/components/PageHeader';
import { HeaderRefreshAction } from '../../design-system/components/HeaderRefreshAction';
import { DataTable, type Column } from '../../design-system/components/DataTable';
import { StatusBadge } from '../../design-system/components/StatusBadge';
import { ProgressBar } from '../../design-system/components/ProgressBar';
import { CarteiraSegmentTabs } from '../carteira/CarteiraSegmentTabs';
import { CarteiraFilterBar, carteiraCounter } from '../carteira/CarteiraFilterBar';
import { CarteiraFilterButton } from '../carteira/CarteiraFilterButton';
import { carteiraDetalhe, carteiraNumero, carteiraValor } from '../carteira/carteiraStyles';
import { AdminListShell } from '../admin/shared/AdminListShell';
import { CelulaContrato, CelulaFiscal } from './ContratosFiscalizacaoTabela';
import { COR, linhasDoContrato, type Linha } from '../../utils/fiscalizacaoMesa';
import { useAuth } from '../../context/AuthContext';
import { useNavigateWithOrigin } from '../../hooks/useDetailOrigin';
import { useContratosFiscalizacao, useEntregasFiscalizacao, useFiscaisAtivos } from '../../hooks/useFiscalizacao';
import type { ContratoFiscalizacao, EntregaFiscalizacao } from '../../services/fiscalizacaoService';
import { NOME_SFC, dataBR, fiscaisVisiveis, hojeEmBrasilia, idsDosFiscaisComContrato, rotaDoContrato } from '../../utils/fiscalizacao';
import { FASES_ENTREGA, foiEntregue } from '../../utils/fiscalizacaoEntregas';
import { agrupar, chaveDeOrdem, diasAte, numero, pct, programasDe, qtdTexto, resumir, type Resumo } from '../../utils/fiscalizacaoResumo';
const POR_PAGINA = 25;

// ── Fiscalização › Contratos ─────────────────────────────────────────────────────────────────────

type SegContrato = 'VOCE' | 'OUTROS' | 'FINALIZADO' | 'TODOS';
interface LinhaContrato { c: ContratoFiscalizacao; es: EntregaFiscalizacao[]; r: Resumo; agora: Linha | null; mais: number; dias: number | null; seg: Exclude<SegContrato, 'TODOS'> }

/** Vigência só aparece na lista quando falta pouco (90 dias) e ainda há item a entregar. */
const vigenciaPerto = (l: LinhaContrato, hoje: string) => Boolean(l.c.vigenciaFim && diasAte(l.c.vigenciaFim, hoje) <= 90 && l.es.some((e) => e.responsavel === 'SFC' && !foiEntregue(e)));

/** Contrato: número, fornecedor e, quando falta pouco, a vigência. */
const CelulaContratoDaLista: React.FC<{ l: LinhaContrato; hoje: string; abrir: (c: ContratoFiscalizacao) => void }> = ({ l, hoje, abrir }) => {
  const perto = vigenciaPerto(l, hoje);
  const d = l.c.vigenciaFim ? diasAte(l.c.vigenciaFim, hoje) : null;
  return (
    <>
      <CelulaContrato c={l.c} onAbrir={() => abrir(l.c)} />
      {perto && d != null && <div style={{ ...carteiraDetalhe, color: d < 0 ? 'var(--color-danger-text)' : 'var(--color-warning-text)', fontWeight: 700 }}>{d < 0 ? `vigência acabou em ${dataBR(l.c.vigenciaFim)}` : `vigência acaba em ${d} dias`} · item a entregar</div>}
    </>
  );
};

/**
 * Agora (proposta dos especialistas, 11/11/2026): o próximo passo e o prazo dele numa frase só. Bolinha cheia =
 * com o fiscal; vazia = com outros (CAEP, Exército, fornecedor, financeiro). O prazo é o do passo, numa etiqueta.
 */
const CelulaAgora: React.FC<{ l: LinhaContrato }> = ({ l }) => {
  const x = l.agora;
  if (!x) return <span style={{ ...carteiraDetalhe, marginTop: 0 }}>{l.r.fase === 'FINALIZADO' ? 'fiscalização finalizada' : 'nada pendente'}</span>;
  const etiqueta = l.dias == null ? null : l.dias < 0 ? { texto: `vencido há ${-l.dias} ${l.dias === -1 ? 'dia' : 'dias'}`, tom: 'danger' as const } : l.dias <= 15 ? { texto: l.dias === 0 ? 'vence hoje' : `vence em ${l.dias} ${l.dias === 1 ? 'dia' : 'dias'}`, tom: 'warning' as const } : null;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '10px minmax(0, 1fr)', gap: '0 0.5rem', alignItems: 'start', minWidth: 260 }}>
      <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: '50%', marginTop: '0.35rem', boxSizing: 'border-box', ...(x.tom === 'espera' ? { border: `2px solid ${COR.espera}` } : { background: x.tom === 'vencido' ? COR.vencido : COR.eu }) }} />
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.25rem 0.5rem', fontSize: '0.86rem' }}>
        <span style={{ fontWeight: 700 }}>
          {x.quem && <span style={{ color: '#64748b', fontWeight: 600 }}>{x.quem} · </span>}
          {x.titulo}
        </span>
        {etiqueta && <StatusBadge label={etiqueta.texto} variant={etiqueta.tom} size="sm" dot={false} />}
        {l.mais > 0 && <span style={{ color: '#94a3b8', fontSize: '0.78rem' }}>+{l.mais} {l.mais === 1 ? 'passo' : 'passos'}</span>}
      </div>
    </div>
  );
};

/** Andamento contado em itens (o fiscal pensa em itens); as unidades ficam embaixo, pequenas. */
const CelulaAndamento: React.FC<{ l: LinhaContrato }> = ({ l }) => {
  const sfc = l.es.filter((e) => e.responsavel === 'SFC');
  const feitos = sfc.filter(foiEntregue).length;
  if (sfc.length === 0) return <span style={carteiraDetalhe}>com a área requisitante</span>;
  return (
    <div style={{ minWidth: 150 }}>
      <span style={{ ...carteiraValor, ...carteiraNumero }}>{feitos} de {qtdTexto(sfc.length, 'item', 'itens')}</span>
      <div style={{ margin: '0.3rem 0 0.15rem' }}><ProgressBar value={pct(feitos, sfc.length)} colorScheme={feitos === sfc.length ? 'success' : 'primary'} height="6px" showPercent={false} /></div>
      <div style={carteiraDetalhe}>{numero(l.r.entregues)} de {qtdTexto(l.r.acompanhadas, 'unidade', 'unidades')}</div>
    </div>
  );
};

export const FiscalizacaoContratosPage: React.FC = () => {
  const { user, role } = useAuth();
  const navigate = useNavigateWithOrigin();
  const contratosQ = useContratosFiscalizacao();
  const entregasQ = useEntregasFiscalizacao(null);
  const contratos = useMemo(() => contratosQ.data ?? [], [contratosQ.data]);
  const entregas = useMemo(() => entregasQ.data ?? [], [entregasQ.data]);
  const carregando = contratosQ.isLoading || entregasQ.isLoading;
  const falha = contratosQ.error ?? entregasQ.error;
  const { servidores } = useFiscaisAtivos();
  const fiscais = useMemo(() => fiscaisVisiveis(servidores, idsDosFiscaisComContrato(contratos)), [servidores, contratos]);
  const hoje = hojeEmBrasilia();
  const ehFiscal = role === 'gestor_fiscalizacao';
  const [seg, setSeg] = useState<SegContrato>(ehFiscal ? 'VOCE' : 'TODOS');
  const doFiscalPadrao = ehFiscal && user?.id ? user.id : '';
  const [fiscal, setFiscal] = useState(doFiscalPadrao);
  const [busca, setBusca] = useState('');
  const [prazo, setPrazo] = useState('');
  const [fase, setFase] = useState('');
  const [programa, setPrograma] = useState('');

  const linhas = useMemo<LinhaContrato[]>(() => {
    const porContrato = agrupar(entregas, (e) => e.contractKey);
    return contratos
      .filter((c) => c.situacao === 'SFC' || c.situacao === 'MISTA')
      .map((c) => {
        const es = porContrato.get(c.contractKey) ?? [];
        const r = resumir(es);
        const { comVoce, comOutros } = linhasDoContrato(es, !c.processoSei, () => {}, () => {});
        const agora = comVoce[0] ?? comOutros[0] ?? null;
        const mais = comVoce.length ? comVoce.length - 1 : 0;
        const dias = agora?.limite ? diasAte(agora.limite, hoje) : null;
        const segDe: LinhaContrato['seg'] = r.fase === 'FINALIZADO' ? 'FINALIZADO' : comVoce.length ? 'VOCE' : 'OUTROS';
        return { c, es, r, agora, mais, dias, seg: segDe };
      });
  }, [contratos, entregas, hoje]);
  const doFiscal = linhas.filter((l) => !fiscal || l.c.fiscalUserId === fiscal);
  const conta = (s: SegContrato) => doFiscal.filter((l) => s === 'TODOS' || l.seg === s).length;
  const doSeg = doFiscal.filter((l) => seg === 'TODOS' || l.seg === seg);
  const q = busca.trim().toLowerCase();
  const passaPrazoDoPasso = (l: LinhaContrato, f: string) => !f || (f === 'danger' ? l.dias != null && l.dias < 0 : f === 'warning' ? l.dias != null && l.dias >= 0 && l.dias <= 15 : l.dias == null || l.dias > 15);
  const filtradas = doSeg
    .filter((l) => !q || `${l.c.numero} ${l.c.fornecedor ?? ''} ${l.c.objeto ?? ''} ${l.c.emendas.join(' ')}`.toLowerCase().includes(q))
    .filter((l) => passaPrazoDoPasso(l, prazo))
    .filter((l) => !fase || l.r.fase === fase)
    .filter((l) => !programa || programasDe(l.es).includes(programa))
    // Vencidos primeiro (o mais antigo no topo), depois os que vencem logo, por fim os sem prazo.
    .sort((a, b) => (a.dias ?? 99999) - (b.dias ?? 99999));
  const ativos = Boolean(busca || prazo || fase || programa || (fiscal && fiscal !== doFiscalPadrao));
  const progs = [...new Set(doSeg.flatMap((l) => programasDe(l.es)))];

  const colunas: Column<LinhaContrato>[] = [
    { key: 'contrato', header: 'Contrato', minWidth: '210px', priority: 'primary', sortValue: (l) => chaveDeOrdem(l.c.numero), render: (l) => <CelulaContratoDaLista l={l} hoje={hoje} abrir={(c) => navigate(rotaDoContrato(c))} /> },
    { key: 'passo', header: 'Próximo passo', minWidth: '320px', sortValue: (l) => l.dias ?? 99999, render: (l) => <CelulaAgora l={l} /> },
    { key: 'entrega', header: 'Entrega', sortValue: (l) => pct(l.r.entregues, l.r.acompanhadas), render: (l) => <CelulaAndamento l={l} /> },
    // Fiscal: texto simples e sempre visível, como a coluna Gestor da Carteira.
    { key: 'fiscal', header: 'Fiscal', sortValue: (l) => l.c.fiscalNome, render: (l) => <CelulaFiscal c={l.c} /> }
  ];

  return (
    <PageContainer style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <PageHeader
        title="Contratos"
        subtitle={`Contratos que a ${NOME_SFC} fiscaliza: o que fazer agora em cada um.`}
        hint="Próximo passo: o próximo passo do contrato e o prazo dele, o mesmo da mesa do Contrato 360. Bolinha cheia, o passo é do fiscal; vazia, o contrato está com outros (CAEP, Exército, fornecedor, financeiro). Os botões ficam no Contrato 360, que a linha abre."
        icon={<FileText size={26} color="var(--primary)" aria-hidden="true" />}
        actions={<HeaderRefreshAction onRefresh={() => Promise.all([contratosQ.refetch(), entregasQ.refetch()])} isRefreshing={contratosQ.isFetching || entregasQ.isFetching} lastUpdated={entregasQ.dataUpdatedAt || null} dataTestId="fisc-contratos-atualizar" tooltipTitle="Recarregar os contratos" />}
      />
      <CarteiraSegmentTabs<SegContrato>
        testIdPrefix="fisc-contratos-seg"
        ariaLabel="Com quem está o contrato"
        active={seg}
        onSelect={setSeg}
        segments={[
          { id: 'VOCE', label: ehFiscal ? 'Com você' : 'Com o fiscal', count: conta('VOCE'), dot: 'var(--primary)' },
          { id: 'OUTROS', label: 'Com outros', count: conta('OUTROS'), dot: 'var(--color-warning)' },
          { id: 'TODOS', label: 'Todos', count: conta('TODOS') },
          { id: 'FINALIZADO', label: 'Finalizados', count: conta('FINALIZADO') }
        ]}
      />
      <CarteiraFilterBar
        busca={busca}
        searchPlaceholder="Buscar por contrato, fornecedor, objeto ou emenda..."
        onChangeBusca={setBusca}
        hasActiveFilters={ativos}
        onResetFilters={() => { setBusca(''); setPrazo(''); setFase(''); setPrograma(''); setFiscal(doFiscalPadrao); }}
        counter={carteiraCounter(filtradas.length, doSeg.length, ativos, 'contrato', 'contratos')}
        testIdPrefix="fisc-contratos"
      >
        <CarteiraFilterButton label="Fiscal" value={fiscal} emptyValue="" options={fiscais.map((f) => ({ value: f.id, label: f.id === user?.id ? `${f.nome} (você)` : f.nome, count: linhas.filter((l) => l.c.fiscalUserId === f.id).length }))} onChange={setFiscal} testId="fisc-contratos-filtro-fiscal" />
        <CarteiraFilterButton label="Prazo" value={prazo} emptyValue="" options={[{ value: 'danger', label: 'Vencido', count: doSeg.filter((l) => passaPrazoDoPasso(l, 'danger')).length }, { value: 'warning', label: 'Vence em 15 dias', count: doSeg.filter((l) => passaPrazoDoPasso(l, 'warning')).length }, { value: 'neutral', label: 'Em dia ou sem prazo', count: doSeg.filter((l) => passaPrazoDoPasso(l, 'neutral')).length }]} onChange={setPrazo} testId="fisc-contratos-filtro-prazo" />
        <CarteiraFilterButton label="Fase" value={fase} emptyValue="" options={FASES_ENTREGA.map((f) => ({ value: f.id, label: f.nome, count: doSeg.filter((l) => l.r.fase === f.id).length }))} onChange={setFase} testId="fisc-contratos-filtro-fase" />
        <CarteiraFilterButton label="Programa" value={programa} emptyValue="" options={progs.map((p) => ({ value: p, label: p, count: doSeg.filter((l) => programasDe(l.es).includes(p)).length }))} onChange={setPrograma} testId="fisc-contratos-filtro-programa" />
      </CarteiraFilterBar>
      <AdminListShell testId="fisc-contratos-lista" isLoading={carregando} isError={Boolean(falha)} errorTitle="Não foi possível carregar os contratos" errorMessage={falha?.message} onRetry={() => { void contratosQ.refetch(); void entregasQ.refetch(); }} isEmpty={!carregando && filtradas.length === 0} emptyTitle={seg === 'VOCE' ? 'Nada com você agora.' : 'Nenhum contrato nesta situação.'} emptyDescription="Ajuste a busca ou os filtros.">
        <DataTable<LinhaContrato> testId="fisc-contratos-tabela" className="data-table-container--flush" data={filtradas.slice(0, POR_PAGINA)} keyExtractor={(l) => l.c.contractKey} columns={colunas} rowOpen={(l) => () => navigate(rotaDoContrato(l.c))} />
      </AdminListShell>
    </PageContainer>
  );
};
