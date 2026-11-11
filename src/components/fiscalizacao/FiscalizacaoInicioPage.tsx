import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, Clock, FolderOpen, LayoutDashboard, ScrollText } from 'lucide-react';
import { PageContainer } from '../../design-system/components/PageContainer';
import { PageHeader } from '../../design-system/components/PageHeader';
import { HeaderRefreshAction } from '../../design-system/components/HeaderRefreshAction';
import { SectionHeader } from '../../design-system/components/SectionHeader';
import { AppButton } from '../../design-system/components/AppButton';
import { CarteiraSegmentTabs } from '../carteira/CarteiraSegmentTabs';
import { CarteiraFilterBar, carteiraCounter } from '../carteira/CarteiraFilterBar';
import { CarteiraPagination } from '../carteira/CarteiraPagination';
import { useCarteiraPagination } from '../carteira/useCarteiraPagination';
import { AdminListShell } from '../admin/shared/AdminListShell';
import { ComVoce, type ItemComVoce } from '../instrumentos/ComVoce';
import { PainelCartao, PainelCartoes } from '../instrumentos/PainelCartao';
import { PainelComFaixa, PainelFaixa, type PainelFaixaChip } from '../instrumentos/PainelFaixa';
import { PainelBotoesGavetas, PainelGaveta, type PainelBotaoGaveta, type PainelGavetaId } from '../instrumentos/PainelGavetas';
import { PainelFiltros, TODOS_OS_GESTORES } from '../instrumentos/PainelFiltros';
import { scrollToDock } from '../instrument360/instrument360Dock';
import { ErrorState } from '../../design-system/components/ErrorState';
import { SkeletonLoader } from '../../design-system/components/SkeletonLoader';
import { useAuth } from '../../context/AuthContext';
import { useNavigateWithOrigin } from '../../hooks/useDetailOrigin';
import { useContratosFiscalizacao, useEntregasFiscalizacao } from '../../hooks/useFiscalizacao';
import { prazoDaEntrega } from '../../utils/fiscalizacaoEntregas';
import type { ContratoFiscalizacao } from '../../services/fiscalizacaoService';
import { NOME_SFC, cargaPorFiscal, comSfc, dataBR, ehDoFiscal, hojeEmBrasilia, numeroDoContrato, pendenciasDoContrato } from '../../utils/fiscalizacao';
import { useFiscaisAtivos, useTransferenciasFiscalizacao } from '../../hooks/useFiscalizacao';

import { ContratosFiscalizacaoTabela } from './ContratosFiscalizacaoTabela';
import { GavetaDistribuicaoFiscais } from './GavetaDistribuicaoFiscais';
import { RegistrarProcessoModal } from './FiscalizacaoModais';

const POR_PAGINA = 25;
type Segmento = 'AUTUAR' | 'PORTARIA' | 'TODAS';

/**
 * Início › Painel da fiscalização (migration 259). O gestor de fiscalização vê os contratos em que é o fiscal titular
 * e o que falta em cada um; onde é só substituto, o contrato não entra nas pendências (decisão de 11/11/2026: o
 * substituto é o da portaria e assume pela transferência temporária) e aparece só no número "Como substituto"; o coordenador e a consulta veem todos os contratos com a SFC/CGLIC e podem escolher um fiscal
 * (o Painel passa a ser o dele, como o filtro Gestor em Atas e Contratos). Mesma moldura dos outros Painéis
 * (PainelComFaixa, 11/11/2026): cartões e "Ver mais" encolhem numa faixa azul fixa, "Com você" só do coordenador, e as
 * abas das Pendências (A autuar · Sem portaria · Todos) grudam embaixo da faixa.
 */
export const FiscalizacaoInicioPage: React.FC = () => {
  const { user, role } = useAuth();
  const navigate = useNavigateWithOrigin();
  const { data, isLoading, isError, error, refetch, isFetching, dataUpdatedAt } = useContratosFiscalizacao();
  const entregasConsulta = useEntregasFiscalizacao(null);
  const [autuando, setAutuando] = useState<ContratoFiscalizacao | null>(null);
  const [segmentoEscolhido, setSegmento] = useState<Segmento | null>(null);
  const [busca, setBusca] = useState('');
  const { fiscais } = useFiscaisAtivos();
  const [params, setParams] = useSearchParams();
  const dockRef = useRef<HTMLDivElement>(null);
  const transferencias = useTransferenciasFiscalizacao();
  const coordenador = role === 'admin';
  const fiscal = role === 'gestor_fiscalizacao';
  const contratos = useMemo(() => data ?? [], [data]);

  // Escopo: o fiscal vê os dele; o coordenador e a consulta escolhem um fiscal no filtro do topo (?fiscal=).
  const fiscalEscolhido = fiscal ? '' : params.get('fiscal') ?? TODOS_OS_GESTORES;
  const nomeEscolhido = fiscais.find((f) => f.id === fiscalEscolhido)?.nome ?? '';
  const escopo = fiscal ? user?.id ?? null : fiscalEscolhido || null;
  const mudarEndereco = useCallback(
    (mudancas: Record<string, string | null>) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          Object.entries(mudancas).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
          return next;
        },
        { replace: true }
      ),
    [setParams]
  );
  // Escolhido um fiscal, só os contratos em que ele é o titular: o substituto não recebe pendências.
  const daSfc = useMemo(() => contratos.filter((c) => comSfc(c) && (!escopo || c.fiscalUserId === escopo)), [contratos, escopo]);
  const comoSubstituto = escopo ? contratos.filter((c) => comSfc(c) && c.substitutoUserId === escopo).length : 0;
  const aDefinir = contratos.filter((c) => c.situacao === 'A_DEFINIR');
  const pendencias = useMemo(() => daSfc.flatMap(pendenciasDoContrato), [daSfc]);
  const aAutuar = pendencias.filter((p) => p.tipo === 'AUTUAR');
  const semPortaria = pendencias.filter((p) => p.tipo === 'PORTARIA');
  const mistas = daSfc.filter((c) => c.situacao === 'MISTA').length;
  const minhasEntregas = useMemo(
    () => (entregasConsulta.data ?? []).filter((e) => e.responsavel === 'SFC' && (!escopo || e.fiscalUserId === escopo)),
    [entregasConsulta.data, escopo]
  );
  const vencidas = minhasEntregas.filter((e) => prazoDaEntrega(e).tom === 'danger');
  const aVencer = minhasEntregas.filter((e) => prazoDaEntrega(e).tom === 'warning' && prazoDaEntrega(e).dias !== null);
  const noExercito = minhasEntregas.filter((e) => e.etapa === 'CONTROLADO');
  const entregasCarregando = entregasConsulta.isLoading;

  // "Com você": só as decisões do coordenador, e só no Painel geral (escolhido um fiscal, o Painel é o dele).
  const comVoceVisivel = coordenador && !escopo;
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
        !q || `${numeroDoContrato(c)} ${c.fornecedor ?? ''} ${c.emendas.join(' ')} ${c.fiscalNome ?? ''}`.toLowerCase().includes(q)
    );
  }, [doSegmento, busca]);
  const filtrosAtivos = Boolean(busca);
  const { currentPage, setPage, pageItems } = useCarteiraPagination(filtrados, (c: ContratoFiscalizacao) => c.contractKey, POR_PAGINA);
  const podeAutuar = (c: ContratoFiscalizacao) => !c.processoSei && (coordenador || (fiscal && ehDoFiscal(c, user?.id)));
  // Como em Atas e Contratos: cartão e aba levam à lista com a faixa encolhida.
  const irPara = (sg: Segmento) => {
    setSegmento(sg);
    scrollToDock(dockRef.current);
  };

  // "Ver mais": Distribuição (carga de cada fiscal) para o coordenador no Painel geral, como em Atas e Contratos.
  const gavetasDisponiveis: PainelGavetaId[] = coordenador && !escopo ? ['distribuicao'] : [];
  const gavetaUrl = params.get('gaveta') as PainelGavetaId | null;
  const gavetaAberta: PainelGavetaId | null = gavetaUrl && gavetasDisponiveis.includes(gavetaUrl) ? gavetaUrl : null;
  const rolarParaGaveta = useRef(false);
  const alternarGaveta = (id: PainelGavetaId) => {
    rolarParaGaveta.current = gavetaAberta !== id;
    mudarEndereco({ gaveta: gavetaAberta === id ? null : id });
  };
  useEffect(() => {
    if (!gavetaAberta || !rolarParaGaveta.current) return;
    rolarParaGaveta.current = false;
    scrollToDock(dockRef.current);
  }, [gavetaAberta]);
  const carga = useMemo(() => cargaPorFiscal(contratos, fiscais), [contratos, fiscais]);
  const ausentes = transferencias.data ?? [];
  const botoesGavetas: PainelBotaoGaveta[] = gavetasDisponiveis.map((id) => ({
    id,
    resumo: `${carga.length} ${carga.length === 1 ? 'fiscal' : 'fiscais'}${ausentes.length ? ` · ${ausentes.length} ${ausentes.length === 1 ? 'ausente' : 'ausentes'}` : ''}`,
    atencao: ausentes.length > 0
  }));

  const qtd = (n: number) => String(n);
  const chipsDaFaixa: PainelFaixaChip[] = [
    { id: 'contratos', rotulo: escopo ? 'Contratos' : `Com a ${NOME_SFC}`, valor: qtd(daSfc.length), ativo: segmento === 'TODAS', onClick: () => irPara('TODAS') },
    { id: 'autuar', rotulo: 'A autuar', valor: qtd(aAutuar.length), ativo: segmento === 'AUTUAR', onClick: () => irPara('AUTUAR') },
    { id: 'vencidas', rotulo: 'Itens com prazo vencido', valor: entregasCarregando ? '…' : qtd(vencidas.length), perigo: vencidas.length > 0, onClick: () => navigate('/fiscalizacao/itens?prazo=danger') },
    ...(!fiscal && !escopo ? [{ id: 'definir', rotulo: 'A definir', valor: qtd(aDefinir.length), perigo: aDefinir.length > 0, onClick: () => navigate(coordenador ? '/fiscalizacao/distribuicao' : '/fiscalizacao/inicio') }] : [])
  ];

  return (
    <PageContainer style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <PageHeader
        title="Início"
        subtitle={fiscal ? 'Os contratos que você fiscaliza e o que falta em cada um.' : `Resumo da fiscalização dos contratos pela ${NOME_SFC} e o que exige sua atenção.`}
        hint={`Contrato de emenda chega "A definir", com sugestão ${NOME_SFC}; o coordenador decide na Distribuição. Depois da decisão, o fiscal autua o processo de fiscalização e registra a portaria. As pendências são do fiscal titular; o substituto só as recebe quando assume numa transferência temporária.`}
        icon={<LayoutDashboard size={26} color="var(--primary)" aria-hidden="true" />}
        actions={<HeaderRefreshAction onRefresh={() => refetch()} isRefreshing={isFetching} lastUpdated={dataUpdatedAt || null} dataTestId="fisc-inicio-atualizar" tooltipTitle="Recarregar a fiscalização" />}
      />
      {!fiscal && (
        <PainelFiltros
          gestor={{ rotulo: 'Fiscal', valor: fiscalEscolhido, opcoes: fiscais.map((f) => ({ value: f.id, label: f.nome })), onChange: (id) => mudarEndereco({ fiscal: id || null, gaveta: null }) }}
          onLimpar={() => mudarEndereco({ fiscal: null })}
        />
      )}
      {isLoading ? (
        <SkeletonLoader variant="card" count={3} testId="fisc-inicio-carregando" />
      ) : isError ? (
        <ErrorState title="Não foi possível carregar a fiscalização" message={error?.message || 'Falha ao consultar a fiscalização dos contratos.'} onRetry={() => refetch()} testId="fisc-inicio-erro" />
      ) : (
        <PainelComFaixa
          dockRef={dockRef}
          faixa={<PainelFaixa titulo={`Início${nomeEscolhido ? ` · ${nomeEscolhido}` : ''}`} chips={chipsDaFaixa} gavetas={gavetasDisponiveis} gavetaAberta={gavetaAberta} onToggleGaveta={alternarGaveta} testId="fisc-inicio-faixa" />}
          topo={
            <>
          <PainelCartoes testId="fisc-inicio-cartoes">
            <PainelCartao
              rotulo={fiscal ? 'Meus contratos' : escopo ? `Contratos de ${nomeEscolhido}` : `Com a ${NOME_SFC}`}
              icone={<FolderOpen size={16} />}
              tom="primary"
              valor={String(daSfc.length)}
              unidade={daSfc.length === 1 ? 'contrato' : 'contratos'}
              linhas={[
                escopo ? { rotulo: 'Como substituto', valor: String(comoSubstituto) } : { rotulo: 'Fiscalização mista', valor: String(mistas) },
                { rotulo: 'Processo a autuar', valor: String(aAutuar.length), tom: aAutuar.length ? 'warning' : undefined },
                { rotulo: 'Sem portaria registrada', valor: String(semPortaria.length), tom: semPortaria.length ? 'warning' : undefined }
              ]}
              onClick={() => irPara(aAutuar.length ? 'AUTUAR' : semPortaria.length ? 'PORTARIA' : 'TODAS')}
              testId="fisc-cartao-contratos"
            />
            <PainelCartao
              rotulo="Itens com prazo vencido"
              icone={<AlertTriangle size={16} />}
              tom={vencidas.length ? 'danger' : 'success'}
              valor={entregasCarregando ? '…' : vencidas.length ? String(vencidas.length) : 'Em dia'}
              unidade={vencidas.length ? (vencidas.length === 1 ? 'item' : 'itens') : undefined}
              linhas={[
                { rotulo: 'Vencem em 30 dias', valor: String(aVencer.length), tom: aVencer.length ? 'warning' : undefined },
                { rotulo: 'Itens acompanhados', valor: String(minhasEntregas.length) }
              ]}
              onClick={() => navigate('/fiscalizacao/itens?prazo=danger')}
              testId="fisc-cartao-vencidas"
            />
            <PainelCartao
              rotulo="Aguardando o Exército"
              icone={<Clock size={16} />}
              tom={noExercito.length ? 'amber' : 'success'}
              valor={entregasCarregando ? '…' : noExercito.length ? String(noExercito.length) : 'Nenhum'}
              unidade={noExercito.length ? (noExercito.length === 1 ? 'item' : 'itens') : undefined}
              linhas={[{ rotulo: 'Produto controlado (DFPC)', valor: '' }]}
              onClick={() => navigate('/fiscalizacao/itens?fase=EXECUCAO')}
              testId="fisc-cartao-exercito"
            />
            {!fiscal && !escopo && (
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
              <PainelBotoesGavetas botoes={botoesGavetas} aberta={gavetaAberta} onToggle={alternarGaveta} />
              {comVoceVisivel && <ComVoce itens={comVoce} testId="fisc-com-voce" />}
              <SectionHeader
                className="section-header--flush"
                title="Pendências da fiscalização"
                subtitle={fiscal ? 'O que falta nos contratos que você fiscaliza. A linha abre o Contrato 360.' : `O que falta nos contratos com a ${NOME_SFC}. A linha abre o Contrato 360.`}
              />
            </>
          }
          trilho={
            <CarteiraSegmentTabs<Segmento>
              testIdPrefix="fisc-inicio"
              ariaLabel="Pendências da fiscalização"
              active={segmento}
              onSelect={irPara}
              segments={[
                { id: 'AUTUAR', label: 'A autuar', count: contaSeg('AUTUAR'), dot: aAutuar.length ? 'var(--color-warning-solid)' : undefined },
                { id: 'PORTARIA', label: 'Sem portaria', count: contaSeg('PORTARIA'), dot: semPortaria.length ? 'var(--color-warning-solid)' : undefined },
                { id: 'TODAS', label: fiscal ? 'Meus contratos' : 'Todos os contratos', count: contaSeg('TODAS') }
              ]}
            />
          }
        >
          {gavetaAberta === 'distribuicao' && (
            <PainelGaveta
              id="distribuicao"
              onFechar={() => alternarGaveta('distribuicao')}
              subtitulo="Clique num fiscal para ver o painel dele."
              hint="Contratos com a SFC/CGLIC de cada fiscal (titular e substituto) e o que falta autuar ou registrar; “A definir” leva à Distribuição. Transferir e ausências ficam em Distribuição › Equipe."
            >
              <GavetaDistribuicaoFiscais
                carga={carga}
                aDefinir={aDefinir.length}
                onEscolherFiscal={(userId) => mudarEndereco({ fiscal: userId, gaveta: null })}
                onDistribuir={() => navigate('/fiscalizacao/distribuicao')}
              />
            </PainelGaveta>
          )}
          <CarteiraFilterBar
            busca={busca}
            searchPlaceholder="Buscar por contrato, fornecedor, emenda ou fiscal..."
            onChangeBusca={setBusca}
            hasActiveFilters={filtrosAtivos}
            onResetFilters={() => setBusca('')}
            counter={carteiraCounter(filtrados.length, doSegmento.length, filtrosAtivos, 'contrato', 'contratos')}
            testIdPrefix="fisc-inicio"
          />
          <AdminListShell
            testId="fisc-inicio-lista"
            isLoading={false}
            isError={false}
            isEmpty={filtrados.length === 0}
            emptyTitle={filtrosAtivos ? 'Nenhum contrato atende à busca.' : segmento === 'TODAS' ? 'Nenhum contrato com a SFC/CGLIC.' : 'Nada pendente aqui.'}
            emptyDescription={filtrosAtivos ? 'Ajuste a busca.' : segmento === 'TODAS' ? 'Os contratos aparecem quando o coordenador decide a fiscalização.' : 'Escolha outra aba para ver os demais contratos.'}
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
        </PainelComFaixa>
      )}
      {autuando && <RegistrarProcessoModal key={autuando.contractKey} contrato={autuando} onClose={() => setAutuando(null)} />}
    </PageContainer>
  );
};

