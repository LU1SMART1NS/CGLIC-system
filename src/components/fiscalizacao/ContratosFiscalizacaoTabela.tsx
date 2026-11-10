import React from 'react';
import { DataTable, type Column } from '../../design-system/components/DataTable';
import { StatusBadge, type StatusBadgeVariant } from '../../design-system/components/StatusBadge';
import { NumeroSeiEtiqueta } from '../../design-system/components/NumeroSeiEtiqueta';
import { carteiraDetalhe, carteiraIdentificacao, carteiraSubtitle, carteiraValor } from '../carteira/carteiraStyles';
import { useNavigateWithOrigin } from '../../hooks/useDetailOrigin';
import type { ContratoFiscalizacao } from '../../services/fiscalizacaoService';
import { ROTULO_SITUACAO, dataBR, numeroDoContrato, rotaDoContrato } from '../../utils/fiscalizacao';

const VARIANTE: Record<ContratoFiscalizacao['situacao'], StatusBadgeVariant> = { A_DEFINIR: 'warning', SFC: 'info', MISTA: 'purple', AREA: 'neutral', AREA_PADRAO: 'neutral' };

export const CelulaContrato: React.FC<{ c: ContratoFiscalizacao }> = ({ c }) => (
  <>
    <span style={carteiraIdentificacao}>{numeroDoContrato(c)}</span>
    <div style={carteiraSubtitle}>{c.fornecedor ?? '—'}</div>
  </>
);

export const CelulaOrigem: React.FC<{ c: ContratoFiscalizacao }> = ({ c }) =>
  c.emendas.length > 0 ? (
    <>
      <span style={carteiraValor}>{c.emendas.length === 1 ? 'Emenda' : 'Emendas'} {c.emendas.slice(0, 3).join(', ')}{c.emendas.length > 3 ? ` +${c.emendas.length - 3}` : ''}</span>
      <div style={carteiraDetalhe}>assinado em {dataBR(c.assinatura)}</div>
    </>
  ) : (
    <>
      <span style={carteiraValor}>Sem emenda</span>
      <div style={carteiraDetalhe}>assinado em {dataBR(c.assinatura)}</div>
    </>
  );

export const CelulaSituacao: React.FC<{ c: ContratoFiscalizacao }> = ({ c }) => (
  <>
    <StatusBadge label={ROTULO_SITUACAO[c.situacao]} variant={VARIANTE[c.situacao]} size="sm" dot={false} />
    {c.situacao === 'AREA_PADRAO' && <div style={carteiraDetalhe}>padrão: contrato sem emenda</div>}
    {c.situacao === 'A_DEFINIR' && <div style={carteiraDetalhe}>de emenda: sugestão SFC/CGLIC</div>}
    {c.motivo && <div style={carteiraDetalhe} title={c.motivo}>{c.motivo.length > 60 ? `${c.motivo.slice(0, 60)}…` : c.motivo}</div>}
  </>
);

export const CelulaFiscal: React.FC<{ c: ContratoFiscalizacao }> = ({ c }) =>
  c.fiscalNome ? (
    <>
      <span style={carteiraValor}>{c.fiscalNome}</span>
      {c.substitutoNome && <div style={carteiraDetalhe}>substituto: {c.substitutoNome}</div>}
    </>
  ) : (
    <span style={carteiraDetalhe}>—</span>
  );

export const CelulaProcesso: React.FC<{ c: ContratoFiscalizacao }> = ({ c }) =>
  c.processoSei ? (
    <>
      <NumeroSeiEtiqueta numero={c.processoSei} testId={`fisc-processo-${c.contractKey}`} />
      <div style={carteiraDetalhe}>autuado em {dataBR(c.autuadoEm)}</div>
    </>
  ) : c.situacao === 'SFC' || c.situacao === 'MISTA' ? (
    <StatusBadge label="A autuar" variant="warning" size="sm" dot={false} />
  ) : (
    <span style={carteiraDetalhe}>—</span>
  );

/** Contratos com a SFC/CGLIC: a linha abre o Contrato 360 na aba Fiscalização. */
export const ContratosFiscalizacaoTabela: React.FC<{
  contratos: ContratoFiscalizacao[];
  testId: string;
  comOrigem?: boolean;
  rowActions?: (c: ContratoFiscalizacao) => React.ReactNode;
}> = ({ contratos, testId, comOrigem = true, rowActions }) => {
  const navigate = useNavigateWithOrigin();
  const colunas: Column<ContratoFiscalizacao>[] = [
    { key: 'contrato', header: 'Contrato', minWidth: '200px', render: (c) => <CelulaContrato c={c} /> },
    ...(comOrigem ? [{ key: 'origem', header: 'Origem', minWidth: '160px', render: (c: ContratoFiscalizacao) => <CelulaOrigem c={c} /> }] : []),
    { key: 'situacao', header: 'Fiscalização', minWidth: '150px', render: (c) => <CelulaSituacao c={c} /> },
    { key: 'fiscal', header: 'Fiscal SFC/CGLIC', render: (c) => <CelulaFiscal c={c} /> },
    { key: 'processo', header: 'Processo', render: (c) => <CelulaProcesso c={c} /> },
    { key: 'vigencia', header: 'Vigência', nowrap: true, render: (c) => <span style={carteiraValor}>{dataBR(c.vigenciaFim)}</span> }
  ];
  return (
    <DataTable<ContratoFiscalizacao>
      testId={testId}
      className="data-table-container--flush"
      data={contratos}
      keyExtractor={(c) => c.contractKey}
      columns={colunas}
      rowOpen={(c) => () => navigate(rotaDoContrato(c))}
      rowActions={rowActions}
    />
  );
};
