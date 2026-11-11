import React from 'react';
import { DataTable, type Column } from '../../design-system/components/DataTable';
import { StatusBadge, type StatusBadgeVariant } from '../../design-system/components/StatusBadge';
import { NumeroSeiEtiqueta } from '../../design-system/components/NumeroSeiEtiqueta';
import { SkeletonLoader } from '../../design-system/components/SkeletonLoader';
import { ErrorState } from '../../design-system/components/ErrorState';
import { carteiraDetalhe, carteiraIdentificacao, carteiraNumero, carteiraSubtitle, carteiraValor } from '../carteira/carteiraStyles';
import { useMovimentosDaEntrega } from '../../hooks/useFiscalizacao';
import type { EntregaFiscalizacao } from '../../services/fiscalizacaoService';
import { NOME_SFC, dataBR } from '../../utils/fiscalizacao';
import { etapaDef, nomeDoItem, prazoDaEntrega, rotuloDoBeneficiario, type FaseEntrega } from '../../utils/fiscalizacaoEntregas';

const VARIANTE_DA_FASE: Record<FaseEntrega, StatusBadgeVariant> = { PREPARACAO: 'neutral', EXECUCAO: 'info', RECEBIMENTO: 'warning', PAGAMENTO: 'success', FINALIZADO: 'success' };
const COR_DO_PRAZO = { danger: 'var(--color-danger-text)', warning: 'var(--color-warning-text)', success: 'var(--color-success-text)', neutral: '#64748b' } as const;

export const CelulaEtapa: React.FC<{ e: EntregaFiscalizacao }> = ({ e }) => {
  if (e.responsavel === 'AREA') {
    return (
      <>
        <StatusBadge label="Área requisitante" variant="neutral" size="sm" dot={false} />
        <div style={carteiraDetalhe}>sem acompanhamento da {NOME_SFC}</div>
      </>
    );
  }
  const d = etapaDef(e.etapa);
  return (
    <>
      <StatusBadge label={d.nome} variant={e.etapa === 'CONTROLADO' ? 'danger' : VARIANTE_DA_FASE[d.fase]} size="sm" dot={false} />
      {e.etapaEm && <div style={carteiraDetalhe}>desde {dataBR(e.etapaEm)}</div>}
      {e.pagoEm ? <div style={carteiraDetalhe}>pago em {dataBR(e.pagoEm)}</div> : e.faturadoEm ? <div style={carteiraDetalhe}>faturado em {dataBR(e.faturadoEm)}</div> : null}
    </>
  );
};

export const CelulaPrazo: React.FC<{ e: EntregaFiscalizacao }> = ({ e }) => {
  const p = prazoDaEntrega(e);
  if (e.responsavel === 'AREA') return <span style={carteiraDetalhe}>—</span>;
  return (
    <>
      <span style={{ ...carteiraValor, color: COR_DO_PRAZO[p.tom], whiteSpace: 'nowrap' }}>{p.texto}</span>
      <div style={carteiraDetalhe}>{e.entregueEm ? `entregue em ${dataBR(e.entregueEm)}` : e.prevista ? `prevista ${dataBR(e.prevista)}` : 'sem data prevista'}</div>
    </>
  );
};

export const CelulaBeneficiario: React.FC<{ e: EntregaFiscalizacao }> = ({ e }) => {
  const r = rotuloDoBeneficiario(e);
  return (
    <>
      <span style={carteiraValor}>{r.principal}</span>
      <div style={carteiraDetalhe}>{[r.detalhe, e.municipio && e.uf ? `${e.municipio}/${e.uf}` : e.uf].filter(Boolean).join(' · ')}</div>
    </>
  );
};

/** Histórico da entrega (linha aberta): etapas, divisões, data prevista e quem fiscaliza. */
export const HistoricoDaEntrega: React.FC<{ entregaId: string }> = ({ entregaId }) => {
  const { data, isLoading, isError, refetch } = useMovimentosDaEntrega(entregaId);
  if (isLoading) return <SkeletonLoader variant="text" count={2} testId={`fisc-historico-${entregaId}-carregando`} />;
  if (isError) return <ErrorState title="Não foi possível carregar o histórico" onRetry={() => refetch()} testId={`fisc-historico-${entregaId}-erro`} />;
  const itens = data ?? [];
  if (itens.length === 0) return <span style={carteiraDetalhe}>Sem registros.</span>;
  return (
    <ul style={{ margin: 0, padding: '0.25rem 0 0.25rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.8rem' }} data-testid={`fisc-historico-${entregaId}`}>
      {itens.map((m) => (
        <li key={m.id}>
          <b>{m.etapa ? etapaDef(m.etapa).nome : m.tipo === 'DIVISAO' ? 'Divisão' : m.tipo === 'PREVISTA' ? `Data prevista: ${dataBR(m.data)}` : m.tipo === 'RESPONSAVEL' ? 'Quem fiscaliza' : 'Registro'}</b>
          {m.etapa && m.data && <span> em {dataBR(m.data)}</span>}
          {m.documentoSei && (
            <span style={{ marginLeft: '0.4rem' }}>
              <NumeroSeiEtiqueta numero={m.documentoSei} testId={`fisc-historico-sei-${m.id}`} />
            </span>
          )}
          {m.observacao && <span style={carteiraDetalhe}> · {m.observacao}</span>}
          <span style={carteiraDetalhe}> · {m.criadoPorNome ?? 'Sistema'}, {dataBR(m.criadoEm)}</span>
        </li>
      ))}
    </ul>
  );
};

/**
 * Tabela de entregas. Com `selecao`, a primeira coluna marca as linhas para agir em lote (Contrato 360); com
 * `comContrato`, mostra o contrato e a linha abre o Contrato 360 (Fiscalização › Entregas).
 */
export const EntregasTabela: React.FC<{
  entregas: EntregaFiscalizacao[];
  testId: string;
  comContrato?: boolean;
  selecao?: { marcadas: ReadonlySet<string>; alternar: (id: string) => void };
  abrir?: (e: EntregaFiscalizacao) => void;
  abertas?: ReadonlySet<string>;
  alternarAberta?: (id: string) => void;
}> = ({ entregas, testId, comContrato = false, selecao, abrir, abertas, alternarAberta }) => {
  const colunas: Column<EntregaFiscalizacao>[] = [
    ...(selecao
      ? [
          {
            key: 'sel',
            header: '',
            width: '36px',
            render: (e: EntregaFiscalizacao) => (
              <input
                type="checkbox"
                checked={selecao.marcadas.has(e.id)}
                onChange={() => selecao.alternar(e.id)}
                aria-label={`Marcar ${nomeDoItem(e)} para ${rotuloDoBeneficiario(e).principal}`}
                style={{ accentColor: 'var(--primary)', width: 16, height: 16 }}
                data-testid={`${testId}-marcar-${e.id}`}
              />
            )
          }
        ]
      : []),
    ...(comContrato
      ? [
          {
            key: 'contrato',
            header: 'Contrato',
            minWidth: '170px',
            render: (e: EntregaFiscalizacao) => (
              <>
                <span style={carteiraIdentificacao}>{e.contratoNumero}</span>
                <div style={carteiraSubtitle}>{e.fornecedor ?? '—'}</div>
                {e.fiscalNome && <div style={carteiraDetalhe}>{e.fiscalNome}</div>}
              </>
            )
          }
        ]
      : []),
    { key: 'item', header: 'Item', minWidth: '200px', render: (e) => <span style={carteiraValor}>{nomeDoItem(e)}</span> },
    { key: 'beneficiario', header: 'Beneficiário', minWidth: '170px', render: (e) => <CelulaBeneficiario e={e} /> },
    {
      key: 'quantidade',
      header: 'Qtd.',
      align: 'right',
      render: (e) => (
        <>
          <span style={{ ...carteiraValor, ...carteiraNumero }}>{e.quantidade.toLocaleString('pt-BR')}</span>
          {e.divididaDe && <div style={carteiraDetalhe}>entrega parcial</div>}
        </>
      )
    },
    { key: 'origem', header: 'Origem', render: (e) => (e.emenda ? <span style={carteiraValor}>Emenda {e.emenda}</span> : <span style={carteiraDetalhe}>Sem emenda</span>) },
    { key: 'etapa', header: 'Etapa', minWidth: '170px', render: (e) => <CelulaEtapa e={e} /> },
    { key: 'prazo', header: 'Prazo', render: (e) => <CelulaPrazo e={e} /> }
  ];
  return (
    <DataTable<EntregaFiscalizacao>
      testId={testId}
      className="data-table-container--flush"
      data={entregas}
      keyExtractor={(e) => e.id}
      columns={colunas}
      rowOpen={abrir ? (e) => () => abrir(e) : undefined}
      rowStyle={(e) => (selecao?.marcadas.has(e.id) ? { background: 'var(--color-info-bg)' } : e.responsavel === 'AREA' ? { opacity: 0.8 } : undefined)}
      renderExpanded={alternarAberta ? (e) => <HistoricoDaEntrega entregaId={e.id} /> : undefined}
      expandedKeys={abertas}
      onToggleExpand={alternarAberta}
      expandLabel={() => 'Histórico'}
      emptyMessage="Nenhuma entrega."
    />
  );
};
