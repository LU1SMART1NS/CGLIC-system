import React, { useMemo, useState } from 'react';
import { ClipboardList } from 'lucide-react';
import { PageContainer } from '../../design-system/components/PageContainer';
import { PageHeader } from '../../design-system/components/PageHeader';
import { HeaderRefreshAction } from '../../design-system/components/HeaderRefreshAction';
import { DataTable, type Column } from '../../design-system/components/DataTable';
import { StatusBadge, type StatusBadgeVariant } from '../../design-system/components/StatusBadge';
import { ActionButton } from '../../design-system/components/ActionButton';
import { AppButton } from '../../design-system/components/AppButton';
import { CarteiraFilterBar, carteiraCounter } from '../carteira/CarteiraFilterBar';
import { CarteiraFilterButton } from '../carteira/CarteiraFilterButton';
import { CarteiraSegmentTabs } from '../carteira/CarteiraSegmentTabs';
import { CarteiraPagination } from '../carteira/CarteiraPagination';
import { useCarteiraPagination } from '../carteira/useCarteiraPagination';
import { carteiraSubtitle } from '../carteira/carteiraStyles';
import { AdminListShell } from '../admin/shared/AdminListShell';
import {
  hojeEmBrasilia,
  useAutoresEmendas,
  useBeneficiariosEmendas,
  useItensCaep,
  useKitsEmendas,
  usePedidosEmendas,
  usePodeGerirEmendas,
  usePodeVerContratos,
  useNotasDasLinhas
} from '../../hooks/useEmendas';
import { formatCurrency } from '../../utils/format';
import { avisoIndicacaoDias, corteIndicacaoDias, curto, dataBR } from '../../utils/emendasKits';
import {
  ataDaLinha,
  avisoGrave,
  AUTOR_A_DEFINIR,
  avisosDoPedido,
  dataDaEtapa,
  ETAPAS,
  linhasAtivas,
  orgaoDoPedido,
  ORDEM_ETAPA,
  proximaAcao,
  reservadoPorItem,
  ROTULO_ETAPA,
  identificacaoDoPedido,
  ultimoContatoPorAutor,
  valorDaLinha,
  valorDoPedido,
  execucaoDoPedido,
  type AvisoPedido
} from '../../utils/emendasPedidos';
import type { AutorEmenda, BeneficiarioEmenda, EtapaPedido, ItemCaep, NotaDaLinha, PedidoEmenda } from '../../services/emendasService';

const SEM_NOTAS = new Map<string, NotaDaLinha>();
import { AConferirDaLinha, AutorDoPedido, BeneficiarioDaLinha, EmpenhoDaLinha, ExecucaoDoPedidoResumo, LinhaDoPedido } from './emendasPartes';
import { ContatoDoResponsavel } from './ContatoDoResponsavel';
import { PedidoModal } from './PedidoModal';
import { EtapaPedidoModal, type AcaoDaJanela } from './EtapaPedidoModal';

type Segmento = 'todos' | EtapaPedido;
type Linha = PedidoEmenda & { valor: number; avisos: AvisoPedido[] };

const POR_PAGINA = 25;
const chaveDaLinha = (p: { id: string }) => p.id;
const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const VARIANTE_ETAPA: Record<EtapaPedido, StatusBadgeVariant> = {
  RESERVADO: 'info',
  MINUTA: 'info',
  OFICIO: 'info',
  CONFERIDO: 'info',
  AUTORIZADO: 'info',
  EMPENHADO: 'success',
  CANCELADO: 'neutral'
};

/** Linha do tempo das etapas do pedido. */
const EtapasDoPedido: React.FC<{ p: PedidoEmenda }> = ({ p }) => {
  const atual = ORDEM_ETAPA[p.etapa];
  return (
    <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.55rem' }} data-testid={`emendas-pedido-etapas-${p.id}`}>
      {ETAPAS.map((e, i) => {
        const feita = p.etapa !== 'CANCELADO' && i <= atual;
        // Na carga das planilhas a data da reserva é a da carga, não a da conversa com o gabinete.
        const data = p.origem === 'PLANILHA' && e.etapa === 'RESERVADO' ? null : dataDaEtapa(p, e.etapa);
        const proxima = p.etapa !== 'CANCELADO' && i === atual + 1;
        const detalhe =
          e.etapa === 'MINUTA' && p.minutaDocumentoSei
            ? `doc. SEI ${p.minutaDocumentoSei}`
            : e.etapa === 'OFICIO' && (p.oficioNumero || p.oficioProcessoSei)
              ? [p.oficioNumero, p.oficioProcessoSei && `SEI ${p.oficioProcessoSei}`].filter(Boolean).join(' · ')
              : e.etapa === 'CONFERIDO' && p.siopEmenda
                ? `emenda ${p.siopEmenda}${p.siopGnd ? ` · ${p.siopGnd}` : ''}${p.siopValor != null ? ` · ${formatCurrency(p.siopValor)}` : ''}`
                : e.etapa === 'AUTORIZADO' && p.autorizadoDocumentoSei
                  ? `doc. SEI ${p.autorizadoDocumentoSei}`
                  : null;
        return (
          <li key={e.etapa} style={{ display: 'grid', gridTemplateColumns: '20px 1fr', gap: '0.5rem', alignItems: 'start' }}>
            <span
              aria-hidden="true"
              style={{
                width: 20,
                height: 20,
                borderRadius: '50%',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.7rem',
                fontWeight: 800,
                background: feita ? 'var(--primary)' : '#ffffff',
                color: feita ? '#ffffff' : proxima ? 'var(--primary)' : '#94a3b8',
                border: `2px solid ${feita || proxima ? 'var(--primary)' : '#e2e8f0'}`
              }}
            >
              {feita ? '✓' : i + 1}
            </span>
            <div>
              <div style={{ fontWeight: feita || proxima ? 700 : 500, color: feita || proxima ? '#0f172a' : '#94a3b8', fontSize: '0.82rem' }}>{e.rotulo}</div>
              <div style={carteiraSubtitle}>{[feita ? (data ? dataBR(data) : p.origem === 'PLANILHA' ? 'sem data na planilha' : 'não houve') : proxima ? 'próxima etapa' : null, feita ? detalhe : null].filter(Boolean).join(' · ')}</div>
              {e.etapa === 'OFICIO' && p.etapa === 'OFICIO' && p.divergencia && (
                <div style={{ ...carteiraSubtitle, color: 'var(--color-danger, #b11b05)', WebkitLineClamp: 4 }}>Divergência: {p.divergencia}</div>
              )}
            </div>
          </li>
        );
      })}
      {p.etapa === 'CANCELADO' && (
        <li style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--color-danger, #b11b05)' }}>
          Cancelado em {dataBR(p.canceladoEm)}: {p.canceladoMotivo}. A quantidade voltou ao saldo da CAEP.
        </li>
      )}
    </ol>
  );
};

interface DetalheProps {
  p: Linha;
  itens: Map<string, ItemCaep>;
  beneficiarios: Map<string, BeneficiarioEmenda>;
  notas: Map<string, NotaDaLinha>;
  podeGerir: boolean;
  podeVerContratos: boolean;
  hoje: string;
  onAcao: (acao: AcaoDaJanela) => void;
  onAlterar: () => void;
}

const DetalheDoPedido: React.FC<DetalheProps> = ({ p, itens, beneficiarios, notas, podeGerir, podeVerContratos, hoje, onAcao, onAlterar }) => {
  // Reserva para um órgão (migration 163): antes da minuta, a CAEP indica o parlamentar que assumiu.
  const semAutor = !p.autorId;
  const prox = semAutor ? null : proximaAcao(p.etapa);
  const colunas: Column<PedidoEmenda['linhas'][number]>[] = [
    {
      key: 'linha',
      header: 'Item ou kit',
      priority: 'primary',
      width: '42%',
      render: (l) => {
        const ata = ataDaLinha(p, l, itens, hoje);
        return (
          <>
            <LinhaDoPedido linha={l} itens={itens} />
            <AConferirDaLinha linha={l} />
            {ata && (
              <div style={{ marginTop: '0.3rem' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, borderRadius: 4, padding: '0.25rem 0.45rem', display: 'inline-block', color: avisoGrave(ata) ? 'var(--color-danger-text)' : 'var(--color-warning-text)', background: avisoGrave(ata) ? 'var(--color-danger-bg)' : 'var(--color-warning-bg)' }}>
                  {ata.texto}
                </span>
              </div>
            )}
          </>
        );
      }
    },
    {
      key: 'ben',
      header: 'Beneficiário',
      render: (l) => <BeneficiarioDaLinha linha={l} beneficiarios={beneficiarios} />
    },
    { key: 'valor', header: 'Valor', align: 'right', nowrap: true, render: (l) => formatCurrency(valorDaLinha(l, itens)) },
    { key: 'ne', header: 'Empenho e contrato', nowrap: true, render: (l) => <EmpenhoDaLinha linha={l} achada={notas.get(l.id)} podeVerContratos={podeVerContratos} /> }
  ];
  const canceladas = p.linhas.filter((l) => l.cancelada);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.8fr) minmax(240px, 1fr)', gap: '1rem', padding: '0.4rem 0' }} className="emendas-detalhe-pedido" data-testid={`emendas-pedido-detalhe-${p.id}`}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', minWidth: 0 }}>
        {p.avisos
          .filter((a) => a.tipo === 'semOficio' || a.tipo === 'divergencia')
          .map((a) => (
            <div key={a.tipo} style={{ fontSize: '0.8rem', fontWeight: 600, borderRadius: 6, padding: '0.5rem 0.7rem', color: avisoGrave(a) ? 'var(--color-danger-text)' : 'var(--color-warning-text)', background: avisoGrave(a) ? 'var(--color-danger-bg)' : 'var(--color-warning-bg)' }}>
              {a.texto}
            </div>
          ))}
        <DataTable testId={`emendas-pedido-linhas-${p.id}`} data={linhasAtivas(p)} keyExtractor={(l) => l.id} columns={colunas} className="emendas-tabela-topo" />
        {canceladas.length > 0 && (
          <div style={carteiraSubtitle}>
            {canceladas.length} {canceladas.length === 1 ? 'linha tirada' : 'linhas tiradas'} do pedido: {canceladas.map((l) => l.canceladaMotivo).filter(Boolean).join('; ')}
          </div>
        )}
        {p.etapa === 'EMPENHADO' && <ExecucaoDoPedidoResumo execucao={execucaoDoPedido(p, notas)} />}
        {semAutor && (
          <div style={{ fontSize: '0.8rem', color: 'var(--color-warning-text)', background: 'var(--color-warning-bg)', borderRadius: 6, padding: '0.5rem 0.7rem', fontWeight: 600 }}>
            Reserva feita a pedido do órgão, ainda sem parlamentar. Quando um parlamentar ou bancada assumir, use "Indicar o parlamentar" para seguir com a minuta.
          </div>
        )}
        {p.observacao && <div style={carteiraSubtitle}>Observação: {p.observacao}</div>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
        <EtapasDoPedido p={p} />
        {podeGerir && p.etapa !== 'EMPENHADO' && p.etapa !== 'CANCELADO' && (
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {semAutor && (
              <AppButton size="sm" onClick={onAlterar} data-testid={`emendas-pedido-indicar-autor-${p.id}`}>
                Indicar o parlamentar
              </AppButton>
            )}
            {prox && (
              <AppButton size="sm" onClick={() => onAcao(prox.acao)} data-testid={`emendas-pedido-proximo-${p.id}`}>
                {prox.rotulo}
              </AppButton>
            )}
            {/* Às vezes o gabinete manda o ofício sem minuta da CAEP. */}
            {p.etapa === 'RESERVADO' && !semAutor && <ActionButton action="avancarEtapa" size="sm" label="Já chegou o ofício" onClick={() => onAcao('OFICIO')} />}
            <ActionButton action="editar" size="sm" label="Alterar linhas" onClick={onAlterar} data-testid={`emendas-pedido-alterar-${p.id}`} />
            <ActionButton action="cancelarCiclo" size="sm" label="Cancelar pedido" onClick={() => onAcao('CANCELAR')} data-testid={`emendas-pedido-cancelar-${p.id}`} />
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * Pedidos dos parlamentares (migration 157): a reserva já ocupa o saldo da CAEP; o pedido segue até o empenho e então
 * a CAEP só acompanha. Cancelar devolve o saldo.
 */
export const EmendasPedidosPage: React.FC = () => {
  const { data: pedidos = [], isLoading, isFetching, isError, error, refetch, dataUpdatedAt } = usePedidosEmendas();
  const { data: notas = SEM_NOTAS } = useNotasDasLinhas();
  const { data: itensLista = [], isLoading: carregandoItens } = useItensCaep();
  const { data: autores = [] } = useAutoresEmendas();
  const { data: beneficiariosLista = [] } = useBeneficiariosEmendas();
  const { data: kits = [] } = useKitsEmendas();
  const podeGerir = usePodeGerirEmendas();
  const podeVerContratos = usePodeVerContratos();
  const hoje = hojeEmBrasilia();
  const [segmento, setSegmento] = useState<Segmento>('todos');
  const [filtroAviso, setFiltroAviso] = useState('');
  const [busca, setBusca] = useState('');
  const [editando, setEditando] = useState<PedidoEmenda | 'novo' | null>(null);
  const [janela, setJanela] = useState<{ pedido: PedidoEmenda; acao: AcaoDaJanela } | null>(null);

  const itens = useMemo(() => new Map(itensLista.map((i) => [i.itemKey, i])), [itensLista]);
  const autorPorId = useMemo(() => new Map<string, AutorEmenda>(autores.map((a) => [a.id, a])), [autores]);
  const beneficiarios = useMemo(() => new Map(beneficiariosLista.map((b) => [b.id, b])), [beneficiariosLista]);
  const nomeDoBeneficiario = (id: string) => beneficiarios.get(id)?.nomeCurto;
  const linhas: Linha[] = useMemo(() => pedidos.map((p) => ({ ...p, valor: valorDoPedido(p, itens), avisos: avisosDoPedido(p, itens, hoje, notas) })), [pedidos, itens, hoje, notas]);

  const contagem = useMemo(() => {
    const c: Record<string, number> = { todos: 0, CANCELADO: 0 };
    for (const l of linhas) {
      c[l.etapa] = (c[l.etapa] ?? 0) + 1;
      if (l.etapa !== 'CANCELADO') c.todos++;
    }
    return c;
  }, [linhas]);

  const doSegmento = useMemo(() => linhas.filter((l) => (segmento === 'todos' ? l.etapa !== 'CANCELADO' : l.etapa === segmento)), [linhas, segmento]);
  const filtradas = useMemo(() => {
    const termo = semAcento(busca.trim());
    return doSegmento
      .filter((l) => !filtroAviso || (filtroAviso === 'com' ? l.avisos.length > 0 : l.avisos.some((a) => a.tipo === filtroAviso)))
      .filter((l) => {
        if (!termo) return true;
        const a = l.autorId ? autorPorId.get(l.autorId) : undefined;
        const textoLinhas = linhasAtivas(l)
          .map((x) => `${(x.tipo === 'KIT' ? x.kitNome : itens.get(x.itemKey ?? '')?.descricao) ?? ''} ${x.beneficiarioNome ?? ''} ${x.contratoNumero ?? ''}`)
          .join(' ');
        return semAcento(`${a?.nome ?? AUTOR_A_DEFINIR} ${l.contatoNome ?? ''} ${a?.uf ?? ''} ${l.oficioNumero ?? ''} ${l.oficioProcessoSei ?? ''} ${l.siopEmenda ?? ''} ${textoLinhas}`).includes(termo);
      });
  }, [doSegmento, filtroAviso, busca, autorPorId, itens]);

  const { currentPage, setPage, pageItems } = useCarteiraPagination(filtradas, chaveDaLinha, POR_PAGINA);
  const filtrosAtivos = Boolean(busca.trim() || filtroAviso);
  const contaAviso = (tipo: string) => doSegmento.filter((l) => (tipo === 'com' ? l.avisos.length > 0 : l.avisos.some((a) => a.tipo === tipo))).length;

  const colunas: Column<Linha>[] = [
    {
      key: 'autor',
      header: 'Autor',
      priority: 'primary',
      minWidth: '200px',
      render: (l) => <AutorDoPedido autor={l.autorId ? autorPorId.get(l.autorId) : undefined} autorId={l.autorId} orgao={orgaoDoPedido(l, nomeDoBeneficiario)} destaque />
    },
    {
      // A reserva não é documento: até o ofício chegar, o que identifica o pedido é a data e o contato na assessoria.
      key: 'reserva',
      header: 'Reserva / ofício',
      minWidth: '200px',
      render: (l) =>
        l.oficioNumero ? (
          <>
            <div style={{ fontWeight: 600 }}>{l.oficioNumero}</div>
            {l.oficioProcessoSei && <div style={carteiraSubtitle}>SEI {l.oficioProcessoSei}</div>}
          </>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
              {/* "Reserva da planilha" se repetia em quase toda linha: a origem vira uma etiqueta discreta. */}
              <span style={{ fontWeight: 600 }}>{l.origem === 'PLANILHA' && !l.siopEmenda ? 'Reserva' : identificacaoDoPedido(l)}</span>
              {l.origem === 'PLANILHA' && <StatusBadge label="Planilha" variant="neutral" size="sm" dot={false} />}
            </div>
            {l.oficioProcessoSei && <div style={carteiraSubtitle}>SEI {l.oficioProcessoSei}</div>}
            {(l.contatoNome || l.contatoTelefone || l.contatoEmail) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                <span style={carteiraSubtitle}>{l.contatoNome ? `com ${l.contatoNome}` : 'contato'}</span>
                <ContatoDoResponsavel nome={l.contatoNome ?? 'assessoria'} telefone={l.contatoTelefone} email={l.contatoEmail} />
              </div>
            )}
          </>
        )
    },
    {
      key: 'linhas',
      header: 'Itens e kits',
      minWidth: '240px',
      render: (l) => {
        const ativas = linhasAtivas(l);
        const resumo = ativas
          .slice(0, 2)
          .map((x) => (x.tipo === 'KIT' ? `${x.quantidade} ${x.kitNome}` : `${x.quantidade} ${curto(itens.get(x.itemKey ?? '')?.descricao ?? x.itemKey ?? '', 34)}`))
          .join(' · ');
        return (
          <>
            <div style={{ fontWeight: 600 }}>{resumo}</div>
            {ativas.length > 2 && <div style={carteiraSubtitle}>+{ativas.length - 2} {ativas.length - 2 === 1 ? 'linha' : 'linhas'}</div>}
          </>
        );
      }
    },
    { key: 'valor', header: 'Valor', align: 'right', nowrap: true, render: (l) => formatCurrency(l.valor) },
    {
      key: 'etapa',
      header: 'Etapa',
      nowrap: true,
      render: (l) => <StatusBadge label={ROTULO_ETAPA[l.etapa]} variant={VARIANTE_ETAPA[l.etapa]} size="sm" dot={false} />
    },
    {
      // Etiqueta curta: o aviso mais grave e "+N"; a frase completa aparece ao parar o mouse e no detalhe da linha.
      key: 'aviso',
      header: 'Aviso',
      nowrap: true,
      render: (l) => {
        const [primeiro, ...outros] = l.avisos;
        if (!primeiro) return <span style={carteiraSubtitle}>—</span>;
        return (
          <span title={l.avisos.map((a) => a.texto).join('\n')} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }} data-testid={`emendas-pedido-aviso-${l.id}`}>
            <StatusBadge label={primeiro.curto} variant={avisoGrave(primeiro) ? 'danger' : 'warning'} size="sm" dot={false} />
            {outros.length > 0 && <span style={{ ...carteiraSubtitle, fontWeight: 700 }}>+{outros.length}</span>}
          </span>
        );
      }
    }
  ];

  const nomeDoAutor = (id: string | null) => (id ? autorPorId.get(id)?.nome ?? id : AUTOR_A_DEFINIR);

  return (
    <PageContainer style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <PageHeader
        title="Pedidos"
        subtitle="Reservas e ofícios dos parlamentares, da reserva ao empenho."
        hint={`A reserva já ocupa o saldo da CAEP: o total reservado de um item nunca passa do alocado à CAEP, e a alocação da CAEP não pode baixar para menos do que está reservado. Etapas: Reservado → Minuta enviada → Ofício recebido → Conferido no SIOP → Empenho autorizado → Empenhado (com a CCGA). Prazo: o contrato precisa ser assinado antes do fim da ata; a ${avisoIndicacaoDias()} dias do fim o pedido avisa, e a menos de ${corteIndicacaoDias()} dias o sistema não aceita nova reserva nem ofício com itens da ata (os dois prazos ficam em Ajustes > Regras de Alertas). A CAEP também reserva a pedido de um órgão (o beneficiário final) antes de haver parlamentar: a reserva fica com "Parlamentar a definir" e só segue para a minuta quando o parlamentar for indicado. Avisos: mais de 30 dias sem ofício (ou sem parlamentar), divergência com o SIOP, ata vencendo, ata que passou do prazo de indicação ou vencida antes do empenho e linhas a conferir das planilhas da CAEP. Pedidos que vieram das planilhas trazem o beneficiário pelo nome (a cadastrar com CNPJ), o documento SEI do empenho (a nota é achada pelo contrato) e o contrato. Cancelar devolve o saldo.`}
        icon={<ClipboardList size={26} color="var(--primary)" aria-hidden="true" />}
        actions={
          <>
            {podeGerir && <ActionButton action="novo" label="Nova reserva" onClick={() => setEditando('novo')} disabled={carregandoItens} data-testid="emendas-pedidos-novo" />}
            <HeaderRefreshAction onRefresh={() => refetch()} isRefreshing={isFetching} lastUpdated={dataUpdatedAt || null} dataTestId="emendas-pedidos-atualizar" tooltipTitle="Recarregar os pedidos" />
          </>
        }
      />

      <CarteiraSegmentTabs<Segmento>
        testIdPrefix="emendas-pedidos-etapa"
        ariaLabel="Etapa dos pedidos"
        active={segmento}
        onSelect={setSegmento}
        segments={[
          ...ETAPAS.map((e) => ({ id: e.etapa as Segmento, label: e.curto, count: contagem[e.etapa] ?? 0, dot: e.etapa === 'EMPENHADO' ? 'var(--color-success)' : undefined })),
          { id: 'todos', label: 'Todos', count: contagem.todos },
          { id: 'CANCELADO', label: 'Cancelados', count: contagem.CANCELADO ?? 0 }
        ]}
      />

      <CarteiraFilterBar
        busca={busca}
        searchPlaceholder="Buscar por autor, contato, ofício, SEI, emenda ou item..."
        onChangeBusca={setBusca}
        hasActiveFilters={filtrosAtivos}
        onResetFilters={() => {
          setBusca('');
          setFiltroAviso('');
        }}
        counter={carteiraCounter(filtradas.length, doSegmento.length, filtrosAtivos, 'pedido', 'pedidos')}
        testIdPrefix="emendas-pedidos"
      >
        <CarteiraFilterButton
          label="Aviso"
          value={filtroAviso}
          emptyValue=""
          options={[
            { value: 'com', label: 'Com algum aviso', count: contaAviso('com') },
            { value: 'semOficio', label: 'Mais de 30 dias sem ofício ou parlamentar', count: contaAviso('semOficio') },
            { value: 'divergencia', label: 'Divergência com o SIOP', count: contaAviso('divergencia') },
            { value: 'ataNoCorte', label: 'Passou do prazo de indicação', count: contaAviso('ataNoCorte') },
            { value: 'ataVencendo', label: 'Ata vencendo', count: contaAviso('ataVencendo') },
            { value: 'ataVencida', label: 'Ata vencida', count: contaAviso('ataVencida') },
            { value: 'aConferir', label: 'Linhas a conferir (planilhas da CAEP)', count: contaAviso('aConferir') },
            { value: 'semNota', label: 'Empenhado com linha sem nota', count: contaAviso('semNota') }
          ]}
          onChange={setFiltroAviso}
          testId="emendas-pedidos-filtro-aviso"
        />
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
          rowStyle={(l) => (l.etapa === 'CANCELADO' ? { opacity: 0.7 } : undefined)}
          columns={colunas}
          renderExpanded={(l) => (
            <DetalheDoPedido
              p={l}
              itens={itens}
              beneficiarios={beneficiarios}
              notas={notas}
              podeGerir={podeGerir}
              podeVerContratos={podeVerContratos}
              hoje={hoje}
              onAcao={(acao) => setJanela({ pedido: l, acao })}
              onAlterar={() => setEditando(l)}
            />
          )}
        />
        <CarteiraPagination page={currentPage} pageSize={POR_PAGINA} total={filtradas.length} onChange={setPage} testIdPrefix="emendas-pedidos" />
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
      {janela && <EtapaPedidoModal pedido={janela.pedido} acao={janela.acao} itens={itens} nomeDoAutor={nomeDoAutor(janela.pedido.autorId)} onClose={() => setJanela(null)} />}
    </PageContainer>
  );
};
