import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowRight, ChevronDown, ChevronRight, FileText, Link2, Package, UserPlus, UserX, Users, ArrowLeftRight } from 'lucide-react';
import { ContractsPartialNotice } from '../../carteira/ContractsPartialNotice';
import { PageContainer } from '../../../design-system/components/PageContainer';
import { PageHeader } from '../../../design-system/components/PageHeader';
import { HeaderRefreshAction } from '../../../design-system/components/HeaderRefreshAction';
import { SkeletonLoader } from '../../../design-system/components/SkeletonLoader';
import { ErrorState } from '../../../design-system/components/ErrorState';
import { EmptyState } from '../../../design-system/components/EmptyState';
import { carteiraButton, carteiraSelect, carteiraTableShell, carteiraTd, carteiraTh } from '../../carteira/carteiraStyles';
import { CARTEIRA_EXPANDED_CELL_STYLE } from '../../carteira/CarteiraDetailLabel';
import { DistribuicaoItens } from './DistribuicaoItens';
import { formatCurrencyCompact } from '../../carteira/carteiraFormat';
import { SEM_GESTOR } from '../../carteira/carteiraGestor';
import { canAssignManager } from '../../carteira/ManagerAssign';
import { AtribuirGestorModal } from './AtribuirGestorModal';
import { ContratosSemAtaSection } from './ContratosSemAtaSection';
import { buildPendenciasDistribuicao, type ContratoAVincular } from './contratosSemAta';
import { AtasSemGestorSection } from './AtasSemGestorSection';
import { useContratosSemAta } from '../../../hooks/useContratosSemAta';
import type { ManagerTarget } from '../../../services/managerAssignmentService';
import { useAuth } from '../../../context/AuthContext';
import { useAtasPortfolio, getArpPrazo } from '../../../hooks/useAtasPortfolio';
import { useContractsPortfolio } from '../../../hooks/useContractsPortfolio';
import { useArpItemContractLinks } from '../../../hooks/useAtaManagers';
import { useComplexidadeAjustes } from '../../../hooks/useComplexidadeAjustes';
import { formatContractNumber } from '../../../utils/contractNumber';
import {
  buildDistribuicaoEquipe,
  isVigente,
  ordenarDistribuicao,
  FAIXA_MEDIA_EQUIPE,
  type DistribuicaoLinha
} from './distribuicaoEquipe';
import { mesesDeVigencia, PESO_COMPLEXIDADE, ROTULO_COMPLEXIDADE, type NivelComplexidade } from './complexidade';

/** Carteira filtrada por gestor (o filtro padrão de situação já é "Vigentes", o mesmo critério desta tela). */
function carteiraPath(base: '/atas' | '/contratos', gestorNome: string | null): string {
  return `${base}?${new URLSearchParams({ gestor: gestorNome ?? SEM_GESTOR })}`;
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** Itens e fornecedores distintos (CNPJ) da ata, para a complexidade. */
function contarItensEFornecedores(itens?: Array<{ niFornecedor?: string }>): { itens: number; fornecedores: number } {
  const lista = itens || [];
  const cnpjs = new Set(lista.map((i) => (i.niFornecedor || '').replace(/\D/g, '')).filter(Boolean));
  return { itens: lista.length, fornecedores: cnpjs.size };
}

/** Categoria do contrato: `categoria` no Contratos.gov.br, `nomeCategoria` no Compras.gov.br. */
function categoriaDoContrato(raw: unknown): string | undefined {
  const r = raw as { categoria?: unknown; nomeCategoria?: unknown } | undefined;
  const c = r?.categoria ?? r?.nomeCategoria;
  return typeof c === 'string' ? c : undefined;
}

/** Cores das faixas de complexidade (barra empilhada e etiquetas). */
export const COR_COMPLEXIDADE: Record<NivelComplexidade, string> = { ALTA: '#0c326f', MEDIA: '#5b8bd6', BAIXA: '#c7d7f0' };
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
      <div
        style={{ display: 'flex', height: '8px', borderRadius: '4px', overflow: 'hidden', background: '#f1f5f9' }}
        aria-hidden="true"
      >
        {total > 0 && NIVEIS.map((n) => (
          <div key={n} style={{ width: `${(l.complexidade[n] / total) * 100}%`, background: COR_COMPLEXIDADE[n] }} />
        ))}
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
    {l.relacaoEquipe && (
      <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', whiteSpace: 'nowrap' }}>{RELACAO_ROTULO[l.relacaoEquipe]}</div>
    )}
  </div>
);

/** Pressão do momento: o que aperta agora (não muda a carga estrutural). */
const PressaoCell: React.FC<{ l: DistribuicaoLinha; aVincular?: number }> = ({ l, aVincular = 0 }) => {
  const vencendo = l.atas.criticos + l.atas.atencao + l.contratos.criticos + l.contratos.atencao;
  const partes: Array<{ texto: string; cor: string }> = [];
  if (l.pendencias.urgentes > 0) partes.push({ texto: plural(l.pendencias.urgentes, 'urgente', 'urgentes'), cor: '#b91c1c' });
  if (l.pendencias.atrasadas > 0) partes.push({ texto: plural(l.pendencias.atrasadas, 'tarefa atrasada', 'tarefas atrasadas'), cor: '#b91c1c' });
  if (l.pendencias.acompanhar > 0) partes.push({ texto: `${l.pendencias.acompanhar} a acompanhar`, cor: '#b45309' });
  if (vencendo > 0) partes.push({ texto: `${vencendo} ${vencendo === 1 ? 'vence' : 'vencem'} em até 90 dias`, cor: '#b45309' });
  if (aVincular > 0) partes.push({ texto: `${aVincular} ${aVincular === 1 ? 'contrato' : 'contratos'} a vincular`, cor: '#1e3a8a' });
  if (partes.length === 0) return <span style={{ color: '#94a3b8' }}>—</span>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem', fontSize: '0.75rem', fontWeight: 700 }}>
      {partes.map((p) => (
        <span key={p.texto} style={{ color: p.cor, whiteSpace: 'nowrap' }}>{p.texto}</span>
      ))}
    </div>
  );
};

interface KpiTileProps {
  label: string;
  value: React.ReactNode;
  hint: string;
  icon: React.ComponentType<{ size?: number }>;
  tone: 'neutral' | 'warning' | 'danger';
  onClick?: () => void;
  testId: string;
}

const TONES = {
  neutral: { color: '#0c326f', bg: '#eff6ff', border: '#e2e8f0' },
  warning: { color: '#b45309', bg: '#fffbeb', border: '#fde68a' },
  danger: { color: '#b91c1c', bg: '#fef2f2', border: '#fecaca' }
};

const KpiTile: React.FC<KpiTileProps> = ({ label, value, hint, icon: Icon, tone, onClick, testId }) => {
  const t = TONES[tone];
  const content = (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{label}</span>
        <div style={{ background: t.bg, color: t.color, padding: '0.35rem', borderRadius: '6px', display: 'flex' }}>
          <Icon size={16} />
        </div>
      </div>
      <div style={{ fontSize: '1.6rem', fontWeight: 900, color: t.color, letterSpacing: '-0.02em', lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{hint}</div>
    </>
  );
  const style: React.CSSProperties = {
    background: '#ffffff',
    border: `2px solid ${t.border}`,
    borderRadius: '10px',
    padding: '0.95rem 1.1rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.45rem',
    textAlign: 'left',
    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.03)'
  };
  return onClick ? (
    <button type="button" onClick={onClick} data-testid={testId} style={{ ...style, cursor: 'pointer' }}>{content}</button>
  ) : (
    <div data-testid={testId} style={style}>{content}</div>
  );
};

/**
 * Central de Distribuição: carteira vigente (atas e contratos) por gestor, para o coordenador
 * acompanhar a carga de cada um, o que está sem gestor e contratos com gestor diferente da ata.
 */
export const DistribuicaoEquipePage: React.FC = () => {
  const navigate = useNavigate();
  const atas = useAtasPortfolio();
  const contratos = useContractsPortfolio();
  const { data: links = [], isLoading: linksLoading } = useArpItemContractLinks();
  // Só quem pode atribuir (admin) vê as ações de transferir; o leitor acompanha.
  const { role } = useAuth();
  const canAssign = canAssignManager(role);
  // Ajuste manual de complexidade: só o coordenador (a RPC também exige admin).
  const canAjustar = role === 'admin';
  const { data: ajustes } = useComplexidadeAjustes();
  const { data: confirmacoesSemAta = {}, isLoading: semAtaLoading } = useContratosSemAta();

  // "Para quem atribuo?" aberto: alvos (carteira inteira de um gestor ou itens marcados), de quem saem e o que fazer ao salvar.
  const [transferencia, setTransferencia] = React.useState<{ targets: ManagerTarget[]; origem: string | null; done?: () => void; provaveis?: number } | null>(null);
  const [expanded, setExpanded] = React.useState<string | null>(null);
  const [ordem, setOrdem] = React.useState<'NOME' | 'CARGA'>('NOME');
  const carteiraTargets = (l: DistribuicaoLinha): ManagerTarget[] => [
    ...l.ataKeys.map((ataKey) => ({ tipo: 'ATA' as const, ataKey })),
    ...l.contractKeys.map((contractKey) => ({ tipo: 'CONTRATO' as const, contractKey }))
  ];

  const distribuicao = useMemo(
    () =>
      buildDistribuicaoEquipe({
        atas: atas.scopedArps.map((arp) => ({
          numeroAta: arp.numeroAtaRegistroPreco,
          uasg: arp.codigoUnidadeGerenciadora,
          objeto: arp.objeto,
          dias: getArpPrazo(arp).dias,
          faixa: getArpPrazo(arp).faixa,
          valor: Number(arp.valorTotal) || 0,
          gestorNome: atas.gestorByAta[arp.numeroAtaRegistroPreco],
          ...contarItensEFornecedores(atas.itemsByAta[`${arp.numeroAtaRegistroPreco}-${arp.codigoUnidadeGerenciadora}`])
        })),
        contratos: contratos.rows.map((row) => ({
          contractKey: row.contractKey,
          numero: formatContractNumber(row.contract),
          objeto: row.contract.objeto,
          dias: row.diasRestantes,
          faixa: row.faixa,
          valor: row.contract.valorGlobal || row.contract.valorInicial || 0,
          gestorNome: row.gestorNome,
          categoria: categoriaDoContrato(row.contract.raw),
          mesesVigencia: mesesDeVigencia(row.contract.dataVigenciaInicio, row.contract.dataVigenciaFim)
        })),
        links,
        attentionItems: contratos.attentionItems,
        ajustes
      }),
    [atas.scopedArps, atas.gestorByAta, atas.itemsByAta, contratos.rows, contratos.attentionItems, links, ajustes]
  );

  // Pendências de distribuição: atas sem gestor, contratos sem gestor e sem ata e contratos a vincular por
  // gestor. Atas encerradas entram nas sugestões (o contrato costuma durar mais que a ata de onde veio).
  const pendencias = useMemo(() => {
    const ataDoContrato = new Map(links.map((l) => [l.contractKey, l.ataKey]));
    return buildPendenciasDistribuicao({
      contratos: contratos.rows.map((row) => ({
        contractKey: row.contractKey,
        numero: formatContractNumber(row.contract),
        fornecedorNome: row.contract.fornecedorNome,
        fornecedorCnpj: row.contract.fornecedorCnpjCpf,
        idCompra: row.contract.idCompra,
        objeto: row.contract.objeto,
        faixa: row.faixa,
        dias: row.diasRestantes,
        gestorNome: row.gestorNome,
        contract: row.contract
      })),
      atas: atas.arps.map((arp) => {
        const itens = atas.itemsByAta[`${arp.numeroAtaRegistroPreco}-${arp.codigoUnidadeGerenciadora}`] || [];
        const prazo = getArpPrazo(arp);
        return {
          numeroAta: arp.numeroAtaRegistroPreco,
          uasg: arp.codigoUnidadeGerenciadora,
          idCompra: arp.idCompra,
          numeroCompra: arp.numeroCompra,
          anoCompra: arp.anoCompra,
          cnpjs: Array.from(new Set(itens.map((i) => (i.niFornecedor || '').replace(/\D/g, '')).filter(Boolean))),
          gestorNome: atas.gestorByAta[arp.numeroAtaRegistroPreco],
          objeto: arp.objeto,
          fornecedorNome: itens[0]?.nomeRazaoSocialFornecedor,
          faixa: prazo.faixa,
          dias: prazo.dias,
          itens: itens.length
        };
      }),
      ataDoContrato,
      naoPertencemAAta: new Set(Object.keys(confirmacoesSemAta))
    });
  }, [contratos.rows, atas.arps, atas.itemsByAta, atas.gestorByAta, links, confirmacoesSemAta]);
  const aVincularDe = (gestorNome: string | null): ContratoAVincular[] =>
    gestorNome ? pendencias.aVincularPorGestor.get(gestorNome) || [] : [];

  const refresh = () => {
    contratos.refresh();
    atas.reload();
  };

  if (contratos.error && !contratos.hasAnyData && atas.arps.length === 0) {
    return (
      <PageContainer style={{ padding: '2rem 0' }}>
        <ErrorState
          title="Erro ao carregar a central de distribuição"
          message={contratos.error.message || 'Não foi possível carregar atas e contratos.'}
          onRetry={refresh}
        />
      </PageContainer>
    );
  }

  // Só mostra números com atas, contratos e vínculos carregados: totais parciais enganariam a leitura da carga.
  const isBusy = atas.isLoading || atas.scopeLoading || contratos.isLoading || contratos.isLoadingScope || linksLoading || semAtaLoading;
  const { divergencias, totais } = distribuicao;
  const linhas = ordenarDistribuicao(distribuicao.linhas, ordem);
  const totalInstrumentos = totais.atas.vigentes + totais.contratos.vigentes;

  const scrollTo = (id: string) => () => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const totalContratosSemAta = pendencias.precisamDecisao.length + pendencias.aguardamVinculo.length;

  return (
    <PageContainer style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <PageHeader
        title="Central de Distribuição"
        subtitle="Atas e contratos vigentes por gestor. Contratos vinculados a uma ata seguem o gestor da ata."
        icon={<Users size={26} color="#0c326f" aria-hidden="true" />}
        actions={
          <HeaderRefreshAction
            onRefresh={refresh}
            isRefreshing={contratos.isFetching}
            lastUpdated={contratos.dataUpdatedAt}
            dataTestId="distribuicao-refresh-btn"
            tooltipTitle="Recarregar atas, contratos e gestores"
          />
        }
      />

      {!isBusy && contratos.isPartial && (
        <ContractsPartialNotice onRetry={() => contratos.refresh()} isRetrying={contratos.isFetching} />
      )}

      {isBusy ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }} aria-busy="true" aria-label="Carregando distribuição...">
          <SkeletonLoader variant="card" height="96px" count={1} />
          <SkeletonLoader variant="rectangular" height="300px" count={1} />
        </div>
      ) : totalInstrumentos === 0 ? (
        <EmptyState
          title="Nenhuma ata ou contrato vigente."
          description="Não há instrumentos vigentes nas unidades consolidadas para distribuir."
        />
      ) : (
        <>
          <div className="carteira-summary-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 210px), 1fr))', gap: '0.9rem' }}>
            <KpiTile
              testId="distribuicao-kpi-gestores"
              label="Gestores com carteira"
              value={totais.gestores}
              hint={`${plural(totais.atas.vigentes, 'ata', 'atas')} e ${plural(totais.contratos.vigentes, 'contrato', 'contratos')} vigentes`}
              icon={Users}
              tone="neutral"
            />
            <KpiTile
              testId="distribuicao-kpi-atas-sem-gestor"
              label="Atas sem gestor"
              value={pendencias.atasSemGestor.length}
              hint={(() => {
                const vigentes = pendencias.atasSemGestor.filter((a) => isVigente(a.faixa)).length;
                const encerradas = pendencias.atasSemGestor.length - vigentes;
                return encerradas > 0 ? `${vigentes} vigentes e ${encerradas} encerradas com contratos` : `${plural(vigentes, 'vigente', 'vigentes')}`;
              })()}
              icon={Package}
              tone={pendencias.atasSemGestor.length ? 'warning' : 'neutral'}
              onClick={pendencias.atasSemGestor.length ? scrollTo('distribuicao-atas-sem-gestor') : undefined}
            />
            <KpiTile
              testId="distribuicao-kpi-sem-ata"
              label="Contratos sem gestor e sem ata"
              value={totalContratosSemAta}
              hint={
                totalContratosSemAta
                  ? `${pendencias.precisamDecisao.length} precisam de decisão, ${pendencias.aguardamVinculo.length} aguardam vínculo`
                  : 'Nenhum pendente'
              }
              icon={FileText}
              tone={pendencias.precisamDecisao.length ? 'warning' : 'neutral'}
              onClick={totalContratosSemAta ? scrollTo('distribuicao-sem-ata') : undefined}
            />
            <KpiTile
              testId="distribuicao-kpi-a-vincular"
              label="Contratos a vincular"
              value={pendencias.totalAVincular}
              hint={pendencias.totalAVincular ? 'Prováveis nas atas que já têm gestor' : 'Nenhum provável pendente'}
              icon={Link2}
              tone={pendencias.totalAVincular ? 'warning' : 'neutral'}
            />
            <KpiTile
              testId="distribuicao-kpi-divergencias"
              label="Gestor diferente da ata"
              value={divergencias.length}
              hint={divergencias.length > 0 ? 'Contratos vinculados fora da regra' : 'Contratos vinculados seguem a ata'}
              icon={AlertTriangle}
              tone={divergencias.length > 0 ? 'danger' : 'neutral'}
              onClick={divergencias.length > 0 ? scrollTo('distribuicao-divergencias') : undefined}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', fontSize: '0.75rem', color: '#475569', fontWeight: 700 }}>
              <span>Complexidade:</span>
              {NIVEIS.map((n) => (
                <span key={n} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: COR_COMPLEXIDADE[n] }} aria-hidden="true" />
                  {ROTULO_COMPLEXIDADE[n]} (peso {PESO_COMPLEXIDADE[n]})
                </span>
              ))}
              {totais.mediaEquivalente !== null && (
                <span>· Média da equipe: {totais.mediaEquivalente.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}</span>
              )}
            </div>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem', fontWeight: 700, color: '#475569' }}>
              Ordenar por
              <select
                value={ordem}
                onChange={(e) => setOrdem(e.target.value as 'NOME' | 'CARGA')}
                data-testid="distribuicao-ordem"
                style={{ ...carteiraSelect, maxWidth: '140px' }}
              >
                <option value="NOME">Nome</option>
                <option value="CARGA">Carga</option>
              </select>
            </label>
          </div>

          <div data-testid="distribuicao-table" style={carteiraTableShell}>
            <div style={{ overflowX: 'auto', containerType: 'inline-size' }}>
              <table className="carteira-stack" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ ...carteiraTh, width: '32px', padding: '0.65rem 0.4rem' }} aria-label="Expandir" />
                    <th style={carteiraTh}>Gestor</th>
                    <th style={carteiraTh}>Carteira</th>
                    <th style={carteiraTh} title="Alta: serviço/TIC com 12+ meses, obra ou engenharia; ata com 6+ itens ou 2+ fornecedores. Baixa: compra de até 12 meses; ata com 1 item. Média: o resto.">Complexidade</th>
                    <th style={carteiraTh} title={`Soma dos pesos (Baixa = ${PESO_COMPLEXIDADE.BAIXA}, Média = ${PESO_COMPLEXIDADE.MEDIA}, Alta = ${PESO_COMPLEXIDADE.ALTA}), comparada à média da equipe (±${FAIXA_MEDIA_EQUIPE * 100}%)`}>Carga</th>
                    <th style={carteiraTh}>Pressão agora</th>
                    <th style={{ ...carteiraTh, textAlign: 'right' }}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((l) => {
                    const isSemGestor = l.gestorNome === null;
                    const testKey = isSemGestor ? 'sem-gestor' : l.gestorNome;
                    const isExpanded = expanded === testKey;
                    return (
                      <React.Fragment key={testKey ?? 'sem-gestor'}>
                      <tr data-testid={`distribuicao-row-${testKey}`} style={isSemGestor ? { background: '#fffbeb' } : undefined}>
                        <td data-role="expand" style={{ ...carteiraTd, padding: '0.7rem 0.4rem', textAlign: 'center' }}>
                          <button
                            type="button"
                            onClick={() => setExpanded(isExpanded ? null : testKey)}
                            aria-expanded={isExpanded}
                            aria-label={isExpanded ? 'Recolher atas e contratos' : 'Ver atas e contratos'}
                            data-testid={`distribuicao-expand-${testKey}`}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', display: 'flex', padding: '0.2rem' }}
                          >
                            {isExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                          </button>
                        </td>
                        <td style={{ ...carteiraTd, minWidth: '160px' }}>
                          {isSemGestor ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontWeight: 800, color: '#b45309' }}>
                              <UserX size={14} aria-hidden="true" /> Sem gestor
                            </span>
                          ) : (
                            <span style={{ fontWeight: 800 }}>{l.gestorNome}</span>
                          )}
                        </td>
                        <td data-label="Carteira" style={{ ...carteiraTd, whiteSpace: 'nowrap' }}>
                          <CarteiraCell l={l} />
                        </td>
                        <td data-label="Complexidade" style={carteiraTd}>
                          <ComplexidadeCell l={l} />
                        </td>
                        <td data-label="Carga" style={{ ...carteiraTd, whiteSpace: 'nowrap' }}>
                          <CargaEquivalenteCell l={l} />
                        </td>
                        <td data-label="Pressão agora" style={carteiraTd}>
                          <PressaoCell l={l} aVincular={aVincularDe(l.gestorNome).length} />
                        </td>
                        <td data-role="action" style={{ ...carteiraTd, textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'inline-flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
                            <button
                              type="button"
                              disabled={l.atas.vigentes === 0}
                              onClick={() => navigate(carteiraPath('/atas', l.gestorNome))}
                              data-testid={`distribuicao-ver-atas-${testKey}`}
                              style={{ ...carteiraButton, opacity: l.atas.vigentes === 0 ? 0.45 : 1, cursor: l.atas.vigentes === 0 ? 'default' : 'pointer' }}
                            >
                              Atas <ArrowRight size={13} />
                            </button>
                            <button
                              type="button"
                              disabled={l.contratos.vigentes === 0}
                              onClick={() => navigate(carteiraPath('/contratos', l.gestorNome))}
                              data-testid={`distribuicao-ver-contratos-${testKey}`}
                              style={{ ...carteiraButton, opacity: l.contratos.vigentes === 0 ? 0.45 : 1, cursor: l.contratos.vigentes === 0 ? 'default' : 'pointer' }}
                            >
                              Contratos <ArrowRight size={13} />
                            </button>
                            {canAssign && (l.ataKeys.length > 0 || l.contractKeys.length > 0) && (
                              <button
                                type="button"
                                onClick={() => setTransferencia({ targets: carteiraTargets(l), origem: l.gestorNome })}
                                data-testid={`distribuicao-transferir-${testKey}`}
                                title={isSemGestor ? 'Atribuir todas as atas e contratos vigentes sem gestor' : 'Passar toda a carteira vigente deste gestor para outra pessoa'}
                                style={{ ...carteiraButton, color: '#15803d', borderColor: '#bbf7d0', background: '#f0fdf4' }}
                              >
                                {isSemGestor ? <UserPlus size={13} /> : <ArrowLeftRight size={13} />} {isSemGestor ? 'Atribuir' : 'Transferir'}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="carteira-expanded" data-testid={`distribuicao-expanded-${testKey}`}>
                          <td colSpan={7} style={CARTEIRA_EXPANDED_CELL_STYLE}>
                            <DistribuicaoItens
                              linha={l}
                              canAssign={canAssign}
                              canAjustar={canAjustar}
                              aVincular={aVincularDe(l.gestorNome)}
                              onTransfer={(targets, done) => setTransferencia({ targets, origem: l.gestorNome, done })}
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

          <AtasSemGestorSection
            atas={pendencias.atasSemGestor}
            podeAtribuir={canAssign}
            onAtribuir={(ata) => setTransferencia({ targets: [{ tipo: 'ATA', ataKey: ata.numeroAta }], origem: null, provaveis: ata.provaveis.length })}
          />

          <ContratosSemAtaSection
            pendencias={pendencias}
            confirmacoes={confirmacoesSemAta}
            podeAgir={canAssign}
            onAtribuir={(item) => setTransferencia({ targets: [{ tipo: 'CONTRATO', contractKey: item.contractKey }], origem: item.gestorNome ?? null })}
          />

          {transferencia && (
            <AtribuirGestorModal
              targets={transferencia.targets}
              origem={transferencia.origem}
              linhas={distribuicao.linhas}
              links={links}
              contractsByKey={contratos.contractsByKey}
              onDone={transferencia.done}
              provaveis={transferencia.provaveis}
              onClose={() => setTransferencia(null)}
            />
          )}

          {divergencias.length > 0 && (
            <section id="distribuicao-divergencias" data-testid="distribuicao-divergencias" style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', scrollMarginTop: '1rem' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>Contratos com gestor diferente da ata</h2>
                <p style={{ margin: '0.25rem 0 0', fontSize: '0.82rem', color: '#64748b' }}>
                  Pela regra, o contrato vinculado a uma ata tem o mesmo gestor da ata. "Alinhar gestor" atribui o gestor à ata e o leva a todos os contratos vinculados a ela.
                </p>
              </div>
              <div style={carteiraTableShell}>
                <div style={{ overflowX: 'auto' }}>
                  <table className="carteira-stack" style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={carteiraTh}>Ata</th>
                        <th style={carteiraTh}>Gestor da ata</th>
                        <th style={carteiraTh}>Contrato</th>
                        <th style={carteiraTh}>Gestor do contrato</th>
                        <th style={{ ...carteiraTh, textAlign: 'right' }}>Ação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {divergencias.map((d) => (
                        <tr key={`${d.numeroAta}|${d.contractKey}`} data-testid={`distribuicao-divergencia-${d.contractKey}`}>
                          <td data-label="Ata" style={{ ...carteiraTd, fontWeight: 800, whiteSpace: 'nowrap' }}><span>{d.numeroAta}</span></td>
                          <td data-label="Gestor da ata" style={carteiraTd}><span>{d.gestorAta || <em style={{ color: '#b45309' }}>Sem gestor</em>}</span></td>
                          <td data-label="Contrato" style={{ ...carteiraTd, fontWeight: 800, whiteSpace: 'nowrap' }}><span>{d.numeroContrato}</span></td>
                          <td data-label="Gestor do contrato" style={carteiraTd}><span>{d.gestorContrato || <em style={{ color: '#b45309' }}>Sem gestor</em>}</span></td>
                          <td data-role="action" style={{ ...carteiraTd, textAlign: 'right', whiteSpace: 'nowrap' }}>
                            {canAssign ? (
                              <button
                                type="button"
                                onClick={() => setTransferencia({ targets: [{ tipo: 'ATA', ataKey: d.numeroAta }], origem: d.gestorAta ?? null })}
                                data-testid={`distribuicao-alinhar-${d.contractKey}`}
                                style={{ ...carteiraButton, color: '#15803d', borderColor: '#bbf7d0', background: '#f0fdf4' }}
                              >
                                <UserPlus size={13} /> Alinhar gestor
                              </button>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          )}
        </>
      )}
    </PageContainer>
  );
};
