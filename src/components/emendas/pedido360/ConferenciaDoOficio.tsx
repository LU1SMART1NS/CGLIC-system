import React, { useMemo, useState } from 'react';
import { AppButton } from '../../../design-system/components/AppButton';
import { ActionButton } from '../../../design-system/components/ActionButton';
import { AppDateInput, AppInput, AppSelect, AppTextarea } from '../../../design-system/components/FormFields';
import { useToast } from '../../../design-system/components/Toast';
import { hojeEmBrasilia, useAutoresEmendas, useConferirOficio, useEmendasSiop, usePedidoEmDiaNaTela } from '../../../hooks/useEmendas';
import { formatCurrency, formatNumber } from '../../../utils/format';
import {
  ataDoItem,
  conferirNumeroDaEmenda,
  documentoSeiDaEtapaValido,
  identificacaoDoPedido,
  lerNumeroDaEmenda,
  numeroDaEmendaEmTexto,
  precoParaEmenda,
  rodadaDoPedido
} from '../../../utils/emendasPedidos';
import {
  ajustesFeitos,
  cabeNaEmenda,
  linhasParaConferir,
  linhasParaSalvar,
  livrePorItem,
  mesmoValor,
  passaDoSaldo,
  PONTOS_SIOP,
  oficioForaDoPrazo,
  precosQueMudaram,
  precoUnitarioDeHoje,
  sobraDaEmendaParaOPedido,
  valorDosItens,
  type LinhaConferida
} from '../../../utils/emendasConferenciaOficio';
import { curto, dataBR, diasEntre, passouDoCorte } from '../../../utils/emendasKits';
import { podeReservar, reajusteDoItem } from '../../../utils/emendasReajuste';
import { daUfDoParlamentar } from '../../../utils/emendasBeneficiarios';
import { lerValorBR, mascaraValorBR } from '../../../utils/mascaras';
import { rotuloBeneficiario, type AutorEmenda, type BeneficiarioEmenda, type ItemCaep, type PedidoEmenda } from '../../../services/emendasService';
import type { PrecoDoItem } from '../../../services/emendasQuadroService';
import { BeneficiarioDaLinha } from '../emendasPartes';

interface Props {
  pedido: PedidoEmenda;
  pedidos: PedidoEmenda[];
  itens: Map<string, ItemCaep>;
  itensLista: ItemCaep[];
  beneficiarios: Map<string, BeneficiarioEmenda>;
  beneficiariosLista: BeneficiarioEmenda[];
  autor: AutorEmenda | undefined;
  nomeDoAutor: string;
  precos: Map<string, PrecoDoItem> | undefined;
  reservadoFora: Map<string, number>;
  hoje: string;
  /** Aberta pelo "Ofício com divergência": já começa no pedido da nova minuta. */
  iniciarDevolvendo?: boolean;
  onSair: () => void;
  /** Nova minuta registrada: o pedido voltou para a reserva e a tela vai para o quadro do ofício. */
  onNovaMinuta: () => void;
}

const valorBR = (v: number) =>
  v.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

/**
 * Conferência do ofício (protótipo aprovado em 28/10/2026): dentro do Pedido 360, numa área larga. (1) O ofício pede o
 * que está no pedido? Cada item com ✓, e o pedido se ajusta ao ofício (quantidade, retirar, acrescentar). (2) A emenda
 * no SIOP bate? Os 6 pontos que o SIOP mostra, e o pedido cabe no que sobra da emenda. Desde 29/10/2026 (migration 246)
 * o ofício tem de pedir o valor do pedido pelo preço de hoje, centavo a centavo, chegar no prazo da minuta e com o preço
 * que a minuta levou; o banco confere o prazo e o preço.
 * No fim, "Tudo confere" grava os ajustes e a conferência juntos; "Não bate: gerar nova minuta" grava os ajustes e
 * devolve o ofício (o pedido volta para a reserva e o quadro sai com o preço de hoje). As marcas não ficam gravadas.
 */
export const ConferenciaDoOficio: React.FC<Props> = ({
  pedido,
  pedidos,
  itens,
  itensLista,
  beneficiarios,
  beneficiariosLista,
  autor,
  nomeDoAutor,
  precos,
  reservadoFora,
  hoje,
  iniciarDevolvendo = false,
  onSair,
  onNovaMinuta
}) => {
  const toast = useToast();
  const conferir = useConferirOficio();
  const emDiaNaTela = usePedidoEmDiaNaTela();
  const { data: emendasSiop } = useEmendasSiop();
  const { data: autores = [] } = useAutoresEmendas();

  // Parte 1: as linhas do pedido ajustadas ao ofício.
  const [linhas, setLinhas] = useState<LinhaConferida[]>(() => linhasParaConferir(pedido));
  const [valorOficio, setValorOficio] = useState(pedido.oficioValor != null ? valorBR(pedido.oficioValor) : '');
  const [seiOficio, setSeiOficio] = useState(pedido.oficioValorDocumentoSei ?? pedido.oficioDocumentoSei ?? '');
  const [retificador, setRetificador] = useState(pedido.oficioValorRetificador ?? false);
  const [acrescentando, setAcrescentando] = useState(false);
  const [novoItem, setNovoItem] = useState('');
  const [novoBeneficiario, setNovoBeneficiario] = useState('');
  const [novaQuantidade, setNovaQuantidade] = useState('1');
  const [todasUfs, setTodasUfs] = useState(false);
  const [erroNovo, setErroNovo] = useState<string | null>(null);

  // Parte 2: a emenda no SIOP. Pedido criado a partir da emenda registrada (migration 205) já vem com ela.
  const daEmenda = pedido.emendaId ? emendasSiop?.find((e) => e.id === pedido.emendaId) : undefined;
  const anoDeHoje = Number(hojeEmBrasilia().slice(0, 4));
  const [emenda, setEmenda] = useState(pedido.siopEmenda ? numeroDaEmendaEmTexto(pedido.siopEmenda) : '');
  const [anoEmenda, setAnoEmenda] = useState(pedido.siopEmendaAno ?? anoDeHoje);
  const [valor, setValor] = useState(pedido.siopValor != null ? valorBR(pedido.siopValor) : '');
  const [gnd, setGnd] = useState(pedido.siopGnd ?? 'GND-4');
  const [preenchido, setPreenchido] = useState(false);
  // Ajuste durante a renderização (a emenda pode chegar depois de a tela abrir), uma vez só.
  if (!preenchido && daEmenda && !pedido.siopEmenda) {
    setPreenchido(true);
    setEmenda(numeroDaEmendaEmTexto(daEmenda.numero));
    setAnoEmenda(daEmenda.ano);
    setValor(daEmenda.valor != null ? valorBR(daEmenda.valor) : '');
    setGnd(daEmenda.gnd ?? 'GND-4');
  }
  // Migration 243 (D5): o nº vem da reserva e só se confirma; trocar a emenda pede o motivo.
  const numeroDaReserva = pedido.siopEmenda ?? daEmenda?.numero ?? null;
  const anoDaReserva = pedido.siopEmendaAno ?? daEmenda?.ano ?? null;
  const [trocandoEmenda, setTrocandoEmenda] = useState(false);
  const [motivoTroca, setMotivoTroca] = useState('');
  const emendaTravada = Boolean(numeroDaReserva) && !trocandoEmenda;
  const [corrigindoSiop, setCorrigindoSiop] = useState(false);
  const [data, setData] = useState(hojeEmBrasilia());
  const [pontos, setPontos] = useState<Record<string, boolean>>({});

  // Rodapé: a nova minuta.
  const [devolvendo, setDevolvendo] = useState(iniciarDevolvendo);
  const [motivo, setMotivo] = useState('');
  const [tentou, setTentou] = useState(false);

  const anosDaEmenda = [...new Set([...Array.from({ length: 5 }, (_, i) => anoDeHoje - i), anoEmenda])].sort((a, b) => b - a);
  const digitarEmenda = (texto: string) => {
    const lido = lerNumeroDaEmenda(texto);
    if (lido?.ano) {
      setAnoEmenda(lido.ano);
      setEmenda(numeroDaEmendaEmTexto(lido.numero));
    } else setEmenda(texto);
  };
  const emendaLida = lerNumeroDaEmenda(emenda);
  const conferenciaDaEmenda = emendaLida ? conferirNumeroDaEmenda(pedido, emendaLida.numero, emendaLida.ano ?? anoEmenda, pedidos) : null;
  const nomeDe = (autorId: string | null) => autores.find((a) => a.id === autorId)?.nome ?? 'outro parlamentar';
  // A emenda dividida em vários pedidos do mesmo processo: o processo uma vez só ("todos do Processo …").
  const idsDosOutros = [...new Set((conferenciaDaEmenda?.mesmaEmenda ?? []).map((x) => identificacaoDoPedido(x)))];
  const identificacoesDosOutros = idsDosOutros.length === 1 && (conferenciaDaEmenda?.mesmaEmenda.length ?? 0) > 1 ? `todos do ${idsDosOutros[0]}` : idsDosOutros.join(', ');
  const registrada = emendaLida ? emendasSiop?.find((e) => e.numero === emendaLida.numero && e.ano === (emendaLida.ano ?? anoEmenda)) : undefined;
  // Emenda registrada na reserva sem o valor: o valor do SIOP entra aqui.
  const digitaValorDaEmenda = !registrada || registrada.valor == null || corrigindoSiop;
  const valorDigitado = lerValorBR(valor);
  const valorDaEmenda = digitaValorDaEmenda ? valorDigitado : registrada.valor;
  const trocouEmenda = Boolean(numeroDaReserva && emendaLida && (emendaLida.numero !== numeroDaReserva || (anoDaReserva != null && (emendaLida.ano ?? anoEmenda) !== anoDaReserva)));
  const valorDoOficio = lerValorBR(valorOficio);

  const nomeDoItem = (l: Pick<LinhaConferida, 'tipo' | 'itemKey' | 'kitNome'>): string => {
    if (l.tipo === 'KIT') return `${l.kitNome ?? 'kit'} (kit)`;
    const i = l.itemKey ? itens.get(l.itemKey) : undefined;
    return i?.nomeCurto?.trim() || curto(i?.descricao ?? l.itemKey ?? '', 48);
  };
  const siglaDe = (id: string | null) => {
    const b = id ? beneficiarios.get(id) : undefined;
    return b ? b.sigla || b.nome : 'sem beneficiário';
  };
  const nomeParaHistorico = (l: LinhaConferida) => `${nomeDoItem(l)} → ${siglaDe(l.beneficiarioId)}`;

  const livre = useMemo(() => livrePorItem(linhas, itens, reservadoFora), [linhas, itens, reservadoFora]);
  // O pedido pelo preço de hoje tem de caber no que sobra da emenda (28/10/2026) e ser o valor do ofício (29/10/2026).
  const total = valorDosItens(linhas, itens, precos);
  const conta = valorDaEmenda != null && valorDaEmenda > 0 ? sobraDaEmendaParaOPedido(valorDaEmenda, conferenciaDaEmenda?.mesmaEmenda ?? [], itens, precos) : null;
  // Pedido completado com outra emenda (migration 211): o sistema não tem o valor dela, então não trava; a CAEP confere.
  const comOutraEmenda = pedido.outrasEmendas.length > 0;
  const cabe = conta != null && (comOutraEmenda || cabeNaEmenda(total, conta.sobra));
  const mudaram = precosQueMudaram(linhas, pedido, itens, precos);
  const ajustes = ajustesFeitos(linhas, nomeParaHistorico);
  const ficam = linhas.filter((l) => !l.retirada);
  const conferidas = linhas.filter((l) => l.retirada || l.confere).length;
  const pontosMarcados = PONTOS_SIOP.filter((x) => pontos[x.chave]).length;
  const oficioIgual = valorDoOficio != null && valorDoOficio > 0 && mesmoValor(valorDoOficio, total);
  const foraDoPrazo = oficioForaDoPrazo(pedido);
  const semBeneficiario = ficam.filter((l) => !l.beneficiarioId).length;
  const foraDoSaldo = linhas.filter((l) => passaDoSaldo(l, livre));
  const rodada = rodadaDoPedido(pedido);

  // Grupos por ata, na ordem em que aparecem; os kits juntos no fim.
  const grupos = useMemo(() => {
    const m = new Map<string, LinhaConferida[]>();
    for (const l of linhas) {
      const chave = l.tipo === 'KIT' || !l.itemKey ? 'KITS' : ataDoItem(l.itemKey);
      if (!m.has(chave)) m.set(chave, []);
      m.get(chave)!.push(l);
    }
    return [...m.entries()].sort(([a], [b]) => (a === 'KITS' ? 1 : b === 'KITS' ? -1 : 0));
  }, [linhas]);

  const mudar = (chave: string, f: (l: LinhaConferida) => LinhaConferida) => setLinhas((ls) => ls.map((l) => (l.chave === chave ? f(l) : l)));
  const retirar = (l: LinhaConferida) => (l.original === 0 ? setLinhas((ls) => ls.filter((x) => x.chave !== l.chave)) : mudar(l.chave, (x) => ({ ...x, retirada: true })));

  // Acrescentar: item com alocação da CAEP, saldo livre e ata dentro do prazo de indicação; órgão da UF do parlamentar.
  const ufDoAutor = autor?.uf ?? null;
  const itensParaAcrescentar = useMemo(
    () =>
      itensLista
        .filter(
          (i) =>
            !i.ataEncerrada &&
            !(i.vigenciaFinal && passouDoCorte(diasEntre(hoje, i.vigenciaFinal))) &&
            podeReservar(reajusteDoItem(precos?.get(i.itemKey), hoje)) &&
            livre(i.itemKey) > 0
        )
        .sort(
          (a, b) =>
            a.numeroAta.localeCompare(b.numeroAta) ||
            a.numeroItem.localeCompare(b.numeroItem, 'pt-BR', {
              numeric: true
            })
        ),
    [itensLista, hoje, livre, precos]
  );
  const beneficiariosParaAcrescentar = useMemo(() => {
    const doPedido = new Set(linhas.map((l) => l.beneficiarioId).filter(Boolean));
    return (
      beneficiariosLista
        .filter((b) => b.ativo && (todasUfs || daUfDoParlamentar(b, ufDoAutor)))
        // Os órgãos que já estão no pedido vêm primeiro.
        .sort((a, b) => Number(doPedido.has(b.id)) - Number(doPedido.has(a.id)) || rotuloBeneficiario(a).localeCompare(rotuloBeneficiario(b), 'pt-BR'))
    );
  }, [beneficiariosLista, linhas, todasUfs, ufDoAutor]);
  const acrescentar = () => {
    const i = itens.get(novoItem);
    const q = Number(novaQuantidade.replace(/\D/g, ''));
    if (!i) return setErroNovo('Escolha o item da ata.');
    if (!novoBeneficiario) return setErroNovo('Escolha o órgão que recebe.');
    if (!(q > 0)) return setErroNovo('Informe a quantidade.');
    if (q > livre(i.itemKey)) return setErroNovo(`A CAEP tem ${formatNumber(livre(i.itemKey))} livres deste item. Sem saldo, gere nova minuta sem ele.`);
    setLinhas((ls) => [
      ...ls,
      {
        chave: `nova-${ls.length}-${i.itemKey}`,
        id: null,
        tipo: 'ITEM',
        itemKey: i.itemKey,
        kitId: null,
        kitNome: null,
        kitComposicao: null,
        beneficiarioId: novoBeneficiario,
        quantidade: q,
        original: 0,
        retirada: false,
        confere: true
      }
    ]);
    setAcrescentando(false);
    setNovoItem('');
    setNovaQuantidade('1');
    setErroNovo(null);
  };

  const pendencias: string[] = [];
  if (conferidas < linhas.length) pendencias.push(`marcar os itens que batem com o ofício (${linhas.length - conferidas} sem marca)`);
  if (ficam.length === 0) pendencias.push('pelo menos um item no pedido (se o ofício não pede nenhum, cancele o pedido)');
  if (foraDoSaldo.length) pendencias.push('quantidade dentro do saldo livre da CAEP');
  if (semBeneficiario) pendencias.push(`beneficiário em ${semBeneficiario === 1 ? 'um item' : `${semBeneficiario} itens`} (use "Alterar itens")`);
  if (!(valorDoOficio != null && valorDoOficio > 0)) pendencias.push('valor do ofício');
  else if (!oficioIgual) pendencias.push('valor do ofício igual ao do pedido, centavo a centavo (ajuste os itens ou gere nova minuta)');
  if (foraDoPrazo) pendencias.push(`ofício dentro do prazo da minuta (${dataBR(pedido.minutaValidaAte)}): gere nova minuta`);
  if (mudaram.length) pendencias.push('o preço da minuta (mudou depois dela): gere nova minuta');
  if (conta && !cabe) pendencias.push('o pedido caber no valor a indicar da emenda (ajuste os itens ou gere nova minuta)');
  if (seiOficio.trim() && !documentoSeiDaEtapaValido(seiOficio.replace(/\D/g, ''))) pendencias.push('documento SEI do ofício (só números, 7 a 10 dígitos)');
  if (!emenda.trim()) pendencias.push('número da emenda');
  else if (!emendaLida) pendencias.push('nº da emenda com 8 dígitos (ex.: 4095 0004), ou 12 com o ano na frente');
  if (digitaValorDaEmenda && !(valorDigitado != null && valorDigitado > 0)) pendencias.push('valor da emenda no SIOP');
  if (trocouEmenda && !motivoTroca.trim()) pendencias.push('motivo da troca da emenda');
  if (pontosMarcados < PONTOS_SIOP.length) pendencias.push('marcar os 6 pontos do SIOP');

  const motivoSugerido = (): string => {
    if (foraDoPrazo) return `O ofício chegou em ${dataBR(pedido.oficioEm)}, depois do prazo da minuta (${dataBR(pedido.minutaValidaAte)}). Nova minuta com o preço do dia.`;
    if (mudaram.length)
      return `O preço mudou depois da minuta (${[...new Set(mudaram.map((m) => `ata ${m.numeroAta ?? '?'}`))].join(', ')}). Nova minuta com o preço do dia.`;
    if (valorDoOficio != null && valorDoOficio > 0 && !oficioIgual) return `O ofício pede ${formatCurrency(valorDoOficio)} e os itens somam ${formatCurrency(total)}.`;
    if (conta && !cabe)
      return `O valor dos itens (${formatCurrency(total)}) passa do valor a indicar da emenda (${formatCurrency(conta.sobra)})${mudaram.length ? `: o preço mudou depois da minuta (${[...new Set(mudaram.map((m) => `ata ${m.numeroAta ?? '?'}`))].join(', ')})` : ''}.`;
    return '';
  };
  const abrirDevolucao = () => {
    if (!motivo.trim()) setMotivo(motivoSugerido());
    setDevolvendo(true);
  };

  const ocupado = conferir.isPending;
  const motivoDoAjuste = `Ajustado ao ofício${seiOficio.replace(/\D/g, '') ? ` SEI ${seiOficio.replace(/\D/g, '')}` : ''}`;

  const tudoConfere = async () => {
    setTentou(true);
    if (pendencias.length) return;
    try {
      const gravado = await conferir.mutateAsync({
        id: pedido.id,
        versao: pedido.versao,
        acao: 'CONFERIDO',
        linhas: linhasParaSalvar(linhas),
        motivo: motivoDoAjuste,
        dados: {
          data,
          emenda: emendaLida?.numero,
          ano: emendaLida?.ano ?? anoEmenda,
          ...(digitaValorDaEmenda ? { valor_emenda: valorDigitado } : {}),
          ...(trocouEmenda ? { motivo_troca: motivoTroca.trim() } : {}),
          valor_oficio: valorDoOficio,
          oficio_valor_documento_sei: seiOficio.replace(/\D/g, '') || null,
          oficio_retificador: retificador,
          gnd,
          conferencia: {
            ...pontos,
            itens_do_oficio: true,
            valor_do_pedido: total,
            ...(conta ? { sobra_da_emenda: conta.sobra } : {}),
            ajustes
          }
        }
      });
      toast.success(`${nomeDoAutor}: ofício conferido${ajustes.length ? ` e pedido ajustado (${ajustes.length === 1 ? '1 ajuste' : `${ajustes.length} ajustes`})` : ''}.`);
      if (!emDiaNaTela(gravado.id, gravado.versao)) toast.show('Registrado, mas a tela ainda não mostra a mudança. Clique em "Atualizar" no alto da tela.', 'warning');
      onSair();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const gerarNovaMinuta = async () => {
    if (!motivo.trim()) {
      setTentou(true);
      return;
    }
    if (foraDoSaldo.length || ficam.length === 0) {
      toast.error(ficam.length === 0 ? 'Deixe pelo menos um item no pedido.' : 'Há quantidade acima do saldo livre da CAEP: corrija antes de gerar a nova minuta.');
      return;
    }
    try {
      await conferir.mutateAsync({
        id: pedido.id,
        versao: pedido.versao,
        acao: 'DIVERGENCIA',
        linhas: linhasParaSalvar(linhas),
        motivo: motivoDoAjuste,
        dados: {
          data,
          texto: `${motivo.trim()}${ajustes.length ? ` Ajustes ao ofício: ${ajustes.join('; ')}.` : ''}`
        }
      });
      toast.success(
        `Ofício devolvido. O pedido voltou para a reserva (${rodada + 1}ª minuta): o quadro do ofício já está com ${ajustes.length ? 'os ajustes e ' : ''}o preço de hoje.`
      );
      onNovaMinuta();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <div className="conferencia-oficio" data-testid="conferencia-oficio">
      <div className="conferencia-oficio__topo">
        <div>
          <h2 className="conferencia-oficio__titulo">Conferência do ofício</h2>
          <div className="conferencia-oficio__sub">
            {nomeDoAutor} · {identificacaoDoPedido(pedido)}
            {pedido.oficioDocumentoSei ? ` · ofício SEI ${pedido.oficioDocumentoSei}` : ''}
          </div>
        </div>
        <AppButton variant="outline" size="sm" onClick={onSair} disabled={ocupado} data-testid="conferencia-sair">
          Sair da conferência
        </AppButton>
      </div>

      <section className="conferencia-oficio__parte" aria-labelledby="conferencia-parte-1">
        <div className="conferencia-oficio__parte-cab">
          <span className="conferencia-oficio__num">1</span>
          <h3 id="conferencia-parte-1">O ofício pede o que está no pedido?</h3>
          <span className="conferencia-oficio__dica">
            Marque cada item que bate com o ofício. Se o ofício mudou a quantidade, ajuste; se tirou um item, retire; se pediu outro, acrescente.
          </span>
        </div>

        {grupos.map(([chave, ls]) => {
          const item = chave === 'KITS' ? undefined : itensLista.find((i) => ataDoItem(i.itemKey) === chave);
          const ok = ls.filter((l) => l.retirada || l.confere).length;
          return (
            <div key={chave} className="emendas-bloco-ata" data-testid={`conferencia-ata-${item?.numeroAta ?? 'kits'}`}>
              <div className="conferencia-oficio__ata-cab">
                <strong>{item ? `Ata ${item.numeroAta}` : 'Kits'}</strong>
                {item?.fornecedor && <span className="emendas-bloco-ata__forn">{item.fornecedor}</span>}
                <span style={{ flex: 1 }} />
                <span className={`conferencia-oficio__contagem${ok === ls.length ? ' conferencia-oficio__contagem--ok' : ''}`}>
                  {ok} de {ls.length} conferidos
                </span>
              </div>
              <div className="conferencia-oficio__tabela">
                <table>
                  <thead>
                    <tr>
                      <th className="conferencia-oficio__c">Confere</th>
                      <th>Item</th>
                      <th>Beneficiário</th>
                      <th className="conferencia-oficio__n">Quantidade</th>
                      <th className="conferencia-oficio__n">Preço de hoje</th>
                      <th className="conferencia-oficio__n">Total</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {ls.map((l) => {
                      const unitario = precoUnitarioDeHoje(l, itens, precos);
                      const passa = passaDoSaldo(l, livre);
                      const classe = l.retirada ? 'retirada' : l.original === 0 ? 'nova' : l.confere ? 'ok' : '';
                      return (
                        <tr key={l.chave} className={classe ? `conferencia-oficio__linha--${classe}` : undefined} data-testid={`conferencia-linha-${l.chave}`}>
                          <td className="conferencia-oficio__c">
                            {l.retirada ? (
                              <span className="conferencia-oficio__etiqueta">retirado</span>
                            ) : (
                              <input
                                type="checkbox"
                                className="conferencia-oficio__chk"
                                checked={l.confere}
                                onChange={(e) =>
                                  mudar(l.chave, (x) => ({
                                    ...x,
                                    confere: e.target.checked
                                  }))
                                }
                                aria-label={`Confere: ${nomeDoItem(l)}`}
                                data-testid={`conferencia-confere-${l.chave}`}
                              />
                            )}
                          </td>
                          <td className="conferencia-oficio__item">
                            <strong>{nomeDoItem(l)}</strong>
                            {l.original === 0 && <span className="conferencia-oficio__nota conferencia-oficio__nota--nova">acrescentado pelo ofício</span>}
                            {l.original > 0 && !l.retirada && l.quantidade !== l.original && (
                              <span className="conferencia-oficio__nota">no pedido: {formatNumber(l.original)}</span>
                            )}
                            {passa && <span className="conferencia-oficio__nota conferencia-oficio__nota--erro">passa do saldo livre da CAEP</span>}
                          </td>
                          <td>
                            <BeneficiarioDaLinha linha={l} beneficiarios={beneficiarios} />
                          </td>
                          <td className="conferencia-oficio__n">
                            {l.retirada ? (
                              formatNumber(l.original)
                            ) : (
                              <span className="conferencia-oficio__passo">
                                <AppButton
                                  size="xs"
                                  variant="ghost"
                                  onClick={() => mudar(l.chave, (x) => ({ ...x, quantidade: Math.max(1, x.quantidade - 1) }))}
                                  aria-label="Diminuir"
                                  disabled={l.quantidade <= 1}
                                >
                                  −
                                </AppButton>
                                <input
                                  inputMode="numeric"
                                  value={l.quantidade}
                                  onChange={(e) =>
                                    mudar(l.chave, (x) => ({
                                      ...x,
                                      quantidade: Math.max(1, Number(e.target.value.replace(/\D/g, '')) || 1)
                                    }))
                                  }
                                  aria-label={`Quantidade de ${nomeDoItem(l)}`}
                                  data-testid={`conferencia-qtd-${l.chave}`}
                                />
                                <AppButton size="xs" variant="ghost" onClick={() => mudar(l.chave, (x) => ({ ...x, quantidade: x.quantidade + 1 }))} aria-label="Aumentar">
                                  +
                                </AppButton>
                              </span>
                            )}
                          </td>
                          <td className="conferencia-oficio__n">{formatCurrency(unitario)}</td>
                          <td className="conferencia-oficio__n">{l.retirada ? '—' : formatCurrency(unitario * l.quantidade)}</td>
                          <td className="conferencia-oficio__n">
                            {l.retirada ? (
                              <ActionButton action="desfazer" size="xs" onClick={() => mudar(l.chave, (x) => ({ ...x, retirada: false }))} />
                            ) : (
                              <AppButton size="xs" variant="link" onClick={() => retirar(l)} data-testid={`conferencia-retirar-${l.chave}`}>
                                Retirar
                              </AppButton>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}

        {acrescentando ? (
          <div className="conferencia-oficio__acrescentar" data-testid="conferencia-acrescentar">
            <strong>Acrescentar item pedido no ofício</strong>
            <div className="conferencia-oficio__grade">
              <AppSelect label="Item da ata *" value={novoItem} onChange={(e) => setNovoItem(e.target.value)} data-testid="conferencia-novo-item">
                <option value="">Escolha…</option>
                {itensParaAcrescentar.map((i) => (
                  <option key={i.itemKey} value={i.itemKey}>
                    {nomeDoItem({
                      tipo: 'ITEM',
                      itemKey: i.itemKey,
                      kitNome: null
                    })}{' '}
                    · ata {i.numeroAta} · {formatCurrency(precoParaEmenda(i.itemKey, itens, precos).valor)} · {formatNumber(livre(i.itemKey))} livres
                  </option>
                ))}
              </AppSelect>
              <AppSelect label="Órgão que recebe *" value={novoBeneficiario} onChange={(e) => setNovoBeneficiario(e.target.value)} data-testid="conferencia-novo-beneficiario">
                <option value="">Escolha…</option>
                {beneficiariosParaAcrescentar.map((b) => (
                  <option key={b.id} value={b.id}>
                    {rotuloBeneficiario(b)}
                  </option>
                ))}
              </AppSelect>
              <AppInput
                label="Quantidade *"
                inputMode="numeric"
                value={novaQuantidade}
                onChange={(e) => setNovaQuantidade(e.target.value.replace(/\D/g, ''))}
                data-testid="conferencia-nova-qtd"
              />
            </div>
            {ufDoAutor && (
              <label className="conferencia-oficio__check">
                <input type="checkbox" checked={todasUfs} onChange={(e) => setTodasUfs(e.target.checked)} /> Mostrar órgãos de todas as UFs (hoje só {ufDoAutor})
              </label>
            )}
            {erroNovo && (
              <div className="conferencia-oficio__aviso conferencia-oficio__aviso--erro" role="alert">
                {erroNovo}
              </div>
            )}
            <div className="conferencia-oficio__acoes">
              <AppButton size="sm" onClick={acrescentar} data-testid="conferencia-novo-confirmar">
                Acrescentar
              </AppButton>
              <ActionButton action="cancelar" size="sm" onClick={() => (setAcrescentando(false), setErroNovo(null))} />
            </div>
          </div>
        ) : (
          <div>
            <AppButton size="sm" variant="outline" onClick={() => setAcrescentando(true)} data-testid="conferencia-abrir-acrescentar">
              + Acrescentar item pedido no ofício
            </AppButton>
          </div>
        )}

        <div className="conferencia-oficio__soma">
          <div className="conferencia-oficio__kpi">
            <span>Valor do pedido{ajustes.length ? ' ajustado' : ''}</span>
            <b data-testid="conferencia-total">{formatCurrency(total)}</b>
            <small>pelo preço de hoje das atas</small>
          </div>
          <AppInput
            label="Valor deste ofício (R$) *"
            hint="O que o parlamentar pediu neste ofício."
            inputMode="decimal"
            placeholder="1.200.000,00"
            value={valorOficio}
            onChange={(e) => setValorOficio(mascaraValorBR(e.target.value, valorOficio))}
            data-testid="conferencia-valor-oficio"
          />
          <AppInput
            label="Documento SEI do ofício"
            hint="Com retificador, o do retificador."
            inputMode="numeric"
            value={seiOficio}
            onChange={(e) => setSeiOficio(e.target.value)}
          />
        </div>
        <label className="conferencia-oficio__check">
          <input type="checkbox" checked={retificador} onChange={(e) => setRetificador(e.target.checked)} /> Ofício retificador (o valor substitui o do ofício anterior)
        </label>
        {valorDoOficio != null && valorDoOficio > 0 && !oficioIgual && (
          <div className="conferencia-oficio__aviso conferencia-oficio__aviso--erro" role="status" data-testid="conferencia-oficio-diferente">
            O ofício pede {formatCurrency(valorDoOficio)} e os itens somam {formatCurrency(total)} ({valorDoOficio > total ? 'ofício acima' : 'ofício abaixo'} em{' '}
            {formatCurrency(Math.abs(valorDoOficio - total))}). O ofício precisa ser igual ao pedido, centavo a centavo: se o parlamentar mudou algum item, ajuste o pedido acima;
            senão, gere nova minuta.
          </div>
        )}
        {foraDoPrazo && (
          <div className="conferencia-oficio__aviso conferencia-oficio__aviso--erro" role="status" data-testid="conferencia-fora-do-prazo">
            O ofício chegou em {dataBR(pedido.oficioEm)}, depois do prazo da minuta ({dataBR(pedido.minutaValidaAte)}). Gere uma nova minuta com o preço do dia.
          </div>
        )}
        {mudaram.length > 0 && (
          <div className="conferencia-oficio__aviso conferencia-oficio__aviso--erro" role="status" data-testid="conferencia-preco-mudou">
            O preço mudou depois da minuta e o ofício saiu com o preço antigo: gere uma nova minuta.{' '}
            {mudaram
              .map(
                (m) => `${nomeDoItem({ tipo: 'ITEM', itemKey: m.itemKey, kitNome: null })} (ata ${m.numeroAta ?? '?'}): ${formatCurrency(m.naMinuta)} → ${formatCurrency(m.hoje)}`
              )
              .join('; ')}
            .
          </div>
        )}
      </section>

      <section className="conferencia-oficio__parte" aria-labelledby="conferencia-parte-2">
        <div className="conferencia-oficio__parte-cab">
          <span className="conferencia-oficio__num">2</span>
          <h3 id="conferencia-parte-2">A emenda no SIOP bate com o ofício?</h3>
        </div>
        <div className="conferencia-oficio__grade">
          <AppSelect label="Ano da emenda *" value={String(anoEmenda)} disabled={emendaTravada} onChange={(e) => setAnoEmenda(Number(e.target.value))} data-testid="conferencia-emenda-ano">
            {anosDaEmenda.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </AppSelect>
          <AppInput
            label="Nº da emenda *"
            placeholder="Ex.: 4095 0004"
            hint={emendaTravada ? 'Informado na reserva: confira no SIOP.' : '8 dígitos. Pode colar o código do SIOP com o ano.'}
            inputMode="numeric"
            readOnly={emendaTravada}
            value={emenda}
            onChange={(e) => digitarEmenda(e.target.value)}
            data-testid="conferencia-emenda"
          />
          {digitaValorDaEmenda && (
            <AppInput
              label={registrada ? 'Valor novo da emenda no SIOP (R$) *' : 'Valor da emenda no SIOP (R$) *'}
              hint="Só a parte de compra direta pelo MJ."
              inputMode="decimal"
              placeholder="1.200.000,00"
              value={valor}
              onChange={(e) => setValor(mascaraValorBR(e.target.value, valor))}
              data-testid="conferencia-valor-emenda"
            />
          )}
          <AppSelect label="GND" value={gnd} onChange={(e) => setGnd(e.target.value)}>
            <option value="GND-4">GND-4 Investimento</option>
            <option value="GND-3">GND-3 Custeio</option>
          </AppSelect>
          <AppDateInput label="Conferido em" value={data} onValueChange={setData} />
        </div>
        {numeroDaReserva && (
          <div className="conferencia-oficio__aviso conferencia-oficio__aviso--info" data-testid="conferencia-emenda-da-reserva">
            {trocandoEmenda ? 'Trocando a emenda informada na reserva: digite o nº e o ano que o ofício cita.' : 'A emenda foi informada na reserva e saiu na minuta.'}{' '}
            <AppButton
              type="button"
              variant="link"
              size="xs"
              onClick={() => {
                if (trocandoEmenda) {
                  setEmenda(numeroDaEmendaEmTexto(numeroDaReserva));
                  if (anoDaReserva != null) setAnoEmenda(anoDaReserva);
                  setMotivoTroca('');
                }
                setTrocandoEmenda((t) => !t);
              }}
              data-testid="conferencia-trocar-emenda"
            >
              {trocandoEmenda ? 'Manter a emenda da reserva' : 'Trocar a emenda'}
            </AppButton>
          </div>
        )}
        {trocouEmenda && (
          <AppInput
            label="Motivo da troca da emenda *"
            hint="Fica registrado no pedido."
            placeholder="Ex.: o ofício cita outra emenda do parlamentar"
            value={motivoTroca}
            onChange={(e) => setMotivoTroca(e.target.value)}
            error={tentou && !motivoTroca.trim() ? 'Informe o motivo.' : undefined}
            data-testid="conferencia-motivo-troca"
          />
        )}
        {registrada && registrada.valor != null && (
          <div className="conferencia-oficio__aviso conferencia-oficio__aviso--info" data-testid="conferencia-valor-registrado">
            Valor da emenda no SIOP: <b>{formatCurrency(registrada.valor)}</b> · {registrada.gnd} · lido em {registrada.vistaEm.split('-').reverse().join('/')}
            {valorDoOficio != null && valorDoOficio > 0 && !corrigindoSiop && (
              <>
                {' '}
                ·{' '}
                {valorDoOficio - registrada.valor > 0.004
                  ? `o ofício pede ${formatCurrency(valorDoOficio - registrada.valor)} a mais que a emenda`
                  : `a indicar depois deste ofício: ${formatCurrency(registrada.valor - valorDoOficio)} (os outros pedidos da emenda também descontam)`}
              </>
            )}{' '}
            <AppButton type="button" variant="link" size="xs" onClick={() => setCorrigindoSiop((c) => !c)} data-testid="conferencia-corrigir-siop">
              {corrigindoSiop ? 'Manter o valor lido' : 'O SIOP mudou? Corrigir'}
            </AppButton>
          </div>
        )}
        {!registrada && valorDaEmenda != null && valorDoOficio != null && valorDoOficio - valorDaEmenda > 0.004 && (
          <div className="conferencia-oficio__aviso conferencia-oficio__aviso--atencao" role="status">
            O ofício pede {formatCurrency(valorDoOficio - valorDaEmenda)} a mais que o valor da emenda no SIOP.
          </div>
        )}
        {conferenciaDaEmenda && conferenciaDaEmenda.outroAutor.length > 0 && (
          <div className="conferencia-oficio__aviso conferencia-oficio__aviso--atencao" role="status" data-testid="conferencia-emenda-outro-autor">
            Os 4 primeiros dígitos ({emendaLida!.numero.slice(0, 4)}) são o código do autor, e nos pedidos{' '}
            {conferenciaDaEmenda.outroAutor.map((x) => `${nomeDe(x.autorId)} (emenda ${numeroDaEmendaEmTexto(x.siopEmenda!)})`).join(', ')} eles são de outro parlamentar. Confira
            se o número não está trocado.
          </div>
        )}
        {conferenciaDaEmenda && conferenciaDaEmenda.mesmaEmenda.length > 0 && (
          <div className="conferencia-oficio__aviso conferencia-oficio__aviso--info" data-testid="conferencia-emenda-outro-pedido">
            Esta emenda também está em {conferenciaDaEmenda.mesmaEmenda.length === 1 ? 'outro pedido' : `${conferenciaDaEmenda.mesmaEmenda.length} outros pedidos`} de {nomeDoAutor}{' '}
            ({identificacoesDosOutros}): o valor do SIOP é da emenda inteira; cada pedido tem o valor do seu ofício.
          </div>
        )}
        {conta && (
          <div className="conferencia-oficio__soma" data-testid="conferencia-cabe-na-emenda">
            <div className="conferencia-oficio__kpi">
              <span>Valor da emenda no SIOP</span>
              <b>{formatCurrency(valorDaEmenda!)}</b>
              <small>{conta.outros > 0 ? `menos ${formatCurrency(conta.outros)} dos outros pedidos da emenda` : 'nenhum outro pedido da emenda'}</small>
            </div>
            <div className="conferencia-oficio__kpi">
              <span>A indicar para este pedido</span>
              <b>{formatCurrency(conta.sobra)}</b>
              <small>este pedido: {formatCurrency(total)}</small>
            </div>
            <div className="conferencia-oficio__kpi">
              <span>Cabe na emenda?</span>
              <b className={cabe ? 'conferencia-oficio__bate' : 'conferencia-oficio__nao-bate'} data-testid="conferencia-cabe">
                {cabe ? 'Cabe' : 'Não cabe'}
              </b>
              <small>
                {cabe ? (comOutraEmenda ? 'confira também a outra emenda' : `sobram ${formatCurrency(conta.sobra - total)}`) : `faltam ${formatCurrency(total - conta.sobra)}`}
              </small>
            </div>
          </div>
        )}
        {conta && !cabe && (
          <div className="conferencia-oficio__aviso conferencia-oficio__aviso--erro" role="status" data-testid="conferencia-nao-cabe">
            O valor dos itens passa do que sobra da emenda{mudaram.length ? ', porque o preço mudou depois da minuta' : ''}. Se o parlamentar tirou ou diminuiu algum item,
            ajuste o pedido acima; senão, gere nova minuta.
          </div>
        )}
        {comOutraEmenda && (
          <div className="conferencia-oficio__aviso conferencia-oficio__aviso--atencao" role="status">
            Este pedido também usa {pedido.outrasEmendas.map((o) => `a emenda ${o.ano} · ${numeroDaEmendaEmTexto(o.numero)}`).join(', ')}: o sistema não tem o valor dela, então a
            conta não trava. Confira o saldo das emendas no SIOP.
          </div>
        )}
        <div className="conferencia-oficio__pontos">
          {PONTOS_SIOP.map((x) => (
            <label key={x.chave} className={pontos[x.chave] ? 'conferencia-oficio__ponto conferencia-oficio__ponto--ok' : 'conferencia-oficio__ponto'}>
              <input
                type="checkbox"
                className="conferencia-oficio__chk"
                checked={Boolean(pontos[x.chave])}
                onChange={(e) => setPontos((p) => ({ ...p, [x.chave]: e.target.checked }))}
                data-testid={`conferencia-ponto-${x.chave}`}
              />
              <span>
                {x.rotulo}
                {x.dica && <small>{x.dica}</small>}
              </span>
            </label>
          ))}
        </div>
      </section>

      <div className="conferencia-oficio__rodape" data-testid="conferencia-rodape">
        {devolvendo ? (
          <>
            <div className="conferencia-oficio__devolver">
              <AppTextarea
                label="O que não bate *"
                rows={2}
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ex.: o ofício pede rádio da ata 00031/2023, que venceu"
                error={tentou && !motivo.trim() ? 'Descreva o que não bate.' : undefined}
                data-testid="conferencia-motivo"
              />
              <span className="conferencia-oficio__sub">
                {ajustes.length
                  ? `${ajustes.length === 1 ? 'O ajuste feito aqui fica' : `Os ${ajustes.length} ajustes feitos aqui ficam`} no pedido e entram na nova minuta. `
                  : ''}
                O pedido volta para a reserva ({rodada + 1}ª minuta) e o quadro do ofício sai com o preço de hoje.
              </span>
            </div>
            <AppButton onClick={gerarNovaMinuta} isLoading={ocupado} disabled={ocupado} data-testid="conferencia-confirmar-nova-minuta">
              Gerar nova minuta
            </AppButton>
            <ActionButton action="voltar" onClick={() => setDevolvendo(false)} disabled={ocupado} />
          </>
        ) : (
          <>
            <div className="conferencia-oficio__estado">
              <b>
                Itens {conferidas} de {linhas.length} · SIOP {pontosMarcados} de {PONTOS_SIOP.length}
              </b>
              {ajustes.length > 0 && (
                <span className="conferencia-oficio__etiqueta conferencia-oficio__etiqueta--ajuste">
                  {ajustes.length === 1 ? '1 ajuste' : `${ajustes.length} ajustes`} no pedido
                </span>
              )}
              <span className="conferencia-oficio__sub">{ajustes.length ? 'Os ajustes só valem ao concluir.' : 'Nenhum ajuste no pedido.'}</span>
              {tentou && pendencias.length > 0 && (
                <span className="conferencia-oficio__falta" role="alert" data-testid="conferencia-pendencias">
                  Falta: {pendencias.join('; ')}.
                </span>
              )}
            </div>
            <AppButton variant="ghostDanger" onClick={abrirDevolucao} disabled={ocupado} data-testid="conferencia-nova-minuta">
              Não bate: gerar nova minuta
            </AppButton>
            <AppButton onClick={tudoConfere} isLoading={ocupado} disabled={ocupado} data-testid="conferencia-tudo-confere">
              {ajustes.length ? 'Tudo confere, salvar ajustes' : 'Tudo confere'}
            </AppButton>
          </>
        )}
      </div>
    </div>
  );
};
