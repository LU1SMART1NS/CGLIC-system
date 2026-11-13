import React from 'react';
import { DataTable, type Column } from '../../design-system/components/DataTable';
import { StatusBadge, type StatusBadgeVariant } from '../../design-system/components/StatusBadge';
import { NumeroSeiEtiqueta } from '../../design-system/components/NumeroSeiEtiqueta';
import { carteiraDetalhe, carteiraFornecedor, carteiraIdentificacao, carteiraValor } from '../carteira/carteiraStyles';
import { CarteiraIdLink } from '../carteira/CarteiraRowLink';
import { CarteiraNovoBadge } from '../carteira/CarteiraNovoBadge';
import { contratoEhNovo } from '../carteira/carteiraNovidade';
import { useNavigateWithOrigin } from '../../hooks/useDetailOrigin';
import { SELECIONADA_BG } from '../atas/distribuicao/DistribuicaoSelecao';
import type { ContratoFiscalizacao } from '../../services/fiscalizacaoService';
import { NOME_SFC, ROTULO_SITUACAO, comArea, dataBR, numeroDoContrato, rotaDoContrato, unidadeDaArea, unidadeSugerida } from '../../utils/fiscalizacao';

const VARIANTE: Record<ContratoFiscalizacao['situacao'], StatusBadgeVariant> = { A_DEFINIR: 'warning', SFC: 'info', MISTA: 'purple', AREA: 'neutral', AREA_PADRAO: 'neutral' };

/**
 * Identificação do contrato no padrão da Carteira › Contratos: número em azul, etiqueta Novo (assinado há até 45 dias),
 * "· Ata …" e o fornecedor em maiúsculas, com o nome inteiro ao passar o mouse.
 */
export const IdentificacaoDoContrato: React.FC<{ numero: string; fornecedor: string | null; assinatura?: string | null; atas?: string[]; onAbrir?: () => void; testId?: string }> = ({ numero, fornecedor, assinatura, atas = [], onAbrir, testId }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.15rem', minWidth: 0 }}>
    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.35rem', flexWrap: 'wrap' }}>
      {onAbrir ? (
        <CarteiraIdLink onClick={onAbrir} label={`Ver detalhes do contrato ${numero}`} testId={testId}>
          {numero}
        </CarteiraIdLink>
      ) : (
        <span style={carteiraIdentificacao}>{numero}</span>
      )}
      {assinatura && contratoEhNovo({ dataAssinatura: assinatura, dataVigenciaInicio: null } as never) && <CarteiraNovoBadge genero="m" />}
      {atas.length > 0 && (
        <>
          <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>·</span>
          <span title={atas.length === 1 ? undefined : `Atas: ${atas.join(', ')}`} style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 700 }}>
            {atas.length === 1 ? `Ata ${atas[0]}` : `${atas.length} atas`}
          </span>
        </>
      )}
    </div>
    {fornecedor && <div title={fornecedor} style={carteiraFornecedor}>{fornecedor}</div>}
  </div>
);

export const CelulaContrato: React.FC<{ c: ContratoFiscalizacao; onAbrir?: () => void }> = ({ c, onAbrir }) => (
  <IdentificacaoDoContrato numero={numeroDoContrato(c)} fornecedor={c.fornecedor} assinatura={c.assinatura} atas={c.atas} onAbrir={onAbrir} testId={`fisc-contrato-${c.contractKey}`} />
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

/** Unidade interna da área requisitante, embaixo da situação: indicada, da divisão do contrato ou a indicar. */
/**
 * Contrato só com a área requisitante: a sigla da unidade no lugar da etiqueta (a origem já diz se é de emenda).
 * Sem unidade, a etiqueta "Unidade a indicar". A sugestão pela divisão do contrato fica no title.
 */
const CelulaDaArea: React.FC<{ c: ContratoFiscalizacao }> = ({ c }) => {
  const u = unidadeDaArea(c);
  return (
    <div data-testid={`fisc-unidade-${c.contractKey}`}>
      {u ? (
        <span style={carteiraValor} title={unidadeSugerida(c) ? 'Unidade pela divisão do contrato por unidade interna' : undefined}>{u}</span>
      ) : (
        <StatusBadge label="Unidade a indicar" variant="warning" size="sm" dot={false} />
      )}
    </div>
  );
};

/** Motivo da decisão do coordenador, cortado em 60 letras (o texto inteiro no title). */
const Motivo: React.FC<{ c: ContratoFiscalizacao }> = ({ c }) =>
  c.motivo ? <div style={carteiraDetalhe} title={c.motivo}>{c.motivo.length > 60 ? `${c.motivo.slice(0, 60)}…` : c.motivo}</div> : null;

export const CelulaSituacao: React.FC<{ c: ContratoFiscalizacao }> = ({ c }) => {
  const motivo = <Motivo c={c} />;
  if (comArea(c) && c.situacao !== 'MISTA') return <><CelulaDaArea c={c} />{motivo}</>;
  const parte = c.situacao === 'MISTA' ? unidadeDaArea(c) : null;
  return (
    <>
      <StatusBadge label={ROTULO_SITUACAO[c.situacao]} variant={VARIANTE[c.situacao]} size="sm" dot={false} />
      {c.situacao === 'MISTA' && <div style={carteiraDetalhe}>{parte ? `parte com a ${parte}` : 'parte da área: unidade a indicar'}</div>}
      {c.situacao === 'A_DEFINIR' && <div style={carteiraDetalhe}>sugestão {NOME_SFC}</div>}
      {motivo}
    </>
  );
};

export const CelulaFiscal: React.FC<{ c: ContratoFiscalizacao }> = ({ c }) =>
  c.fiscalNome ? (
    <span style={carteiraValor}>{c.fiscalNome}</span>
  ) : (
    <span style={carteiraDetalhe}>—</span>
  );

export const CelulaProcesso: React.FC<{ c: ContratoFiscalizacao }> = ({ c }) =>
  c.processoNup ? (
    <>
      <NumeroSeiEtiqueta numero={c.processoNup} testId={`fisc-processo-${c.contractKey}`} />
      <div style={carteiraDetalhe}>autuado em {dataBR(c.processoAutuadoEm)}</div>
    </>
  ) : c.situacao === 'SFC' || c.situacao === 'MISTA' ? (
    <>
      <StatusBadge label="A autuar" variant="warning" size="sm" dot={false} />
      {c.processoSei && <div style={carteiraDetalhe}>SEI do contrato {c.processoSei}</div>}
    </>
  ) : (
    <span style={carteiraDetalhe}>—</span>
  );

/** Caixas de marcar na primeira coluna (Equipe: transferir só os marcados). */
export interface SelecaoDeContratos {
  selecionadas: Set<string>;
  onAlternar: (contractKey: string) => void;
}

/** Colunas que a Distribuição tira numa aba em que repetiriam o mesmo valor ou viriam vazias em todas as linhas. */
export interface ColunasOcultas {
  situacao?: boolean;
  fiscal?: boolean;
  processo?: boolean;
}

/** Contratos com a SFC/CGLIC: a linha abre o Contrato 360 na aba Fiscalização. */
export const ContratosFiscalizacaoTabela: React.FC<{
  contratos: ContratoFiscalizacao[];
  testId: string;
  comOrigem?: boolean;
  rowActions?: (c: ContratoFiscalizacao) => React.ReactNode;
  selecao?: SelecaoDeContratos;
  ocultas?: ColunasOcultas;
  /** Título da coluna Fiscalização (ex.: "Unidade da área" na aba Área requisitante). */
  rotuloSituacao?: string;
}> = ({ contratos, testId, comOrigem = false, rowActions, selecao, ocultas = {}, rotuloSituacao = 'Fiscalização' }) => {
  const navigate = useNavigateWithOrigin();
  // Sem a coluna Fiscalização, o motivo vai para o fiscal ou, sem fiscal, para a origem.
  const motivoNoFiscal = Boolean(ocultas.situacao) && !ocultas.fiscal;
  const motivoNaOrigem = Boolean(ocultas.situacao) && Boolean(ocultas.fiscal) && comOrigem;
  const colunas: Column<ContratoFiscalizacao>[] = [
    ...(selecao
      ? [
          {
            key: 'selecao',
            header: '',
            width: '36px',
            render: (c: ContratoFiscalizacao) => (
              <input
                type="checkbox"
                checked={selecao.selecionadas.has(c.contractKey)}
                onChange={() => selecao.onAlternar(c.contractKey)}
                aria-label={`Selecionar o contrato ${numeroDoContrato(c)}`}
                data-testid={`${testId}-marcar-${c.contractKey}`}
                style={{ width: '15px', height: '15px', cursor: 'pointer', accentColor: 'var(--primary)' }}
              />
            )
          }
        ]
      : []),
    { key: 'contrato', header: 'Contrato', minWidth: '200px', sortValue: (c) => `${c.numero.split('/')[1] ?? ''}-${c.numero.split('/')[0]?.padStart(6, '0')}`, render: (c) => <CelulaContrato c={c} onAbrir={() => navigate(rotaDoContrato(c))} /> },
    ...(comOrigem ? [{ key: 'origem', header: 'Origem', minWidth: '160px', render: (c: ContratoFiscalizacao) => <><CelulaOrigem c={c} />{motivoNaOrigem && <Motivo c={c} />}</> }] : []),
    ...(ocultas.situacao ? [] : [{ key: 'situacao', header: rotuloSituacao, minWidth: '150px', render: (c: ContratoFiscalizacao) => <CelulaSituacao c={c} /> }]),
    ...(ocultas.fiscal
      ? []
      : [{ key: 'fiscal', header: 'Fiscal SFC/CGLIC', sortValue: (c: ContratoFiscalizacao) => c.fiscalNome, render: (c: ContratoFiscalizacao) => <><CelulaFiscal c={c} />{motivoNoFiscal && <Motivo c={c} />}</> }]),
    ...(ocultas.processo ? [] : [{ key: 'processo', header: 'Processo SEI', render: (c: ContratoFiscalizacao) => <CelulaProcesso c={c} /> }]),
    { key: 'vigencia', header: 'Vigência', nowrap: true, sortValue: (c) => c.vigenciaFim, render: (c) => <span style={carteiraValor}>{dataBR(c.vigenciaFim)}</span> }
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
      rowStyle={selecao ? (c) => (selecao.selecionadas.has(c.contractKey) ? { background: SELECIONADA_BG } : undefined) : undefined}
    />
  );
};
