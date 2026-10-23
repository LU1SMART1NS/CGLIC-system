import React from 'react';
import { Link } from 'react-router-dom';
import { StatusBadge } from '../../design-system/components/StatusBadge';
import { carteiraDescricaoItem, carteiraIdentificacao, carteiraSubtitle } from '../carteira/carteiraStyles';
import { CarteiraPrazoPill } from '../carteira/CarteiraPrazoPill';
import { classifyPrazo } from '../carteira/carteiraPrazo';
import { dataBR, diasEntre } from '../../utils/emendasKits';
import { AUTOR_A_DEFINIR, chaveDoContratoDaEmenda } from '../../utils/emendasPedidos';
import { descricaoItemEmFrase } from '../../utils/textCase';
import type { AutorEmenda, BeneficiarioEmenda, ItemCaep, LinhaPedido } from '../../services/emendasService';

const TIPO: Record<AutorEmenda['tipo'], string> = { DEPUTADO: 'Deputado', SENADOR: 'Senador', BANCADA: 'Bancada' };

/**
 * Autor em duas linhas: nome e "Deputado · PL · RJ". Sem autor (reserva para um órgão, migration 163): "Parlamentar a
 * definir" e, embaixo, para qual órgão a CAEP separou.
 */
export const AutorDoPedido: React.FC<{ autor: AutorEmenda | undefined; autorId: string | null; orgao?: string | null; destaque?: boolean }> = ({ autor, autorId, orgao, destaque }) => {
  const nome: React.CSSProperties = destaque ? carteiraIdentificacao : { fontWeight: 600 };
  if (!autorId)
    return (
      <>
        <div style={{ ...nome, color: 'var(--color-warning-text)' }}>{AUTOR_A_DEFINIR}</div>
        <div style={carteiraSubtitle}>{orgao ? `Reserva para ${orgao}` : 'Reserva para um órgão'}</div>
      </>
    );
  return (
    <>
      <div style={nome}>{autor?.nome ?? autorId}</div>
      {autor && <div style={carteiraSubtitle}>{[TIPO[autor.tipo], autor.partido, autor.uf].filter(Boolean).join(' · ')}</div>}
    </>
  );
};

const ataEmCinza: React.CSSProperties = { fontSize: '0.75rem', color: '#64748b', fontWeight: 700 };

/** Célula do item igual à Carteira de Itens: "00001 · Ata 00031/2025" e a descrição em até 2 linhas. */
export const ItemDaAta: React.FC<{ item: Pick<ItemCaep, 'numeroAta' | 'numeroItem' | 'descricao' | 'codigoUasg'> | null | undefined; semItem?: string; extra?: React.ReactNode }> = ({ item, semItem, extra }) => (
  <>
    {item && (
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem', flexWrap: 'wrap' }}>
        <span style={carteiraIdentificacao}>{String(item.numeroItem).padStart(5, '0')}</span>
        <span style={ataEmCinza}>·</span>
        <span style={ataEmCinza} title={`UASG ${item.codigoUasg}`}>
          Ata {item.numeroAta}
        </span>
        {extra}
      </div>
    )}
    <div title={item?.descricao} style={carteiraDescricaoItem}>
      {item ? descricaoItemEmFrase(item.descricao) : semItem}
    </div>
  </>
);

/** Vigência igual à Carteira de Itens: a pílula do prazo e "até dd/mm/aaaa" embaixo. */
export const VigenciaDaAta: React.FC<{ item: Pick<ItemCaep, 'vigenciaFinal' | 'ataEncerrada'> | null | undefined; hoje: string }> = ({ item, hoje }) => {
  if (!item) return <span style={carteiraSubtitle}>—</span>;
  const dias = item.vigenciaFinal ? diasEntre(hoje, item.vigenciaFinal) : null;
  return (
    <>
      <CarteiraPrazoPill faixa={classifyPrazo(dias, item.ataEncerrada)} diasRestantes={dias} />
      {item.vigenciaFinal && <div style={{ ...ataEmCinza, fontWeight: 600, marginTop: '0.2rem' }}>até {dataBR(item.vigenciaFinal)}</div>}
    </>
  );
};

/** Linha do pedido: kit (nome e composição) ou item (ata · item e descrição). */
export const LinhaDoPedido: React.FC<{ linha: Pick<LinhaPedido, 'tipo' | 'itemKey' | 'kitNome' | 'kitComposicao' | 'quantidade'>; itens: Map<string, ItemCaep> }> = ({ linha, itens }) => {
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
  return <ItemDaAta item={i} semItem={`${linha.itemKey} · item sem alocação da CAEP`} />;
};

/**
 * Beneficiário da linha: o cadastrado (com CNPJ) ou, na carga das planilhas (migration 160), o nome como veio, com o
 * aviso de que falta cadastrar.
 */
export const BeneficiarioDaLinha: React.FC<{ linha: Pick<LinhaPedido, 'beneficiarioId' | 'beneficiarioNome'>; beneficiarios: Map<string, BeneficiarioEmenda> }> = ({ linha, beneficiarios }) => {
  const b = linha.beneficiarioId ? beneficiarios.get(linha.beneficiarioId) : undefined;
  if (b) {
    return (
      <>
        <div style={{ fontWeight: 600 }}>{b.nomeCurto}</div>
        <div style={carteiraSubtitle}>
          {b.entregaMunicipio}/{b.entregaUf}
        </div>
      </>
    );
  }
  if (linha.beneficiarioNome) {
    return (
      <>
        <div style={{ fontWeight: 600 }}>{linha.beneficiarioNome}</div>
        <StatusBadge label="A cadastrar" variant="warning" size="sm" dot={false} />
      </>
    );
  }
  return <StatusBadge label="A informar" variant="warning" size="sm" dot={false} />;
};

/** Empenho da linha: a nota, quando já se sabe; antes, o documento SEI do empenho. Embaixo, o contrato. */
export const EmpenhoDaLinha: React.FC<{ linha: Pick<LinhaPedido, 'notaEmpenho' | 'empenhoDocumentoSei' | 'contratoNumero'>; podeVerContratos: boolean }> = ({ linha, podeVerContratos }) => {
  const chave = chaveDoContratoDaEmenda(linha.contratoNumero);
  if (!linha.notaEmpenho && !linha.empenhoDocumentoSei && !linha.contratoNumero) return <span style={carteiraSubtitle}>—</span>;
  return (
    <>
      {linha.notaEmpenho ? (
        <div style={{ fontWeight: 700 }}>{linha.notaEmpenho}</div>
      ) : linha.empenhoDocumentoSei ? (
        <>
          <div style={{ fontWeight: 600 }}>doc. SEI {linha.empenhoDocumentoSei}</div>
          <div style={carteiraSubtitle}>nota a localizar</div>
        </>
      ) : null}
      {linha.contratoNumero && (
        <div style={carteiraSubtitle}>
          Contrato{' '}
          {podeVerContratos && chave ? (
            <Link to={`/contratos/${encodeURIComponent(chave)}`} onClick={(e) => e.stopPropagation()} style={{ color: 'var(--primary)', fontWeight: 700 }}>
              {linha.contratoNumero}
            </Link>
          ) : (
            linha.contratoNumero
          )}
        </div>
      )}
    </>
  );
};

/** O que não bate entre as planilhas da CAEP nesta linha (migration 160). */
export const AConferirDaLinha: React.FC<{ linha: Pick<LinhaPedido, 'aConferir' | 'planilhaRef'> }> = ({ linha }) =>
  linha.aConferir ? (
    <div
      title={linha.planilhaRef ? `Na planilha: ${linha.planilhaRef}` : undefined}
      style={{ marginTop: '0.3rem', fontSize: '0.75rem', color: 'var(--color-warning-text)', background: 'var(--color-warning-bg)', borderRadius: 4, padding: '0.25rem 0.45rem' }}
    >
      A conferir: {linha.aConferir}
    </div>
  ) : null;
