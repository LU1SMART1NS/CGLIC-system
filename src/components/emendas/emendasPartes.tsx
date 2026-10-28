import React from 'react';
import { Link } from 'react-router-dom';
import { buildAtaItemPath, buildAtaPath } from '../../hooks/useAta';
import { StatusBadge } from '../../design-system/components/StatusBadge';
import { SummaryBar } from '../../design-system/components/SummaryBar';
import { InfoHint } from '../../design-system/components/InfoHint';
import { carteiraDescricaoItem, carteiraDetalhe, carteiraFornecedor, carteiraIdentificacao, carteiraNumero, carteiraSubtitle, carteiraValor } from '../carteira/carteiraStyles';
import { CarteiraPrazoPill } from '../carteira/CarteiraPrazoPill';
import { classifyPrazo } from '../carteira/carteiraPrazo';
import { dataBR, diasEntre } from '../../utils/emendasKits';
import { AUTOR_A_DEFINIR, chaveDoContratoDaEmenda, ORDEM_SITUACAO_LINHA, ROTULO_MOTIVO_SEM_NOTA, ROTULO_REGRA_DA_NOTA, type ExecucaoDoPedido, type SituacaoDaLinha } from '../../utils/emendasPedidos';
import { numeroDaChave } from '../../utils/contractKeyUtils';
import { formatCurrency } from '../../utils/format';
import { descricaoItemEmFrase } from '../../utils/textCase';
import { formatarCnpj, localDoBeneficiario, type AutorEmenda, type BeneficiarioEmenda, type ItemCaep, type LinhaPedido, type NotaDaLinha } from '../../services/emendasService';
import { NumeroSeiEtiqueta } from '../../design-system/components/NumeroSeiEtiqueta';

const TIPO: Record<AutorEmenda['tipo'], string> = { DEPUTADO: 'Deputado', SENADOR: 'Senador', BANCADA: 'Bancada' };

/** "Deputado · PL · RJ": a segunda linha do parlamentar em todas as telas. */
export const linhaDoAutor = (autor: AutorEmenda): string => [TIPO[autor.tipo], autor.partido, autor.uf].filter(Boolean).join(' · ');

/**
 * Autor em duas linhas: nome e "Deputado · PL · RJ". Sem autor (reserva para um órgão, migration 163): "Parlamentar a
 * definir" e, embaixo, para qual órgão a CAEP separou.
 */
/** Mesma largura da coluna do parlamentar em todas as tabelas de Emendas (o navegador não estica conforme as outras colunas). */
export const LARGURA_AUTOR = '240px';

export const AutorDoPedido: React.FC<{ autor: AutorEmenda | undefined; autorId: string | null; orgao?: string | null; destaque?: boolean }> = ({ autor, autorId, orgao, destaque }) => {
  // Como coluna de identificação (destaque): nome forte e azul e a 2ª linha da Ata; nas outras colunas, valor e detalhe.
  const nome: React.CSSProperties = destaque ? carteiraIdentificacao : carteiraValor;
  const segunda: React.CSSProperties = destaque ? { ...carteiraSubtitle, marginTop: '0.15rem' } : carteiraDetalhe;
  if (!autorId)
    return (
      <>
        <div style={{ ...nome, color: 'var(--color-warning-text)' }}>{AUTOR_A_DEFINIR}</div>
        <div style={segunda}>{orgao ? `Reserva para ${orgao}` : 'Reserva para um órgão'}</div>
      </>
    );
  return (
    <>
      <div style={nome}>{autor?.nome ?? autorId}</div>
      {autor && <div style={segunda}>{[TIPO[autor.tipo], autor.partido, autor.uf].filter(Boolean).join(' · ')}</div>}
    </>
  );
};

const ataEmCinza: React.CSSProperties = { fontSize: '0.75rem', color: '#64748b', fontWeight: 700 };

/**
 * Célula do item igual à Carteira de Itens: "00001 · Ata 00031/2025" e a descrição em até 2 linhas. Com `comLinks`, o
 * número do item abre o Item 360 na aba Emendas e o da ata abre a Ata 360 (o clique não abre a linha da tabela).
 */
export const ItemDaAta: React.FC<{
  item: (Pick<ItemCaep, 'numeroAta' | 'numeroItem' | 'descricao' | 'codigoUasg'> & Partial<Pick<ItemCaep, 'nomeCurto'>>) | null | undefined;
  semItem?: string;
  extra?: React.ReactNode;
  comLinks?: boolean;
  /** Mostra o nome curto da CAEP (o do quadro do gabinete) em destaque, com a descrição do edital embaixo. */
  comNomeCurto?: boolean;
}> = ({ item, semItem, extra, comLinks, comNomeCurto }) => {
  const parar = (e: React.MouseEvent) => e.stopPropagation();
  return (
    <>
      {item && (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem', flexWrap: 'wrap' }}>
          {comLinks ? (
            <Link
              to={`${buildAtaItemPath(item.numeroAta, item.codigoUasg, item.numeroItem)}?aba=emendas`}
              onClick={parar}
              style={{ ...carteiraIdentificacao, textDecoration: 'none' }}
              title="Abrir o item na aba Emendas"
              data-testid="emendas-item-link"
            >
              {String(item.numeroItem).padStart(5, '0')}
            </Link>
          ) : (
            <span style={carteiraIdentificacao}>{String(item.numeroItem).padStart(5, '0')}</span>
          )}
          <span style={ataEmCinza}>·</span>
          {comLinks ? (
            <Link to={buildAtaPath(item.numeroAta, item.codigoUasg)} onClick={parar} style={{ ...ataEmCinza, textDecoration: 'none' }} title={`Abrir a Ata 360 (UASG ${item.codigoUasg})`} data-testid="emendas-ata-link">
              Ata {item.numeroAta}
            </Link>
          ) : (
            <span style={ataEmCinza} title={`UASG ${item.codigoUasg}`}>
              Ata {item.numeroAta}
            </span>
          )}
          {extra}
        </div>
      )}
      {comNomeCurto && item?.nomeCurto?.trim() && (
        <div style={{ ...carteiraValor, marginTop: '0.15rem' }} data-testid="emendas-item-nome-curto">
          {item.nomeCurto.trim()}
        </div>
      )}
      <div title={item?.descricao} style={carteiraDescricaoItem}>
        {item ? descricaoItemEmFrase(item.descricao) : semItem}
      </div>
    </>
  );
};

/** Vigência igual à Carteira de Itens: a pílula do prazo e "até dd/mm/aaaa" embaixo. */
export const VigenciaDaAta: React.FC<{ item: Pick<ItemCaep, 'vigenciaFinal' | 'ataEncerrada'> | null | undefined; hoje: string }> = ({ item, hoje }) => {
  if (!item) return <span style={carteiraDetalhe}>—</span>;
  const dias = item.vigenciaFinal ? diasEntre(hoje, item.vigenciaFinal) : null;
  return (
    <>
      <CarteiraPrazoPill faixa={classifyPrazo(dias, item.ataEncerrada)} diasRestantes={dias} />
      {item.vigenciaFinal && <div style={carteiraDetalhe}>até {dataBR(item.vigenciaFinal)}</div>}
    </>
  );
};

/** Linha do pedido: kit (nome e composição) ou item (ata · item e descrição). */
export const LinhaDoPedido: React.FC<{ linha: Pick<LinhaPedido, 'tipo' | 'itemKey' | 'kitNome' | 'kitComposicao' | 'quantidade'>; itens: Map<string, ItemCaep>; comLinks?: boolean }> = ({ linha, itens, comLinks }) => {
  if (linha.tipo === 'KIT') {
    return (
      <>
        <div style={{ fontWeight: 700 }}>
          {linha.kitNome ?? 'Kit'} × {linha.quantidade}
        </div>
        <div style={carteiraSubtitle}>
          {(linha.kitComposicao ?? [])
            .map((c) => {
              const i = itens.get(c.itemKey);
              return `${c.quantidade * linha.quantidade} ${i ? descricaoItemEmFrase(i.descricao).slice(0, 40) : c.itemKey}`;
            })
            .join(' · ')}
        </div>
      </>
    );
  }
  const i = linha.itemKey ? itens.get(linha.itemKey) : undefined;
  return <ItemDaAta item={i} semItem={`${linha.itemKey} · item sem alocação da CAEP`} comLinks={comLinks} comNomeCurto />;
};

/** Nome da unidade e, ao lado, a sigla mais clara (padrão "00001 · Ata 00055/2025" das carteiras). */
export const NomeComSigla: React.FC<{ b: Pick<BeneficiarioEmenda, 'nome' | 'sigla'> & Partial<Pick<BeneficiarioEmenda, 'cnpj' | 'razaoSocial'>>; destaque?: boolean }> = ({ b, destaque }) => (
  // Até duas linhas: nome longo termina em "…". Ao passar o mouse: nome inteiro e, se houver, CNPJ e razão social.
  <div
    title={[b.sigla ? `${b.nome} · ${b.sigla}` : b.nome, b.cnpj ? `CNPJ ${formatarCnpj(b.cnpj)}${b.razaoSocial ? ` · ${b.razaoSocial}` : ''}` : null].filter(Boolean).join('\n')}
    style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: destaque ? undefined : 1.35 }}
  >
    <span style={destaque ? carteiraIdentificacao : carteiraValor}>{b.nome}</span>
    {b.sigla && <span style={{ ...ataEmCinza, marginLeft: '0.4rem' }}>· {b.sigla}</span>}
  </div>
);

/** Embaixo do nome, na linha da emenda: a razão social do CNPJ vinculado e a cidade - UF (aqui não há coluna de entrega). */
export const RazaoELocal: React.FC<{ b: Pick<BeneficiarioEmenda, 'razaoSocial' | 'entregaMunicipio' | 'entregaUf'> }> = ({ b }) => {
  const local = localDoBeneficiario(b);
  return (
    <>
      {b.razaoSocial && <div style={carteiraFornecedor}>{b.razaoSocial}</div>}
      {local && <div style={carteiraDetalhe}>{local}</div>}
    </>
  );
};

/** Beneficiário da linha: o nome com a sigla e embaixo a razão social (migration 166). */
export const BeneficiarioDaLinha: React.FC<{ linha: Pick<LinhaPedido, 'beneficiarioId'>; beneficiarios: Map<string, BeneficiarioEmenda> }> = ({ linha, beneficiarios }) => {
  const b = linha.beneficiarioId ? beneficiarios.get(linha.beneficiarioId) : undefined;
  if (b) {
    return (
      <>
        <NomeComSigla b={b} />
        <RazaoELocal b={b} />
        {!b.cnpj && <StatusBadge label="Falta CNPJ" variant="neutral" size="sm" dot={false} />}
      </>
    );
  }
  return <StatusBadge label="A informar" variant="warning" size="sm" dot={false} />;
};

/** Empenho da linha: a nota, quando já se sabe; antes, o documento SEI do empenho. Embaixo, o contrato. */
export const EmpenhoDaLinha: React.FC<{
  linha: Pick<LinhaPedido, 'empenhoDocumentoSei' | 'contratoNumero'>;
  /** Nota achada pelo sistema: pelo documento SEI da nota (migration 177) ou pelo plano interno (migration 164). */
  achada?: NotaDaLinha;
  podeVerContratos: boolean;
}> = ({ linha, achada, podeVerContratos }) => {
  const chave = achada?.contractKey ?? chaveDoContratoDaEmenda(linha.contratoNumero);
  const contrato = achada?.contractKey ? numeroDaChave(achada.contractKey) : linha.contratoNumero;
  if (!achada?.nota && !linha.empenhoDocumentoSei && !contrato) return <span style={carteiraDetalhe}>—</span>;
  return (
    <>
      {achada?.nota ? (
        <>
          <div style={{ fontWeight: 700 }}>{achada.nota}</div>
          {achada.regra && <div style={carteiraDetalhe}>{ROTULO_REGRA_DA_NOTA[achada.regra]}</div>}
        </>
      ) : linha.empenhoDocumentoSei ? (
        <>
          <NumeroSeiEtiqueta numero={linha.empenhoDocumentoSei} testId="emendas-linha-empenho-sei" />
          <div style={carteiraDetalhe}>{achada?.motivo ? `nota não achada: ${ROTULO_MOTIVO_SEM_NOTA[achada.motivo]}` : 'nota a localizar'}</div>
        </>
      ) : null}
      {contrato && (
        <div style={carteiraDetalhe}>
          Contrato{' '}
          {podeVerContratos && chave ? (
            <Link to={`/contratos/${encodeURIComponent(chave)}`} onClick={(e) => e.stopPropagation()} style={{ color: 'var(--primary)', fontWeight: 700 }}>
              {contrato}
            </Link>
          ) : (
            contrato
          )}
        </div>
      )}
    </>
  );
};

/** Cor da etiqueta de situação da linha: pendência em amarelo, antes do empenho em azul, empenhada e contratada em verde. */
const varianteDaSituacao = (s: SituacaoDaLinha): 'warning' | 'info' | 'success' | 'neutral' | 'danger' =>
  s.situacao === 'CANCELADO' ? 'neutral' : s.situacao === 'EMPENHO_ANULADO' ? 'danger' : s.pendente || s.situacao === 'SOLICITACAO_A_INFORMAR' || s.situacao === 'AGUARDANDO_ASSINATURA' ? 'warning' : ORDEM_SITUACAO_LINHA[s.situacao] >= ORDEM_SITUACAO_LINHA.EMPENHADO ? 'success' : 'info';

/** Situação da linha do pedido (migration 180): a etiqueta e, embaixo, a solicitação, a nota ligada ou o que falta. */
export const SituacaoDaLinhaEtiqueta: React.FC<{ s: SituacaoDaLinha; testId?: string }> = ({ s, testId }) => (
  <div data-testid={testId} data-situacao={s.situacao}>
    <StatusBadge label={s.rotulo} variant={varianteDaSituacao(s)} size="sm" dot={false} />
    {s.detalhe && <div style={{ ...carteiraDetalhe, marginTop: '0.2rem' }}>{s.detalhe}</div>}
  </div>
);

/**
 * Execução do pedido empenhado pelas notas achadas, no resumo de uma linha das abas do Contrato 360 (SummaryBar):
 * notas, empenhado, liquidado e pago, a barra do pago e a próxima entrega prevista; a ressalva fica no ⓘ.
 */
export const ExecucaoDoPedidoResumo: React.FC<{ execucao: ExecucaoDoPedido }> = ({ execucao: e }) => (
  <SummaryBar
    testId="emendas-pedido-execucao"
    items={
      e.notas
        ? [
            { label: 'Notas', value: String(e.notas), unit: '' },
            { label: 'Empenhado', value: formatCurrency(e.empenhado), unit: '' },
            { label: 'Liquidado', value: formatCurrency(e.liquidado), unit: '' },
            { label: 'Pago', value: formatCurrency(e.pago), unit: '', tone: e.pago > 0 ? 'success' : 'default' }
          ]
        : [{ label: 'Notas', value: 'nenhuma achada ainda', unit: '' }]
    }
    progress={e.notas && e.empenhado > 0 ? { value: e.pago, max: e.empenhado } : undefined}
    extra={e.linhasSemNota > 0 ? <StatusBadge label={`${e.linhasSemNota} sem nota`} variant="warning" size="sm" dot={false} /> : null}
  >
    <div style={{ ...carteiraDetalhe, marginTop: 0, display: 'flex', alignItems: 'center', gap: '0.3rem', flexWrap: 'wrap' }}>
      {e.proximaEntrega
        ? `Próxima entrega prevista: ${dataBR(e.proximaEntrega.data)}${e.proximaEntrega.valor != null ? ` (${formatCurrency(e.proximaEntrega.valor)})` : ''}, informada pelo gestor do contrato.`
        : 'Entrega prevista: o gestor do contrato ainda não informou.'}
      <InfoHint
        content="Os valores são das notas inteiras, que podem ter outros itens da mesma emenda no contrato. A entrega ao beneficiário será registrada pelo módulo de Fiscalização."
        label="Sobre os valores da execução"
        testId="emendas-pedido-execucao-hint"
      />
    </div>
  </SummaryBar>
);

/**
 * Valor pelo preço previsto para a emenda (o mesmo do quadro do parlamentar), com o de hoje embaixo quando muda e o
 * motivo ao passar o mouse.
 */
export const ValorPrevisto: React.FC<{ previsto: number; hoje: number; nota?: string | null; marca?: string; testId?: string }> = ({ previsto, hoje, nota, marca, testId }) => (
  <span title={nota ?? undefined} data-testid={testId} style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end' }}>
    <span style={carteiraNumero}>
      {formatCurrency(previsto)}
      {marca}
    </span>
    {Math.abs(previsto - hoje) > 0.004 && <span style={{ ...carteiraDetalhe, whiteSpace: 'nowrap' }}>hoje {formatCurrency(hoje)}</span>}
  </span>
);

/** Valor do pedido: o da emenda no SIOP depois da conferência; antes, o previsto pelos itens (ver valorDoPedidoNaEtapa). */
export const ValorDoPedido: React.FC<{ valor: number; fonte: 'EMENDA' | 'PREVISTO' }> = ({ valor, fonte }) => (
  <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end' }} title={fonte === 'EMENDA' ? 'Valor da emenda no SIOP' : 'Previsto pelos itens, com o reajuste das atas (o mesmo do quadro do parlamentar)'}>
    <span style={carteiraNumero}>{formatCurrency(valor)}</span>
    <span style={{ ...carteiraDetalhe, whiteSpace: 'nowrap' }}>{fonte === 'EMENDA' ? 'da emenda' : 'previsto'}</span>
  </span>
);

