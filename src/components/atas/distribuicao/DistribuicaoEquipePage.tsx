import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowRight, FileText, Package, UserX, Users } from 'lucide-react';
import { PageContainer } from '../../../design-system/components/PageContainer';
import { PageHeader } from '../../../design-system/components/PageHeader';
import { HeaderRefreshAction } from '../../../design-system/components/HeaderRefreshAction';
import { SkeletonLoader } from '../../../design-system/components/SkeletonLoader';
import { ErrorState } from '../../../design-system/components/ErrorState';
import { EmptyState } from '../../../design-system/components/EmptyState';
import { carteiraButton, carteiraTableShell, carteiraTd, carteiraTh } from '../../carteira/carteiraStyles';
import { formatCurrencyCompact } from '../../carteira/carteiraFormat';
import { SEM_GESTOR } from '../../carteira/carteiraGestor';
import { useAtasPortfolio, getArpPrazo } from '../../../hooks/useAtasPortfolio';
import { useContractsPortfolio } from '../../../hooks/useContractsPortfolio';
import { useArpItemContractLinks } from '../../../hooks/useAtaManagers';
import { formatContractNumber } from '../../../utils/contractNumber';
import {
  buildDistribuicaoEquipe,
  type CargaInstrumentos,
  type DistribuicaoLinha
} from './distribuicaoEquipe';

/** Carteira filtrada por gestor (o filtro padrão de situação já é "Vigentes", o mesmo critério desta tela). */
function carteiraPath(base: '/atas' | '/contratos', gestorNome: string | null): string {
  return `${base}?${new URLSearchParams({ gestor: gestorNome ?? SEM_GESTOR })}`;
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

const CargaCell: React.FC<{ carga: CargaInstrumentos; feminino?: boolean }> = ({ carga, feminino }) => {
  const detalhes = [
    carga.criticos > 0 ? `${carga.criticos} ${feminino ? (carga.criticos === 1 ? 'crítica' : 'críticas') : (carga.criticos === 1 ? 'crítico' : 'críticos')}` : null,
    carga.atencao > 0 ? `${carga.atencao} em atenção` : null
  ].filter(Boolean);
  return (
    <div>
      <div style={{ fontWeight: 800 }}>{carga.vigentes}</div>
      {detalhes.length > 0 && (
        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: carga.criticos > 0 ? '#b91c1c' : '#b45309' }}>
          {detalhes.join(' · ')}
        </div>
      )}
    </div>
  );
};

const CargaBar: React.FC<{ pct: number }> = ({ pct }) => (
  <div style={{ minWidth: '90px' }}>
    <span style={{ fontWeight: 800 }}>{pct.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%</span>
    <div style={{ height: '5px', background: '#f1f5f9', borderRadius: '3px', marginTop: '0.2rem', overflow: 'hidden' }}>
      <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: '#0c326f' }} />
    </div>
  </div>
);

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
 * Distribuição da Equipe: carteira vigente (atas e contratos) por gestor, para o coordenador
 * acompanhar a carga de cada um, o que está sem gestor e contratos com gestor diferente da ata.
 */
export const DistribuicaoEquipePage: React.FC = () => {
  const navigate = useNavigate();
  const atas = useAtasPortfolio();
  const contratos = useContractsPortfolio();
  const { data: links = [], isLoading: linksLoading } = useArpItemContractLinks();

  const distribuicao = useMemo(
    () =>
      buildDistribuicaoEquipe({
        atas: atas.scopedArps.map((arp) => ({
          numeroAta: arp.numeroAtaRegistroPreco,
          faixa: getArpPrazo(arp).faixa,
          valor: Number(arp.valorTotal) || 0,
          gestorNome: atas.gestorByAta[arp.numeroAtaRegistroPreco]
        })),
        contratos: contratos.rows.map((row) => ({
          contractKey: row.contractKey,
          numero: formatContractNumber(row.contract),
          faixa: row.faixa,
          valor: row.contract.valorGlobal || row.contract.valorInicial || 0,
          gestorNome: row.gestorNome
        })),
        links,
        attentionItems: contratos.attentionItems
      }),
    [atas.scopedArps, atas.gestorByAta, contratos.rows, contratos.attentionItems, links]
  );

  const refresh = () => {
    contratos.refresh();
    atas.reload();
  };

  if (contratos.error && !contratos.hasAnyData && atas.arps.length === 0) {
    return (
      <PageContainer style={{ padding: '2rem 0' }}>
        <ErrorState
          title="Erro ao carregar a distribuição da equipe"
          message={contratos.error.message || 'Não foi possível carregar atas e contratos.'}
          onRetry={refresh}
        />
      </PageContainer>
    );
  }

  // Só mostra números com atas, contratos e vínculos carregados: totais parciais enganariam a leitura da carga.
  const isBusy = atas.isLoading || atas.scopeLoading || contratos.isLoading || contratos.isLoadingScope || linksLoading;
  const { linhas, divergencias, totais } = distribuicao;
  const semGestor = linhas.find((l) => l.gestorNome === null);
  const totalInstrumentos = totais.atas.vigentes + totais.contratos.vigentes;
  const cargaPct = (l: DistribuicaoLinha) =>
    totalInstrumentos > 0 ? ((l.atas.vigentes + l.contratos.vigentes) / totalInstrumentos) * 100 : 0;

  const scrollToDivergencias = () =>
    document.getElementById('distribuicao-divergencias')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <PageContainer style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <PageHeader
        title="Distribuição da Equipe"
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
              value={semGestor?.atas.vigentes ?? 0}
              hint={`de ${plural(totais.atas.vigentes, 'ata vigente', 'atas vigentes')}`}
              icon={Package}
              tone={semGestor?.atas.vigentes ? 'warning' : 'neutral'}
              onClick={semGestor?.atas.vigentes ? () => navigate(carteiraPath('/atas', null)) : undefined}
            />
            <KpiTile
              testId="distribuicao-kpi-contratos-sem-gestor"
              label="Contratos sem gestor"
              value={semGestor?.contratos.vigentes ?? 0}
              hint={`de ${plural(totais.contratos.vigentes, 'contrato vigente', 'contratos vigentes')}`}
              icon={FileText}
              tone={semGestor?.contratos.vigentes ? 'warning' : 'neutral'}
              onClick={semGestor?.contratos.vigentes ? () => navigate(carteiraPath('/contratos', null)) : undefined}
            />
            <KpiTile
              testId="distribuicao-kpi-divergencias"
              label="Gestor diferente da ata"
              value={divergencias.length}
              hint={divergencias.length > 0 ? 'Contratos vinculados fora da regra' : 'Contratos vinculados seguem a ata'}
              icon={AlertTriangle}
              tone={divergencias.length > 0 ? 'danger' : 'neutral'}
              onClick={divergencias.length > 0 ? scrollToDivergencias : undefined}
            />
          </div>

          <div data-testid="distribuicao-table" style={carteiraTableShell}>
            <div style={{ overflowX: 'auto' }}>
              <table className="carteira-stack" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={carteiraTh}>Gestor</th>
                    <th style={carteiraTh}>Atas</th>
                    <th style={{ ...carteiraTh, textAlign: 'right' }}>Valor registrado</th>
                    <th style={carteiraTh}>Contratos</th>
                    <th style={{ ...carteiraTh, textAlign: 'right' }}>Valor vigente</th>
                    <th style={carteiraTh}>Pendências</th>
                    <th style={carteiraTh}>Parte da carteira</th>
                    <th style={{ ...carteiraTh, textAlign: 'right' }}>Ver na carteira</th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((l) => {
                    const isSemGestor = l.gestorNome === null;
                    const testKey = isSemGestor ? 'sem-gestor' : l.gestorNome;
                    return (
                      <tr key={testKey ?? 'sem-gestor'} data-testid={`distribuicao-row-${testKey}`} style={isSemGestor ? { background: '#fffbeb' } : undefined}>
                        <td style={{ ...carteiraTd, minWidth: '160px' }}>
                          {isSemGestor ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontWeight: 800, color: '#b45309' }}>
                              <UserX size={14} aria-hidden="true" /> Sem gestor
                            </span>
                          ) : (
                            <span style={{ fontWeight: 800 }}>{l.gestorNome}</span>
                          )}
                        </td>
                        <td data-label="Atas" style={{ ...carteiraTd, whiteSpace: 'nowrap' }}>
                          <CargaCell carga={l.atas} feminino />
                        </td>
                        <td data-label="Valor registrado" style={{ ...carteiraTd, textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 700 }}>
                          <span>{l.atas.vigentes > 0 ? formatCurrencyCompact(l.atas.valor) : '—'}</span>
                        </td>
                        <td data-label="Contratos" style={{ ...carteiraTd, whiteSpace: 'nowrap' }}>
                          <CargaCell carga={l.contratos} />
                        </td>
                        <td data-label="Valor vigente" style={{ ...carteiraTd, textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 700 }}>
                          <span>{l.contratos.vigentes > 0 ? formatCurrencyCompact(l.contratos.valor) : '—'}</span>
                        </td>
                        <td data-label="Pendências" style={{ ...carteiraTd, whiteSpace: 'nowrap' }}>
                          <span style={{ fontWeight: 800, color: l.pendencias > 0 ? '#b91c1c' : '#94a3b8' }}>
                            {l.pendencias > 0 ? l.pendencias : '—'}
                          </span>
                        </td>
                        <td data-label="Parte da carteira" style={carteiraTd}>
                          <CargaBar pct={cargaPct(l)} />
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
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {divergencias.length > 0 && (
            <section id="distribuicao-divergencias" data-testid="distribuicao-divergencias" style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', scrollMarginTop: '1rem' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>Contratos com gestor diferente da ata</h2>
                <p style={{ margin: '0.25rem 0 0', fontSize: '0.82rem', color: '#64748b' }}>
                  Pela regra, o contrato vinculado a uma ata tem o mesmo gestor da ata. Atribua de novo o gestor na ata para alinhar os vínculos.
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
                            <button
                              type="button"
                              onClick={() => navigate(`/atas?${new URLSearchParams({ busca: d.numeroAta, situacao: 'TODOS' })}`)}
                              style={carteiraButton}
                            >
                              Ver ata <ArrowRight size={13} />
                            </button>
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
