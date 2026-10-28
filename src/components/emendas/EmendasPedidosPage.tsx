import React, { useCallback, useMemo, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { ClipboardList } from 'lucide-react';
import { PageContainer } from '../../design-system/components/PageContainer';
import { PageHeader } from '../../design-system/components/PageHeader';
import { HeaderRefreshAction } from '../../design-system/components/HeaderRefreshAction';
import { DataTable, type Column } from '../../design-system/components/DataTable';
import { StatusBadge, type StatusBadgeVariant } from '../../design-system/components/StatusBadge';
import { ActionButton } from '../../design-system/components/ActionButton';
import { AppButton } from '../../design-system/components/AppButton';
import { NoticeBar } from '../../design-system/components/NoticeBar';
import { CarteiraFilterBar, carteiraCounter } from '../carteira/CarteiraFilterBar';
import { CarteiraFilterButton } from '../carteira/CarteiraFilterButton';
import { CarteiraSegmentTabs } from '../carteira/CarteiraSegmentTabs';
import { CarteiraPagination } from '../carteira/CarteiraPagination';
import { useCarteiraPagination } from '../carteira/useCarteiraPagination';
import { carteiraDetalhe, carteiraIdentificacao, carteiraNumero, carteiraValor } from '../carteira/carteiraStyles';
import { useCarteiraSort, type CarteiraSortColumn } from '../carteira/useCarteiraSort';
import { AdminListShell } from '../admin/shared/AdminListShell';
import {
  hojeEmBrasilia,
  useAutoresEmendas,
  useBeneficiariosEmendas,
  useItensCaep,
  useKitsEmendas,
  usePedidosEmendas,
  usePodeGerirEmendas,
  useNotasDasLinhas,
  useDiferencasDeEmpenho,
  useCredorDiferente,
  useEmendasSiop,
  useContatosDasEmendas,
  useMapaGruposBeneficiarios
} from '../../hooks/useEmendas';
import { contarPorGti, passaFiltroGti, pctDoGti } from '../../config/gruposGti';
import { GRUPOS_CAPTACAO, fatiasDaCaptacao, lerFiltroCaptacao, lerModoCaptacao } from '../../config/captacaoEmendas';
import { CelulaCaptacao, FiltroCaptacao } from './CaptacaoDoPedido';
import { useNavigateWithOrigin } from '../../hooks/useDetailOrigin';
import { contaEmendasSemPedido, diasSemContatoParaUrgente, emendasNaLista } from '../../utils/emendasSemPedido';
import { formatCurrency } from '../../utils/format';
import { avisoIndicacaoDias, corteIndicacaoDias } from '../../utils/emendasKits';
import { casaBusca, textoDeBuscaDoBeneficiario } from '../../utils/emendasBeneficiarios';
import {
  avisoGrave,
  AUTOR_A_DEFINIR,
  AUTOR_A_DEFINIR_CHAVE,
  avisosDoPedido,
  ETAPAS,
  FASES_PEDIDO,
  faseDaEtapa,
  type FasePedido,
  contratosDoPedido,
  linhasAtivas,
  linhasDaLista,
  orgaoDoPedido,
  ORDEM_ETAPA,
  reservadoPorItem,
  resumoDasLinhas,
  ROTULO_ETAPA,
  seiDaEtapa,
  ultimoContatoPorAutor,
  valorDoPedidoNaEtapa,
  ROTULO_AVISO,
  TIPOS_AVISO,
  type AvisoPedido
} from '../../utils/emendasPedidos';
import { faltaAnoDaEmenda, numeroDoPedido, rotaDoPedido } from '../../utils/emendasNomeDoPedido';
import { rotuloBeneficiario, type AutorEmenda, type EtapaPedido, type NotaDaLinha, type PedidoEmenda } from '../../services/emendasService';
import { AutorDoPedido, LARGURA_AUTOR, ValorDoPedido } from './emendasPartes';
import { usePrecosParaEmenda } from '../../hooks/useEmendasQuadro';
import { PedidoModal } from './PedidoModal';
import { AnoDaEmenda } from './AnoDaEmenda';
import { ANO_TODOS, contagemPorAno, lerAnoDaUrl, pedidoNoAno } from '../../utils/emendasAno';

const SEM_NOTAS = new Map<string, NotaDaLinha>();

type Segmento = 'todos' | FasePedido | 'CANCELADO';
/** Filtro de etapa dentro da fase; na Contratação separa quem aguarda o contrato de quem já está contratado. */
type FiltroEtapa = '' | Exclude<EtapaPedido, 'CANCELADO' | 'CONTRATACAO'> | 'AGUARDANDO_CONTRATO' | 'CONTRATADO';
type Linha = PedidoEmenda & { valor: number; fonteDoValor: 'EMENDA' | 'PREVISTO'; avisos: AvisoPedido[]; captacao: ReturnType<typeof fatiasDaCaptacao> };

const POR_PAGINA = 25;
/** Filtro de aviso da lista: um tipo, 'com' (qualquer aviso) ou 'grave' (só os vermelhos, como no cartão do Início). */
const temAviso = (l: { avisos: AvisoPedido[] }, filtro: string) =>
  filtro === 'com' ? l.avisos.length > 0 : filtro === 'grave' ? l.avisos.some(avisoGrave) : l.avisos.some((a) => a.tipo === filtro);
const chaveDaLinha = (p: { id: string }) => p.id;
const VARIANTE_ETAPA: Record<EtapaPedido, StatusBadgeVariant> = {
  RESERVADO: 'info',
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

/**
 * Pedidos dos parlamentares (migration 157): a reserva já ocupa o saldo da CAEP; o pedido segue até o empenho e então
 * a CAEP só acompanha. Cancelar devolve o saldo.
 */
export const EmendasPedidosPage: React.FC = () => {
  const { data: pedidos = [], isLoading, isFetching, isError, error, refetch, dataUpdatedAt } = usePedidosEmendas();
  const { data: notas = SEM_NOTAS } = useNotasDasLinhas();
  const { diferencas } = useDiferencasDeEmpenho();
  const { porPedido: credorPendente } = useCredorDiferente();
  const { data: itensLista = [], isLoading: carregandoItens } = useItensCaep();
  const { data: autores = [] } = useAutoresEmendas();
  const { data: beneficiariosLista = [] } = useBeneficiariosEmendas();
  const { data: kits = [] } = useKitsEmendas();
  const podeGerir = usePodeGerirEmendas();
  const hoje = hojeEmBrasilia();
  // Vindo do Início: ?aviso= (tipo, 'com' ou 'grave') e ?etapa=. O pedido abre no Pedido 360.
  const [searchParams, setSearchParams] = useSearchParams();
  // ?etapa= abre a aba da fase com o filtro daquela etapa (a etapa de contratação abre a fase inteira).
  const etapaDaUrl = searchParams.get('etapa');
  const etapaValida = etapaDaUrl && etapaDaUrl in ORDEM_ETAPA ? (etapaDaUrl as EtapaPedido) : null;
  const [segmento, setSegmentoBruto] = useState<Segmento>(() => (etapaValida === 'CANCELADO' ? 'CANCELADO' : etapaValida ? faseDaEtapa(etapaValida) ?? 'todos' : 'todos'));
  const [filtroEtapa, setFiltroEtapa] = useState<FiltroEtapa>(() =>
    etapaValida && etapaValida !== 'CANCELADO' && etapaValida !== 'CONTRATACAO' ? etapaValida : ''
  );
  const setSegmento = (s: Segmento) => {
    setSegmentoBruto(s);
    setFiltroEtapa('');
  };
  const [filtroAviso, setFiltroAviso] = useState(() => searchParams.get('aviso') ?? '');
  // Endereço antigo (?pedido=<id>&item=): o pedido abre no Pedido 360 (links colados em processos não quebram).
  const pedidoDoEnderecoAntigo = searchParams.get('pedido');
  const itemDoEnderecoAntigo = searchParams.get('item');
  const [busca, setBusca] = useState('');
  const navegar = useNavigateWithOrigin();
  // "Por parlamentar" e "Por emenda" viraram as abas Parlamentares e Emendas (protótipo aprovado em 27/10/2026):
  // ?ver=autor e ?ver=emenda vão para lá. O filtro de parlamentar fica no endereço (?autor=).
  const verAntigo = searchParams.get('ver');
  const filtroAutor = searchParams.get('autor') ?? '';
  // Ano da emenda (28/10/2026): abre no ano corrente. Quem chega por um aviso, uma etapa ou um parlamentar (Início,
  // número do menu) abre em todos os anos, para a lista bater com o número de onde veio.
  const anoCorrente = Number(hoje.slice(0, 4));
  const anoPadrao = searchParams.has('aviso') || searchParams.has('etapa') || searchParams.has('autor') ? ANO_TODOS : String(anoCorrente);
  const filtroAno = searchParams.get('ano') ? lerAnoDaUrl(searchParams.get('ano'), anoCorrente, true) : anoPadrao;
  const mudarUrl = (mudar: (p: URLSearchParams) => void) =>
    setSearchParams((atual) => {
      const prox = new URLSearchParams(atual);
      mudar(prox);
      return prox;
    });
  const [editando, setEditando] = useState<PedidoEmenda | 'novo' | null>(null);
  // Emendas vistas no SIOP (migration 205): registrar ou alterar, e o pedido novo criado a partir de uma delas.
  const { data: emendasSiop = [] } = useEmendasSiop();
  // Faixa acima do trilho: as emendas sem pedido não são pedidos (não entram nas fases), mas precisam ser vistas daqui.
  const { data: contatosDasEmendas = [] } = useContatosDasEmendas();
  const semPedido = useMemo(() => contaEmendasSemPedido(emendasNaLista(emendasSiop, pedidos, contatosDasEmendas, hoje)), [emendasSiop, pedidos, contatosDasEmendas, hoje]);

  const itens = useMemo(() => new Map(itensLista.map((i) => [i.itemKey, i])), [itensLista]);
  const autorPorId = useMemo(() => new Map<string, AutorEmenda>(autores.map((a) => [a.id, a])), [autores]);
  const beneficiarios = useMemo(() => new Map(beneficiariosLista.map((b) => [b.id, b])), [beneficiariosLista]);
  const nomeDoBeneficiario = (id: string) => {
    const b = beneficiarios.get(id);
    return b ? rotuloBeneficiario(b) : undefined;
  };
  const { precos } = usePrecosParaEmenda();
  const gruposDosBeneficiarios = useMapaGruposBeneficiarios();
  // Captação principal (migration 218): fatia de cada grupo no valor das linhas; ?captacao= e ?captacaoConta= nas três visões.
  const filtroCaptacao = lerFiltroCaptacao(searchParams.get('captacao'));
  const modoCaptacao = lerModoCaptacao(searchParams.get('captacaoConta'));
  const linhas: Linha[] = useMemo(
    () =>
      pedidos.filter((p) => pedidoNoAno(p, filtroAno)).map((p) => {
        const v = valorDoPedidoNaEtapa(p, itens, precos);
        return {
          ...p,
          valor: v.valor,
          fonteDoValor: v.fonte,
          avisos: avisosDoPedido(p, itens, hoje, notas, diferencas.get(p.id), credorPendente.get(p.id)),
          captacao: fatiasDaCaptacao([p], gruposDosBeneficiarios, itens, precos)
        };
      }),
    [pedidos, filtroAno, itens, hoje, notas, precos, diferencas, credorPendente, gruposDosBeneficiarios]
  );
  // Contagem do botão de ano: os pedidos não cancelados de cada ano (o "Todos" do trilho).
  const anosDoSeletor = useMemo(() => contagemPorAno(pedidos, anoCorrente), [pedidos, anoCorrente]);

  const contagem = useMemo(() => {
    const c: Record<string, number> = { todos: 0, CANCELADO: 0 };
    for (const l of linhas) {
      const fase = faseDaEtapa(l.etapa);
      if (fase) c[fase] = (c[fase] ?? 0) + 1;
      else c.CANCELADO++;
      if (l.etapa !== 'CANCELADO') c.todos++;
    }
    return c;
  }, [linhas]);

  const doSegmento = useMemo(
    () => linhas.filter((l) => (segmento === 'todos' ? l.etapa !== 'CANCELADO' : segmento === 'CANCELADO' ? l.etapa === 'CANCELADO' : faseDaEtapa(l.etapa) === segmento)),
    [linhas, segmento]
  );
  const etapaDoFiltro = useCallback(
    (l: Linha): FiltroEtapa => (l.etapa === 'CONTRATACAO' ? (contratosDoPedido(l, notas).contratado ? 'CONTRATADO' : 'AGUARDANDO_CONTRATO') : (l.etapa as FiltroEtapa)),
    [notas]
  );
  // Opções do filtro de etapa: as etapas da fase da aba, com a contagem.
  const opcoesDeEtapa = useMemo(() => {
    const fase = FASES_PEDIDO.find((f) => f.id === segmento);
    if (!fase) return [];
    const valores: { value: FiltroEtapa; label: string }[] =
      fase.id === 'CONTRATACAO'
        ? [
            { value: 'AGUARDANDO_CONTRATO', label: 'Aguardando contrato' },
            { value: 'CONTRATADO', label: 'Contratado' }
          ]
        : fase.etapas.map((e) => ({ value: e as FiltroEtapa, label: ROTULO_ETAPA[e] }));
    return valores.map((v) => ({ ...v, count: doSegmento.filter((l) => etapaDoFiltro(l) === v.value).length }));
  }, [segmento, doSegmento, etapaDoFiltro]);
  const filtradas = useMemo(() => {
    const termo = busca.trim();
    const textoDoBeneficiario = (id: string | null) => {
      const b = id ? beneficiarios.get(id) : undefined;
      return b ? textoDeBuscaDoBeneficiario(b) : '';
    };
    return doSegmento
      .filter((l) => !filtroEtapa || etapaDoFiltro(l) === filtroEtapa)
      .filter((l) => !filtroAutor || (filtroAutor === AUTOR_A_DEFINIR_CHAVE ? !l.autorId : l.autorId === filtroAutor))
      .filter((l) => !filtroAviso || temAviso(l, filtroAviso))
      .filter((l) => passaFiltroGti(l.captacao, filtroCaptacao, modoCaptacao))
      .filter((l) => {
        if (!termo) return true;
        const a = l.autorId ? autorPorId.get(l.autorId) : undefined;
        const textoLinhas = linhasAtivas(l)
          .map((x) => {
            const it = x.tipo === 'KIT' ? undefined : itens.get(x.itemKey ?? '');
            return `${(x.tipo === 'KIT' ? x.kitNome : it?.descricao) ?? ''} ${it?.nomeCurto ?? ''} ${it?.numeroAta ?? ''} ${textoDoBeneficiario(x.beneficiarioId)} ${x.beneficiarioNome ?? ''} ${x.contratoNumero ?? ''}`;
          })
          .join(' ');
        // O nome do contato da assessoria só entra na busca de quem o vê.
        return casaBusca(`${a?.nome ?? AUTOR_A_DEFINIR} ${podeGerir ? l.contatoNome ?? '' : ''} ${a?.uf ?? ''} ${l.oficioProcessoSei ?? ''} ${l.siopEmenda ?? ''} ${ETAPAS.flatMap((e) => seiDaEtapa(l, e.etapa)).join(' ')} ${textoLinhas}`, termo);
      });
  }, [doSegmento, filtroEtapa, etapaDoFiltro, filtroAutor, filtroAviso, filtroCaptacao, modoCaptacao, busca, autorPorId, itens, beneficiarios, podeGerir]);

  // Como nas carteiras: ordena pelo cabeçalho (?ordem=) antes de paginar.
  const ordem = useMemo<Record<string, CarteiraSortColumn<Linha>>>(
    () => ({
      // Pelo ano e o número no parlamentar; as reservas, sem número, vão para o fim.
      pedido: { value: (l) => (l.numeroNoAno && l.anoDoNumero ? l.anoDoNumero * 10000 + l.numeroNoAno : null), firstDir: 'desc' },
      autor: { value: (l) => (l.autorId ? autorPorId.get(l.autorId)?.nome ?? l.autorId : null) },
      valor: { value: (l) => l.valor, firstDir: 'desc' },
      // Com o filtro de captação: a fatia do grupo escolhido; sem ele, a fatia do grupo principal.
      captacao: { value: (l) => (filtroCaptacao === 'TODOS' ? l.captacao.principal?.pct ?? null : pctDoGti(l.captacao, filtroCaptacao)), firstDir: 'desc' },
      etapa: { value: (l) => ORDEM_ETAPA[l.etapa] },
      aviso: { value: (l) => (l.avisos.length ? l.avisos.length + (l.avisos.some(avisoGrave) ? 100 : 0) : null), firstDir: 'desc' }
    }),
    [autorPorId, filtroCaptacao]
  );
  const { sorted, sortKey, sortDir, toggle } = useCarteiraSort(filtradas, ordem);
  const { currentPage, setPage, pageItems } = useCarteiraPagination(sorted, chaveDaLinha, POR_PAGINA);
  const filtrosAtivos = Boolean(busca.trim() || filtroEtapa || filtroAviso || filtroAutor || filtroCaptacao !== 'TODOS');
  const contagemCaptacao = useMemo(() => contarPorGti(doSegmento.map((l) => l.captacao), modoCaptacao, GRUPOS_CAPTACAO), [doSegmento, modoCaptacao]);
  // Autores com pedido na etapa escolhida, os que têm mais pedidos primeiro; "Parlamentar a definir" no fim.
  const opcoesDeAutor = useMemo(() => {
    const conta = new Map<string, number>();
    for (const l of doSegmento) conta.set(l.autorId ?? AUTOR_A_DEFINIR_CHAVE, (conta.get(l.autorId ?? AUTOR_A_DEFINIR_CHAVE) ?? 0) + 1);
    if (filtroAutor && !conta.has(filtroAutor)) conta.set(filtroAutor, 0);
    return [...conta.entries()]
      .map(([value, count]) => ({ value, count, label: value === AUTOR_A_DEFINIR_CHAVE ? AUTOR_A_DEFINIR : autorPorId.get(value)?.nome ?? value }))
      .sort((a, b) => Number(a.value === AUTOR_A_DEFINIR_CHAVE) - Number(b.value === AUTOR_A_DEFINIR_CHAVE) || a.label.localeCompare(b.label, 'pt-BR'));
  }, [doSegmento, filtroAutor, autorPorId]);
  const contaAviso = (tipo: string) => doSegmento.filter((l) => temAviso(l, tipo)).length;

  const colunas: Column<Linha>[] = [
    {
      // O número do pedido no parlamentar e no ano (migration 217); antes da emenda, a reserva. O sequencial do banco não aparece.
      key: 'pedido',
      header: 'Pedido',
      nowrap: true,
      sortValue: ordem.pedido.value,
      sortFirstDir: 'desc',
      render: (l) => {
        const numero = numeroDoPedido(l);
        if (numero) return <span style={{ ...carteiraIdentificacao, whiteSpace: 'nowrap' }}>{numero}</span>;
        if (faltaAnoDaEmenda(l))
          return (
            <>
              <div style={carteiraValor}>Emenda {l.siopEmenda!.slice(0, 4)} {l.siopEmenda!.slice(4)}</div>
              <div style={{ ...carteiraDetalhe, color: 'var(--color-warning-text)' }}>ano a informar</div>
            </>
          );
        // Só "Reserva": o parlamentar ao lado já diferencia, e a data da reserva fica no Pedido 360 (decisão de 27/10/2026).
        return <div style={carteiraValor}>Reserva</div>;
      }
    },
    {
      key: 'autor',
      header: 'Parlamentar',
      priority: 'primary',
      width: LARGURA_AUTOR,
      minWidth: LARGURA_AUTOR,
      sortValue: ordem.autor.value,
      render: (l) => <AutorDoPedido autor={l.autorId ? autorPorId.get(l.autorId) : undefined} autorId={l.autorId} orgao={orgaoDoPedido(l, nomeDoBeneficiario)} destaque />
    },
    {
      // O que foi pedido e para quem: uma linha por item ("10× Carabina 5,56 mm → PMMG"); a ata fica no Pedido 360 e no aviso (decisão de 28/10/2026).
      key: 'linhas',
      header: 'Itens e beneficiários',
      minWidth: '280px',
      render: (l) => {
        const todas = linhasDaLista(l, itens, beneficiarios);
        const mostradas = todas.slice(0, 2);
        const resto = todas.length - mostradas.length;
        return (
          <>
            {mostradas.map((x) => (
              <div key={x.id} style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem', minWidth: 0, maxWidth: '32rem' }}>
                <span style={{ ...carteiraNumero, fontWeight: 700, color: '#64748b', minWidth: '2.2em', textAlign: 'right' }}>{x.quantidade}×</span>
                <span title={x.nome} style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, flex: '1 1 auto' }}>{x.nome}</span>
                {x.kit && <StatusBadge label="Kit" variant="neutral" size="sm" dot={false} />}
                <span style={{ color: '#64748b' }}>→</span>
                <span title={x.beneficiarioNome ?? undefined} style={{ fontWeight: 600, color: x.beneficiario ? 'var(--color-primary, #0c326f)' : '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '11rem', flex: '0 1 auto' }}>
                  {x.beneficiario ?? 'a definir'}
                </span>
              </div>
            ))}
            {resto > 0 && (
              <div
                style={carteiraDetalhe}
                title={todas.map((x) => `${x.quantidade}× ${x.nome} → ${x.beneficiarioNome ?? 'a definir'}`).join('\n')}
              >
                +{resto} {resto === 1 ? 'linha' : 'linhas'}
              </div>
            )}
          </>
        );
      }
    },
    { key: 'valor', header: 'Valor', align: 'right', nowrap: true, sortValue: ordem.valor.value, sortFirstDir: 'desc', render: (l) => <ValorDoPedido valor={l.valor} fonte={l.fonteDoValor} /> },
    {
      key: 'captacao',
      header: 'Captação principal',
      sortValue: ordem.captacao.value,
      sortFirstDir: 'desc',
      render: (l) => <CelulaCaptacao fatias={l.captacao} testId={`emendas-pedido-captacao-${l.id}`} />
    },
    {
      key: 'etapa',
      header: 'Etapa',
      nowrap: true,
      sortValue: ordem.etapa.value,
      // Sem coluna própria para a reserva (repetia a etapa): o documento que marca a etapa fica embaixo dela.
      render: (l) => {
        // Uma linha só, em texto: a emenda quando já há; antes dela, o processo. O SEI para copiar fica no detalhe.
        const documento = l.siopEmenda ? `Emenda ${l.siopEmenda}` : l.oficioProcessoSei ? `Processo ${l.oficioProcessoSei}` : null;
        return (
          <>
            {etapaDoFiltro(l) === 'CONTRATADO' ? (
              <StatusBadge label="Contratado" variant="success" size="sm" dot={false} />
            ) : (
              <StatusBadge label={ROTULO_ETAPA[l.etapa]} variant={VARIANTE_ETAPA[l.etapa]} size="sm" dot={false} />
            )}
            {documento && <div style={carteiraDetalhe}>{documento}</div>}
            {(() => {
              const r = resumoDasLinhas(l, notas);
              return r.divergem ? <div style={{ ...carteiraDetalhe, whiteSpace: 'normal' }}>{r.texto}</div> : null;
            })()}
          </>
        );
      }
    },
    {
      // Etiqueta curta: o aviso mais grave e "+N"; a frase completa aparece ao parar o mouse e no detalhe da linha.
      key: 'aviso',
      header: 'Aviso',
      nowrap: true,
      sortValue: ordem.aviso.value,
      sortFirstDir: 'desc',
      render: (l) => {
        const [primeiro, ...outros] = l.avisos;
        if (!primeiro) return <span style={carteiraDetalhe}>—</span>;
        return (
          <span title={l.avisos.map((a) => a.texto).join('\n')} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }} data-testid={`emendas-pedido-aviso-${l.id}`}>
            <StatusBadge label={primeiro.curto} variant={avisoGrave(primeiro) ? 'danger' : 'warning'} size="sm" dot={false} />
            {outros.length > 0 && <span style={{ ...carteiraDetalhe, fontWeight: 700 }}>+{outros.length}</span>}
          </span>
        );
      }
    }
  ];

  if (verAntigo === 'autor') return <Navigate to="/emendas/parlamentares" replace />;
  if (verAntigo === 'emenda') return <Navigate to={`/emendas/emendas${searchParams.get('situacao') ? `?situacao=${searchParams.get('situacao')}` : ''}`} replace />;
  // Endereço antigo do pedido: espera a lista e vai para o Pedido 360 (sem o pedido, fica na lista).
  if (pedidoDoEnderecoAntigo && !isLoading) {
    const alvo = pedidos.find((x) => x.id === pedidoDoEnderecoAntigo);
    const destino = alvo ? `${rotaDoPedido(alvo)}${itemDoEnderecoAntigo ? `?item=${encodeURIComponent(itemDoEnderecoAntigo)}` : ''}` : '/emendas/pedidos';
    return <Navigate to={destino} replace />;
  }

  return (
    <PageContainer style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <PageHeader
        title="Pedidos"
        subtitle="Reservas e ofícios dos parlamentares, da reserva ao empenho." 
        hint={`A reserva já ocupa o saldo da CAEP e cancelar devolve o saldo. O contrato precisa ser assinado antes do fim da ata: a ${avisoIndicacaoDias()} dias do fim o pedido avisa e a menos de ${corteIndicacaoDias()} dias não entra reserva nem ofício com itens da ata (prazos em Ajustes › Regras de Alertas).`}
        icon={<ClipboardList size={26} color="var(--primary)" aria-hidden="true" />}
        actions={
          <>
            <AnoDaEmenda
              valor={filtroAno}
              anoCorrente={anoCorrente}
              anos={anosDoSeletor.anos}
              todos={anosDoSeletor.todos}
              semAno={anosDoSeletor.semAno}
              onChange={(v) =>
                mudarUrl((p) => {
                  if (v === anoPadrao) p.delete('ano');
                  else p.set('ano', v);
                })
              }
              testId="emendas-pedidos-ano"
            />
            {podeGerir && <ActionButton action="novo" label="Nova reserva" onClick={() => setEditando('novo')} disabled={carregandoItens} data-testid="emendas-pedidos-novo" />}
            <HeaderRefreshAction onRefresh={() => refetch()} isRefreshing={isFetching} lastUpdated={dataUpdatedAt || null} dataTestId="emendas-pedidos-atualizar" tooltipTitle="Recarregar os pedidos" />
          </>
        }
      />

      {semPedido.total > 0 && (
        <NoticeBar
          tone={podeGerir && semPedido.urgentes > 0 ? 'danger' : 'warning'}
          testId="emendas-pedidos-faixa-sem-pedido"
          action={
            <AppButton variant="outline" size="sm" onClick={() => navegar('/emendas/emendas?situacao=sem&ano=todos')} data-testid="emendas-pedidos-faixa-sem-pedido-ver">
              Ver emendas
            </AppButton>
          }
        >
          <b>
            {semPedido.total === 1 ? '1 emenda indicada no SIOP ainda sem pedido' : `${semPedido.total} emendas indicadas no SIOP ainda sem pedido`}
          </b>
          {/* Os contatos só a CAEP e o coordenador leem: para os outros não dá para saber se está urgente. */}
          {podeGerir && semPedido.urgentes > 0 && ` · ${semPedido.urgentes} sem contato há ${diasSemContatoParaUrgente()} dias ou mais`}
          {semPedido.valor > 0 && ` · ${formatCurrency(semPedido.valor)}`}
        </NoticeBar>
      )}

        <CarteiraSegmentTabs<Segmento>
          testIdPrefix="emendas-pedidos-etapa"
          ariaLabel="Fase dos pedidos"
          active={segmento}
          onSelect={setSegmento}
          segments={[
            ...FASES_PEDIDO.map((f) => ({ id: f.id as Segmento, label: f.nome, count: contagem[f.id] ?? 0 })),
            { id: 'todos', label: 'Todos', count: contagem.todos },
            { id: 'CANCELADO', label: 'Cancelados', count: contagem.CANCELADO ?? 0 }
          ]}
        />

          <CarteiraFilterBar
            busca={busca}
            searchPlaceholder={podeGerir ? 'Buscar por parlamentar, contato, ofício, SEI, emenda ou item...' : 'Buscar por parlamentar, ofício, SEI, emenda ou item...'}
            onChangeBusca={setBusca}
            hasActiveFilters={filtrosAtivos}
            onResetFilters={() => {
              setBusca('');
              setFiltroEtapa('');
              setFiltroAviso('');
              // O ano não é filtro da lista: fica como está.
              const ano = searchParams.get('ano');
              if (searchParams.toString()) setSearchParams(ano ? { ano } : {}, { replace: true });
            }}
            counter={carteiraCounter(filtradas.length, doSegmento.length, filtrosAtivos, 'pedido', 'pedidos')}
            testIdPrefix="emendas-pedidos"
          >
            {opcoesDeEtapa.length > 0 && (
              <CarteiraFilterButton
                label="Etapa"
                value={filtroEtapa}
                emptyValue=""
                options={opcoesDeEtapa}
                onChange={(v) => setFiltroEtapa(v as FiltroEtapa)}
                testId="emendas-pedidos-filtro-etapa"
              />
            )}
            <CarteiraFilterButton
              label="Parlamentar"
              value={filtroAutor}
              emptyValue=""
              options={opcoesDeAutor}
              onChange={(v) =>
                mudarUrl((p) => {
                  if (v) p.set('autor', v);
                  else p.delete('autor');
                })
              }
              testId="emendas-pedidos-filtro-autor"
            />
            <CarteiraFilterButton
              label="Aviso"
              value={filtroAviso}
              emptyValue=""
              options={[
                { value: 'com', label: 'Com algum aviso', count: contaAviso('com') },
                { value: 'grave', label: 'Urgentes (avisos vermelhos)', count: contaAviso('grave') },
                // Um nome por aviso em todas as telas (ROTULO_AVISO), do mais grave ao mais leve.
                ...TIPOS_AVISO.map((t) => ({ value: t, label: ROTULO_AVISO[t], count: contaAviso(t) }))
              ]}
              onChange={setFiltroAviso}
              testId="emendas-pedidos-filtro-aviso"
            />
            <FiltroCaptacao gti={filtroCaptacao} modo={modoCaptacao} counts={contagemCaptacao} mudarUrl={mudarUrl} testIdPrefix="emendas-pedidos" />
          </CarteiraFilterBar>

          <AdminListShell
            testId="emendas-pedidos-lista"
            isLoading={isLoading || carregandoItens}
            isError={isError}
            errorTitle="Não foi possível carregar os pedidos"
            errorMessage={(error as Error | null)?.message || 'Falha ao consultar os pedidos.'}
            onRetry={() => refetch()}
            isEmpty={!isLoading && !carregandoItens && filtradas.length === 0}
            emptyTitle={pedidos.length === 0 ? 'Nenhum pedido ainda.' : 'Nenhum pedido nesta situação.'}
            emptyDescription={pedidos.length === 0 ? (podeGerir ? 'Use "Nova reserva" quando combinar itens ou kits com um parlamentar.' : 'A CAEP registra as reservas dos parlamentares.') : 'Ajuste a busca ou escolha outra etapa.'}
          >
            <DataTable<Linha>
              testId="emendas-pedidos-tabela"
              className="data-table-container--flush emendas-tabela-topo"
              data={pageItems}
              keyExtractor={chaveDaLinha}
              sort={{ key: sortKey, dir: sortDir }}
              onSort={toggle}
              rowStyle={(l) => (l.etapa === 'CANCELADO' ? { opacity: 0.7 } : undefined)}
              columns={colunas}
              rowOpen={(l) => () => navegar(rotaDoPedido(l))}
            />
            <CarteiraPagination page={currentPage} pageSize={POR_PAGINA} total={sorted.length} onChange={setPage} testIdPrefix="emendas-pedidos" />
          </AdminListShell>

      {editando && (
        <PedidoModal
          pedido={editando === 'novo' ? null : editando}
          autores={autores}
          itens={itensLista}
          kits={kits}
          beneficiarios={beneficiariosLista}
          reservadoFora={reservadoPorItem(pedidos, editando === 'novo' ? undefined : editando.id)}
          ultimoContato={ultimoContatoPorAutor(pedidos)}
          hoje={hoje}
          onClose={() => setEditando(null)}
        />
      )}
    </PageContainer>
  );
};
