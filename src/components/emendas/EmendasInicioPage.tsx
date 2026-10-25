import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { LayoutDashboard } from 'lucide-react';
import { PageContainer } from '../../design-system/components/PageContainer';
import { PageHeader } from '../../design-system/components/PageHeader';
import { HeaderRefreshAction } from '../../design-system/components/HeaderRefreshAction';
import { DataTable, type Column } from '../../design-system/components/DataTable';
import { StatusBadge, type StatusBadgeVariant } from '../../design-system/components/StatusBadge';
import { SectionHeader } from '../../design-system/components/SectionHeader';
import { AppButton } from '../../design-system/components/AppButton';
import { ActionButton } from '../../design-system/components/ActionButton';
import { CarteiraSegmentTabs } from '../carteira/CarteiraSegmentTabs';
import { CarteiraPagination } from '../carteira/CarteiraPagination';
import { useCarteiraPagination } from '../carteira/useCarteiraPagination';
import { carteiraDetalhe, carteiraNumero, carteiraSubtitle, carteiraValor } from '../carteira/carteiraStyles';
import { useCarteiraSort, type CarteiraSortColumn } from '../carteira/useCarteiraSort';
import { AdminListShell } from '../admin/shared/AdminListShell';
import { PainelBotoesGavetas, PainelGaveta, type PainelGavetaId } from '../instrumentos/PainelGavetas';
import { hojeEmBrasilia, useAutoresEmendas, useItensCaep, useNotasDasLinhas, usePedidosEmendas, usePodeGerirEmendas } from '../../hooks/useEmendas';
import { formatNumber } from '../../utils/format';
import { avisoIndicacaoDias, corteIndicacaoDias, curto, dataBR } from '../../utils/emendasKits';
import { AVISO_SEM_OFICIO_DIAS, avisoGrave, identificacaoDoPedido, itensDaLinha, linhasAtivas, ORDEM_ETAPA, ROTULO_ETAPA, type TipoAviso } from '../../utils/emendasPedidos';
import { nomeDoItem } from '../../utils/emendasQuadro';
import { prazoDoAviso, resumoInicioEmendas, type ItemLivrePertoDoFim, type PedidoComAviso } from '../../utils/emendasInicio';
import type { AutorEmenda, EtapaPedido, ItemCaep, NotaDaLinha } from '../../services/emendasService';
import { AutorDoPedido, ItemDaAta } from './emendasPartes';
import { DadosItemModal } from './DadosItemModal';

type Aba = 'todas' | TipoAviso;

const SEM_NOTAS = new Map<string, NotaDaLinha>();
const POR_PAGINA = 25;
const chave = (l: PedidoComAviso) => l.pedido.id;

/** Abas na ordem de gravidade; as zeradas saem do trilho e aparecem na frase "Sem pendência hoje". */
const ABAS: ReadonlyArray<{ id: TipoAviso; rotulo: string }> = [
  { id: 'ataVencida', rotulo: 'Ata encerrada' },
  { id: 'ataNoCorte', rotulo: 'Prazo de indicação vencido' },
  { id: 'divergencia', rotulo: 'Ofício devolvido' },
  { id: 'semOficio', rotulo: `Sem ofício há mais de ${AVISO_SEM_OFICIO_DIAS} dias` },
  { id: 'ataVencendo', rotulo: 'Ata vence em breve' },
  { id: 'semAutorizacao', rotulo: 'Ata sem autorização de empenho' },
  { id: 'semNota', rotulo: 'Sem nota de empenho' }
];

const VARIANTE_ETAPA: Record<EtapaPedido, StatusBadgeVariant> = {
  RESERVADO: 'neutral',
  MINUTA: 'info',
  OFICIO: 'info',
  CONFERIDO: 'info',
  SOLICITADO: 'info',
  AUTORIZADO: 'info',
  CGOFI: 'info',
  EMPENHADO: 'success',
  CONTRATACAO: 'success',
  CANCELADO: 'neutral'
};

const plural = (n: number, um: string, varios: string) => `${formatNumber(n)} ${n === 1 ? um : varios}`;

/** Frases dos cartões: [um pedido, vários pedidos]. */
const NO_CARTAO_GRAVE: Partial<Record<TipoAviso, [string, string]>> = {
  ataVencida: ['com ata encerrada', 'com ata encerrada'],
  ataNoCorte: ['passou do prazo de indicação', 'passaram do prazo de indicação'],
  divergencia: ['com ofício devolvido', 'com ofício devolvido'],
  semOficio: [`sem ofício há mais de ${AVISO_SEM_OFICIO_DIAS} dias`, `sem ofício há mais de ${AVISO_SEM_OFICIO_DIAS} dias`]
};
const NO_CARTAO_ETAPA: Partial<Record<EtapaPedido, [string, string]>> = {
  RESERVADO: ['reservado', 'reservados'],
  MINUTA: ['com minuta enviada', 'com minuta enviada'],
  OFICIO: ['com ofício recebido', 'com ofício recebido'],
  CONFERIDO: ['conferido no SIOP', 'conferidos no SIOP'],
  SOLICITADO: ['com solicitação de empenho', 'com solicitação de empenho'],
  AUTORIZADO: ['com empenho autorizado', 'com empenho autorizado'],
  CGOFI: ['na CGOFI para empenhar', 'na CGOFI para empenhar']
};

const Cartao: React.FC<{ rotulo: string; valor: React.ReactNode; grave?: boolean; onClick: () => void; testId: string; children: React.ReactNode }> = ({ rotulo, valor, grave, onClick, testId, children }) => (
  <button type="button" className={grave ? 'em-inicio-cartao em-inicio-cartao--grave' : 'em-inicio-cartao'} onClick={onClick} data-testid={testId}>
    <span className="em-inicio-cartao-rotulo">{rotulo}</span>
    <span className="em-inicio-cartao-valor">{valor}</span>
    {children}
  </button>
);

/**
 * Início do gestor de emendas (protótipo aprovado em 23/10/2026): pedidos com aviso, do mais urgente ao menos urgente,
 * e o saldo da CAEP que ainda pode ser oferecido antes de a ata acabar. Os avisos são os mesmos da lista de Pedidos.
 */
export const EmendasInicioPage: React.FC = () => {
  const navigate = useNavigate();
  // Para o gestor de emendas esta é o Início; o coordenador a abre na aba Emendas do Início dele.
  const { role } = useAuth();
  const { data: pedidos = [], isLoading, isFetching, isError, error, refetch, dataUpdatedAt } = usePedidosEmendas();
  const { data: notas = SEM_NOTAS, refetch: recarregarNotas } = useNotasDasLinhas();
  const { data: itensLista = [], isLoading: carregandoItens, refetch: recarregarItens } = useItensCaep();
  const { data: autores = [] } = useAutoresEmendas();
  const hoje = hojeEmBrasilia();
  const [aba, setAba] = useState<Aba>('todas');
  const [gavetaAberta, setGavetaAberta] = useState<PainelGavetaId | null>('saldoLivre');
  const podeGerir = usePodeGerirEmendas();
  const [editando, setEditando] = useState<ItemCaep | null>(null);

  const carregando = isLoading || carregandoItens;
  const r = useMemo(() => resumoInicioEmendas(pedidos, itensLista, notas, hoje), [pedidos, itensLista, notas, hoje]);
  const autorPorId = useMemo(() => new Map<string, AutorEmenda>(autores.map((a) => [a.id, a])), [autores]);
  const itens = useMemo(() => new Map(itensLista.map((i) => [i.itemKey, i])), [itensLista]);

  const abasComPedido = ABAS.filter((a) => r.porTipo[a.id] > 0);
  const abasZeradas = ABAS.filter((a) => r.porTipo[a.id] === 0);
  const abaAtiva: Aba = aba !== 'todas' && r.porTipo[aba] === 0 ? 'todas' : aba;
  const lista = useMemo(
    () => (abaAtiva === 'todas' ? r.pedidosComAviso : r.pedidosComAviso.filter((p) => p.avisos.some((a) => a.tipo === abaAtiva))),
    [r.pedidosComAviso, abaAtiva]
  );
  // Item do aviso ou o primeiro item do pedido: o mesmo que a coluna Item · ata mostra.
  const itemDaLinha = (x: PedidoComAviso): ItemCaep | undefined =>
    x.itemDoAviso ?? linhasAtivas(x.pedido).flatMap((l) => itensDaLinha(l)).map((i) => itens.get(i.itemKey)).find((i): i is ItemCaep => Boolean(i));
  // Como nas carteiras: ordena pelo cabeçalho (?ordem=) antes de paginar; sem escolha, do mais urgente ao menos urgente.
  const ordem = useMemo<Record<string, CarteiraSortColumn<PedidoComAviso>>>(
    () => ({
      autor: { value: (x) => (x.pedido.autorId ? autorPorId.get(x.pedido.autorId)?.nome ?? x.pedido.autorId : null) },
      etapa: { value: (x) => ORDEM_ETAPA[x.pedido.etapa] },
      item: { value: (x) => itemDaLinha(x)?.descricao }
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [autorPorId, itens]
  );
  const { sorted, sortKey, sortDir, toggle } = useCarteiraSort(lista, ordem);
  const { currentPage, setPage, pageItems } = useCarteiraPagination(sorted, chave, POR_PAGINA);

  const vermelhos = (Object.keys(NO_CARTAO_GRAVE) as TipoAviso[])
    .filter((t) => r.porTipo[t] > 0)
    .map((t) => plural(r.porTipo[t], ...NO_CARTAO_GRAVE[t]!))
    .join(' · ');
  const passaramDoCorte = r.livrePertoDoFim.filter((x) => x.passouDoCorte).length;
  const partesReservado = r.alocado > 0 ? Math.round((r.reservado / r.alocado) * 100) : 0;
  const porEtapaAntes = (Object.keys(NO_CARTAO_ETAPA) as EtapaPedido[])
    .filter((e) => r.porEtapa[e])
    .map((e) => plural(r.porEtapa[e]!, ...NO_CARTAO_ETAPA[e]!))
    .join(' · ');

  const recarregar = () => {
    refetch();
    recarregarNotas();
    recarregarItens();
  };

  const colunas: Column<PedidoComAviso>[] = [
    {
      key: 'autor',
      header: 'Parlamentar',
      priority: 'primary',
      minWidth: '200px',
      sortValue: ordem.autor.value,
      render: ({ pedido: p }) => (
        <>
          <AutorDoPedido autor={p.autorId ? autorPorId.get(p.autorId) : undefined} autorId={p.autorId} destaque />
          <div style={{ ...carteiraSubtitle, marginTop: '0.15rem' }}>{identificacaoDoPedido(p)}</div>
        </>
      )
    },
    {
      key: 'etapa',
      header: 'Etapa',
      nowrap: true,
      sortValue: ordem.etapa.value,
      render: ({ pedido: p }) => <StatusBadge label={ROTULO_ETAPA[p.etapa]} variant={VARIANTE_ETAPA[p.etapa]} size="sm" dot={false} />
    },
    {
      key: 'aviso',
      header: 'Aviso',
      nowrap: true,
      render: ({ pedido: p, avisos }) => {
        const [primeiro, ...outros] = avisos;
        return (
          <span title={avisos.map((a) => a.texto).join('\n')} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }} data-testid={`emendas-inicio-aviso-${p.id}`}>
            <StatusBadge label={primeiro.curto} variant={avisoGrave(primeiro) ? 'danger' : 'warning'} size="sm" dot={false} />
            {outros.length > 0 && <span style={{ ...carteiraDetalhe, fontWeight: 700 }}>+{outros.length}</span>}
          </span>
        );
      }
    },
    {
      key: 'item',
      header: 'Item · ata',
      minWidth: '240px',
      sortValue: ordem.item.value,
      render: (x) => {
        if (x.itemDoAviso) return <ItemDaAta item={x.itemDoAviso} comLinks />;
        const ativas = linhasAtivas(x.pedido);
        const primeiro = itemDaLinha(x);
        return (
          <>
            {primeiro ? <div style={carteiraValor}>{curto(primeiro.descricao, 48)}</div> : <span style={carteiraDetalhe}>—</span>}
            {ativas.length > 1 && <div style={carteiraDetalhe}>{plural(ativas.length, 'linha', 'linhas')} no pedido</div>}
          </>
        );
      }
    },
    {
      key: 'prazo',
      header: 'Prazo',
      minWidth: '160px',
      render: ({ avisos, itemDoAviso }) => <span style={carteiraValor}>{prazoDoAviso(avisos[0], itemDoAviso, hoje)}</span>
    }
  ];

  const colunasLivre: Column<ItemLivrePertoDoFim>[] = [
    { key: 'item', header: 'Item', priority: 'primary', minWidth: '260px', sortValue: (x) => x.item.descricao, render: (x) => <ItemDaAta item={x.item} comLinks /> },
    { key: 'livre', header: 'Livre', align: 'right', nowrap: true, sortValue: (x) => x.livre, sortFirstDir: 'desc', render: (x) => <span style={{ ...carteiraValor, ...carteiraNumero }}>{formatNumber(x.livre)}</span> },
    { key: 'alocado', header: 'Alocado', align: 'right', nowrap: true, sortValue: (x) => x.item.alocado, sortFirstDir: 'desc', render: (x) => <span style={carteiraNumero}>{formatNumber(x.item.alocado)}</span> },
    {
      key: 'fim',
      header: 'Fim da ata',
      nowrap: true,
      sortValue: (x) => x.item.vigenciaFinal,
      render: (x) => (
        <>
          <div style={carteiraValor}>{dataBR(x.item.vigenciaFinal)}</div>
          <div style={carteiraDetalhe}>em {plural(x.diasParaVencer, 'dia', 'dias')}</div>
        </>
      )
    },
    {
      key: 'indicar',
      header: 'Indicar até',
      nowrap: true,
      render: (x) =>
        x.passouDoCorte ? (
          <StatusBadge label="Prazo vencido" variant="danger" size="sm" dot={false} />
        ) : (
          <>
            <StatusBadge label={dataBR(x.indicarAte)} variant="warning" size="sm" dot={false} />
            <div style={carteiraDetalhe}>faltam {plural(x.diasParaVencer - corteIndicacaoDias(), 'dia', 'dias')}</div>
          </>
        )
    }
  ];

  const colunasSemNome: Column<ItemCaep>[] = [
    { key: 'item', header: 'Item', priority: 'primary', minWidth: '260px', sortValue: (i) => i.descricao, render: (i) => <ItemDaAta item={i} comLinks /> },
    {
      key: 'quadro',
      header: 'Sai no quadro hoje',
      minWidth: '200px',
      render: (i) => <span style={carteiraValor}>{nomeDoItem(i, i.itemKey)}</span>
    },
    { key: 'alocado', header: 'Alocado', align: 'right', nowrap: true, sortValue: (i) => i.alocado, sortFirstDir: 'desc', render: (i) => <span style={carteiraNumero}>{formatNumber(i.alocado)}</span> },
    { key: 'fim', header: 'Fim da ata', nowrap: true, sortValue: (i) => i.vigenciaFinal, render: (i) => <span style={carteiraValor}>{dataBR(i.vigenciaFinal)}</span> }
  ];

  const valor = (n: number) => (carregando ? '—' : formatNumber(n));

  return (
    <PageContainer style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <PageHeader
        title={role === 'gestor_emendas' ? 'Início' : 'Emendas'}
        subtitle="Pedidos dos parlamentares e saldo da CAEP que pedem atenção."
        hint={`Os avisos são os mesmos da lista de Pedidos: ata encerrada antes do empenho, prazo de indicação vencido (a menos de ${corteIndicacaoDias()} dias do fim da ata), divergência com o SIOP, mais de ${AVISO_SEM_OFICIO_DIAS} dias sem ofício, ata vencendo em até ${avisoIndicacaoDias()} dias e linhas empenhadas sem nota. Os dois prazos ficam em Ajustes > Regras de Alertas. Saldo livre = alocado à CAEP − reservado nos pedidos, só nas atas vigentes. Item sem nome curto: alocado à CAEP em ata vigente e ainda sem o nome que sai no quadro do parlamentar.`}
        icon={<LayoutDashboard size={26} color="var(--primary)" aria-hidden="true" />}
        actions={<HeaderRefreshAction onRefresh={recarregar} isRefreshing={isFetching} lastUpdated={dataUpdatedAt || null} dataTestId="emendas-inicio-atualizar" tooltipTitle="Recarregar pedidos, notas e saldo" />}
      />

      <div className="em-inicio-cartoes" data-testid="emendas-inicio-cartoes">
        <Cartao rotulo="Pedem ação já" valor={valor(r.graves)} grave={r.graves > 0} onClick={() => navigate('/emendas/pedidos?aviso=grave')} testId="emendas-inicio-cartao-graves">
          <span className="em-inicio-cartao-texto">{vermelhos || 'Nenhum pedido com aviso vermelho'}</span>
        </Cartao>
        <Cartao rotulo="Pedidos antes do empenho" valor={valor(r.antesDoEmpenho)} onClick={() => navigate('/emendas/pedidos')} testId="emendas-inicio-cartao-antes">
          <span className="em-inicio-cartao-texto">{porEtapaAntes || 'Nenhum pedido em andamento'}</span>
        </Cartao>
        <Cartao rotulo="Empenhados" valor={valor(r.empenhados)} onClick={() => navigate(`/emendas/pedidos?etapa=${r.porEtapa.EMPENHADO ? 'EMPENHADO' : 'CONTRATACAO'}`)} testId="emendas-inicio-cartao-empenhados">
          <span className="em-inicio-cartao-texto">
            {formatNumber(r.linhasComNota)} de {plural(r.linhasEmpenhadas, 'linha', 'linhas')} já com a nota de empenho
          </span>
        </Cartao>
        <Cartao
          rotulo="Livre para indicar"
          valor={
            <>
              {valor(r.livre)} <small>un.</small>
            </>
          }
          onClick={() => navigate('/emendas/itens')}
          testId="emendas-inicio-cartao-livre"
        >
          <span className="em-inicio-cartao-texto">
            de {formatNumber(r.alocado)} alocadas à CAEP em {plural(r.itensVigentes, 'item', 'itens')} de atas vigentes
          </span>
          <span className="em-inicio-barra" aria-hidden="true">
            <i style={{ width: `${partesReservado}%` }} />
          </span>
          <span className="em-inicio-cartao-texto">{formatNumber(r.reservado)} reservadas a parlamentares</span>
        </Cartao>
      </div>

      <PainelBotoesGavetas
        botoes={[
          {
            id: 'saldoLivre',
            resumo: carregando
              ? undefined
              : r.livrePertoDoFim.length === 0
                ? `nenhum item com ata vencendo em até ${avisoIndicacaoDias()} dias`
                : `${plural(r.livrePertoDoFim.length, 'item', 'itens')} com ata vencendo em até ${avisoIndicacaoDias()} dias${passaramDoCorte ? ` · ${formatNumber(passaramDoCorte)} já passaram do prazo de indicação` : ''}`,
            atencao: r.livrePertoDoFim.length > 0
          },
          {
            id: 'semNomeCurto',
            resumo: carregando ? undefined : r.semNomeCurto.length === 0 ? 'todos com nome curto' : `${plural(r.semNomeCurto.length, 'item', 'itens')} sem o nome do quadro`,
            atencao: r.semNomeCurto.length > 0
          }
        ]}
        aberta={gavetaAberta}
        onToggle={(id) => setGavetaAberta((v) => (v === id ? null : id))}
      />
      {gavetaAberta === 'saldoLivre' && (
        <PainelGaveta
          id="saldoLivre"
          subtitulo={`Saldo da CAEP que ainda não foi reservado a nenhum parlamentar. Depois do prazo de indicação (${corteIndicacaoDias()} dias antes do fim da ata) não dá mais para reservar; o gestor de saldo pode remanejar.`}
          onFechar={() => setGavetaAberta(null)}
        >
          {r.livrePertoDoFim.length === 0 ? (
            <div style={carteiraSubtitle}>{carregando ? 'Carregando…' : 'Nenhum item com saldo livre perto do fim da ata.'}</div>
          ) : (
            <DataTable<ItemLivrePertoDoFim>
              testId="emendas-inicio-livre"
              className="data-table-container--flush"
              data={r.livrePertoDoFim}
              keyExtractor={(x) => x.item.itemKey}
              columns={colunasLivre}
              rowOpen={(x) => () => navigate(`/emendas/itens?busca=${encodeURIComponent(`${x.item.numeroAta} item ${Number(x.item.numeroItem)}`)}`)}
            />
          )}
        </PainelGaveta>
      )}
      {gavetaAberta === 'semNomeCurto' && (
        <PainelGaveta
          id="semNomeCurto"
          subtitulo="Itens que chegaram à CAEP em atas vigentes sem o nome curto. Sem ele, o quadro do parlamentar mostra o começo da descrição do catálogo."
          onFechar={() => setGavetaAberta(null)}
        >
          {r.semNomeCurto.length === 0 ? (
            <div style={carteiraSubtitle}>{carregando ? 'Carregando…' : 'Todos os itens das atas vigentes já têm nome curto.'}</div>
          ) : (
            <DataTable<ItemCaep>
              testId="emendas-inicio-sem-nome"
              className="data-table-container--flush"
              data={r.semNomeCurto}
              keyExtractor={(i) => i.itemKey}
              columns={colunasSemNome}
              rowOpen={(i) => () => navigate(`/emendas/itens?busca=${encodeURIComponent(`${i.numeroAta} item ${Number(i.numeroItem)}`)}`)}
              rowActions={
                podeGerir
                  ? (i) => <ActionButton action="editar" iconOnly label={`Nome curto e GND de ${nomeDoItem(i, i.itemKey)}`} onClick={() => setEditando(i)} data-testid={`emendas-inicio-nome-${i.itemKey}`} />
                  : undefined
              }
            />
          )}
        </PainelGaveta>
      )}
      {editando && <DadosItemModal item={editando} onClose={() => setEditando(null)} />}

      <SectionHeader
        title="Pendências dos pedidos"
        subtitle="Os mesmos avisos da lista de Pedidos, do mais urgente ao menos urgente."
        actions={
          <AppButton size="sm" variant="secondary" onClick={() => navigate(`/emendas/pedidos?aviso=${abaAtiva === 'todas' ? 'com' : abaAtiva}`)} data-testid="emendas-inicio-ver-pedidos">
            Ver em Pedidos
          </AppButton>
        }
      />
      <CarteiraSegmentTabs<Aba>
        testIdPrefix="emendas-inicio-aba"
        ariaLabel="Filtrar por aviso"
        active={abaAtiva}
        onSelect={setAba}
        segments={[
          ...abasComPedido.map((a) => ({ id: a.id as Aba, label: a.rotulo, count: r.porTipo[a.id], dot: avisoGrave({ tipo: a.id }) ? 'var(--color-danger)' : 'var(--color-warning-solid)' })),
          { id: 'todas', label: 'Todas', count: r.pedidosComAviso.length }
        ]}
      />
      {!carregando && abasZeradas.length > 0 && (
        <div style={carteiraSubtitle} data-testid="emendas-inicio-sem-pendencia">
          Sem pendência hoje: {abasZeradas.map((a) => a.rotulo).join(' · ')}.
        </div>
      )}

      <AdminListShell
        testId="emendas-inicio-lista"
        isLoading={carregando}
        isError={isError}
        errorTitle="Não foi possível carregar os pedidos"
        errorMessage={(error as Error | null)?.message || 'Falha ao consultar os pedidos.'}
        onRetry={() => refetch()}
        isEmpty={!carregando && lista.length === 0}
        emptyTitle="Nenhum pedido com aviso."
        emptyDescription="Quando um pedido precisar de atenção, ele aparece aqui."
      >
        <DataTable<PedidoComAviso>
          testId="emendas-inicio-pedidos"
          className="data-table-container--flush emendas-tabela-topo"
          data={pageItems}
          keyExtractor={chave}
          sort={{ key: sortKey, dir: sortDir }}
          onSort={toggle}
          columns={colunas}
          rowOpen={(l) => () => navigate(`/emendas/pedidos?pedido=${l.pedido.id}`)}
        />
        <CarteiraPagination page={currentPage} pageSize={POR_PAGINA} total={lista.length} onChange={setPage} testIdPrefix="emendas-inicio" />
      </AdminListShell>
    </PageContainer>
  );
};
