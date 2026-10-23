import React from 'react';
import { carteiraDescricaoItem, carteiraIdentificacao, carteiraSubtitle } from '../carteira/carteiraStyles';
import { CarteiraPrazoPill } from '../carteira/CarteiraPrazoPill';
import { classifyPrazo } from '../carteira/carteiraPrazo';
import { dataBR, diasEntre } from '../../utils/emendasKits';
import { descricaoItemEmFrase } from '../../utils/textCase';
import type { AutorEmenda, ItemCaep, LinhaPedido } from '../../services/emendasService';

const TIPO: Record<AutorEmenda['tipo'], string> = { DEPUTADO: 'Deputado', SENADOR: 'Senador', BANCADA: 'Bancada' };

/** Autor em duas linhas: nome e "Deputado · PL · RJ". */
export const AutorDoPedido: React.FC<{ autor: AutorEmenda | undefined; autorId: string }> = ({ autor, autorId }) => (
  <>
    <div style={{ fontWeight: 600 }}>{autor?.nome ?? autorId}</div>
    {autor && <div style={carteiraSubtitle}>{[TIPO[autor.tipo], autor.partido, autor.uf].filter(Boolean).join(' · ')}</div>}
  </>
);

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
