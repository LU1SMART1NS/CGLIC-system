import React from 'react';
import { useNavigateWithOrigin } from '../../hooks/useDetailOrigin';
import { ArrowRight, Ban, Layers, Receipt } from 'lucide-react';
import { buildAtaItemPath } from '../../hooks/useAta';
import { numeroDaChave } from '../../utils/contractKeyUtils';
import { useItensDoContrato } from '../../hooks/useItensDoContrato';
import { useFaturasDoContrato, empenhosDaFatura } from '../../hooks/useFaturasDoContrato';
import { useAcoesDistribuicaoEmpenho, useDistribuicoesEmpenhoContrato } from '../../hooks/useDistribuicaoEmpenhos';
import type { DistribuicaoDoEmpenho, QuantidadeNoItem } from '../../services/distribuicaoEmpenhoService';
import type { FaturaDoContrato } from '../../services/faturasService';
import type { VinculoDoContrato } from '../../services/itensContratoService';
import {
  empenhadoPorItem,
  itensNumerados,
  motivoDaRevisao,
  quantidadeCalculada,
  quantidadeDaParcela,
  quantidadeFoiInformada,
  quantidadeQuebrada,
  rotuloDaSituacao,
  sugestaoCurta,
  textoDaSugestao,
  type ItemNumerado
} from '../../utils/distribuicaoEmpenho';
import { AvisoQuantidade, CampoQuantidadeNota } from '../item-balances/CampoQuantidadeNota';
import { DistribuirEmpenhoModal } from './DistribuirEmpenhoModal';
import { useLinhasAbertas } from './useLinhasAbertas';
import type { ContractDashboardRecord } from '../../types';
import { useContractFinancialSummary } from '../../hooks/useContractFinancialSummary';
import { useSincronizacaoEmpenhosContrato } from '../../hooks/useSincronizacaoEmpenhosContrato';
import type { SincronizacaoEmpenhosContrato } from '../../services/contratoEmpenhosSincronizacaoService';
import { CarteiraIdLink } from '../carteira/CarteiraRowLink';
import { useAuth } from '../../context/AuthContext';
import { useAcoesVinculoEmpenho, useDescartesEmpenhoContrato } from '../../hooks/useVinculoEmpenhosContrato';
import type { DescarteEmpenhoContrato } from '../../services/contratoEmpenhoVinculoService';
import { credorDiferenteDoFornecedor } from '../../utils/fornecedorMatch';
import { VincularEmpenhoModal, type PedidoDeVinculo } from './EmpenhoVinculoModals';
import {
  ActionButton,
  AppButton,
  DataTable,
  EmptyState,
  ErrorState,
  NoticeBar,
  SectionHeader,
  StatusBadge,
  SummaryBar,
  Tooltip,
  useConfirm,
  useToast,
  type Column
} from '../../design-system';

interface ContractFinancialExecutionSectionProps {
  contract: ContractDashboardRecord;
  contractKey: string;
  /** Nota a abrir (número oficial), vinda da aba Pagamentos pelo endereço. */
  abrirEmpenho?: string | null;
  /** Abre a fatura na aba Pagamentos. */
  onAbrirFatura?: (idFatura: number) => void;
}

const formatCurrency = (val?: number | null) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);

const formatDate = (val?: string | null) => {
  if (!val) return '—';
  try {
    const parts = val.split('T')[0].split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return new Date(val).toLocaleDateString('pt-BR');
  } catch {
    return val;
  }
};

/** O sistema só repete o vínculo do Contratos.gov.br: a correção é lá. */
const COMO_CORRIGIR_NA_FONTE =
  'Se não for deste contrato, peça ao setor responsável que retire a nota do contrato no Contratos.gov.br. A correção aparece aqui na próxima sincronização.';

type EmpenhoRow = ReturnType<typeof useContractFinancialSummary>['empenhosList'][number];

/** Data e hora local, ex.: 06/10/2026 14:25. */
const formatDataHora = (val?: string | null) => {
  if (!val) return '—';
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

/** A última tentativa de atualizar os empenhos falhou (toda ou em parte)? */
const ultimaTentativaFalhou = (sync?: SincronizacaoEmpenhosContrato | null) =>
  sync?.situacao === 'ERRO' || sync?.situacao === 'PARCIAL';

/** Linha com a data da consulta e, se a última tentativa falhou, o motivo. */
const SituacaoSincronizacaoEmpenhos: React.FC<{ sync?: SincronizacaoEmpenhosContrato | null }> = ({ sync }) => {
  if (!sync) return null;
  if (ultimaTentativaFalhou(sync)) {
    return (
      <NoticeBar tone={sync.situacao === 'ERRO' ? 'danger' : 'warning'} testId="contract-financial-sync-failed">
        A última atualização dos empenhos, em {formatDataHora(sync.tentativaEm)},{' '}
        {sync.situacao === 'ERRO' ? 'falhou' : 'ficou incompleta'}
        {sync.mensagem ? `: ${sync.mensagem}` : '.'}{' '}
        {sync.ultimoSucessoEm
          ? `Os dados abaixo são da consulta de ${formatDataHora(sync.ultimoSucessoEm)}.`
          : 'Os empenhos deste contrato ainda não foram consultados com sucesso.'}
      </NoticeBar>
    );
  }
  const consultados = (
    <span data-testid="contract-financial-sync-ok" style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
      Empenhos consultados no Contratos.gov.br em {formatDataHora(sync.ultimoSucessoEm || sync.tentativaEm)}.
    </span>
  );
  // Sem erro, a mensagem traz os avisos da consulta: vínculos removidos e conferência com o PNCP.
  if (!sync.mensagem) return consultados;
  return (
    <>
      {consultados}
      <NoticeBar tone="info" testId="contract-financial-sync-pncp">
        {sync.mensagem}
      </NoticeBar>
    </>
  );
};

/**
 * Descartes feitos antes de o sistema passar a seguir só o Contratos.gov.br. Não há como descartar
 * novos; restaurar devolve o empenho ao contrato e às somas até a fonte ser corrigida.
 */
const EmpenhosDescartados: React.FC<{
  descartes: DescarteEmpenhoContrato[];
  podeEditar: boolean;
  restaurando?: string;
  onRestaurar: (d: DescarteEmpenhoContrato) => void;
}> = ({ descartes, podeEditar, restaurando, onRestaurar }) => {
  if (descartes.length === 0) return null;
  const columns: Column<DescarteEmpenhoContrato>[] = [
    { key: 'numero', header: 'Empenho', priority: 'primary', render: (d) => <strong>{d.numeroOficial || '—'}</strong> },
    { key: 'credor', header: 'Credor', render: (d) => d.credorNome || '—' },
    { key: 'valor', header: 'Empenhado', align: 'right', render: (d) => formatCurrency(d.valorEmpenhado) },
    { key: 'motivo', header: 'Motivo', render: (d) => d.motivo },
    {
      key: 'por',
      header: 'Descartado por',
      render: (d) => (
        <span>
          {d.descartadoPorNome || '—'}
          <br />
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{formatDataHora(d.descartadoEm)}</span>
        </span>
      )
    }
  ];
  return (
    <div data-testid="contract-financial-descartados">
      <SectionHeader
        title="Empenhos descartados"
        subtitle="Tirados do contrato pela equipe antes de o sistema passar a seguir só o Contratos.gov.br. Ficam fora das somas até serem restaurados. Restaure e, se o vínculo estiver errado, retire a nota do contrato no Contratos.gov.br."
        icon={<Ban size={16} />}
        countBadge={descartes.length}
      />
      <DataTable
        columns={columns}
        data={descartes}
        keyExtractor={(d) => d.empenhoId}
        testId="contract-financial-descartados-table"
        rowActions={
          podeEditar
            ? (d) => (
                <ActionButton
                  action="restaurar"
                  size="sm"
                  onClick={() => onRestaurar(d)}
                  isLoading={restaurando === d.empenhoId}
                  disabled={Boolean(restaurando)}
                  data-testid="contract-financial-restaurar"
                />
              )
            : undefined
        }
      />
    </div>
  );
};

const brlCurto = (v: number) => formatCurrency(v);
const qtd = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

/** Divisão da nota entre os itens do contrato e as faturas que a citam: o que a setinha da linha abre. */
export const EmpenhoDetalhe: React.FC<{
  empenho: EmpenhoRow;
  distribuicao?: DistribuicaoDoEmpenho;
  itens: ItemNumerado[];
  vinculoPorItem: Map<number, VinculoDoContrato>;
  faturas: FaturaDoContrato[];
  podeEditar: boolean;
  desfazendo: boolean;
  /** A quantidade desta nota está sendo gravada ou conferida. */
  gravando?: boolean;
  onDistribuir: (d: DistribuicaoDoEmpenho) => void;
  onDesfazer: (d: DistribuicaoDoEmpenho) => void;
  /** Grava a quantidade da nota em um item (nula = volta à calculada). */
  onInformarQuantidade?: (d: DistribuicaoDoEmpenho, numeroItem: number, quantidade: number | null) => void;
  /** Confirma as quantidades depois que o valor da nota mudou. */
  onConferir?: (d: DistribuicaoDoEmpenho) => void;
  onAbrirItem: (v: VinculoDoContrato) => void;
  onAbrirFatura?: (idFatura: number) => void;
}> = ({
  empenho,
  distribuicao: d,
  itens,
  vinculoPorItem,
  faturas,
  podeEditar,
  desfazendo,
  gravando = false,
  onDistribuir,
  onDesfazer,
  onInformarQuantidade,
  onConferir,
  onAbrirItem,
  onAbrirFatura
}) => {
  const parcelaDe = new Map((d?.parcelas ?? []).map((p) => [p.numeroItem, p]));
  const fechada = d?.situacao === 'DISTRIBUIDA';
  const podeDistribuir = podeEditar && d && (d.situacao === 'A_DISTRIBUIR' || d.situacao === 'REVISAR' || (d.situacao === 'DISTRIBUIDA' && d.origem === 'USUARIO'));
  const sugestao = d && !fechada ? textoDaSugestao(d.sugestaoTipo, d.sugestao) : null;
  const revisao = d ? motivoDaRevisao(d) : null;

  return (
    <div className="detail-panel" data-testid={`empenho-detalhe-${empenho.numero_oficial}`}>
      {!d ? (
        <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
          A divisão desta nota entre os itens do contrato ainda não foi calculada. Ela aparece depois da próxima sincronização dos empenhos.
        </span>
      ) : d.situacao === 'SEM_ITENS' ? (
        <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
          O contrato não tem itens numerados na fonte oficial: a nota fica no contrato inteiro, sem divisão por item.
        </span>
      ) : d.situacao === 'SEM_VALOR' ? (
        <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>A nota está com valor zero e não tem o que vincular aos itens.</span>
      ) : (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.4rem 1.25rem', fontSize: '0.82rem' }}>
            {fechada ? (
              <StatusBadge
                label={d.origem === 'AUTO' ? 'Vinculada automaticamente: contrato de um item' : `Vinculada por ${d.distribuidoPorNome || 'usuário'}${d.distribuidoEm ? ` em ${formatDate(d.distribuidoEm)}` : ''}`}
                variant="info"
                size="sm"
                dot={false}
              />
            ) : (
              <StatusBadge label={d.situacao === 'REVISAR' ? 'Revisar o vínculo aos itens' : 'A vincular aos itens'} variant="warning" size="sm" dot={false} />
            )}
            {sugestao && <span style={{ color: 'var(--text-muted)' }}>sugestão: {sugestao}</span>}
            <span style={{ flex: 1 }} />
            {podeDistribuir && (
              <AppButton
                variant={fechada ? 'outline' : 'primary'}
                size="sm"
                onClick={() => onDistribuir(d)}
                data-testid={`empenho-distribuir-${empenho.numero_oficial}`}
              >
                {fechada ? 'Editar o vínculo aos itens' : 'Vincular aos itens'}
              </AppButton>
            )}
            {podeEditar && fechada && d.origem === 'USUARIO' && (
              <ActionButton action="desfazer" size="sm" onClick={() => onDesfazer(d)} isLoading={desfazendo} disabled={desfazendo}>
                Desfazer
              </ActionButton>
            )}
          </div>
          {revisao && (
            <NoticeBar
              tone="warning"
              testId={`empenho-revisao-${empenho.numero_oficial}`}
              action={
                podeEditar && onConferir && fechada && d.motivoRevisao === 'VALOR_MUDOU' ? (
                  <AppButton variant="outline" size="sm" onClick={() => onConferir(d)} disabled={gravando} data-testid={`empenho-conferir-${empenho.numero_oficial}`}>
                    Quantidades conferidas
                  </AppButton>
                ) : undefined
              }
            >
              {revisao}
            </NoticeBar>
          )}
          {d.observacao && fechada && (
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Observação: {d.observacao}</span>
          )}
          <div className="table-scroll" style={{ border: '1px solid #e2e8f0', borderRadius: '6px', background: '#ffffff' }}>
            <table className="ds-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Descrição</th>
                  <th style={{ textAlign: 'right' }}>Quantidade</th>
                  <th>Na ata</th>
                </tr>
              </thead>
              <tbody>
                {itens.map((i) => {
                  const p = fechada ? parcelaDe.get(i.numeroItem) : undefined;
                  const q = p ? quantidadeDaParcela(p, i.valorUnitario) : null;
                  const informada = p ? quantidadeFoiInformada(p, i.valorUnitario) : false;
                  const vinculo = vinculoPorItem.get(i.numeroItem);
                  return (
                    <tr key={i.numeroItem}>
                      <td style={{ fontWeight: 700 }}>{i.numeroItem}</td>
                      <td style={{ minWidth: '180px', maxWidth: '340px' }}>{i.descricao || '—'}</td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                        {!p ? (
                          <span style={{ color: 'var(--text-muted)' }}>—</span>
                        ) : podeEditar && onInformarQuantidade ? (
                          <CampoQuantidadeNota
                            quantidade={q}
                            calculada={quantidadeCalculada(p, i.valorUnitario)}
                            informada={informada}
                            podeVoltarACalculada={p.valor != null}
                            disabled={gravando}
                            ariaLabel={`Quantidade da nota ${empenho.numero_oficial} no item ${i.numeroItem}`}
                            testId={`empenho-quantidade-${empenho.numero_oficial}-${i.numeroItem}`}
                            onGravar={(nova) => onInformarQuantidade(d, i.numeroItem, nova)}
                          />
                        ) : q != null ? (
                          <strong>
                            {informada && <StatusBadge label="Informada" variant="info" size="sm" dot={false} />} {qtd(q)} un
                          </strong>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>a definir</span>
                        )}
                        {p && <AvisoQuantidade quantidade={q} />}
                        {i.quantidade != null && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>de {qtd(i.quantidade)} contratadas</div>
                        )}
                      </td>
                      <td>
                        {vinculo ? (
                          <CarteiraIdLink onClick={() => onAbrirItem(vinculo)} label={`Abrir o item ${vinculo.numeroItem} da ata ${vinculo.numeroAta}`} title="Abrir o item na ata">
                            Ata {vinculo.numeroAta} · item {vinculo.numeroItem}
                          </CarteiraIdLink>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>sem vínculo</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.3rem 0.75rem', fontSize: '0.8rem' }} data-testid={`empenho-faturas-${empenho.numero_oficial}`}>
        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Faturas</span>
        {faturas.length === 0 ? (
          <span style={{ color: 'var(--text-muted)' }}>nenhuma fatura cita esta nota</span>
        ) : (
          faturas.map((f) => (
            <span key={f.idFatura}>
              {onAbrirFatura ? (
                <AppButton variant="link" size="xs" type="button" onClick={() => onAbrirFatura(f.idFatura)} title="Abrir a fatura na aba Pagamentos">
                  fatura {f.numero || f.idFatura}
                </AppButton>
              ) : (
                <>fatura {f.numero || f.idFatura}</>
              )}{' '}
              <span style={{ color: 'var(--text-muted)' }}>
                {brlCurto(f.valor)} · {f.cancelada ? 'cancelada' : f.paga ? 'paga' : f.dataLiquidacao ? 'liquidada' : 'em andamento'}
              </span>
            </span>
          ))
        )}
      </div>
    </div>
  );
};

export const ContractFinancialExecutionSection: React.FC<ContractFinancialExecutionSectionProps> = ({
  contract,
  contractKey,
  abrirEmpenho,
  onAbrirFatura
}) => {
  const navigate = useNavigateWithOrigin();
  const empenhosUrl = `/empenhos?contractKey=${encodeURIComponent(contractKey)}`;

  // Empenhos de Contratos.gov/Compras.gov + v_empenhos_resumo, deduplicados por canonical_key
  const { empenhosList, summary: financialSummary, isLoading, isError, refetch } = useContractFinancialSummary(contract, contractKey);
  // Quando e com que resultado os empenhos deste contrato foram consultados nas fontes oficiais.
  const { data: sync } = useSincronizacaoEmpenhosContrato(contractKey);
  // Divisão de cada NE entre os itens do contrato (migration 94), os itens e as faturas que citam cada NE.
  const { data: distribuicoes = [] } = useDistribuicoesEmpenhoContrato(contractKey);
  const { data: itensDoContrato } = useItensDoContrato(contractKey);
  const { data: faturasData } = useFaturasDoContrato(contractKey);

  // Vínculo híbrido (migration 85): a fonte vincula e a equipe vincula à mão o que falta. Vínculo errado
  // vindo da fonte se corrige no Contratos.gov.br; a sincronização traz a correção.
  const { role } = useAuth();
  const podeEditar = role === 'admin' || role === 'gestor';
  const toast = useToast();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const { data: descartes = [] } = useDescartesEmpenhoContrato(contractKey);
  const acoes = useAcoesVinculoEmpenho(contractKey);
  const acoesDistribuicao = useAcoesDistribuicaoEmpenho(contractKey);
  const [vinculando, setVinculando] = React.useState(false);
  const [distribuindo, setDistribuindo] = React.useState<DistribuicaoDoEmpenho | null>(null);
  const numeroContrato = contract.numero || numeroDaChave(contractKey);
  const fornecedor = { cnpj: contract.fornecedorCnpjCpf, nome: contract.fornecedorNome };
  const credorDiverge = (e: EmpenhoRow) => credorDiferenteDoFornecedor({ cnpj: e.credor_cnpj_cpf, nome: e.credor_nome }, fornecedor);

  const itens = React.useMemo(() => itensNumerados(itensDoContrato?.itens ?? []), [itensDoContrato]);
  const vinculoPorItem = React.useMemo(() => new Map((itensDoContrato?.vinculos ?? []).map((v) => [v.numeroItem, v])), [itensDoContrato]);
  const precoDoItem = React.useMemo(() => new Map(itens.map((i) => [i.numeroItem, i.valorUnitario])), [itens]);
  const distribuicaoPorEmpenho = React.useMemo(() => new Map(distribuicoes.map((d) => [d.empenhoId, d])), [distribuicoes]);
  const faturas = faturasData?.faturas ?? [];
  const faturasDaNota = (numero: string) => faturas.filter((f) => empenhosDaFatura(f.empenhos).includes(numero));
  const linhas = useLinhasAbertas(abrirEmpenho, 'contract-financial-table', empenhosList.length > 0);

  const restaurar = (d: DescarteEmpenhoContrato) =>
    acoes.restaurar.mutate(d.empenhoId, {
      onSuccess: () => toast.success(`${d.numeroOficial || 'Empenho'} voltou para o contrato ${numeroContrato}.`),
      onError: (err: any) => toast.error(err?.message || 'Não foi possível restaurar o empenho.')
    });
  const desvincular = async (e: EmpenhoRow) => {
    if (!e.empenho_id) return;
    const ok = await confirm({
      title: 'Desvincular empenho',
      message: (
        <>
          O empenho <strong>{e.numero_oficial}</strong> foi vinculado à mão
          {e.vinculado_por_nome ? ` por ${e.vinculado_por_nome}` : ''} e sai deste contrato e das somas dele.
        </>
      ),
      confirmLabel: 'Desvincular',
      tone: 'danger'
    });
    if (!ok) return;
    acoes.desvincular.mutate(e.empenho_id, {
      onSuccess: () => toast.success(`${e.numero_oficial} desvinculado do contrato ${numeroContrato}.`),
      onError: (err: any) => toast.error(err?.message || 'Não foi possível desvincular o empenho.')
    });
  };
  const abrirVinculo = () => {
    acoes.vincular.reset();
    setVinculando(true);
  };
  const confirmarVinculo = (pedido: PedidoDeVinculo) =>
    acoes.vincular.mutate(pedido, {
      onSuccess: (r) => {
        setVinculando(false);
        toast.success(`${r.numeroOficial || 'Empenho'} vinculado ao contrato ${numeroContrato}${r.empenhoCriado ? ' (nota informada à mão)' : ''}.`);
      }
    });
  const abrirDistribuicao = (d: DistribuicaoDoEmpenho) => {
    acoesDistribuicao.vincular.reset();
    setDistribuindo(d);
  };
  const salvarDistribuicao = (quantidades: QuantidadeNoItem[], observacao: string) => {
    if (!distribuindo) return;
    const alvo = distribuindo;
    acoesDistribuicao.vincular.mutate(
      { contratoEmpenhoId: alvo.contratoEmpenhoId, itens: quantidades, observacao },
      {
        onSuccess: () => {
          setDistribuindo(null);
          toast.success(`${alvo.numeroOficial} vinculada a ${quantidades.length === 1 ? '1 item' : `${quantidades.length} itens`} do contrato.`);
        }
      }
    );
  };
  const informarQuantidade = (d: DistribuicaoDoEmpenho, numeroItem: number, quantidade: number | null) =>
    acoesDistribuicao.informar.mutate(
      { contratoEmpenhoId: d.contratoEmpenhoId, numeroItem, quantidade },
      {
        onSuccess: () =>
          toast.success(quantidade == null ? `${d.numeroOficial}: quantidade do item ${numeroItem} voltou à calculada.` : `${d.numeroOficial}: ${quantidade} un no item ${numeroItem}.`),
        onError: (err: any) => toast.error(err?.message || 'Não foi possível gravar a quantidade.')
      }
    );
  const conferirQuantidades = (d: DistribuicaoDoEmpenho) =>
    acoesDistribuicao.conferir.mutate(d.contratoEmpenhoId, {
      onSuccess: () => toast.success(`${d.numeroOficial}: quantidades conferidas.`),
      onError: (err: any) => toast.error(err?.message || 'Não foi possível registrar a conferência.')
    });
  const desfazerDistribuicao = async (d: DistribuicaoDoEmpenho) => {
    const ok = await confirm({
      title: 'Desfazer o vínculo aos itens',
      message: (
        <>
          A nota <strong>{d.numeroOficial}</strong> volta para "a vincular aos itens" e sai do empenhado dos itens até ser vinculada de novo.
        </>
      ),
      confirmLabel: 'Desfazer',
      tone: 'danger'
    });
    if (!ok) return;
    acoesDistribuicao.desfazer.mutate(d.contratoEmpenhoId, {
      onSuccess: () => toast.success(`Vínculo de ${d.numeroOficial} aos itens desfeito.`),
      onError: (err: any) => toast.error(err?.message || 'Não foi possível desfazer o vínculo aos itens.')
    });
  };

  const botaoVincular = podeEditar ? (
    <ActionButton action="vincular" label="Vincular empenho" size="sm" onClick={abrirVinculo} data-testid="contract-financial-vincular" />
  ) : null;

  // Modais e lista de descartados valem para a aba com ou sem empenhos vinculados.
  const extras = (
    <>
      <EmpenhosDescartados
        descartes={descartes}
        podeEditar={podeEditar}
        restaurando={acoes.restaurar.isPending ? acoes.restaurar.variables : undefined}
        onRestaurar={restaurar}
      />
      <VincularEmpenhoModal
        isOpen={vinculando}
        contrato={{ numero: numeroContrato, uasg: contract.uasg, fornecedorNome: contract.fornecedorNome, fornecedorCnpjCpf: contract.fornecedorCnpjCpf }}
        idsVinculados={new Set(empenhosList.map((e) => e.empenho_id).filter(Boolean) as string[])}
        isLoading={acoes.vincular.isPending}
        erro={acoes.vincular.error?.message}
        onVincular={confirmarVinculo}
        onFechar={() => setVinculando(false)}
      />
      <DistribuirEmpenhoModal
        distribuicao={distribuindo}
        numeroContrato={numeroContrato}
        itens={itens}
        empenhadoOutras={empenhadoPorItem(distribuicoes, itens, distribuindo?.contratoEmpenhoId)}
        isLoading={acoesDistribuicao.vincular.isPending}
        erro={acoesDistribuicao.vincular.error?.message}
        onSalvar={salvarDistribuicao}
        onFechar={() => setDistribuindo(null)}
      />
      {confirmDialog}
    </>
  );

  // Abrir o contrato só lê o que está gravado. Os empenhos são buscados nas bases oficiais pelo botão
  // "Atualizar empenhos" (no topo do contrato) ou pela atualização em lote da Execução Financeira.
  if (isLoading && empenhosList.length === 0) {
    return <DataTable columns={[]} data={[]} keyExtractor={() => ''} isLoading testId="contract-financial-loading" />;
  }

  if (isError && empenhosList.length === 0) {
    return (
      <ErrorState
        title="Indisponibilidade na consulta de dados financeiros"
        message="Não foi possível conectar aos serviços de consulta de empenhos oficiais neste momento. Isto não indica ausência de empenhos, mas uma indisponibilidade temporária de consulta."
        onRetry={() => refetch()}
        testId="contract-financial-error"
      />
    );
  }

  if (empenhosList.length === 0 || !financialSummary) {
    // Três casos diferentes: a fonte respondeu que não há empenho; a consulta falhou; nunca foi consultado.
    const vazio = sync?.situacao === 'SEM_EMPENHOS'
      ? {
          title: 'O Contratos.gov.br não tem empenho para este contrato',
          description: `Consulta feita em ${formatDataHora(sync.tentativaEm)}.${sync.mensagem ? ` ${sync.mensagem}` : ''} Use Atualizar empenhos, no topo, para consultar de novo.`
        }
      : ultimaTentativaFalhou(sync) && !sync?.ultimoSucessoEm
        ? {
            title: 'Os empenhos deste contrato não puderam ser consultados',
            description: `${sync?.mensagem || 'A fonte oficial não respondeu.'} Isto não indica ausência de empenhos. Use Atualizar empenhos, no topo, para tentar de novo.`
          }
        : {
            title: 'Nenhum empenho vinculado a este contrato',
            description: 'Nenhum empenho deste contrato está gravado no sistema. Use Atualizar empenhos, no topo, para buscar nas bases oficiais.'
          };
    const avisoFalha = ultimaTentativaFalhou(sync) && sync?.ultimoSucessoEm;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {avisoFalha && <SituacaoSincronizacaoEmpenhos sync={sync} />}
        <EmptyState
          icon={<Receipt size={28} />}
          title={vazio.title}
          description={vazio.description}
          action={
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'center' }}>
              <AppButton variant="outline" size="sm" icon={<ArrowRight size={14} />} onClick={() => navigate(empenhosUrl)}>
                Consultar em Empenhos
              </AppButton>
              {botaoVincular}
            </div>
          }
          testId="contract-financial-empty"
        />
        {extras}
      </div>
    );
  }

  const summary = financialSummary;
  const totalEmpenhado = summary.totalValorEmpenhadoGlobal;
  const totalLiquidado = summary.totalValorLiquidadoGlobal;
  const totalPago = summary.totalValorPagoGlobal;
  const pctPago = totalEmpenhado > 0 ? (totalPago / totalEmpenhado) * 100 : 0;
  const pctLiquidado = totalEmpenhado > 0 ? (totalLiquidado / totalEmpenhado) * 100 : 0;

  const distribuicaoDe = (e: EmpenhoRow) => (e.empenho_id ? distribuicaoPorEmpenho.get(e.empenho_id) : undefined);
  const chaveDaLinha = (e: EmpenhoRow, i: number) => e.numero_oficial || e.canonical_key || String(i);

  // NE que o Contratos.gov.br lista em mais de um contrato: o valor entra inteiro em cada um. Não há
  // rateio oficial; o aviso mostra quanto do total está nessas NEs.
  const compartilhadas = empenhosList.filter((e) => (e.outros_contratos?.length ?? 0) > 0);
  const valorCompartilhado = compartilhadas.reduce((acc, e) => acc + (e.valor_empenhado || 0), 0);
  // NE cujo credor é outra empresa: provável erro de vínculo na fonte.
  const divergentes = empenhosList.filter(credorDiverge);
  const valorDivergente = divergentes.reduce((acc, e) => acc + (e.valor_empenhado || 0), 0);
  const manuais = empenhosList.filter((e) => e.origem_vinculo === 'MANUAL');
  // Notas que ainda não entram no empenhado dos itens: a distribuir ou a rever.
  const listadas = new Set(empenhosList.map((e) => e.empenho_id).filter(Boolean));
  const aDistribuir = distribuicoes.filter((d) => listadas.has(d.empenhoId) && d.situacao === 'A_DISTRIBUIR');
  const aRever = distribuicoes.filter((d) => listadas.has(d.empenhoId) && d.situacao === 'REVISAR');
  const proximaADistribuir = [...aRever, ...aDistribuir][0];
  // Faturas que citam NE fora deste contrato (só depois de os empenhos terem sido consultados).
  const faturasComNeFora = sync?.ultimoSucessoEm ? faturas.filter((f) => f.empenhosSemVinculo > 0) : [];

  const columns: Column<EmpenhoRow>[] = [
    {
      key: 'numero',
      header: 'Empenho',
      sortValue: (e) => e.numero_oficial,
      priority: 'primary',
      render: (e) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
          <strong style={{ color: 'var(--primary)' }}>{e.numero_oficial || 'N/A'}</strong>
          {(e.outros_contratos?.length ?? 0) > 0 && (
            <span data-testid="contract-financial-ne-compartilhada" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              também em{' '}
              {e.outros_contratos!.map((k, i) => (
                <React.Fragment key={k}>
                  {i > 0 && ', '}
                  <AppButton variant="link" size="xs" type="button" onClick={() => navigate(`/contratos/${encodeURIComponent(k)}`)}>
                    {numeroDaChave(k)}
                  </AppButton>
                </React.Fragment>
              ))}
            </span>
          )}
        </div>
      )
    },
    {
      key: 'credor',
      header: 'Credor',
      sortValue: (e) => e.credor_nome,
      render: (e) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', alignItems: 'flex-start' }}>
          <span>{e.credor_nome || '—'}</span>
          {credorDiverge(e) && (
            <Tooltip content={COMO_CORRIGIR_NA_FONTE}>
              <span data-testid="contract-financial-credor-diverge">
                <StatusBadge label="Credor diferente do fornecedor" variant="warning" size="sm" dot={false} />
              </span>
            </Tooltip>
          )}
          {e.origem_vinculo === 'MANUAL' && (
            <Tooltip
              content={`Vinculado à mão${e.vinculado_por_nome ? ` por ${e.vinculado_por_nome}` : ''}${e.vinculado_em ? ` em ${formatDataHora(e.vinculado_em)}` : ''}${e.motivo_manual ? `: ${e.motivo_manual}` : ''}`}
            >
              <span data-testid="contract-financial-vinculo-manual">
                <StatusBadge label="Vinculado pela equipe" variant="info" size="sm" dot={false} />
              </span>
            </Tooltip>
          )}
        </div>
      )
    },
    { key: 'data', header: 'Emissão', sortValue: (e) => e.data_emissao, render: (e) => formatDate(e.data_emissao) },
    { key: 'empenhado', header: 'Empenhado', sortValue: (e) => e.valor_empenhado, sortFirstDir: 'desc', align: 'right', render: (e) => formatCurrency(e.valor_empenhado) },
    { key: 'liquidado', header: 'Liquidado', sortValue: (e) => e.valor_liquidado, sortFirstDir: 'desc', align: 'right', render: (e) => formatCurrency(e.valor_liquidado) },
    { key: 'pago', header: 'Pago', sortValue: (e) => e.valor_pago, sortFirstDir: 'desc', align: 'right', render: (e) => formatCurrency(e.valor_pago) },
    { key: 'saldo', header: 'Saldo a executar', sortValue: (e) => Math.max(0, e.valor_empenhado - e.valor_pago), sortFirstDir: 'desc', align: 'right', render: (e) => formatCurrency(Math.max(0, e.valor_empenhado - e.valor_pago)) },
    {
      key: 'itens',
      header: 'Itens do contrato',
      sortValue: (e) => distribuicaoDe(e)?.situacao,
      render: (e) => {
        const d = distribuicaoDe(e);
        if (!d) return <span style={{ color: 'var(--text-muted)' }}>—</span>;
        const r = rotuloDaSituacao(d);
        const fechada = d.situacao === 'DISTRIBUIDA';
        // Vinculada: cada item com a quantidade (informada ou calculada); avisos de quantidade a definir e valor mudou.
        const quantidades = fechada ? d.parcelas.map((p) => ({ p, q: quantidadeDaParcela(p, precoDoItem.get(p.numeroItem)) })) : [];
        const detalhe = fechada
          ? quantidades.map(({ p, q }) => `item ${p.numeroItem}${q != null ? ` · ${qtd(q)} un` : ''}`).join(', ')
          : d.situacao === 'A_DISTRIBUIR'
            ? sugestaoCurta(d.sugestaoTipo, d.sugestao)
            : d.situacao === 'REVISAR'
              ? 'item fora do contrato'
              : null;
        const algumaInformada = fechada && d.parcelas.some((p) => quantidadeFoiInformada(p, precoDoItem.get(p.numeroItem)));
        const aDefinir = quantidades.some(({ q }) => q == null || quantidadeQuebrada(q));
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', alignItems: 'flex-start' }} data-testid="contract-financial-situacao-itens">
            <span style={{ display: 'inline-flex', gap: '0.3rem', flexWrap: 'wrap' }}>
              <StatusBadge label={r.label} variant={r.variant} size="sm" dot={false} />
              {algumaInformada && <StatusBadge label="Informada" variant="info" size="sm" dot={false} />}
            </span>
            {detalhe && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{detalhe}</span>}
            {aDefinir && <span style={{ fontSize: '0.75rem', color: 'var(--warning)' }}>Quantidade a definir</span>}
            {fechada && d.motivoRevisao === 'VALOR_MUDOU' && <span style={{ fontSize: '0.75rem', color: 'var(--warning)' }}>Valor da nota mudou</span>}
          </div>
        );
      }
    }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <SummaryBar
        testId="contract-financial-summary"
        items={[
          { label: 'Empenhado', value: formatCurrency(totalEmpenhado), unit: '' },
          { label: 'Liquidado', value: `${formatCurrency(totalLiquidado)} (${pctLiquidado.toFixed(1)}%)`, unit: '' },
          { label: 'Pago', value: `${formatCurrency(totalPago)} (${pctPago.toFixed(1)}%)`, unit: '', tone: 'success' },
          { label: 'Saldo não executado', value: formatCurrency(summary.saldoNaoExecutadoGlobal), unit: '', tone: 'warning' }
        ]}
        progress={{ value: totalPago, max: totalEmpenhado, label: 'Pago do empenhado' }}
      >
        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
          A liquidar <strong>{formatCurrency(summary.saldoALiquidarGlobal)}</strong> · A pagar <strong>{formatCurrency(summary.saldoAPagarGlobal)}</strong>
        </span>
        <SituacaoSincronizacaoEmpenhos sync={sync} />
        {(aDistribuir.length > 0 || aRever.length > 0) && (
          <NoticeBar
            testId="contract-financial-a-distribuir"
            action={
              podeEditar && proximaADistribuir ? (
                <AppButton variant="outline" size="sm" onClick={() => abrirDistribuicao(proximaADistribuir)}>
                  Vincular a próxima aos itens
                </AppButton>
              ) : undefined
            }
          >
            {aDistribuir.length > 0 && (
              <>
                <strong>{aDistribuir.length}</strong>{' '}
                {aDistribuir.length === 1 ? 'nota ainda não foi vinculada' : 'notas ainda não foram vinculadas'} aos itens do contrato.{' '}
              </>
            )}
            {aRever.length > 0 && (
              <>
                <strong>{aRever.length}</strong> {aRever.length === 1 ? 'vínculo aos itens precisa' : 'vínculos aos itens precisam'} ser revisto
                {aRever.length === 1 ? '' : 's'}.{' '}
              </>
            )}
            Não entram no empenhado dos itens até serem vinculadas.
          </NoticeBar>
        )}
        {faturasComNeFora.length > 0 && (
          <NoticeBar
            tone="info"
            testId="contract-financial-fatura-ne-fora"
            action={
              onAbrirFatura ? (
                <AppButton variant="outline" size="sm" onClick={() => onAbrirFatura(faturasComNeFora[0].idFatura)}>
                  Ver a fatura
                </AppButton>
              ) : undefined
            }
          >
            {faturasComNeFora.length === 1 ? (
              <>
                A fatura <strong>{faturasComNeFora[0].numero || faturasComNeFora[0].idFatura}</strong> cita
              </>
            ) : (
              <>
                <strong>{faturasComNeFora.length}</strong> faturas citam
              </>
            )}{' '}
            empenho que não está vinculado a este contrato:{' '}
            <strong>{[...new Set(faturasComNeFora.flatMap((f) => empenhosDaFatura(f.empenhosSemVinculoNumeros)))].join(', ')}</strong>. Confira o
            contrato no Contratos.gov.br.
          </NoticeBar>
        )}
        {compartilhadas.length > 0 && (
          <NoticeBar tone="info" testId="contract-financial-compartilhadas">
            <strong>{compartilhadas.length}</strong>{' '}
            {compartilhadas.length === 1 ? 'empenho desta lista também está vinculado' : 'empenhos desta lista também estão vinculados'} a outro
            contrato, porque o Contratos.gov.br os lista nos dois. O valor{' '}
            {compartilhadas.length === 1 ? 'dele' : 'deles'}, <strong>{formatCurrency(valorCompartilhado)}</strong>, entra inteiro no total de
            cada contrato. Se algum não for deste contrato, retire-o no Contratos.gov.br.
          </NoticeBar>
        )}
        {divergentes.length > 0 && (
          <NoticeBar tone="warning" testId="contract-financial-credor-divergente">
            {divergentes.length === 1 ? 'O empenho' : 'Os empenhos'}{' '}
            <strong>{divergentes.map((e) => e.numero_oficial).join(', ')}</strong>{' '}
            {divergentes.length === 1 ? 'tem credor diferente' : 'têm credor diferente'} do fornecedor do contrato
            {contract.fornecedorNome ? ` (${contract.fornecedorNome})` : ''}: {formatCurrency(valorDivergente)} que podem estar no contrato
            errado no Contratos.gov.br. {COMO_CORRIGIR_NA_FONTE}
          </NoticeBar>
        )}
        {manuais.length > 0 && (
          <NoticeBar tone="info" testId="contract-financial-manuais">
            <strong>{manuais.length}</strong>{' '}
            {manuais.length === 1 ? 'empenho foi vinculado' : 'empenhos foram vinculados'} pela equipe, sem estar na lista do Contratos.gov.br
            para este contrato. A sincronização não {manuais.length === 1 ? 'o remove' : 'os remove'}.
          </NoticeBar>
        )}
      </SummaryBar>

      <div>
        <SectionHeader
          title="Notas de empenho do contrato"
          icon={<Layers size={16} />}
          countBadge={empenhosList.length}
          actions={botaoVincular}
        />
        <DataTable
          columns={columns}
          data={empenhosList}
          keyExtractor={chaveDaLinha}
          testId="contract-financial-table"
          // A setinha (ou o clique na linha) abre a divisão da nota entre os itens e as faturas que a citam.
          renderExpanded={(e) => (
            <EmpenhoDetalhe
              empenho={e}
              distribuicao={distribuicaoDe(e)}
              itens={itens}
              vinculoPorItem={vinculoPorItem}
              faturas={faturasDaNota(e.numero_oficial)}
              podeEditar={podeEditar}
              desfazendo={acoesDistribuicao.desfazer.isPending && acoesDistribuicao.desfazer.variables === distribuicaoDe(e)?.contratoEmpenhoId}
              gravando={
                (acoesDistribuicao.informar.isPending && acoesDistribuicao.informar.variables?.contratoEmpenhoId === distribuicaoDe(e)?.contratoEmpenhoId) ||
                (acoesDistribuicao.conferir.isPending && acoesDistribuicao.conferir.variables === distribuicaoDe(e)?.contratoEmpenhoId)
              }
              onDistribuir={abrirDistribuicao}
              onDesfazer={(d) => void desfazerDistribuicao(d)}
              onInformarQuantidade={informarQuantidade}
              onConferir={conferirQuantidades}
              onAbrirItem={(v) => navigate(`${buildAtaItemPath(v.numeroAta, v.uasgAta, v.numeroItem)}?aba=contratos`)}
              onAbrirFatura={onAbrirFatura}
            />
          )}
          expandedKeys={linhas.abertas}
          onToggleExpand={linhas.alternar}
          expandLabel={(e) => e.numero_oficial}
          rowActions={
            podeEditar
              ? (e) =>
                  // Só o vínculo feito à mão se desfaz aqui; o da fonte se corrige no Contratos.gov.br.
                  e.empenho_id && e.origem_vinculo === 'MANUAL' ? (
                    <ActionButton
                      action="desvincular"
                      iconOnly
                      size="sm"
                      label={`Desvincular ${e.numero_oficial}`}
                      onClick={() => desvincular(e)}
                      disabled={acoes.desvincular.isPending}
                      data-testid="contract-financial-desvincular"
                    />
                  ) : null
              : undefined
          }
        />
      </div>
      {extras}
    </div>
  );
};
