import React, { useMemo, useState } from 'react';
import { PackageOpen } from 'lucide-react';
import { PageContainer } from '../../design-system/components/PageContainer';
import { PageHeader } from '../../design-system/components/PageHeader';
import { DataTable } from '../../design-system/components/DataTable';
import { StatusBadge, type StatusBadgeVariant } from '../../design-system/components/StatusBadge';
import { ActionButton } from '../../design-system/components/ActionButton';
import { CarteiraFilterBar, carteiraCounter } from '../carteira/CarteiraFilterBar';
import { CarteiraSegmentTabs } from '../carteira/CarteiraSegmentTabs';
import { AdminListShell } from '../admin/shared/AdminListShell';
import { useToast } from '../../design-system/components/Toast';
import { hojeEmBrasilia, useItensCaep, useKitsEmendas, usePodeGerirEmendas, useSalvarKit } from '../../hooks/useEmendas';
import { formatCurrency, formatNumber } from '../../utils/format';
import { AVISO_VENCIMENTO_DIAS, calcularKit, dataBR, ROTULO_SITUACAO_KIT, type CalculoDoKit, type SituacaoKit } from '../../utils/emendasKits';
import type { KitEmenda } from '../../services/emendasService';
import { KitModal } from './KitModal';

type Segmento = 'todos' | SituacaoKit;
type Linha = KitEmenda & { calculo: CalculoDoKit };

const VARIANTE: Record<SituacaoKit, StatusBadgeVariant> = { disponivel: 'success', vence: 'warning', indisponivel: 'danger', desativado: 'neutral' };
const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Kits das emendas (migration 155): conjunto de itens montado pela CAEP com o que ela tem alocado. A situação é
 * calculada todo dia pelas atas e pelo saldo; quem desativa é só a CAEP.
 */
export const EmendasKitsPage: React.FC = () => {
  const { data: kits = [], isLoading, isError, error, refetch } = useKitsEmendas();
  const { data: itens = [], isLoading: carregandoItens } = useItensCaep();
  const podeGerir = usePodeGerirEmendas();
  const salvar = useSalvarKit();
  const toast = useToast();
  const hoje = hojeEmBrasilia();
  const [segmento, setSegmento] = useState<Segmento>('todos');
  const [busca, setBusca] = useState('');
  const [editando, setEditando] = useState<KitEmenda | 'novo' | null>(null);

  const porChave = useMemo(() => new Map(itens.map((i) => [i.itemKey, i])), [itens]);
  const linhas: Linha[] = useMemo(() => kits.map((k) => ({ ...k, calculo: calcularKit(k, porChave, hoje) })), [kits, porChave, hoje]);

  const contagem = useMemo(() => {
    const c: Record<Segmento, number> = { todos: linhas.length, disponivel: 0, vence: 0, indisponivel: 0, desativado: 0 };
    for (const l of linhas) c[l.calculo.situacao]++;
    return c;
  }, [linhas]);

  const filtradas = useMemo(() => {
    const termo = semAcento(busca.trim());
    return linhas
      .filter((l) => segmento === 'todos' || l.calculo.situacao === segmento)
      .filter((l) => !termo || semAcento(`${l.nome} ${l.descricao ?? ''} ${l.calculo.componentes.map((c) => c.item?.descricao ?? '').join(' ')}`).includes(termo));
  }, [linhas, segmento, busca]);

  const filtrosAtivos = Boolean(busca) || segmento !== 'todos';

  const alternarAtivo = async (k: KitEmenda) => {
    try {
      await salvar.mutateAsync({ id: k.id, versao: k.versao, nome: k.nome, descricao: k.descricao, ativo: !k.ativo, itens: k.itens });
      toast.success(k.ativo ? `${k.nome} desativado: sai da lista dos pedidos.` : `${k.nome} reativado.`);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <PageContainer style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <PageHeader
        title="Kits"
        subtitle={`Conjuntos de itens que a CAEP oferece aos parlamentares. ${itens.length ? `${itens.length} itens com alocação para a CAEP.` : ''}`}
        hint={`O kit não guarda quantidade: quando o parlamentar pede N kits, cada item sai do saldo da CAEP N vezes a quantidade por kit. A situação é calculada sozinha: Vence em breve quando alguma ata do kit acaba em até ${AVISO_VENCIMENTO_DIAS} dias; Indisponível com ata encerrada ou sem saldo (volta sozinho se a ata for prorrogada).`}
        icon={<PackageOpen size={26} color="var(--primary)" aria-hidden="true" />}
        actions={podeGerir ? <ActionButton action="novo" label="Novo kit" onClick={() => setEditando('novo')} disabled={carregandoItens} data-testid="emendas-kits-novo" /> : undefined}
      />

      <CarteiraSegmentTabs<Segmento>
        testIdPrefix="emendas-kits-situacao"
        ariaLabel="Situação dos kits"
        active={segmento}
        onSelect={setSegmento}
        segments={[
          { id: 'todos', label: 'Todos', count: contagem.todos },
          { id: 'disponivel', label: 'Disponíveis', count: contagem.disponivel },
          { id: 'vence', label: 'Vence em breve', count: contagem.vence },
          { id: 'indisponivel', label: 'Indisponíveis', count: contagem.indisponivel },
          { id: 'desativado', label: 'Desativados', count: contagem.desativado }
        ]}
      />

      <CarteiraFilterBar
        busca={busca}
        searchPlaceholder="Buscar kit ou item..."
        onChangeBusca={setBusca}
        hasActiveFilters={filtrosAtivos}
        onResetFilters={() => {
          setBusca('');
          setSegmento('todos');
        }}
        counter={carteiraCounter(filtradas.length, linhas.length, filtrosAtivos, 'kit', 'kits')}
        testIdPrefix="emendas-kits"
      />

      <AdminListShell
        testId="emendas-kits-lista"
        title="Kits da CAEP"
        isLoading={isLoading || carregandoItens}
        isError={isError}
        errorTitle="Não foi possível carregar os kits"
        errorMessage={(error as Error | null)?.message || 'Falha ao consultar os kits.'}
        onRetry={() => refetch()}
        isEmpty={filtradas.length === 0}
        emptyTitle={linhas.length === 0 ? 'Nenhum kit montado.' : 'Nenhum kit nesta situação.'}
        emptyDescription={linhas.length === 0 ? (podeGerir ? 'Use "Novo kit" para agrupar itens alocados à CAEP.' : 'A CAEP monta os kits com os itens alocados a ela.') : 'Ajuste a busca ou os filtros.'}
      >
        <DataTable<Linha>
          testId="emendas-kits-tabela"
          className="data-table-container--flush"
          data={filtradas}
          keyExtractor={(l) => l.id}
          rowStyle={(l) => (l.calculo.situacao === 'desativado' ? { opacity: 0.7 } : undefined)}
          columns={[
            {
              key: 'nome',
              header: 'Kit',
              priority: 'primary',
              sortValue: (l) => l.nome,
              render: (l) => (
                <div>
                  <div style={{ fontWeight: 700 }}>{l.nome}</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
                    {[l.descricao, l.versao > 1 ? `versão ${l.versao}` : null].filter(Boolean).join(' · ')}
                  </div>
                </div>
              )
            },
            {
              key: 'situacao',
              header: 'Situação',
              width: '150px',
              sortValue: (l) => l.calculo.situacao,
              render: (l) => <StatusBadge label={ROTULO_SITUACAO_KIT[l.calculo.situacao]} variant={VARIANTE[l.calculo.situacao]} size="sm" dot={false} />
            },
            { key: 'itens', header: 'Itens', width: '70px', sortValue: (l) => l.itens.length, render: (l) => l.itens.length },
            { key: 'valor', header: 'Valor por kit', width: '140px', sortValue: (l) => l.calculo.valorPorKit, render: (l) => <span style={{ whiteSpace: 'nowrap' }}>{formatCurrency(l.calculo.valorPorKit)}</span> },
            { key: 'possiveis', header: 'Kits possíveis', width: '120px', sortValue: (l) => l.calculo.kitsPossiveis, render: (l) => <b>{formatNumber(l.calculo.kitsPossiveis)}</b> },
            {
              key: 'motivo',
              header: 'Quem limita',
              mobileLabel: 'Quem limita',
              render: (l) => (
                <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                  {l.calculo.situacao === 'desativado'
                    ? 'Desativado pela CAEP'
                    : l.calculo.itemLimitante?.item
                      ? `${l.calculo.itemLimitante.item.descricao.slice(0, 48)} · ata ${l.calculo.itemLimitante.item.numeroAta}`
                      : '—'}
                </span>
              )
            }
          ]}
          renderExpanded={(l) => (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', padding: '0.4rem 0' }} data-testid={`emendas-kit-detalhe-${l.id}`}>
              <div className="data-table-container" style={{ overflowX: 'auto' }}>
                <table className="data-table" style={{ width: '100%' }}>
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Ata · item</th>
                      <th>Vigência</th>
                      <th style={{ textAlign: 'right' }}>Por kit</th>
                      <th style={{ textAlign: 'right' }}>Saldo da CAEP</th>
                      <th style={{ textAlign: 'right' }}>Dá para</th>
                    </tr>
                  </thead>
                  <tbody>
                    {l.calculo.componentes.map((c) => (
                      <tr key={c.itemKey}>
                        <td>{c.item?.descricao ?? `${c.itemKey} (sem alocação da CAEP)`}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>{c.item ? `${c.item.numeroAta} · ${Number(c.item.numeroItem)}` : '—'}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {!c.item ? (
                            '—'
                          ) : c.item.ataEncerrada ? (
                            <StatusBadge label={`encerrada ${dataBR(c.item.vigenciaFinal)}`} variant="danger" size="sm" dot={false} />
                          ) : c.diasParaVencer != null && c.diasParaVencer <= AVISO_VENCIMENTO_DIAS ? (
                            <StatusBadge label={`vence ${dataBR(c.item.vigenciaFinal)} · ${c.diasParaVencer} dias`} variant="warning" size="sm" dot={false} />
                          ) : (
                            `até ${dataBR(c.item.vigenciaFinal)}`
                          )}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatNumber(c.quantidade)}</td>
                        <td style={{ textAlign: 'right' }}>{c.item ? formatNumber(c.saldo) : '—'}</td>
                        <td style={{ textAlign: 'right' }}>{c.item && !c.item.ataEncerrada ? `${formatNumber(c.kits)} kits` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {l.calculo.motivo && <div style={{ fontSize: '0.82rem', fontWeight: 600 }}>{l.calculo.motivo}</div>}
              <div style={{ fontSize: '0.76rem', color: 'var(--color-text-muted)' }}>
                Mudar a composição cria uma nova versão; os pedidos já feitos guardam a composição do dia.
                {l.atualizadoPorNome ? ` Última alteração: ${l.atualizadoPorNome}${l.atualizadoEm ? ` em ${new Date(l.atualizadoEm).toLocaleDateString('pt-BR')}` : ''}.` : ''}
              </div>
            </div>
          )}
          rowActions={
            podeGerir
              ? (l) => (
                  <div style={{ display: 'flex', gap: '0.25rem', justifyContent: 'flex-end' }}>
                    <ActionButton action="editar" iconOnly label={`Alterar ${l.nome}`} onClick={() => setEditando(l)} disabled={salvar.isPending} data-testid={`emendas-kits-editar-${l.id}`} />
                    <ActionButton
                      action={l.ativo ? 'desativarCadastro' : 'reativarCadastro'}
                      iconOnly
                      label={`${l.ativo ? 'Desativar' : 'Reativar'} ${l.nome}`}
                      onClick={() => void alternarAtivo(l)}
                      disabled={salvar.isPending}
                      data-testid={`emendas-kits-ativo-${l.id}`}
                    />
                  </div>
                )
              : undefined
          }
        />
      </AdminListShell>

      {editando && (
        <KitModal
          kit={editando === 'novo' ? null : editando}
          itens={itens}
          nomesExistentes={kits.filter((k) => editando === 'novo' || k.id !== editando.id).map((k) => k.nome)}
          hoje={hoje}
          onClose={() => setEditando(null)}
        />
      )}
    </PageContainer>
  );
};
