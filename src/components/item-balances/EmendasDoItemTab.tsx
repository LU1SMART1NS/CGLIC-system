import React, { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { SummaryBar } from '../../design-system/components/SummaryBar';
import { StatusBadge } from '../../design-system/components/StatusBadge';
import { DataTable, type Column } from '../../design-system/components/DataTable';
import { EmptyState } from '../../design-system/components/EmptyState';
import { ErrorState } from '../../design-system/components/ErrorState';
import { InstrumentSection } from '../instrument360/InstrumentSection';
import { CarteiraSegmentTabs } from '../carteira/CarteiraSegmentTabs';
import { CarteiraFilterBar, carteiraCounter } from '../carteira/CarteiraFilterBar';
import { carteiraDetalhe, carteiraNumero, carteiraSubtitle, carteiraValor } from '../carteira/carteiraStyles';
import { useNavigateWithOrigin } from '../../hooks/useDetailOrigin';
import { hojeEmBrasilia, useAutoresEmendas, useBeneficiariosEmendas, useItensCaep, useKitsEmendas, useNotasDasLinhas, usePedidosEmendas } from '../../hooks/useEmendas';
import { formatCurrency, formatNumber } from '../../utils/format';
import { dataBR, diasEntre, limiteDaIndicacao, passouDoCorte } from '../../utils/emendasKits';
import { numeroDaChave } from '../../utils/contractKeyUtils';
import { FASES_PEDIDO, faseDaEtapa, identificacaoDoPedido, itensDaLinha, linhasAtivas, ORDEM_SITUACAO_LINHA, situacaoDaLinha, type FasePedido, type SituacaoDaLinha } from '../../utils/emendasPedidos';
import { rotuloBeneficiario, type LinhaPedido, type NotaDaLinha, type PedidoEmenda } from '../../services/emendasService';
import { AutorDoPedido, SituacaoDaLinhaEtiqueta } from '../emendas/emendasPartes';
import { ClipboardList } from 'lucide-react';

const SEM_NOTAS = new Map<string, NotaDaLinha>();
type Segmento = FasePedido | 'todos';

interface UsoDoItem {
  pedido: PedidoEmenda;
  /** Linhas do pedido com este item (avulsas ou dentro de um kit) e a quantidade do item em cada uma. */
  linhas: Array<{ linha: LinhaPedido; quantidade: number; situacao: SituacaoDaLinha }>;
  quantidade: number;
  /** A situação da linha mais atrasada deste item no pedido. */
  situacao: SituacaoDaLinha;
  fase: FasePedido | null;
}

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Item 360 › Emendas (decisão de 24/10/2026): o item inteiro nas emendas. Alocado à CAEP → reservado a parlamentares →
 * saldo a oferecer, o prazo de indicação, e um pedido por linha com a situação das linhas deste item (migration 180).
 * A linha abre o pedido em Emendas › Pedidos, onde ficam os botões de etapa; aqui não há botão de etapa.
 */
export const EmendasDoItemTab: React.FC<{ itemKey: string; podeVerContratos: boolean }> = ({ itemKey, podeVerContratos }) => {
  const navigate = useNavigateWithOrigin();
  const hoje = hojeEmBrasilia();
  const { data: itens = [], isLoading, isError, error } = useItensCaep();
  const { data: pedidos = [], isLoading: carregandoPedidos } = usePedidosEmendas();
  const { data: autores = [] } = useAutoresEmendas();
  const { data: beneficiarios = [] } = useBeneficiariosEmendas();
  const { data: notas = SEM_NOTAS } = useNotasDasLinhas();
  const { data: kits = [] } = useKitsEmendas();
  const [segmento, setSegmento] = useState<Segmento>('todos');
  const [busca, setBusca] = useState('');

  const item = itens.find((i) => i.itemKey === itemKey);
  const autorPorId = useMemo(() => new Map(autores.map((a) => [a.id, a])), [autores]);
  const beneficiarioPorId = useMemo(() => new Map(beneficiarios.map((b) => [b.id, b])), [beneficiarios]);
  // Beneficiário ainda não carregado (ou cadastro juntado a outro): sem o "!" que derrubava a tela inteira.
  const nomeDoBeneficiario = useCallback(
    (id: string | null): string | null => {
      if (!id) return null;
      const b = beneficiarioPorId.get(id);
      return b ? rotuloBeneficiario(b) : '…';
    },
    [beneficiarioPorId]
  );

  const usos: UsoDoItem[] = useMemo(() => {
    const lista: UsoDoItem[] = [];
    for (const p of pedidos) {
      if (p.etapa === 'CANCELADO') continue;
      const linhas = linhasAtivas(p)
        .map((l) => ({ linha: l, quantidade: itensDaLinha(l).filter((x) => x.itemKey === itemKey).reduce((s, x) => s + x.quantidade, 0), situacao: situacaoDaLinha(p, l, notas) }))
        .filter((x) => x.quantidade > 0);
      if (!linhas.length) continue;
      const situacao = [...linhas].sort((a, b) => ORDEM_SITUACAO_LINHA[a.situacao.situacao] - ORDEM_SITUACAO_LINHA[b.situacao.situacao])[0].situacao;
      lista.push({ pedido: p, linhas, quantidade: linhas.reduce((s, x) => s + x.quantidade, 0), situacao, fase: faseDaEtapa(p.etapa) });
    }
    return lista.sort((a, b) => ORDEM_SITUACAO_LINHA[a.situacao.situacao] - ORDEM_SITUACAO_LINHA[b.situacao.situacao] || b.quantidade - a.quantidade);
  }, [pedidos, itemKey, notas]);

  const reservado = usos.reduce((s, u) => s + u.quantidade, 0);
  const alocado = item?.alocado ?? 0;
  const saldo = alocado - reservado;
  const contagem = useMemo(() => {
    const c: Record<string, number> = { todos: usos.length };
    for (const u of usos) if (u.fase) c[u.fase] = (c[u.fase] ?? 0) + 1;
    return c;
  }, [usos]);
  const doSegmento = segmento === 'todos' ? usos : usos.filter((u) => u.fase === segmento);
  const filtrados = useMemo(() => {
    const termo = semAcento(busca.trim());
    if (!termo) return doSegmento;
    return doSegmento.filter((u) => {
      const a = u.pedido.autorId ? autorPorId.get(u.pedido.autorId) : undefined;
      const ben = u.linhas.map((x) => nomeDoBeneficiario(x.linha.beneficiarioId) ?? '').join(' ');
      return semAcento(`${a?.nome ?? 'Parlamentar a definir'} ${a?.uf ?? ''} ${u.pedido.oficioProcessoSei ?? ''} ${u.pedido.siopEmenda ?? ''} ${ben}`).includes(termo);
    });
  }, [doSegmento, busca, autorPorId, nomeDoBeneficiario]);
  const unidadesDoSegmento = doSegmento.reduce((s, u) => s + u.quantidade, 0);
  const kitsDoItem = kits.filter((k) => k.ativo && k.itens.some((i) => i.itemKey === itemKey));

  const dias = item?.vigenciaFinal ? diasEntre(hoje, item.vigenciaFinal) : null;
  const prazo =
    !item?.vigenciaFinal ? null
    : item.ataEncerrada ? { label: 'Ata encerrada', variant: 'neutral' as const }
    : passouDoCorte(dias) ? { label: 'Indicação encerrada', variant: 'danger' as const }
    : { label: `Indicação até ${dataBR(limiteDaIndicacao(item.vigenciaFinal))} · ${diasEntre(hoje, limiteDaIndicacao(item.vigenciaFinal))} dias`, variant: 'warning' as const };

  const colunas: Column<UsoDoItem>[] = [
    {
      key: 'autor',
      header: 'Parlamentar',
      priority: 'primary',
      minWidth: '200px',
      render: (u) => <AutorDoPedido autor={u.pedido.autorId ? autorPorId.get(u.pedido.autorId) : undefined} autorId={u.pedido.autorId} destaque />
    },
    { key: 'pedido', header: 'Pedido', nowrap: true, render: (u) => <span style={carteiraValor}>{identificacaoDoPedido(u.pedido)}</span> },
    {
      key: 'situacao',
      header: 'Situação',
      minWidth: '200px',
      render: (u) => (
        <>
          <SituacaoDaLinhaEtiqueta s={u.situacao} testId={`item360-emenda-situacao-${u.pedido.id}`} />
          {u.linhas.length > 1 && <div style={carteiraDetalhe}>{u.linhas.length} linhas deste item no pedido</div>}
        </>
      )
    },
    { key: 'qtd', header: 'Qtd. deste item', align: 'right', nowrap: true, render: (u) => <span style={{ ...carteiraValor, ...carteiraNumero }}>{formatNumber(u.quantidade)}</span> },
    {
      key: 'beneficiarios',
      header: 'Beneficiários',
      render: (u) => {
        const nomes = [...new Set(u.linhas.map((x) => nomeDoBeneficiario(x.linha.beneficiarioId)))];
        const informados = nomes.filter((n): n is string => Boolean(n));
        if (!informados.length) return <StatusBadge label="A informar" variant="warning" size="sm" dot={false} />;
        return (
          <>
            <span style={carteiraValor}>{informados[0]}</span>
            {informados.length > 1 && <div style={carteiraDetalhe}>+ {informados.length - 1} {informados.length - 1 === 1 ? 'beneficiário' : 'beneficiários'}</div>}
            {nomes.includes(null) && <div style={carteiraDetalhe}>e {u.linhas.filter((x) => !x.linha.beneficiarioId).length} a informar</div>}
          </>
        );
      }
    },
    ...(podeVerContratos
      ? [
          {
            key: 'empenho',
            header: 'Empenho',
            nowrap: true,
            render: (u: UsoDoItem) => {
              const comNota = u.linhas.map((x) => notas.get(x.linha.id)).filter((n): n is NotaDaLinha => Boolean(n?.nota));
              if (!comNota.length) return <span style={carteiraDetalhe}>{ORDEM_SITUACAO_LINHA[u.situacao.situacao] >= ORDEM_SITUACAO_LINHA.EMPENHADO ? 'sem nota ligada' : '—'}</span>;
              const contratos = [...new Set(comNota.map((n) => n.contractKey).filter((c): c is string => Boolean(c)))];
              return (
                <>
                  <div style={carteiraValor}>{[...new Set(comNota.map((n) => n.nota))].join(' · ')}</div>
                  {contratos.map((c) => (
                    <div key={c} style={carteiraDetalhe}>
                      Contrato{' '}
                      <Link to={`/contratos/${encodeURIComponent(c)}`} onClick={(e) => e.stopPropagation()} style={{ color: 'var(--primary)', fontWeight: 700 }}>
                        {numeroDaChave(c)}
                      </Link>
                    </div>
                  ))}
                </>
              );
            }
          } as Column<UsoDoItem>
        ]
      : [])
  ];

  if (!isLoading && !isError && !item) {
    return (
      <InstrumentSection id="item-emendas-section" title="Emendas parlamentares" subtitle="Este item não está alocado à CAEP." icon={ClipboardList}>
        <EmptyState title="Sem alocação à CAEP." description="O gestor de saldo aloca o item à CAEP em Alocação; só então a CAEP reserva a parlamentares." />
      </InstrumentSection>
    );
  }

  return (
    <InstrumentSection id="item-emendas-section" title="Emendas parlamentares" subtitle="Quanto do alocado à CAEP já está reservado a parlamentares e em que situação está cada pedido." icon={ClipboardList}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }} data-testid="item360-emendas">
        {isError ? (
          <ErrorState title="Não foi possível carregar as emendas" message={(error as Error | null)?.message || 'Falha ao consultar os itens da CAEP.'} testId="item360-emendas-erro" />
        ) : (
          <SummaryBar
            testId="item360-emendas-resumo"
            loading={isLoading || carregandoPedidos}
            loadingLabel="Carregando as emendas..."
            items={[
              { label: 'Alocado à CAEP', value: formatNumber(alocado) },
              { label: 'Reservado a parlamentares', value: formatNumber(reservado) },
              { label: 'Saldo a oferecer', value: formatNumber(saldo), tone: saldo <= 0 ? 'warning' : 'success' }
            ]}
            progress={{ value: Math.min(reservado, alocado), max: alocado }}
            extra={prazo ? <StatusBadge label={prazo.label} variant={prazo.variant} size="sm" dot={false} /> : null}
          />
        )}

        <CarteiraSegmentTabs<Segmento>
          testIdPrefix="item360-emendas-fase"
          ariaLabel="Fase dos pedidos"
          active={segmento}
          onSelect={setSegmento}
          meta={doSegmento.length ? `${formatNumber(unidadesDoSegmento)} un · ${formatCurrency(unidadesDoSegmento * (item?.valorUnitario ?? 0))} pelo preço de hoje` : undefined}
          segments={[
            ...FASES_PEDIDO.map((f) => ({ id: f.id as Segmento, label: f.nome, count: contagem[f.id] ?? 0 })),
            { id: 'todos', label: 'Todos', count: contagem.todos }
          ]}
        />
        <CarteiraFilterBar
          busca={busca}
          searchPlaceholder="Buscar por parlamentar, processo SEI, emenda ou beneficiário..."
          onChangeBusca={setBusca}
          hasActiveFilters={Boolean(busca.trim())}
          onResetFilters={() => setBusca('')}
          counter={carteiraCounter(filtrados.length, doSegmento.length, Boolean(busca.trim()), 'pedido', 'pedidos')}
          testIdPrefix="item360-emendas"
        />
        {!isLoading && !carregandoPedidos && filtrados.length === 0 ? (
          <EmptyState title={usos.length === 0 ? 'Nenhum parlamentar reservou este item ainda.' : 'Nenhum pedido nesta situação.'} description={usos.length === 0 ? 'A CAEP reserva em Emendas › Pedidos.' : 'Ajuste a busca ou escolha outra fase.'} />
        ) : (
          <DataTable<UsoDoItem>
            testId="item360-emendas-tabela"
            className="data-table-container--flush emendas-tabela-topo"
            data={filtrados}
            keyExtractor={(u) => u.pedido.id}
            columns={colunas}
            rowOpen={(u) => () => navigate(`/emendas/pedidos?pedido=${u.pedido.id}&item=${encodeURIComponent(itemKey)}`)}
          />
        )}
        {kitsDoItem.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }} data-testid="item360-emendas-kits">
            <span style={carteiraSubtitle}>Entra nos kits:</span>
            {kitsDoItem.map((k) => (
              <Link key={k.id} to={`/emendas/itens?ver=kit&abrir=${encodeURIComponent(k.id)}`} style={{ ...carteiraValor, color: 'var(--primary)' }}>
                {k.nome}
              </Link>
            ))}
          </div>
        )}
      </div>
    </InstrumentSection>
  );
};
