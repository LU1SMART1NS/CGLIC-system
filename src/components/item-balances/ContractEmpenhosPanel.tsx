import React from 'react';
import { AppButton, DataTable, NoticeBar, StatusBadge, type Column } from '../../design-system';
import { formatCurrency, formatNumber } from './itemBalanceUtils';
import type { ExecucaoNoContrato, ParcelaDoItem } from '../../utils/empenhoDoItem';
import type { DistribuicaoDoEmpenho } from '../../services/distribuicaoEmpenhoService';
import { textoDaSugestao } from '../../utils/distribuicaoEmpenho';
import { AvisoQuantidade, CampoQuantidadeNota } from './CampoQuantidadeNota';

export interface AllocationOption {
  id: string;
  unitName: string;
  saldoQty: number;
}

/** Unidade que recebeu parte deste contrato no item (migration 103). */
export interface UnidadeDoContrato {
  id: string;
  unitName: string;
  /** Quanto do contrato, neste item, é da unidade. */
  contratado: number;
}

interface ContractEmpenhosPanelProps {
  /** Número do item (o mesmo na ata e no contrato), para destacar a sugestão "deste item". */
  numeroItem: number;
  /** Quantidade do item no contrato segundo a API; nula enquanto não lida. */
  contratado: number | null;
  /** Parcelas deste item e notas a vincular deste contrato. */
  execucao: ExecucaoNoContrato | undefined;
  loading: boolean;
  canLinkEmpenhos: boolean;
  allocationOptions: AllocationOption[];
  /**
   * Unidades deste contrato no item. Uma só: a nota herda a unidade, sem escolha. Várias: a escolha fica entre elas,
   * até o contratado de cada uma neste contrato. Nenhuma (contrato sem divisão): escolhe entre todas as alocadas.
   */
  unidadesDoContrato?: UnidadeDoContrato[];
  /** Id da unidade interna a que a nota (pelo número) está ligada. */
  linkedAllocationId: (numeroEmpenho: string) => string;
  onLinkAllocation: (numeroEmpenho: string, allocationId: string) => void;
  /** Gestor e coordenador: abre a janela "Vincular aos itens" da nota. */
  onVincularAosItens?: (nota: DistribuicaoDoEmpenho) => void;
  /**
   * Gestor e coordenador: grava a quantidade da nota neste item (nula = volta à calculada pelo valor). `sairDaUnidade`
   * = id da unidade ligada à mão em que a nova quantidade não cabe (a tela tira a nota de lá depois de gravar).
   */
  onInformarQuantidade?: (p: ParcelaDoItem, quantidade: number | null, sairDaUnidade: string | null) => void;
  /** Gestor e coordenador: confirma as quantidades depois que o valor da nota mudou. */
  onConferirQuantidades?: (p: ParcelaDoItem) => void;
  /** Nota cuja quantidade está sendo gravada. */
  gravandoQuantidade?: string | null;
  busy: boolean;
}

const dataBR = (iso?: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');
const subtle: React.CSSProperties = { fontSize: '0.75rem', color: 'var(--text-muted)' };
const rotulo: React.CSSProperties = { fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' };

/** Sugestão da nota com "deste item" no lugar do número deste item. */
function sugestaoParaEsteItem(d: DistribuicaoDoEmpenho, numeroItem: number): string {
  const texto = textoDaSugestao(d.sugestaoTipo, d.sugestao);
  if (!texto) return 'sem sugestão';
  return texto.replace(new RegExp(`do item ${numeroItem}(?!\\d)`, 'g'), 'deste item');
}

/**
 * Notas de UM contrato para este item: as que já foram vinculadas a ele (parcela, quantidade e unidade interna) e as
 * do contrato que ainda faltam vincular aos itens. A quantidade é a informada pelo gestor
 * (inteira, editável aqui), senão a parcela ÷ preço do item no contrato (migration 104).
 */
export const ContractEmpenhosPanel: React.FC<ContractEmpenhosPanelProps> = ({
  numeroItem,
  contratado,
  execucao,
  loading,
  canLinkEmpenhos,
  allocationOptions,
  unidadesDoContrato = [],
  linkedAllocationId,
  onLinkAllocation,
  onVincularAosItens,
  onInformarQuantidade,
  onConferirQuantidades,
  gravandoQuantidade,
  busy
}) => {
  const parcelas = execucao?.parcelas ?? [];
  const aVincular = [...(execucao?.aVincular ?? []), ...(execucao?.deOutroItem ?? [])];
  const deOutro = new Set((execucao?.deOutroItem ?? []).map((d) => d.contratoEmpenhoId));
  const empenhado = execucao?.empenhado ?? 0;
  const aEmpenhar = contratado != null ? contratado - empenhado : null;

  // Unidade de cada nota: a ligada à mão ou, sem ela, a herdada do contrato de uma unidade só.
  const herdadaId = unidadesDoContrato.length === 1 ? unidadesDoContrato[0].id : '';
  const unidadeEfetiva = (numero: string) => linkedAllocationId(numero) || herdadaId;
  // Empenhado de cada unidade neste contrato (para o saldo das opções quando o contrato foi dividido).
  const empenhadoNoContrato = new Map<string, number>();
  for (const p of parcelas) {
    const id = unidadeEfetiva(p.numeroOficial);
    if (id && p.quantidade != null) empenhadoNoContrato.set(id, (empenhadoNoContrato.get(id) ?? 0) + p.quantidade);
  }
  const idsDoContrato = new Set(unidadesDoContrato.map((u) => u.id));
  const comValorMudou = parcelas.filter((p) => p.valorMudou);

  // Unidade ligada à mão em que a nova quantidade não cabe (a nota sai dela depois de gravar).
  const unidadeQueNaoCabe = (p: ParcelaDoItem, nova: number): string | null => {
    const atual = linkedAllocationId(p.numeroOficial);
    if (!atual) return null;
    const antiga = p.quantidade ?? 0;
    if (unidadesDoContrato.length > 1 && idsDoContrato.has(atual)) {
      const u = unidadesDoContrato.find((x) => x.id === atual)!;
      const saldo = u.contratado - (empenhadoNoContrato.get(atual) ?? 0) + antiga;
      return saldo >= nova ? null : atual;
    }
    const a = allocationOptions.find((x) => x.id === atual);
    if (!a) return null;
    return a.saldoQty + antiga >= nova ? null : atual;
  };

  const colunasParcelas: Column<ParcelaDoItem>[] = [
    {
      key: 'empenho',
      header: 'Empenho',
      sortValue: (p) => p.numeroOficial,
      render: (p) => (
        <>
          <span style={{ fontWeight: 700, fontFamily: 'monospace', color: 'var(--primary)' }}>{p.numeroOficial}</span>
          <div style={subtle}>
            {p.uasgEmitente ? `UASG ${p.uasgEmitente}` : ''}
            {p.dataEmissao ? ` · ${dataBR(p.dataEmissao)}` : ''}
          </div>
        </>
      )
    },
    {
      key: 'qtd',
      header: 'Quantidade',
      align: 'right',
      sortValue: (p) => p.quantidade,
      sortFirstDir: 'desc',
      render: (p) => (
        <>
          {onInformarQuantidade ? (
            <CampoQuantidadeNota
              quantidade={p.quantidade}
              calculada={p.quantidadeCalculada}
              informada={p.informada}
              podeVoltarACalculada={p.valor != null}
              disabled={busy || gravandoQuantidade === p.contratoEmpenhoId}
              ariaLabel={`Quantidade da nota ${p.numeroOficial} neste item`}
              testId={`quantidade-nota-${p.numeroOficial}`}
              onGravar={(q) => onInformarQuantidade(p, q, q == null ? null : unidadeQueNaoCabe(p, q))}
            />
          ) : p.quantidade != null ? (
            <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>
              {p.informada && <StatusBadge label="Informada" variant="info" size="sm" dot={false} />} {formatNumber(p.quantidade)} un
            </span>
          ) : (
            <span style={subtle} title="O item não tem preço unitário no contrato (ex.: serviço) e a quantidade não foi informada">
              a definir
            </span>
          )}
          <AvisoQuantidade quantidade={p.quantidade} testId={`quantidade-a-definir-${p.numeroOficial}`} />
        </>
      )
    },
    {
      key: 'vinculo',
      header: 'Vínculo',
      render: (p) => (
        <>
          <StatusBadge label={p.origem === 'AUTO' ? 'Vinculada automaticamente' : 'Vinculada'} variant="success" size="sm" dot={false} />
          {p.origem === 'USUARIO' && (
            <div style={subtle}>
              por {p.vinculadaPorNome || 'usuário'}
              {p.vinculadaEm ? ` em ${dataBR(p.vinculadaEm)}` : ''}
            </div>
          )}
        </>
      )
    },
    {
      key: 'unidade',
      header: 'Unidade interna',
      render: (p) => {
        if (allocationOptions.length === 0) return <span style={subtle}>Sem unidades alocadas</span>;
        const current = linkedAllocationId(p.numeroOficial);
        // Contrato de uma unidade só: a nota herda a unidade, sem escolha (a menos que esteja ligada à mão a outra).
        if (unidadesDoContrato.length === 1 && p.quantidade != null && (!current || current === herdadaId)) {
          return (
            <span data-testid={`unidade-herdada-${p.numeroOficial}`}>
              <strong>{unidadesDoContrato[0].unitName}</strong>{' '}
              {!current && <StatusBadge label="do contrato" variant="info" size="sm" dot={false} />}
              {!current && <div style={subtle}>herdada: o contrato é só da {unidadesDoContrato[0].unitName}</div>}
            </span>
          );
        }
        const semQuantidade = p.quantidade == null;
        const estilo: React.CSSProperties = {
          padding: '0.2rem 0.4rem',
          fontSize: '0.75rem',
          height: 'auto',
          width: '100%',
          maxWidth: '220px',
          borderColor: current ? 'var(--primary)' : '#cbd5e1',
          background: current ? 'var(--color-info-bg)' : '#ffffff'
        };
        // A nota só vai para uma unidade depois de ter quantidade neste item, e só para uma unidade onde ela cabe.
        if (semQuantidade) {
          return (
            <select
              disabled
              className="form-input"
              aria-label={`Unidade interna da nota ${p.numeroOficial}`}
              title="A unidade interna só pode ser escolhida depois que a quantidade da nota neste item estiver definida."
              style={{ ...estilo, borderColor: '#cbd5e1', background: '#f1f5f9' }}
            >
              <option value="">Defina a quantidade primeiro</option>
            </select>
          );
        }
        const quantidade = p.quantidade ?? 0;
        // Contrato dividido entre várias unidades: só elas, até o contratado de cada uma neste contrato.
        if (unidadesDoContrato.length > 1) {
          const fora = current && !idsDoContrato.has(current);
          return (
            <>
              <select
                value={current}
                onChange={(e) => onLinkAllocation(p.numeroOficial, e.target.value)}
                disabled={busy || !canLinkEmpenhos}
                className="form-input"
                aria-label={`Unidade interna da nota ${p.numeroOficial}`}
                title={canLinkEmpenhos ? undefined : 'Só o gestor e o coordenador escolhem a unidade interna da nota.'}
                style={{ ...estilo, borderColor: fora ? 'var(--danger)' : estilo.borderColor }}
              >
                <option value="">Sem unidade</option>
                {unidadesDoContrato.map((u) => {
                  // Saldo da unidade neste contrato: o contratado dela menos o já empenhado por ela (sem esta nota).
                  const saldoNoContrato = u.contratado - (empenhadoNoContrato.get(u.id) ?? 0);
                  const cabe = saldoNoContrato + (u.id === current ? quantidade : 0) >= quantidade;
                  return (
                    <option key={u.id} value={u.id} disabled={!cabe && u.id !== current} title={`Contratado ${formatNumber(u.contratado)} un neste contrato`}>
                      {u.unitName} (saldo {formatNumber(saldoNoContrato)} un{cabe ? '' : ' · não cabe'})
                    </option>
                  );
                })}
                {fora && <option value={current}>{allocationOptions.find((a) => a.id === current)?.unitName ?? 'unidade'} (fora do contrato)</option>}
              </select>
              {fora && <div style={{ ...subtle, color: 'var(--danger)' }}>a unidade escolhida não está no contrato: confira</div>}
            </>
          );
        }
        return (
          <select
            value={current}
            onChange={(e) => onLinkAllocation(p.numeroOficial, e.target.value)}
            disabled={busy || !canLinkEmpenhos}
            className="form-input"
            aria-label={`Unidade interna da nota ${p.numeroOficial}`}
            title={canLinkEmpenhos ? undefined : 'Só o gestor e o coordenador escolhem a unidade interna da nota.'}
            style={estilo}
          >
            <option value="">Sem unidade</option>
            {allocationOptions.map((a) => {
              // O saldo da unidade já desconta esta nota quando ela está ligada a ela.
              const cabe = a.saldoQty + (a.id === current ? quantidade : 0) >= quantidade;
              return (
                <option key={a.id} value={a.id} disabled={!cabe && a.id !== current}>
                  {a.unitName} (saldo {formatNumber(a.saldoQty)} un{cabe ? '' : ' · não cabe'})
                </option>
              );
            })}
          </select>
        );
      }
    }
  ];

  const colunasAVincular: Column<DistribuicaoDoEmpenho>[] = [
    {
      key: 'empenho',
      header: 'Empenho',
      sortValue: (d) => d.numeroOficial,
      render: (d) => (
        <>
          <span style={{ fontWeight: 700, fontFamily: 'monospace', color: 'var(--primary)' }}>{d.numeroOficial}</span>
          {d.dataEmissao && <div style={subtle}>{dataBR(d.dataEmissao)}</div>}
        </>
      )
    },
    {
      key: 'sugestao',
      header: 'Sugestão',
      render: (d) => (
        <span style={{ fontSize: '0.8rem' }}>
          {deOutro.has(d.contratoEmpenhoId) && <StatusBadge label="outro item" variant="neutral" size="sm" dot={false} />} {sugestaoParaEsteItem(d, numeroItem)}
        </span>
      )
    },
    {
      key: 'situacao',
      header: 'Situação',
      render: (d) => <StatusBadge label={d.situacao === 'REVISAR' ? 'Revisar' : 'A vincular'} variant={d.situacao === 'REVISAR' ? 'danger' : 'warning'} size="sm" dot={false} />
    }
  ];

  return (
    <div data-testid="contract-empenhos-panel" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', fontSize: '0.8rem' }}>
        <span>
          Contratado: <strong>{contratado != null ? formatNumber(contratado) : 'N/D'}</strong>
        </span>
        <span>
          Empenhado: <strong>{formatNumber(empenhado)}</strong>
        </span>
        <span>
          A empenhar:{' '}
          <strong style={{ color: aEmpenhar != null && aEmpenhar < 0 ? 'var(--danger)' : undefined }}>{aEmpenhar != null ? formatNumber(aEmpenhar) : 'N/D'}</strong>
        </span>
      </div>

      {contratado != null && empenhado > contratado + 1e-6 && (
        <NoticeBar tone="warning" testId="contract-empenhos-acima-do-contratado">
          As quantidades das notas somam {formatNumber(empenhado)} un e passam do contratado ({formatNumber(contratado)} un). Confira a base do contrato
          antes de seguir.
        </NoticeBar>
      )}

      {comValorMudou.length > 0 && (
        <NoticeBar tone="warning" testId="contract-empenhos-valor-mudou">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            {comValorMudou.map((p) => (
              <span key={p.contratoEmpenhoId}>
                O valor da nota <strong>{p.numeroOficial}</strong> mudou de {formatCurrency(p.valorMudou!.antes)} para {formatCurrency(p.valorMudou!.agora)}{' '}
                depois do vínculo. A quantidade continua contando; confira se ainda está certa.{' '}
                {onConferirQuantidades && (
                  <AppButton variant="link" size="xs" type="button" onClick={() => onConferirQuantidades(p)} disabled={busy} data-testid={`conferir-${p.numeroOficial}`}>
                    Quantidade conferida
                  </AppButton>
                )}
              </span>
            ))}
          </div>
        </NoticeBar>
      )}

      {execucao?.semItens && (
        <NoticeBar tone="info" testId="contract-empenhos-sem-itens">
          Este contrato não tem itens na fonte oficial: as notas ({formatCurrency(execucao.valorSemDivisao)}) ficam no contrato inteiro, sem divisão por item,
          e não contam no empenhado deste item.
        </NoticeBar>
      )}

      <div style={rotulo}>Notas vinculadas a este item</div>
      <DataTable
        columns={colunasParcelas}
        data={parcelas}
        keyExtractor={(p) => p.contratoEmpenhoId}
        isLoading={loading}
        emptyMessage="Nenhuma nota deste contrato foi vinculada a este item ainda."
        testId="contract-empenhos-table"
      />

      {aVincular.length > 0 && (
        <>
          <div style={rotulo}>Notas do contrato ainda a vincular aos itens</div>
          <DataTable
            columns={colunasAVincular}
            data={aVincular}
            keyExtractor={(d) => d.contratoEmpenhoId}
            testId="contract-empenhos-a-vincular"
            rowActions={
              onVincularAosItens
                ? (d) => (
                    <AppButton variant={deOutro.has(d.contratoEmpenhoId) ? 'outline' : 'primary'} size="sm" onClick={() => onVincularAosItens(d)} disabled={busy}>
                      Vincular aos itens
                    </AppButton>
                  )
                : undefined
            }
          />
        </>
      )}
    </div>
  );
};
