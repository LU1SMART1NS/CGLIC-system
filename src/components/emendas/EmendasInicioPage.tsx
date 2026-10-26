import React, { useCallback, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { AlertTriangle, Boxes, Check, ClipboardList, LayoutDashboard } from 'lucide-react';
import { PageContainer } from '../../design-system/components/PageContainer';
import { PageHeader } from '../../design-system/components/PageHeader';
import { HeaderRefreshAction } from '../../design-system/components/HeaderRefreshAction';
import { DataTable, type Column } from '../../design-system/components/DataTable';
import { StatusBadge, type StatusBadgeVariant } from '../../design-system/components/StatusBadge';
import { SectionHeader } from '../../design-system/components/SectionHeader';
import { ActionButton } from '../../design-system/components/ActionButton';
import { EmptyState } from '../../design-system/components/EmptyState';
import { ProgressBar } from '../../design-system/components/ProgressBar';
import { CarteiraSegmentTabs } from '../carteira/CarteiraSegmentTabs';
import { CarteiraFilterBar, carteiraCounter } from '../carteira/CarteiraFilterBar';
import { CarteiraFilterButton } from '../carteira/CarteiraFilterButton';
import { CarteiraPagination } from '../carteira/CarteiraPagination';
import { useCarteiraPagination } from '../carteira/useCarteiraPagination';
import { carteiraDetalhe, carteiraNumero, carteiraSubtitle, carteiraValor } from '../carteira/carteiraStyles';
import { useCarteiraSort, type CarteiraSortColumn } from '../carteira/useCarteiraSort';
import { AdminListShell } from '../admin/shared/AdminListShell';
import { PainelBotoesGavetas, PainelGaveta, type PainelGavetaId } from '../instrumentos/PainelGavetas';
import { PainelCartao, PainelCartoes, type PainelCartaoLinha } from '../instrumentos/PainelCartao';
import {
  hojeEmBrasilia,
  useAutoresEmendas,
  useContatosDasEmendas,
  useCredorDiferente,
  useDiferencasDeEmpenho,
  useEmendasSiop,
  useExecucaoEmendas,
  useItensCaep,
  useNotasDasLinhas,
  useNotasSemPedido,
  usePedidosEmendas,
  usePodeGerirEmendas
} from '../../hooks/useEmendas';
import { AvisosResolvidosLista, BotaoResolvido, useResolverAviso } from '../avisos/ResolverAviso';
import { chaveNotaSemPedido, notasSemPedidoPendentes } from '../../utils/emendasConferenciaNota';
import { emendasAConferir, type EmendaAConferir } from '../../utils/emendasEmpenho';
import { formatCurrency, formatCurrencyCompact, formatNumber } from '../../utils/format';
import { avisoIndicacaoDias, corteIndicacaoDias, curto, dataBR } from '../../utils/emendasKits';
import {
  avisoGrave,
  FASES_PEDIDO,
  identificacaoDoPedido,
  itensDaLinha,
  jaEmpenhado,
  linhasAtivas,
  numeroDaEmendaEmTexto,
  ORDEM_ETAPA,
  reservadoPorItem,
  ROTULO_AVISO,
  ROTULO_ETAPA,
  TIPOS_AVISO,
  type TipoAviso
} from '../../utils/emendasPedidos';
import { nomeDoItem } from '../../utils/emendasQuadro';
import { menorPrecoDisponivel, sobraDasEmendas, type ExecucaoNoPortal, type SobraDaEmenda } from '../../utils/emendasSobra';
import { usePrecosParaEmenda } from '../../hooks/useEmendasQuadro';
import { prazoDoAviso, resumoInicioEmendas, type ItemLivrePertoDoFim, type PedidoComAviso } from '../../utils/emendasInicio';
import type { AutorEmenda, EtapaPedido, ItemCaep, NotaDaLinha, NotaSemPedido } from '../../services/emendasService';
import { AutorDoPedido, LARGURA_AUTOR, ItemDaAta } from './emendasPartes';
import { DadosItemModal } from './DadosItemModal';
import { contaEmendasSemPedido, diasSemContatoParaUrgente, emendasNaLista, haDias, numeroDaEmenda, semPedido as emendaSemPedido, textoDias, type EmendaNaLista } from '../../utils/emendasSemPedido';

/** Trilho das pendências: a pergunta principal é a gravidade; o tipo de aviso vira o filtro "+ Aviso". */
type Segmento = 'graves' | 'atencao' | 'todas';

const SEM_NOTAS = new Map<string, NotaDaLinha>();
const SEM_NOTAS_SEM_PEDIDO: NotaSemPedido[] = [];
const POR_PAGINA = 25;
const GAVETAS: PainelGavetaId[] = ['emendasSemPedido', 'saldoLivre', 'empenhoAConferir', 'notasSemPedido', 'sobraEmenda', 'semNomeCurto'];
const SEM_PORTAL: ExecucaoNoPortal[] = [];
const chave = (l: PedidoComAviso) => l.pedido.id;
const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

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

/**
 * Início do gestor de emendas (protótipo aprovado em 23/10/2026; padronizado com o Painel em 25/10/2026): os quatro
 * cartões no desenho do Painel, as gavetas com rótulo curto e a regra no ⓘ, e as pendências dos pedidos num trilho por
 * gravidade com o filtro de aviso. Os avisos são os mesmos da lista de Pedidos.
 */
export const EmendasInicioPage: React.FC = () => {
  const navigate = useNavigate();
  // Para o gestor de emendas esta é o Início; o coordenador a abre na aba Emendas do Início dele.
  const { role } = useAuth();
  const { data: pedidos = [], isLoading, isFetching, isError, error, refetch, dataUpdatedAt } = usePedidosEmendas();
  const { data: notas = SEM_NOTAS, refetch: recarregarNotas } = useNotasDasLinhas();
  const { data: itensLista = [], isLoading: carregandoItens, refetch: recarregarItens } = useItensCaep();
  const { data: autores = [] } = useAutoresEmendas();
  const { consulta: consultaEmpenho, conferencia, diferencas } = useDiferencasDeEmpenho();
  const { porPedido: credor } = useCredorDiferente();
  const { data: notasSemPedido = SEM_NOTAS_SEM_PEDIDO, isLoading: carregandoSemPedido } = useNotasSemPedido();
  // Emendas vistas no SIOP e ainda sem pedido (migration 205): avisam desde o registro.
  const { data: emendasSiop, isLoading: carregandoEmendas } = useEmendasSiop();
  const { data: contatosDasEmendas } = useContatosDasEmendas();
  const { abrir: abrirResolvido, dialog: dialogResolvido, porChave: resolvidos, reexibir } = useResolverAviso();
  const hoje = hojeEmBrasilia();
  const [segmento, setSegmento] = useState<Segmento>('todas');
  const [filtroAviso, setFiltroAviso] = useState<TipoAviso | ''>('');
  const [busca, setBusca] = useState('');
  const podeGerir = usePodeGerirEmendas();
  const [editando, setEditando] = useState<ItemCaep | null>(null);

  // A gaveta aberta fica no endereço (?gaveta=), como no Painel: o Voltar devolve a mesma visão. Nenhuma nasce aberta.
  const [searchParams, setSearchParams] = useSearchParams();
  const gavetaUrl = searchParams.get('gaveta') as PainelGavetaId | null;
  const gavetaAberta: PainelGavetaId | null = gavetaUrl && GAVETAS.includes(gavetaUrl) ? gavetaUrl : null;
  const alternarGaveta = useCallback(
    (id: PainelGavetaId) =>
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (next.get('gaveta') === id) next.delete('gaveta');
          else next.set('gaveta', id);
          return next;
        },
        { replace: true }
      ),
    [setSearchParams]
  );
  const fecharGaveta = () => gavetaAberta && alternarGaveta(gavetaAberta);

  const carregando = isLoading || carregandoItens;
  const emendasSemPedido = useMemo(
    () => emendasNaLista(emendasSiop ?? [], pedidos, contatosDasEmendas ?? [], hoje).filter(emendaSemPedido),
    [emendasSiop, pedidos, contatosDasEmendas, hoje]
  );
  const contaSemPedido = contaEmendasSemPedido(emendasSemPedido);
  const r = useMemo(() => resumoInicioEmendas(pedidos, itensLista, notas, hoje, diferencas, credor), [pedidos, itensLista, notas, hoje, diferencas, credor]);
  const semPedido = useMemo(() => notasSemPedidoPendentes(notasSemPedido, resolvidos), [notasSemPedido, resolvidos]);
  const semPedidoResolvidas = useMemo(() => notasSemPedido.filter((n) => resolvidos.has(chaveNotaSemPedido(n))), [notasSemPedido, resolvidos]);
  const autorPorId = useMemo(() => new Map<string, AutorEmenda>(autores.map((a) => [a.id, a])), [autores]);
  const itens = useMemo(() => new Map(itensLista.map((i) => [i.itemKey, i])), [itensLista]);
  const aConferir = useMemo(() => emendasAConferir(conferencia, itens), [conferencia, itens]);
  const pedidoPorId = useMemo(() => new Map(pedidos.map((p) => [p.id, p])), [pedidos]);
  // Sobra das emendas do ano (migration 204): as que compram pelo menos o item mais barato que a CAEP ainda oferece.
  const { precos } = usePrecosParaEmenda();
  const { data: portal = SEM_PORTAL } = useExecucaoEmendas();
  const sobras = useMemo(() => {
    const minimo = menorPrecoDisponivel(itens, reservadoPorItem(pedidos), precos);
    return sobraDasEmendas({ pedidos, ano: Number(hoje.slice(0, 4)), itens, notas, portal: new Map(portal.map((x) => [x.codigo, x])), precos, minimo }).filter((e) => e.situacao === 'sobra');
  }, [pedidos, hoje, itens, notas, portal, precos]);
  const valorDasSobras = sobras.reduce((t, e) => t + e.sobra, 0);
  const colunasSobra: Column<SobraDaEmenda>[] = [
    { key: 'autor', header: 'Parlamentar', priority: 'primary', width: LARGURA_AUTOR, minWidth: LARGURA_AUTOR, render: (e) => <AutorDoPedido autor={e.autorId ? autorPorId.get(e.autorId) : undefined} autorId={e.autorId} destaque /> },
    { key: 'emenda', header: 'Emenda', nowrap: true, render: (e) => <span style={carteiraNumero}>{`${numeroDaEmendaEmTexto(e.emenda)} / ${e.ano}`}</span> },
    { key: 'pedidos', header: 'Pedidos', render: (e) => <span style={carteiraDetalhe}>{e.pedidos.map((p) => p.numero).join(', ')}</span> },
    { key: 'sobra', header: 'Sobra', align: 'right', nowrap: true, render: (e) => <span style={{ ...carteiraValor, ...carteiraNumero }}>{formatCurrency(e.sobra)}</span> },
    { key: 'prazo', header: 'Prazo', nowrap: true, render: (e) => <span style={carteiraDetalhe}>empenhar até 31/12/{e.ano}</span> }
  ];

  // Item do aviso ou o primeiro item do pedido: o mesmo que a coluna Item · ata mostra.
  const itemDaLinha = useCallback(
    (x: PedidoComAviso): ItemCaep | undefined =>
      x.itemDoAviso ?? linhasAtivas(x.pedido).flatMap((l) => itensDaLinha(l)).map((i) => itens.get(i.itemKey)).find((i): i is ItemCaep => Boolean(i)),
    [itens]
  );
  const nomeDoAutor = useCallback((x: PedidoComAviso) => (x.pedido.autorId ? autorPorId.get(x.pedido.autorId)?.nome ?? x.pedido.autorId : 'Parlamentar a definir'), [autorPorId]);

  const graves = r.graves;
  const atencao = r.pedidosComAviso.length - graves;
  const doSegmento = useMemo(
    () => r.pedidosComAviso.filter((x) => (segmento === 'todas' ? true : segmento === 'graves' ? x.avisos.some(avisoGrave) : !x.avisos.some(avisoGrave))),
    [r.pedidosComAviso, segmento]
  );
  const lista = useMemo(() => {
    const termo = semAcento(busca.trim());
    return doSegmento
      .filter((x) => !filtroAviso || x.avisos.some((a) => a.tipo === filtroAviso))
      .filter((x) => {
        if (!termo) return true;
        const doPedido = linhasAtivas(x.pedido)
          .flatMap((l) => itensDaLinha(l))
          .map((i) => itens.get(i.itemKey))
          .map((i) => (i ? `${i.descricao} ${i.numeroAta} ${i.nomeCurto ?? ''}` : ''))
          .join(' ');
        return semAcento(`${nomeDoAutor(x)} ${identificacaoDoPedido(x.pedido)} ${doPedido}`).includes(termo);
      });
  }, [doSegmento, filtroAviso, busca, itens, nomeDoAutor]);
  const filtrosAtivos = Boolean(filtroAviso || busca.trim());
  // Opções do filtro: só os avisos que algum pedido tem hoje, do mais grave ao mais leve.
  const opcoesDeAviso = TIPOS_AVISO.filter((t) => r.porTipo[t] > 0).map((t) => ({ value: t, label: ROTULO_AVISO[t], count: doSegmento.filter((x) => x.avisos.some((a) => a.tipo === t)).length }));

  // Como nas carteiras: ordena pelo cabeçalho (?ordem=) antes de paginar; sem escolha, do mais urgente ao menos urgente.
  const ordem = useMemo<Record<string, CarteiraSortColumn<PedidoComAviso>>>(
    () => ({
      autor: { value: (x) => (x.pedido.autorId ? autorPorId.get(x.pedido.autorId)?.nome ?? x.pedido.autorId : null) },
      etapa: { value: (x) => ORDEM_ETAPA[x.pedido.etapa] },
      item: { value: (x) => itemDaLinha(x)?.descricao }
    }),
    [autorPorId, itemDaLinha]
  );
  const { sorted, sortKey, sortDir, toggle } = useCarteiraSort(lista, ordem);
  const { currentPage, setPage, pageItems } = useCarteiraPagination(sorted, chave, POR_PAGINA);

  // ---- Cartões (desenho do Painel): número grande e até três linhas rótulo/valor ----------------------------------
  const valor = (n: number) => (carregando ? '—' : formatNumber(n));
  const gravesPorTipo = TIPOS_AVISO.filter((t) => avisoGrave({ tipo: t }) && r.porTipo[t] > 0);
  const linhasGraves: PainelCartaoLinha[] = gravesPorTipo.slice(0, 3).map((t) => ({ rotulo: ROTULO_AVISO[t], valor: formatNumber(r.porTipo[t]), tom: 'danger' }));
  const outrosGraves = gravesPorTipo.slice(3).reduce((s, t) => s + r.porTipo[t], 0);
  if (outrosGraves > 0) linhasGraves.push({ rotulo: 'Outros avisos vermelhos', valor: formatNumber(outrosGraves), tom: 'danger' });
  const porFase = (etapas: readonly EtapaPedido[]) => etapas.filter((e) => !jaEmpenhado(e)).reduce((s, e) => s + (r.porEtapa[e] ?? 0), 0);
  const linhasAntes: PainelCartaoLinha[] = FASES_PEDIDO.filter((f) => f.etapas.some((e) => !jaEmpenhado(e))).map((f) => ({ rotulo: f.nome, valor: formatNumber(porFase(f.etapas)) }));
  const passaramDoCorte = r.livrePertoDoFim.filter((x) => x.passouDoCorte).length;

  const recarregar = () => {
    refetch();
    recarregarNotas();
    recarregarItens();
    void consultaEmpenho.refetch();
  };
  const abrirPedidos = () => navigate(`/emendas/pedidos?aviso=${filtroAviso || (segmento === 'graves' ? 'grave' : 'com')}`);

  const colunas: Column<PedidoComAviso>[] = [
    {
      key: 'autor',
      header: 'Parlamentar',
      priority: 'primary',
      width: LARGURA_AUTOR,
      minWidth: LARGURA_AUTOR,
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
            {ativas.length > 1 && <div style={carteiraDetalhe}>{plural(ativas.length, 'item', 'itens')} no pedido</div>}
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

  const colunasEmendasSemPedido: Column<EmendaNaLista>[] = [
    { key: 'autor', header: 'Parlamentar', priority: 'primary', width: LARGURA_AUTOR, minWidth: LARGURA_AUTOR, render: (l) => <AutorDoPedido autor={l.autorId ? autorPorId.get(l.autorId) : undefined} autorId={l.autorId} /> },
    { key: 'emenda', header: 'Emenda', nowrap: true, render: (l) => <span style={carteiraValor}>{numeroDaEmenda(l.numero)} / {l.ano}</span> },
    { key: 'valor', header: 'Valor', align: 'right', nowrap: true, render: (l) => <span style={{ ...carteiraValor, ...carteiraNumero }}>{formatCurrency(l.valor ?? 0)}</span> },
    { key: 'dias', header: 'Sem pedido há', align: 'right', nowrap: true, render: (l) => <span style={{ ...carteiraValor, ...carteiraNumero }}>{textoDias(l.diasSemPedido ?? 0)}</span> },
    {
      key: 'contato',
      header: 'Último contato',
      render: (l) => {
        const u = l.contatos.at(-1);
        return (
          <>
            <StatusBadge
              label={u ? `contato ${haDias(l.diasSemContato ?? 0)}` : 'sem contato'}
              variant={l.urgente ? 'danger' : 'warning'}
              size="sm"
              dot={false}
            />
            {u && <div style={carteiraDetalhe}>{u.comQuem}</div>}
          </>
        );
      }
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
          <StatusBadge label={ROTULO_AVISO.ataNoCorte} variant="danger" size="sm" dot={false} />
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
    { key: 'quadro', header: 'No quadro', minWidth: '200px', render: (i) => <span style={carteiraValor}>{nomeDoItem(i, i.itemKey)}</span> },
    { key: 'alocado', header: 'Alocado', align: 'right', nowrap: true, sortValue: (i) => i.alocado, sortFirstDir: 'desc', render: (i) => <span style={carteiraNumero}>{formatNumber(i.alocado)}</span> },
    { key: 'fim', header: 'Fim da ata', nowrap: true, sortValue: (i) => i.vigenciaFinal, render: (i) => <span style={carteiraValor}>{dataBR(i.vigenciaFinal)}</span> }
  ];

  const colunasAConferir: Column<EmendaAConferir>[] = [
    {
      key: 'autor',
      header: 'Parlamentar',
      priority: 'primary',
      width: LARGURA_AUTOR,
      minWidth: LARGURA_AUTOR,
      render: (e) => {
        const autorId = e.pedidoIds.map((id) => pedidoPorId.get(id)?.autorId).find(Boolean) ?? null;
        return (
          <>
            <AutorDoPedido autor={autorId ? autorPorId.get(autorId) : undefined} autorId={autorId} destaque />
            <div style={{ ...carteiraSubtitle, marginTop: '0.15rem' }}>emenda {e.emenda} · {e.pedidos.length === 1 ? 'pedido' : 'pedidos'} {e.pedidos.join(', ')}</div>
          </>
        );
      }
    },
    { key: 'itens', header: 'Itens', align: 'right', nowrap: true, sortValue: (e) => e.itens, sortFirstDir: 'desc', render: (e) => <span style={{ ...carteiraValor, ...carteiraNumero }}>{formatNumber(e.itens)}</span> },
    { key: 'motivo', header: 'Motivo', minWidth: '240px', render: (e) => <span style={carteiraDetalhe}>{e.motivo}</span> },
    {
      key: 'parcial',
      header: 'Notas lidas',
      minWidth: '220px',
      render: (e) => (e.parciais.length ? <span style={carteiraDetalhe}>{e.parciais.slice(0, 3).join(' · ')}{e.parciais.length > 3 ? ` · e mais ${e.parciais.length - 3}` : ''}</span> : <span style={carteiraDetalhe}>—</span>)
    }
  ];

  const tituloSemPedido = (n: NotaSemPedido) => `Nota ${n.nota} da emenda ${n.emendaAno ? `${n.emendaAno} · ` : ''}${numeroDaEmendaEmTexto(n.emenda)} sem pedido`;
  const colunasSemPedido: Column<NotaSemPedido>[] = [
    {
      key: 'emenda',
      header: 'Emenda',
      priority: 'primary',
      minWidth: '220px',
      render: (n) => (
        <>
          <div style={{ fontWeight: 700 }}>
            {n.emendaAno ? `${n.emendaAno} · ` : ''}
            {numeroDaEmendaEmTexto(n.emenda)}
          </div>
          <div style={{ ...carteiraSubtitle, marginTop: '0.15rem' }}>{n.planoInterno ?? 'sem plano interno'}</div>
        </>
      )
    },
    {
      key: 'nota',
      header: 'Nota',
      nowrap: true,
      render: (n) => (
        <>
          <div style={carteiraNumero}>{n.nota}</div>
          <div style={carteiraDetalhe}>{n.dataEmissao ? dataBR(n.dataEmissao) : ''}{n.credorNome ? ` · ${curto(n.credorNome, 32)}` : ''}</div>
        </>
      )
    },
    { key: 'valor', header: 'Empenhado', align: 'right', nowrap: true, sortValue: (n) => n.valorEmpenhado, sortFirstDir: 'desc', render: (n) => <span style={{ ...carteiraValor, ...carteiraNumero }}>{formatCurrency(n.valorEmpenhado)}</span> },
    {
      key: 'autores',
      header: 'Mesmo autor',
      minWidth: '200px',
      render: (n) =>
        n.autoresDoCodigo.length ? (
          <>
            <div style={carteiraValor}>{n.autoresDoCodigo.join(', ')}</div>
            <div style={carteiraDetalhe}>confira o nº da emenda no pedido</div>
          </>
        ) : (
          <span style={carteiraDetalhe}>nenhum</span>
        )
    }
  ];

  const valorSemPedido = semPedido.reduce((t, n) => t + n.valorEmpenhado, 0);

  return (
    <PageContainer style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <PageHeader
        title={role === 'gestor_emendas' ? 'Início' : 'Emendas'}
        subtitle="Pedidos dos parlamentares e saldo da CAEP que pedem atenção."
        hint={`Os avisos são os mesmos da lista de Pedidos, do mais urgente ao menos urgente. Os prazos de indicação (${avisoIndicacaoDias()} e ${corteIndicacaoDias()} dias antes do fim da ata) ficam em Ajustes › Regras de Alertas.`}
        icon={<LayoutDashboard size={26} color="var(--primary)" aria-hidden="true" />}
        actions={<HeaderRefreshAction onRefresh={recarregar} isRefreshing={isFetching} lastUpdated={dataUpdatedAt || null} dataTestId="emendas-inicio-atualizar" tooltipTitle="Recarregar pedidos, notas e saldo" />}
      />

      <PainelCartoes testId="emendas-inicio-cartoes">
        <PainelCartao
          rotulo="Pedem ação já"
          icone={<AlertTriangle size={16} />}
          tom="danger"
          valor={valor(graves)}
          unidade={graves === 1 ? 'pedido' : 'pedidos'}
          linhas={linhasGraves}
          onClick={() => navigate('/emendas/pedidos?aviso=grave')}
          testId="emendas-inicio-cartao-graves"
        >
          {!carregando && linhasGraves.length === 0 && <span style={carteiraDetalhe}>Nenhum aviso vermelho hoje.</span>}
        </PainelCartao>
        <PainelCartao
          rotulo="Antes do empenho"
          icone={<ClipboardList size={16} />}
          tom="primary"
          valor={valor(r.antesDoEmpenho)}
          unidade={r.antesDoEmpenho === 1 ? 'pedido' : 'pedidos'}
          linhas={linhasAntes}
          onClick={() => navigate('/emendas/pedidos')}
          testId="emendas-inicio-cartao-antes"
        />
        <PainelCartao
          rotulo="Empenhados"
          icone={<Check size={16} />}
          tom="success"
          valor={valor(r.empenhados)}
          unidade={r.empenhados === 1 ? 'pedido' : 'pedidos'}
          linhas={[
            { rotulo: 'Itens com nota de empenho', valor: `${formatNumber(r.linhasComNota)} de ${formatNumber(r.linhasEmpenhadas)}` },
            { rotulo: 'Em contratação', valor: formatNumber(r.porEtapa.CONTRATACAO ?? 0) }
          ]}
          onClick={() => navigate(`/emendas/pedidos?etapa=${r.porEtapa.EMPENHADO ? 'EMPENHADO' : 'CONTRATACAO'}`)}
          testId="emendas-inicio-cartao-empenhados"
        />
        <PainelCartao
          rotulo="Livre para indicar"
          icone={<Boxes size={16} />}
          tom="amber"
          valor={valor(r.livre)}
          unidade="un."
          linhas={[
            { rotulo: `Alocado à CAEP em ${plural(r.itensVigentes, 'item', 'itens')}`, valor: formatNumber(r.alocado) },
            { rotulo: 'Reservado a parlamentares', valor: formatNumber(r.reservado) }
          ]}
          onClick={() => navigate('/emendas/itens')}
          testId="emendas-inicio-cartao-livre"
        >
          <ProgressBar value={Math.min(r.reservado, r.alocado)} max={r.alocado} showPercent={false} height="4px" colorScheme="primary" testId="emendas-inicio-barra-reservado" />
        </PainelCartao>
      </PainelCartoes>

      <PainelBotoesGavetas
        botoes={[
          {
            id: 'emendasSemPedido',
            resumo: carregandoEmendas
              ? undefined
              : contaSemPedido.total === 0
                ? 'em dia'
                : `${plural(contaSemPedido.total, 'emenda', 'emendas')}${contaSemPedido.urgentes ? ` · ${formatNumber(contaSemPedido.urgentes)} ${contaSemPedido.urgentes === 1 ? 'urgente' : 'urgentes'}` : ''}`,
            atencao: contaSemPedido.total > 0
          },
          {
            id: 'saldoLivre',
            resumo: carregando
              ? undefined
              : r.livrePertoDoFim.length === 0
                ? 'em dia'
                : `${plural(r.livrePertoDoFim.length, 'item', 'itens')}${passaramDoCorte ? ` · ${formatNumber(passaramDoCorte)} fora do prazo` : ''}`,
            atencao: r.livrePertoDoFim.length > 0
          },
          {
            id: 'empenhoAConferir',
            resumo: consultaEmpenho.isLoading ? undefined : aConferir.length === 0 ? 'em dia' : plural(aConferir.length, 'emenda', 'emendas'),
            atencao: false
          },
          {
            id: 'notasSemPedido',
            resumo: carregandoSemPedido ? undefined : semPedido.length === 0 ? 'em dia' : `${plural(semPedido.length, 'nota', 'notas')} · ${formatCurrencyCompact(valorSemPedido)}`,
            atencao: semPedido.length > 0
          },
          {
            id: 'sobraEmenda',
            resumo: carregando ? undefined : sobras.length === 0 ? 'nenhuma' : `${plural(sobras.length, 'emenda', 'emendas')} · ${formatCurrencyCompact(valorDasSobras)}`,
            atencao: sobras.length > 0
          },
          {
            id: 'semNomeCurto',
            resumo: carregando ? undefined : r.semNomeCurto.length === 0 ? 'todos com nome' : `${plural(r.semNomeCurto.length, 'item', 'itens')} sem nome`,
            atencao: r.semNomeCurto.length > 0
          }
        ]}
        aberta={gavetaAberta}
        onToggle={alternarGaveta}
      />
      {gavetaAberta === 'emendasSemPedido' && (
        <PainelGaveta
          id="emendasSemPedido"
          subtitulo="Clique na linha para ver os contatos da emenda."
          hint={`Emendas que a CAEP viu no SIOP e que ainda não viraram pedido. Avisam desde o dia do registro e ficam urgentes com ${diasSemContatoParaUrgente()} dias sem contato registrado com a assessoria do parlamentar ou com a ASPAR dos órgãos (Ajustes › Regras de Alertas).`}
          onFechar={fecharGaveta}
        >
          {emendasSemPedido.length === 0 ? (
            <EmptyState title={carregandoEmendas ? 'Carregando…' : 'Nenhuma emenda sem pedido.'} testId="emendas-inicio-sem-pedido-vazio" />
          ) : (
            <DataTable<EmendaNaLista>
              testId="emendas-inicio-sem-pedido"
              className="data-table-container--flush"
              data={emendasSemPedido}
              keyExtractor={(l) => l.chave}
              columns={colunasEmendasSemPedido}
              rowOpen={() => () => navigate('/emendas/pedidos?ver=emenda&situacao=sem')}
            />
          )}
        </PainelGaveta>
      )}
      {gavetaAberta === 'saldoLivre' && (
        <PainelGaveta
          id="saldoLivre"
          subtitulo="Clique na linha para abrir o item."
          hint={`Saldo da CAEP ainda sem parlamentar em atas que acabam em até ${avisoIndicacaoDias()} dias. Depois do prazo de indicação (${corteIndicacaoDias()} dias antes do fim da ata) não dá mais para reservar; o gestor de saldo pode remanejar.`}
          onFechar={fecharGaveta}
        >
          {r.livrePertoDoFim.length === 0 ? (
            <EmptyState title={carregando ? 'Carregando…' : 'Nenhum item com saldo a vencer.'} testId="emendas-inicio-livre-vazio" />
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
      {gavetaAberta === 'sobraEmenda' && (
        <PainelGaveta
          id="sobraEmenda"
          subtitulo="Clique na linha para abrir a emenda em Pedidos › Por autor."
          hint="Emendas do ano com sobra que compra pelo menos o item mais barato que a CAEP ainda oferece: valor no SIOP menos o empenhado pela SENASP (notas da emenda no Portal da Transparência, ou as ligadas no sistema) e o que está em andamento. O que não for empenhado até o fim do ano perde o crédito."
          onFechar={fecharGaveta}
        >
          {sobras.length === 0 ? (
            <EmptyState title={carregando ? 'Carregando…' : 'Nenhuma emenda do ano com sobra para novo pedido.'} testId="emendas-inicio-sobra-vazio" />
          ) : (
            <DataTable<SobraDaEmenda>
              testId="emendas-inicio-sobra"
              className="data-table-container--flush"
              data={sobras}
              keyExtractor={(e) => e.codigo}
              columns={colunasSobra}
              rowOpen={(e) => () => navigate(`/emendas/pedidos?ver=autor&emenda=${e.codigo}`)}
            />
          )}
        </PainelGaveta>
      )}
      {gavetaAberta === 'semNomeCurto' && (
        <PainelGaveta
          id="semNomeCurto"
          subtitulo={podeGerir ? 'Clique no lápis para dar o nome.' : 'Clique na linha para abrir o item.'}
          hint="Item alocado à CAEP em ata vigente ainda sem o nome na ata assinada. Sem ele, o quadro do parlamentar mostra o começo da descrição do catálogo."
          onFechar={fecharGaveta}
        >
          {r.semNomeCurto.length === 0 ? (
            <EmptyState title={carregando ? 'Carregando…' : 'Todos os itens das atas vigentes já têm o nome da ata assinada.'} testId="emendas-inicio-sem-nome-vazio" />
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
                  ? (i) => <ActionButton action="editar" iconOnly label={`Nome na ata assinada e GND de ${nomeDoItem(i, i.itemKey)}`} onClick={() => setEditando(i)} data-testid={`emendas-inicio-nome-${i.itemKey}`} />
                  : undefined
              }
            />
          )}
        </PainelGaveta>
      )}
      {gavetaAberta === 'empenhoAConferir' && (
        <PainelGaveta
          id="empenhoAConferir"
          subtitulo="Clique na linha para abrir o pedido."
          hint="Pedidos empenhados cuja nota citada no despacho do SEI ainda não está no sistema, não foi lida no Portal da Transparência ou foi empenhada em reais. Não conta nos avisos; a lista encolhe sozinha quando as notas chegam."
          onFechar={fecharGaveta}
        >
          {aConferir.length === 0 ? (
            <EmptyState title={consultaEmpenho.isLoading ? 'Carregando…' : 'Nenhuma emenda esperando nota.'} testId="emendas-inicio-a-conferir-vazio" />
          ) : (
            <DataTable<EmendaAConferir>
              testId="emendas-inicio-a-conferir"
              className="data-table-container--flush"
              data={aConferir}
              keyExtractor={(e) => e.emenda}
              columns={colunasAConferir}
              rowOpen={(e) => () => navigate(`/emendas/pedidos?pedido=${e.pedidoIds[0]}`)}
            />
          )}
        </PainelGaveta>
      )}
      {gavetaAberta === 'notasSemPedido' && (
        <PainelGaveta
          id="notasSemPedido"
          subtitulo="Confira o nº da emenda no pedido ou marque como resolvido."
          hint="Notas de empenho da UG 200330 do ano com o número de uma emenda no plano interno que nenhum pedido tem: emenda autorizada fora do sistema ou número trocado num pedido. Se a emenda não é da CAEP, marque como resolvido."
          onFechar={fecharGaveta}
        >
          {semPedido.length === 0 ? (
            <EmptyState title={carregandoSemPedido ? 'Carregando…' : 'Toda nota de emenda do ano tem pedido no sistema.'} testId="emendas-inicio-sem-pedido-vazio" />
          ) : (
            <DataTable<NotaSemPedido>
              testId="emendas-inicio-sem-pedido"
              className="data-table-container--flush"
              data={semPedido}
              keyExtractor={(n) => `${n.ug}-${n.nota}`}
              columns={colunasSemPedido}
              rowOpen={(n) => (n.pedidosDoCodigo[0] ? () => navigate(`/emendas/pedidos?pedido=${n.pedidosDoCodigo[0]}`) : undefined)}
              rowActions={
                podeGerir
                  ? (n) => (
                      <BotaoResolvido
                        onClick={() => abrirResolvido({ tipo: 'AVISO', chave: chaveNotaSemPedido(n), titulo: tituloSemPedido(n), contexto: n.planoInterno ?? undefined })}
                        testId={`emendas-inicio-sem-pedido-resolver-${n.nota}`}
                      />
                    )
                  : undefined
              }
            />
          )}
          <AvisosResolvidosLista
            itens={semPedidoResolvidas.map((n) => ({ chave: chaveNotaSemPedido(n), titulo: tituloSemPedido(n), contexto: n.planoInterno ?? undefined }))}
            porChave={resolvidos}
            podeReexibir={podeGerir}
            onReexibir={(chave) => reexibir.mutate({ chave })}
            reexibindo={reexibir.isPending}
            testId="emendas-inicio-sem-pedido-resolvidos"
          />
          {dialogResolvido}
        </PainelGaveta>
      )}
      {editando && <DadosItemModal item={editando} onClose={() => setEditando(null)} />}

      <SectionHeader
        title="Pendências dos pedidos"
        subtitle="Os mesmos avisos da lista de Pedidos."
        className="section-header--flush"
        actions={<ActionButton action="abrir" size="sm" label="Ver em Pedidos" onClick={abrirPedidos} data-testid="emendas-inicio-ver-pedidos" />}
      />
      <CarteiraSegmentTabs<Segmento>
        testIdPrefix="emendas-inicio-aba"
        ariaLabel="Gravidade do aviso"
        active={segmento}
        onSelect={(s) => {
          setSegmento(s);
          setFiltroAviso('');
        }}
        segments={[
          { id: 'graves', label: 'Urgentes', count: graves, dot: 'var(--color-danger)', title: 'Avisos vermelhos: pedem ação já' },
          { id: 'atencao', label: 'Atenção', count: atencao, dot: 'var(--color-warning-solid)', title: 'Avisos amarelos' },
          { id: 'todas', label: 'Todas', count: r.pedidosComAviso.length }
        ]}
      />
      <CarteiraFilterBar
        busca={busca}
        searchPlaceholder="Buscar por parlamentar, item ou ata..."
        onChangeBusca={setBusca}
        hasActiveFilters={filtrosAtivos}
        onResetFilters={() => {
          setBusca('');
          setFiltroAviso('');
        }}
        counter={carteiraCounter(lista.length, doSegmento.length, filtrosAtivos, 'pedido', 'pedidos')}
        testIdPrefix="emendas-inicio"
      >
        <CarteiraFilterButton label="Aviso" value={filtroAviso} emptyValue="" options={opcoesDeAviso} onChange={(v) => setFiltroAviso(v as TipoAviso | '')} testId="emendas-inicio-filtro-aviso" />
      </CarteiraFilterBar>

      <AdminListShell
        testId="emendas-inicio-lista"
        isLoading={carregando}
        isError={isError}
        errorTitle="Não foi possível carregar os pedidos"
        errorMessage={(error as Error | null)?.message || 'Falha ao consultar os pedidos.'}
        onRetry={() => refetch()}
        isEmpty={!carregando && lista.length === 0}
        emptyTitle={r.pedidosComAviso.length === 0 ? 'Nenhum pedido com aviso.' : 'Nenhum pedido com este aviso.'}
        emptyDescription={r.pedidosComAviso.length === 0 ? 'Quando um pedido precisar de atenção, ele aparece aqui.' : 'Ajuste a busca ou escolha outro aviso.'}
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
