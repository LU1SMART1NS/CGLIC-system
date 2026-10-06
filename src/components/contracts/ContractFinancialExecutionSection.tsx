import React from 'react';
import { useNavigateWithOrigin } from '../../hooks/useDetailOrigin';
import { ArrowRight, Ban, Layers, Receipt } from 'lucide-react';
import { useContractEmpenhoItemLinks } from '../../hooks/useContractEmpenhoItemLinks';
import { buildAtaItemPath } from '../../hooks/useAta';
import { formatItemKeyLabel, parseItemKey } from '../../utils/itemKeyParts';
import { numeroDaChave } from '../../utils/contractKeyUtils';
import type { ContractEmpenhoItemLink } from '../../services/contractEmpenhoItemLinksService';
import type { ContractDashboardRecord } from '../../types';
import { useContractFinancialSummary } from '../../hooks/useContractFinancialSummary';
import { useSincronizacaoEmpenhosContrato } from '../../hooks/useSincronizacaoEmpenhosContrato';
import type { SincronizacaoEmpenhosContrato } from '../../services/contratoEmpenhosSincronizacaoService';
import { CarteiraIdLink } from '../carteira/CarteiraRowLink';
import { useAuth } from '../../context/AuthContext';
import { useAcoesVinculoEmpenho, useDescartesEmpenhoContrato } from '../../hooks/useVinculoEmpenhosContrato';
import type { DescarteEmpenhoContrato } from '../../services/contratoEmpenhoVinculoService';
import { credorDiferenteDoFornecedor } from '../../utils/fornecedorMatch';
import { DescartarEmpenhoModal, VincularEmpenhoModal, type EmpenhoParaDescartar, type PedidoDeVinculo } from './EmpenhoVinculoModals';
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

/** Situação da quantidade do empenho nos itens da ata: pendente se algum item ainda espera confirmação. */
function quantidadeEstado(links: ContractEmpenhoItemLink[]): { label: string; variant: 'success' | 'info' | 'warning' } {
  if (links.some((l) => l.quantidade == null)) return { label: 'Pendente', variant: 'warning' };
  if (links.every((l) => l.fonte !== 'USUARIO')) return { label: 'Oficial', variant: 'success' };
  return { label: 'Confirmada', variant: 'info' };
}

function itemPath(itemKey: string): string | null {
  const p = parseItemKey(itemKey);
  return p ? `${buildAtaItemPath(p.numeroAta, p.uasg, parseInt(p.numeroItem, 10))}?aba=contratos` : null;
}

/** Empenhos que a equipe tirou do contrato, com motivo, autor e o botão de restaurar. */
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
        subtitle="O Contratos.gov.br lista estes empenhos no contrato, mas a equipe disse que não são dele. Ficam fora das somas e a sincronização não os coloca de volta."
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

export const ContractFinancialExecutionSection: React.FC<ContractFinancialExecutionSectionProps> = ({
  contract,
  contractKey
}) => {
  const navigate = useNavigateWithOrigin();
  const { data: itemLinks = [] } = useContractEmpenhoItemLinks(contractKey);
  const linksByEmpenho = new Map<string, ContractEmpenhoItemLink[]>();
  for (const l of itemLinks) linksByEmpenho.set(l.empenhoId, [...(linksByEmpenho.get(l.empenhoId) ?? []), l]);
  const pendentes = itemLinks.filter((l) => l.quantidade == null);
  const empenhosUrl = `/empenhos?contractKey=${encodeURIComponent(contractKey)}`;

  // Empenhos de Contratos.gov/Compras.gov + v_empenhos_resumo, deduplicados por canonical_key
  const { empenhosList, summary: financialSummary, isLoading, isError, refetch } = useContractFinancialSummary(contract, contractKey);
  // Quando e com que resultado os empenhos deste contrato foram consultados nas fontes oficiais.
  const { data: sync } = useSincronizacaoEmpenhosContrato(contractKey);

  // Vínculo híbrido (migration 85): a fonte vincula; a equipe descarta o que está errado e vincula o que falta.
  const { role } = useAuth();
  const podeEditar = role === 'admin' || role === 'gestor';
  const toast = useToast();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const { data: descartes = [] } = useDescartesEmpenhoContrato(contractKey);
  const acoes = useAcoesVinculoEmpenho(contractKey);
  const [descartando, setDescartando] = React.useState<EmpenhoParaDescartar | null>(null);
  const [motivoSugerido, setMotivoSugerido] = React.useState<string | undefined>();
  const [vinculando, setVinculando] = React.useState(false);
  const numeroContrato = contract.numero || numeroDaChave(contractKey);
  const fornecedor = { cnpj: contract.fornecedorCnpjCpf, nome: contract.fornecedorNome };
  const credorDiverge = (e: EmpenhoRow) => credorDiferenteDoFornecedor({ cnpj: e.credor_cnpj_cpf, nome: e.credor_nome }, fornecedor);

  const abrirDescarte = (e: EmpenhoRow) => {
    if (!e.empenho_id) return;
    acoes.descartar.reset();
    setMotivoSugerido(
      credorDiverge(e)
        ? `O credor (${e.credor_nome || 'outra empresa'}) não é o fornecedor do contrato (${contract.fornecedorNome || 'fornecedor'}).`
        : undefined
    );
    setDescartando({ empenhoId: e.empenho_id, numero: e.numero_oficial, credorNome: e.credor_nome, valorEmpenhado: e.valor_empenhado });
  };
  const confirmarDescarte = (motivo: string) => {
    if (!descartando) return;
    const numero = descartando.numero;
    acoes.descartar.mutate(
      { empenhoId: descartando.empenhoId, motivo },
      {
        onSuccess: () => {
          setDescartando(null);
          toast.success(`${numero} saiu do contrato ${numeroContrato}.`);
        }
      }
    );
  };
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
      <DescartarEmpenhoModal
        empenho={descartando}
        numeroContrato={numeroContrato}
        motivoSugerido={motivoSugerido}
        isLoading={acoes.descartar.isPending}
        erro={acoes.descartar.error?.message}
        onConfirmar={confirmarDescarte}
        onFechar={() => setDescartando(null)}
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

  const linksOf = (e: EmpenhoRow) => (e.empenho_id ? linksByEmpenho.get(e.empenho_id) ?? [] : []);

  // NE que o Contratos.gov.br lista em mais de um contrato: o valor entra inteiro em cada um. Não há
  // rateio oficial; o aviso mostra quanto do total está nessas NEs.
  const compartilhadas = empenhosList.filter((e) => (e.outros_contratos?.length ?? 0) > 0);
  const valorCompartilhado = compartilhadas.reduce((acc, e) => acc + (e.valor_empenhado || 0), 0);
  // NE cujo credor é outra empresa: provável erro de vínculo na fonte.
  const divergentes = empenhosList.filter(credorDiverge);
  const valorDivergente = divergentes.reduce((acc, e) => acc + (e.valor_empenhado || 0), 0);
  const manuais = empenhosList.filter((e) => e.origem_vinculo === 'MANUAL');

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
            <span data-testid="contract-financial-credor-diverge">
              <StatusBadge label="Credor diferente do fornecedor" variant="warning" size="sm" dot={false} />
            </span>
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
      key: 'item',
      header: 'Item da ata',
      render: (e) => {
        const links = linksOf(e);
        if (links.length === 0) return <span style={{ color: 'var(--text-muted)' }}>—</span>;
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
            {links.map((l) => {
              const path = itemPath(l.itemKey);
              return path ? (
                <CarteiraIdLink key={l.itemKey} onClick={() => navigate(path)} label={`Abrir ${formatItemKeyLabel(l.itemKey)}`} title="Abrir o item na ata">
                  {formatItemKeyLabel(l.itemKey)}
                </CarteiraIdLink>
              ) : (
                <span key={l.itemKey}>{formatItemKeyLabel(l.itemKey)}</span>
              );
            })}
          </div>
        );
      }
    },
    {
      key: 'quantidade',
      header: 'Quantidade',
      render: (e) => {
        const links = linksOf(e);
        if (links.length === 0) return <span style={{ color: 'var(--text-muted)' }}>—</span>;
        const estado = quantidadeEstado(links);
        return <StatusBadge label={estado.label} variant={estado.variant} size="sm" dot={false} />;
      }
    }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <SituacaoSincronizacaoEmpenhos sync={sync} />
      {compartilhadas.length > 0 && (
        <NoticeBar tone="info" testId="contract-financial-compartilhadas">
          <strong>{compartilhadas.length}</strong>{' '}
          {compartilhadas.length === 1 ? 'empenho desta lista também está vinculado' : 'empenhos desta lista também estão vinculados'} a outro
          contrato, porque o Contratos.gov.br os lista nos dois. O valor{' '}
          {compartilhadas.length === 1 ? 'dele' : 'deles'}, <strong>{formatCurrency(valorCompartilhado)}</strong>, entra inteiro no total de
          cada contrato.
        </NoticeBar>
      )}
      {divergentes.length > 0 && (
        <NoticeBar tone="warning" testId="contract-financial-credor-divergente">
          {divergentes.length === 1 ? 'O empenho' : 'Os empenhos'}{' '}
          <strong>{divergentes.map((e) => e.numero_oficial).join(', ')}</strong>{' '}
          {divergentes.length === 1 ? 'tem credor diferente' : 'têm credor diferente'} do fornecedor do contrato
          {contract.fornecedorNome ? ` (${contract.fornecedorNome})` : ''}: {formatCurrency(valorDivergente)} que podem estar no contrato
          errado no Contratos.gov.br.{' '}
          {podeEditar
            ? 'Confira e, se não for deste contrato, use Não é deste contrato na linha.'
            : 'Um gestor pode conferir e tirar o empenho do contrato.'}
        </NoticeBar>
      )}
      {manuais.length > 0 && (
        <NoticeBar tone="info" testId="contract-financial-manuais">
          <strong>{manuais.length}</strong>{' '}
          {manuais.length === 1 ? 'empenho foi vinculado' : 'empenhos foram vinculados'} pela equipe, sem estar na lista do Contratos.gov.br
          para este contrato. A sincronização não {manuais.length === 1 ? 'o remove' : 'os remove'}.
        </NoticeBar>
      )}
      {pendentes.length > 0 && (
        <NoticeBar testId="contract-financial-pending">
          <strong>{pendentes.length}</strong>{' '}
          {pendentes.length === 1 ? 'empenho com quantidade pendente' : 'empenhos com quantidade pendente'} de confirmação no item da ata. Clique na linha para abrir o item.
        </NoticeBar>
      )}
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
      </SummaryBar>

      <div>
        <SectionHeader
          title="Notas de empenho vinculadas"
          icon={<Layers size={16} />}
          countBadge={empenhosList.length}
          actions={botaoVincular}
        />
        <DataTable
          columns={columns}
          data={empenhosList}
          keyExtractor={(e, i) => e.canonical_key || e.numero_oficial || String(i)}
          testId="contract-financial-table"
          // A linha abre o item da ata do empenho (o que espera confirmação primeiro).
          rowOpen={(e) => {
            const links = linksOf(e);
            const alvo = links.find((l) => l.quantidade == null) ?? links[0];
            const path = alvo ? itemPath(alvo.itemKey) : null;
            return path ? () => navigate(path) : null;
          }}
          rowActions={
            podeEditar
              ? (e) =>
                  !e.empenho_id ? null : e.origem_vinculo === 'MANUAL' ? (
                    <ActionButton
                      action="desvincular"
                      iconOnly
                      size="sm"
                      label={`Desvincular ${e.numero_oficial}`}
                      onClick={() => desvincular(e)}
                      disabled={acoes.desvincular.isPending}
                      data-testid="contract-financial-desvincular"
                    />
                  ) : (
                    <ActionButton
                      action="descartar"
                      iconOnly
                      size="sm"
                      label={`${e.numero_oficial} não é deste contrato`}
                      onClick={() => abrirDescarte(e)}
                      data-testid="contract-financial-descartar"
                    />
                  )
              : undefined
          }
        />
      </div>
      {extras}
    </div>
  );
};
