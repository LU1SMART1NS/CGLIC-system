import React, { useMemo, useState } from 'react';
import { AlertTriangle, Clock, FolderOpen, LayoutDashboard, ScrollText } from 'lucide-react';
import { PageContainer } from '../../design-system/components/PageContainer';
import { PageHeader } from '../../design-system/components/PageHeader';
import { HeaderRefreshAction } from '../../design-system/components/HeaderRefreshAction';
import { SectionHeader } from '../../design-system/components/SectionHeader';
import { AppButton } from '../../design-system/components/AppButton';
import { CarteiraSegmentTabs } from '../carteira/CarteiraSegmentTabs';
import { CarteiraFilterBar, carteiraCounter } from '../carteira/CarteiraFilterBar';
import { CarteiraFilterButton } from '../carteira/CarteiraFilterButton';
import { CarteiraPagination } from '../carteira/CarteiraPagination';
import { useCarteiraPagination } from '../carteira/useCarteiraPagination';
import { AdminListShell } from '../admin/shared/AdminListShell';
import { ComVoce, type ItemComVoce } from '../instrumentos/ComVoce';
import { PainelCartao, PainelCartoes } from '../instrumentos/PainelCartao';
import { ErrorState } from '../../design-system/components/ErrorState';
import { SkeletonLoader } from '../../design-system/components/SkeletonLoader';
import { useAuth } from '../../context/AuthContext';
import { useNavigateWithOrigin } from '../../hooks/useDetailOrigin';
import { useContratosFiscalizacao, useEntregasFiscalizacao } from '../../hooks/useFiscalizacao';
import { prazoDaEntrega } from '../../utils/fiscalizacaoEntregas';
import type { ContratoFiscalizacao } from '../../services/fiscalizacaoService';
import { NOME_SFC, comSfc, dataBR, ehDoFiscal, hojeEmBrasilia, numeroDoContrato, pendenciasDoContrato } from '../../utils/fiscalizacao';
import { useFiscaisAtivos, useTransferenciasFiscalizacao } from '../../hooks/useFiscalizacao';

import { ContratosFiscalizacaoTabela } from './ContratosFiscalizacaoTabela';
import { RegistrarProcessoModal } from './FiscalizacaoModais';

const POR_PAGINA = 25;
type Segmento = 'AUTUAR' | 'PORTARIA' | 'TODAS';

/**
 * Início › Painel da fiscalização (migration 259). O gestor de fiscalização vê os contratos em que é fiscal ou substituto
 * e o que falta em cada um; o coordenador e a consulta veem todos os contratos com a SFC/CGLIC. Como nos outros Painéis
 * (decisão de 11/11/2026): "Com você" só do coordenador (definir, desfazer ausência); o que falta nos contratos fica em
 * Pendências da fiscalização (A autuar · Sem portaria · Todas).
 */
export const FiscalizacaoInicioPage: React.FC = () => {
  const { user, role } = useAuth();
  const navigate = useNavigateWithOrigin();
  const { data, isLoading, isError, error, refetch, isFetching, dataUpdatedAt } = useContratosFiscalizacao();
  const entregasConsulta = useEntregasFiscalizacao(null);
  const [autuando, setAutuando] = useState<ContratoFiscalizacao | null>(null);
  const [segmentoEscolhido, setSegmento] = useState<Segmento | null>(null);
  const [busca, setBusca] = useState('');
  const [filtroFiscal, setFiltroFiscal] = useState('');
  const { fiscais } = useFiscaisAtivos();
  const transferencias = useTransferenciasFiscalizacao();
  const coordenador = role === 'admin';
  const fiscal = role === 'gestor_fiscalizacao';
  const contratos = useMemo(() => data ?? [], [data]);

  const daSfc = useMemo(() => contratos.filter((c) => comSfc(c) && (!fiscal || ehDoFiscal(c, user?.id))), [contratos, fiscal, user?.id]);
  const titular = daSfc.filter((c) => !fiscal || c.fiscalUserId === user?.id);
  const aDefinir = contratos.filter((c) => c.situacao === 'A_DEFINIR');
  const pendencias = useMemo(() => daSfc.flatMap(pendenciasDoContrato), [daSfc]);
  const aAutuar = pendencias.filter((p) => p.tipo === 'AUTUAR');
  const semPortaria = pendencias.filter((p) => p.tipo === 'PORTARIA');
  const mistas = daSfc.filter((c) => c.situacao === 'MISTA').length;
  const minhasEntregas = useMemo(
    () => (entregasConsulta.data ?? []).filter((e) => e.responsavel === 'SFC' && (!fiscal || e.fiscalUserId === user?.id || e.substitutoUserId === user?.id)),
    [entregasConsulta.data, fiscal, user?.id]
  );
  const vencidas = minhasEntregas.filter((e) => prazoDaEntrega(e).tom === 'danger');
  const aVencer = minhasEntregas.filter((e) => prazoDaEntrega(e).tom === 'warning' && prazoDaEntrega(e).dias !== null);
  const noExercito = minhasEntregas.filter((e) => e.etapa === 'CONTROLADO');
  const entregasCarregando = entregasConsulta.isLoading;

  // "Com você": só as decisões do coordenador.
  const comVoce: ItemComVoce[] = [];
  if (coordenador && aDefinir.length > 0) {
    comVoce.push({ chave: 'definir', titulo: `Definir quem fiscaliza ${aDefinir.length} ${aDefinir.length === 1 ? 'contrato' : 'contratos'} de emenda`, detalhe: `Chegaram do Contratos.gov.br sem decisão. A sugestão é a ${NOME_SFC}.`, acao: 'Distribuir', onAcao: () => navigate('/fiscalizacao/distribuicao') });
  }
  if (coordenador) {
    const hoje = hojeEmBrasilia();
    (transferencias.data ?? [])
      .filter((t) => t.retornoPrevisto <= hoje)
      .forEach((t) => comVoce.push({ chave: `retorno-${t.id}`, titulo: `Devolver os contratos de ${t.ausenteNome}`, detalhe: `Retorno previsto em ${dataBR(t.retornoPrevisto)}; os contratos estão com ${t.destinoNome}.`, acao: 'Desfazer', onAcao: () => navigate('/fiscalizacao/distribuicao?segmento=EQUIPE') }));
  }

  // Sem escolha, abre na primeira aba com algo pendente.
  const segmento: Segmento = segmentoEscolhido ?? (aAutuar.length ? 'AUTUAR' : semPortaria.length ? 'PORTARIA' : 'TODAS');
  // Pendências: contratos do escopo com o que falta (processo a autuar, portaria); "Todas" lista todos os contratos.
  const contaSeg = (sg: Segmento) => (sg === 'TODAS' ? daSfc.length : sg === 'AUTUAR' ? aAutuar.length : semPortaria.length);
  const doSegmento = useMemo(
    () => (segmento === 'TODAS' ? daSfc : daSfc.filter((c) => pendenciasDoContrato(c).some((p) => p.tipo === segmento))),
    [daSfc, segmento]
  );
  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return doSegmento.filter(
      (c) =>
        (!q || `${numeroDoContrato(c)} ${c.fornecedor ?? ''} ${c.emendas.join(' ')} ${c.fiscalNome ?? ''}`.toLowerCase().includes(q)) &&
        (!filtroFiscal || c.fiscalUserId === filtroFiscal || c.substitutoUserId === filtroFiscal)
    );
  }, [doSegmento, busca, filtroFiscal]);
  const filtrosAtivos = Boolean(busca || filtroFiscal);
  const { currentPage, setPage, pageItems } = useCarteiraPagination(filtrados, (c: ContratoFiscalizacao) => c.contractKey, POR_PAGINA);
  const podeAutuar = (c: ContratoFiscalizacao) => !c.processoSei && (coordenador || (fiscal && ehDoFiscal(c, user?.id)));
  const irPara = (sg: Segmento) => {
    setSegmento(sg);
    document.getElementById('fisc-inicio-pendencias')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <PageContainer style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <PageHeader
        title="Início"
        subtitle={fiscal ? 'Os contratos que você fiscaliza e o que falta em cada um.' : `Resumo da fiscalização dos contratos pela ${NOME_SFC} e o que exige sua atenção.`}
        hint={`Contrato de emenda chega "A definir", com sugestão ${NOME_SFC}; o coordenador decide na Distribuição. Depois da decisão, o fiscal autua o processo de fiscalização e registra a portaria.`}
        icon={<LayoutDashboard size={26} color="var(--primary)" aria-hidden="true" />}
        actions={<HeaderRefreshAction onRefresh={() => refetch()} isRefreshing={isFetching} lastUpdated={dataUpdatedAt || null} dataTestId="fisc-inicio-atualizar" tooltipTitle="Recarregar a fiscalização" />}
      />
      {isLoading ? (
        <SkeletonLoader variant="card" count={3} testId="fisc-inicio-carregando" />
      ) : isError ? (
        <ErrorState title="Não foi possível carregar a fiscalização" message={error?.message || 'Falha ao consultar a fiscalização dos contratos.'} onRetry={() => refetch()} testId="fisc-inicio-erro" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <PainelCartoes testId="fisc-inicio-cartoes">
            <PainelCartao
              rotulo={fiscal ? 'Meus contratos' : `Com a ${NOME_SFC}`}
              icone={<FolderOpen size={16} />}
              tom="primary"
              valor={String(fiscal ? titular.length : daSfc.length)}
              unidade={(fiscal ? titular.length : daSfc.length) === 1 ? 'contrato' : 'contratos'}
              linhas={[
                fiscal ? { rotulo: 'Como substituto', valor: String(daSfc.length - titular.length) } : { rotulo: 'Fiscalização mista', valor: String(mistas) },
                { rotulo: 'Processo a autuar', valor: String(aAutuar.length), tom: aAutuar.length ? 'warning' : undefined },
                { rotulo: 'Sem portaria registrada', valor: String(semPortaria.length), tom: semPortaria.length ? 'warning' : undefined }
              ]}
              onClick={() => irPara(aAutuar.length ? 'AUTUAR' : semPortaria.length ? 'PORTARIA' : 'TODAS')}
              testId="fisc-cartao-contratos"
            />
            <PainelCartao
              rotulo="Entregas vencidas"
              icone={<AlertTriangle size={16} />}
              tom={vencidas.length ? 'danger' : 'success'}
              valor={entregasCarregando ? '…' : vencidas.length ? String(vencidas.length) : 'Em dia'}
              unidade={vencidas.length ? (vencidas.length === 1 ? 'entrega' : 'entregas') : undefined}
              linhas={[
                { rotulo: 'Vencem em 30 dias', valor: String(aVencer.length), tom: aVencer.length ? 'warning' : undefined },
                { rotulo: 'Entregas acompanhadas', valor: String(minhasEntregas.length) }
              ]}
              onClick={() => navigate('/fiscalizacao/entregas?prazo=danger')}
              testId="fisc-cartao-vencidas"
            />
            <PainelCartao
              rotulo="Aguardando o Exército"
              icone={<Clock size={16} />}
              tom={noExercito.length ? 'amber' : 'success'}
              valor={entregasCarregando ? '…' : noExercito.length ? String(noExercito.length) : 'Nenhuma'}
              unidade={noExercito.length ? (noExercito.length === 1 ? 'entrega' : 'entregas') : undefined}
              linhas={[{ rotulo: 'Produto controlado (DFPC)', valor: '' }]}
              onClick={() => navigate('/fiscalizacao/entregas?fase=EXECUCAO')}
              testId="fisc-cartao-exercito"
            />
            {!fiscal && (
              <PainelCartao
                rotulo="Contratos a definir"
                icone={<ScrollText size={16} />}
                tom={aDefinir.length ? 'danger' : 'success'}
                valor={aDefinir.length ? String(aDefinir.length) : 'Em dia'}
                unidade={aDefinir.length ? (aDefinir.length === 1 ? 'contrato' : 'contratos') : undefined}
                linhas={[{ rotulo: 'Sugestão', valor: NOME_SFC }]}
                onClick={() => navigate(coordenador ? '/fiscalizacao/distribuicao' : '/fiscalizacao/inicio')}
                testId="fisc-cartao-a-definir"
              />
            )}
          </PainelCartoes>

          {coordenador && <ComVoce itens={comVoce} testId="fisc-com-voce" />}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }} id="fisc-inicio-pendencias">
            <SectionHeader className="section-header--flush" title="Pendências da fiscalização" subtitle={fiscal ? 'O que falta nos contratos que você fiscaliza. A linha abre o Contrato 360.' : `O que falta nos contratos com a ${NOME_SFC}. A linha abre o Contrato 360.`} />
            <CarteiraSegmentTabs<Segmento>
              testIdPrefix="fisc-inicio"
              ariaLabel="Pendências da fiscalização"
              active={segmento}
              onSelect={setSegmento}
              segments={[
                { id: 'AUTUAR', label: 'A autuar', count: contaSeg('AUTUAR'), dot: aAutuar.length ? 'var(--color-warning-solid)' : undefined },
                { id: 'PORTARIA', label: 'Sem portaria', count: contaSeg('PORTARIA'), dot: semPortaria.length ? 'var(--color-warning-solid)' : undefined },
                { id: 'TODAS', label: fiscal ? 'Meus contratos' : 'Todos os contratos', count: contaSeg('TODAS') }
              ]}
            />
            <CarteiraFilterBar
              busca={busca}
              searchPlaceholder="Buscar por contrato, fornecedor, emenda ou fiscal..."
              onChangeBusca={setBusca}
              hasActiveFilters={filtrosAtivos}
              onResetFilters={() => { setBusca(''); setFiltroFiscal(''); }}
              counter={carteiraCounter(filtrados.length, doSegmento.length, filtrosAtivos, 'contrato', 'contratos')}
              testIdPrefix="fisc-inicio"
            >
              {!fiscal && (
                <CarteiraFilterButton label="Fiscal" value={filtroFiscal} emptyValue="" options={fiscais.map((f) => ({ value: f.id, label: f.nome, count: doSegmento.filter((c) => c.fiscalUserId === f.id || c.substitutoUserId === f.id).length }))} onChange={setFiltroFiscal} testId="fisc-inicio-filtro-fiscal" />
              )}
            </CarteiraFilterBar>
            <AdminListShell
              testId="fisc-inicio-lista"
              isLoading={false}
              isError={false}
              isEmpty={filtrados.length === 0}
              emptyTitle={filtrosAtivos ? 'Nenhum contrato atende à busca.' : segmento === 'TODAS' ? 'Nenhum contrato com a SFC/CGLIC.' : 'Nada pendente aqui.'}
              emptyDescription={filtrosAtivos ? 'Ajuste a busca ou o filtro.' : segmento === 'TODAS' ? 'Os contratos aparecem quando o coordenador decide a fiscalização.' : 'Escolha outra aba para ver os demais contratos.'}
            >
              <ContratosFiscalizacaoTabela
                contratos={pageItems}
                testId="fisc-inicio-tabela"
                rowActions={(c) =>
                  podeAutuar(c) ? (
                    <AppButton variant="outline" size="sm" onClick={() => setAutuando(c)} data-testid={`fisc-inicio-autuar-${c.contractKey}`}>Registrar</AppButton>
                  ) : null
                }
              />
              <CarteiraPagination page={currentPage} pageSize={POR_PAGINA} total={filtrados.length} onChange={setPage} testIdPrefix="fisc-inicio" />
            </AdminListShell>
          </div>
        </div>
      )}
      {autuando && <RegistrarProcessoModal key={autuando.contractKey} contrato={autuando} onClose={() => setAutuando(null)} />}
    </PageContainer>
  );
};

