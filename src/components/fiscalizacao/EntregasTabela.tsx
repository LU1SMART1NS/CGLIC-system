import React from 'react';
import { DataTable, type Column } from '../../design-system/components/DataTable';
import { StatusBadge, type StatusBadgeVariant } from '../../design-system/components/StatusBadge';
import { NumeroSeiEtiqueta } from '../../design-system/components/NumeroSeiEtiqueta';
import { SkeletonLoader } from '../../design-system/components/SkeletonLoader';
import { ErrorState } from '../../design-system/components/ErrorState';
import { carteiraIdentificacao, carteiraDetalhe, carteiraNumero, carteiraValor } from '../carteira/carteiraStyles';
import { useMovimentosDaEntrega } from '../../hooks/useFiscalizacao';
import type { EntregaFiscalizacao } from '../../services/fiscalizacaoService';
import { NOME_SFC, dataBR } from '../../utils/fiscalizacao';
import { ataEItemDaChave, etapaDef, nomeDoItem, prazoDaEntrega, rotuloDoBeneficiario, textoDoAviso, type FaseEntrega } from '../../utils/fiscalizacaoEntregas';
import { IdentificacaoDoContrato } from './ContratosFiscalizacaoTabela';
import { NomeComSigla } from '../emendas/emendasPartes';
import { chaveDeOrdem, ordemDaSituacao } from '../../utils/fiscalizacaoResumo';

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
  if (e.aviso)
    return (
      <>
        <StatusBadge label={e.aviso.tipo === 'ITEM_CANCELADO' ? 'empenho anulado' : 'nota em outro contrato'} variant="danger" size="sm" dot={false} />
        <div style={carteiraDetalhe}>{textoDoAviso(e.aviso)}</div>
      </>
    );
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

/**
 * Situação do item numa coluna só (etapa + o que importa do prazo), para não haver duas datas que parecem se
 * contradizer: entregue mostra a data da entrega (e o atraso); a entregar mostra o prazo e a data prevista; sem data
 * prevista, há quanto tempo está na etapa.
 */
/** Etapa numa linha só, para listas apertadas (Item 360 › Emendas): a etiqueta da etapa e, se houver, o atraso. */
export const EtapaEmLinha: React.FC<{ e: EntregaFiscalizacao }> = ({ e }) => {
  if (e.responsavel === 'AREA') return <StatusBadge label="Área requisitante" variant="neutral" size="sm" dot={false} />;
  const d = etapaDef(e.etapa);
  const p = prazoDaEntrega(e);
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
      <StatusBadge label={d.nome} variant={e.etapa === 'CONTROLADO' ? 'danger' : VARIANTE_DA_FASE[d.fase]} size="sm" dot={false} />
      {!e.entregueEm && p.tom === 'danger' && <span style={{ color: COR_DO_PRAZO.danger, fontWeight: 700, fontSize: '0.78rem' }}>{p.texto.toLowerCase()}</span>}
    </span>
  );
};

export const CelulaSituacaoDoItem: React.FC<{ e: EntregaFiscalizacao }> = ({ e }) => {
  if (e.responsavel === 'AREA') return <CelulaEtapa e={e} />;
  const d = etapaDef(e.etapa);
  const p = prazoDaEntrega(e);
  const dias = (a: string, b: string) => Math.round((Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 864e5);
  const atraso = e.entregueEm && e.prevista && e.entregueEm > e.prevista ? dias(e.entregueEm, e.prevista) : 0;
  return (
    <>
      <StatusBadge label={d.nome} variant={e.etapa === 'CONTROLADO' ? 'danger' : VARIANTE_DA_FASE[d.fase]} size="sm" dot={false} />
      <div style={{ ...carteiraDetalhe, whiteSpace: 'nowrap' }}>
        {e.entregueEm ? (
          <>
            entregue em {dataBR(e.entregueEm)}
            {atraso > 0 && <span style={{ color: COR_DO_PRAZO.warning }}> · {atraso} {atraso === 1 ? 'dia' : 'dias'} de atraso</span>}
            {e.pagoEm && <> · pago em {dataBR(e.pagoEm)}</>}
          </>
        ) : e.prevista ? (
          <>
            <span style={{ color: COR_DO_PRAZO[p.tom], fontWeight: p.tom === 'danger' || p.tom === 'warning' ? 700 : 400 }}>{p.texto}</span> · prevista {dataBR(e.prevista)}
          </>
        ) : (
          <>sem data prevista{e.etapaEm ? ` · nesta etapa desde ${dataBR(e.etapaEm)}` : ''}</>
        )}
      </div>
    </>
  );
};

/**
 * Beneficiário como no Pedido 360 (NomeComSigla): nome por extenso com "· SIGLA" ao lado, até duas linhas, e CNPJ e
 * razão social ao passar o mouse; embaixo, a cidade/UF de entrega. Sem cadastro: o nome da planilha e a etiqueta.
 */
export const CelulaBeneficiario: React.FC<{ e: EntregaFiscalizacao; destaque?: boolean }> = ({ e, destaque }) =>
  e.beneficiarioNome ? (
    <>
      <NomeComSigla b={{ nome: e.beneficiarioNome, sigla: e.beneficiarioSigla, razaoSocial: e.beneficiarioRazao } as never} destaque={destaque} />
      {(e.municipio || e.uf) && <div style={carteiraDetalhe}>{e.municipio && e.uf ? `${e.municipio}/${e.uf}` : e.uf}</div>}
    </>
  ) : (
    <>
      <span style={destaque ? carteiraIdentificacao : carteiraValor}>{e.beneficiarioTexto ?? 'Beneficiário a informar'}</span>
      <div style={{ marginTop: '0.2rem' }}><StatusBadge label="Sem cadastro" variant="warning" size="sm" dot={false} /></div>
    </>
  );

/**
 * Item como nos "Itens por ata" do Pedido 360: o número do item em azul com a ata ao lado, e embaixo o nome (nome curto
 * da CAEP; sem ele, a descrição da ata), com a descrição inteira ao passar o mouse. Item da planilha ainda sem ligação
 * com a ata mostra o nome escrito na planilha.
 */
export const CelulaItem: React.FC<{ e: EntregaFiscalizacao; comOrigem?: boolean }> = ({ e, comOrigem }) => {
  const k = ataEItemDaChave(e.itemKey);
  return (
    <div style={{ minWidth: 0 }} title={e.itemDescricao ?? undefined}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.35rem', flexWrap: 'wrap' }}>
        {k ? (
          <>
            <span style={carteiraIdentificacao}>{k.item}</span>
            <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 700 }}>· Ata {k.ata}</span>
          </>
        ) : (
          <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 700 }}>da planilha · sem item da ata</span>
        )}
      </div>
      <div style={{ ...carteiraValor, color: '#0f172a' }}>{nomeDoItem(e)}</div>
      {comOrigem && (e.emenda || e.programaTexto) && <div style={carteiraDetalhe}>{e.emenda ? `Emenda ${e.emenda}` : e.programaTexto}</div>}
    </div>
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
          {m.tipo === 'VOLTA' && m.etapa ? (
            <b style={{ color: 'var(--color-danger-text)' }}>Voltou para {etapaDef(m.etapa).nome}</b>
          ) : m.tipo === 'DESFEITO' && m.etapa ? (
            <b style={{ textDecoration: 'line-through', color: '#94a3b8' }}>{etapaDef(m.etapa).nome}</b>
          ) : <b>{m.etapa ? etapaDef(m.etapa).nome : m.tipo === 'DIVISAO' ? 'Divisão' : m.tipo === 'PREVISTA' ? `Data prevista: ${dataBR(m.data)}` : m.tipo === 'RESPONSAVEL' ? 'Quem fiscaliza' : m.tipo === 'ITEM' ? 'Item da ata' : m.tipo === 'BENEFICIARIO' ? 'Beneficiário' : m.tipo === 'PROGRAMA' ? 'Programa' : 'Registro'}</b>}
          {m.tipo === 'DESFEITO' && <span style={carteiraDetalhe}> (desfeito)</span>}
          {m.tipo === 'CORRECAO' && <span style={carteiraDetalhe}> (correção do coordenador)</span>}
          {m.etapa && m.data && m.tipo !== 'VOLTA' && <span> em {dataBR(m.data)}</span>}
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
  /** Na tela do beneficiário, a coluna Beneficiário repetiria o título. */
  semBeneficiario?: boolean;
  selecao?: { marcadas: ReadonlySet<string>; alternar: (id: string) => void };
  abrir?: (e: EntregaFiscalizacao) => void;
  abertas?: ReadonlySet<string>;
  alternarAberta?: (id: string) => void;
}> = ({ entregas, testId, comContrato = false, semBeneficiario = false, selecao, abrir, abertas, alternarAberta }) => {
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
    { key: 'item', header: 'Item', minWidth: '230px', sortValue: (e) => nomeDoItem(e), priority: 'primary', render: (e) => <CelulaItem e={e} comOrigem /> },
    ...(semBeneficiario ? [] : [{ key: 'beneficiario', header: 'Beneficiário', minWidth: '170px', sortValue: (e: EntregaFiscalizacao) => e.beneficiarioNome ?? e.beneficiarioTexto, render: (e: EntregaFiscalizacao) => <CelulaBeneficiario e={e} /> }]),
    ...(comContrato
      ? [
          {
            key: 'contrato',
            header: 'Contrato',
            minWidth: '200px',
            sortValue: (e: EntregaFiscalizacao) => chaveDeOrdem(e.contratoNumero),
            render: (e: EntregaFiscalizacao) => <IdentificacaoDoContrato numero={e.contratoNumero} fornecedor={e.fornecedor} />
          }
        ]
      : []),
    {
      key: 'quantidade',
      header: 'Qtd.',
      align: 'right',
      sortValue: (e) => e.quantidade,
      sortFirstDir: 'desc',
      render: (e) => (
        <>
          <span style={{ ...carteiraValor, ...carteiraNumero }}>{e.quantidade.toLocaleString('pt-BR')}</span>
          {e.divididaDe && <div style={carteiraDetalhe}>entrega parcial</div>}
        </>
      )
    },
    { key: 'etapa', header: 'Etapa', minWidth: '210px', sortValue: (e) => ordemDaSituacao(e), render: (e) => <CelulaSituacaoDoItem e={e} /> }
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
      emptyMessage="Nenhum item."
    />
  );
};
