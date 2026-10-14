import type { ConferenciaDaNota } from '../../services/conferenciaNotaService';

/**
 * Textos da conferência de uma nota que não bate com o contrato (segmento "Conferir no Contratos.gov.br" da fila
 * Empenhos aos itens): o que aconteceu (uma frase), o que fazer (um caso por linha) e os dados em letra menor.
 */

export interface ContratoDaConferenciaDaNota {
  numero: string;
  fornecedorNome?: string;
}

export interface TextoDaConferenciaDaNota {
  frase: string;
  /** "O que fazer no Contratos.gov.br" quando todo caso se corrige lá; "O que fazer" quando algum não. */
  tituloFazer: string;
  fazer: Array<{ se: string; faca: string }>;
  dados: string[];
}

const moeda = (v: number | null | undefined) => (v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
const qtd = (v: number | null | undefined) => (v == null ? '—' : v.toLocaleString('pt-BR', { maximumFractionDigits: 4 }));
const juntar = (l: Array<string | number>) => {
  const t = l.map(String);
  return t.length <= 1 ? t.join('') : `${t.slice(0, -1).join(', ')} e ${t[t.length - 1]}`;
};
const primeiraPalavra = (nome?: string) => (nome ?? '').trim().split(/\s+/)[0] || '';

const NO_CONTRATOS_GOV = 'O que fazer no Contratos.gov.br';

export function textoDaConferenciaDaNota(c: ConferenciaDaNota, contrato: ContratoDaConferenciaDaNota): TextoDaConferenciaDaNota {
  const dentro = c.itensNota.filter((i) => i.noContrato);
  const fora = c.itensNota.filter((i) => !i.noContrato);
  let frase: string;
  let tituloFazer = NO_CONTRATOS_GOV;
  let fazer: TextoDaConferenciaDaNota['fazer'];

  if (c.tipo === 'ITEM_FORA_DO_CONTRATO') {
    const partes = [`A nota tem ${c.itensNota.length} ${c.itensNota.length === 1 ? 'item' : 'itens'}.`];
    if (dentro.length > 0) {
      partes.push(
        dentro.length === 1
          ? `O item ${dentro[0].numeroItem} está no contrato ${contrato.numero} e já conta no empenhado.`
          : `Os itens ${juntar(dentro.map((i) => i.numeroItem))} estão no contrato ${contrato.numero} e já contam no empenhado.`
      );
    }
    partes.push(
      fora.length === 1
        ? `O item ${fora[0].numeroItem}, com ${qtd(fora[0].quantidade)} un a ${moeda(fora[0].valorUnitario)}, não está no contrato.`
        : `Os itens ${juntar(fora.map((i) => i.numeroItem))} não estão no contrato.`
    );
    frase = partes.join(' ');
    const ref = fora.length === 1 ? `o item ${fora[0].numeroItem}` : `os itens ${juntar(fora.map((i) => i.numeroItem))}`;
    const forn = primeiraPalavra(contrato.fornecedorNome);
    fazer = [
      { se: `Se ${ref} ${fora.length === 1 ? 'faz' : 'fazem'} parte deste contrato:`, faca: `${fora.length === 1 ? 'inclua o item' : 'inclua os itens'} no ${contrato.numero}.` },
      { se: `Se ${ref} ${fora.length === 1 ? 'é' : 'são'} de outro contrato${forn ? ` da ${forn}` : ''}:`, faca: 'inclua a nota também naquele contrato.' }
    ];
  } else if (c.tipo === 'ITEM_COM_OUTRO_PRECO') {
    const o = c.outroPreco[0];
    const item = c.itensNota.find((i) => i.numeroItem === o?.numeroItem);
    frase = o
      ? `A nota diz item ${o.numeroItem}, com ${qtd(item?.quantidade)} un a ${moeda(o.precoNota)}. No contrato ${contrato.numero}, o item ${o.numeroItem} custa ${moeda(o.precoContrato)} e o item ${o.itemComEssePreco} é que custa ${moeda(o.precoNota)}.`
      : `O preço de um item da nota é o preço de outro item do contrato ${contrato.numero}.`;
    tituloFazer = 'O que fazer';
    fazer = [
      { se: 'Se a nota está certa:', faca: `corrija no Contratos.gov.br o número ou o preço dos itens do ${contrato.numero}.` },
      { se: 'Se o contrato está certo:', faca: 'a nota foi emitida no item errado. Avise quem emitiu a nota, porque essa correção é na própria nota e não no Contratos.gov.br.' }
    ];
  } else if (c.tipo === 'CONTRATO_SEM_ITENS') {
    const total = c.itensNota.reduce((s, i) => s + i.quantidade, 0);
    frase =
      c.itensNota.length > 0
        ? `O contrato ${contrato.numero} não tem itens no Contratos.gov.br. A nota diz ${qtd(total)} un em ${c.itensNota.length} ${c.itensNota.length === 1 ? 'item' : 'itens'} da compra.`
        : c.notaLidaEm
          ? `O contrato ${contrato.numero} não tem itens no Contratos.gov.br.`
          : `O contrato ${contrato.numero} não tem itens no Contratos.gov.br. A nota ainda não foi lida no SIAFI.`;
    fazer = [{ se: `No contrato ${contrato.numero}:`, faca: 'cadastre os itens. A linha sai daqui quando a sincronização trouxer os itens.' }];
  } else {
    frase = `A nota foi vinculada ${c.itensDoVinculo.length === 1 ? 'ao item' : 'aos itens'} ${juntar(c.itensDoVinculo)} antes de ser lida no SIAFI. A nota diz ${
      dentro.length === 1 ? 'item' : 'itens'
    } ${juntar(dentro.map((i) => i.numeroItem))}.`;
    tituloFazer = 'O que fazer';
    fazer = [
      { se: 'Se a nota está certa:', faca: 'edite o vínculo aos itens no contrato.' },
      { se: 'Se o vínculo está certo:', faca: 'a nota foi emitida em outro item. Avise quem emitiu a nota.' }
    ];
  }

  const dados: string[] = [];
  const ug = c.uasgEmitente ? ` · UG ${c.uasgEmitente}` : '';
  if (c.itensNota.length > 0) {
    const total = c.totalSiafi ?? c.itensNota.reduce((s, i) => s + i.valorTotal, 0);
    dados.push(
      `Nota no SIAFI: ${c.numeroOficial}${ug} · ${c.itensNota.map((i) => `item ${i.numeroItem} (${qtd(i.quantidade)} un × ${moeda(i.valorUnitario)})`).join(' · ')} · total ${moeda(total)}.`
    );
  } else {
    dados.push(`Nota ${c.numeroOficial}${ug} · ${moeda(c.valorNota)}.`);
  }
  if (c.tipo === 'ITEM_COM_OUTRO_PRECO') {
    dados.push(`Contrato ${contrato.numero}: ${c.itensContrato.map((i) => `item ${i.numeroItem}, ${qtd(i.quantidade)} un a ${moeda(i.valorUnitario)}`).join(' · ')}.`);
  } else if (c.itensContrato.length > 0) {
    dados.push(`Contrato ${contrato.numero}: ${c.itensContrato.length === 1 ? 'item' : 'itens'} ${juntar(c.itensContrato.map((i) => i.numeroItem))}.`);
  }
  if (c.tipo === 'CONTRATO_SEM_ITENS') dados.push('Sem os itens, a nota fica no contrato inteiro e não conta no empenhado de nenhum item.');
  if (c.valorEmDobro && c.totalSiafi != null) {
    dados.push(`O Contratos.gov.br informa ${moeda(c.valorNota)} para esta nota, e o SIAFI informa ${moeda(c.totalSiafi)}.`);
  }
  return { frase, tituloFazer, fazer, dados };
}
