import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { Modal } from '../../design-system/components/Modal';
import { AppButton } from '../../design-system/components/AppButton';
import { ActionButton } from '../../design-system/components/ActionButton';
import { InfoHint } from '../../design-system/components/InfoHint';
import { StatusBadge } from '../../design-system/components/StatusBadge';
import { AppInput, AppTextarea } from '../../design-system/components/FormFields';
import { useToast } from '../../design-system/components/Toast';
import { usePodeGerirEmendas, useSalvarPedido } from '../../hooks/useEmendas';
import { usePrecosParaEmenda } from '../../hooks/useEmendasQuadro';
import { formatCurrency, formatNumber } from '../../utils/format';
import { descricaoItemEmFrase } from '../../utils/textCase';
import { buscarItensCaep, calcularKit, curto, dataBR, diasEntre, limiteDaIndicacao, passouDoCorte, rotuloItemDaAta } from '../../utils/emendasKits';
import { casaBusca, textoDeBuscaDoBeneficiario } from '../../utils/emendasBeneficiarios';
import { identificacaoDoPedido, itensDaLinha, orgaoDoPedido, precoParaEmenda, valorDaLinha, VOLTA_AO_OFICIO } from '../../utils/emendasPedidos';
import { nomeDoItem, notaDoPreco } from '../../utils/emendasQuadro';
import { formatarTelefone, localDoBeneficiario, nomeESigla, rotuloBeneficiario, soDigitos } from '../../services/emendasService';
import type { AutorEmenda, BeneficiarioEmenda, ItemCaep, ItemDoKit, KitEmenda, PedidoEmenda } from '../../services/emendasService';
import { QuadroGabinete } from './QuadroGabinete';

interface Props {
  pedido: PedidoEmenda | null;
  autores: AutorEmenda[];
  itens: ItemCaep[];
  kits: KitEmenda[];
  beneficiarios: BeneficiarioEmenda[];
  /** Reservado por item nos outros pedidos (sem este). */
  reservadoFora: Map<string, number>;
  /** Último contato da assessoria usado com cada autor: sugerido na nova reserva. */
  ultimoContato: Map<string, Pick<PedidoEmenda, 'contatoNome' | 'contatoTelefone' | 'contatoEmail'>>;
  hoje: string;
  onClose: () => void;
}

interface LinhaEdicao {
  chave: string;
  id?: string;
  tipo: 'ITEM' | 'KIT';
  itemKey: string | null;
  kitId: string | null;
  kitNome: string | null;
  kitComposicao: ItemDoKit[] | null;
  quantidade: number;
  /** null = o beneficiário do pedido; preenchido só quando esta linha vai para outro órgão. */
  beneficiarioId: string | null;
}

interface Rascunho {
  autorId: string;
  paraOrgao: boolean;
  contato: { nome: string; telefone: string; email: string };
  beneficiarioDoPedido: string | null;
  linhas: LinhaEdicao[];
  observacao: string;
  salvoEm: string;
}

type Filtro = 'tudo' | 'itens' | 'kits';
type Pendencia = { texto: string; alvo: string; lado: 'itens' | 'pedido' };

const MAX_RESULTADOS = 40;
const MAX_BENEFICIARIOS = 60;
const CHAVE_RASCUNHO = 'emendas-reserva-rascunho';
const MARCAS = ['¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'];
const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const TIPO_AUTOR: Record<AutorEmenda['tipo'], string> = { DEPUTADO: 'Deputado', SENADOR: 'Senador', BANCADA: 'Bancada' };
const iniciais = (nome: string) =>
  nome
    .split(/\s+/)
    .filter((p) => p.length > 2 || /^[A-Z]/.test(p))
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
const metaDoAutor = (a: AutorEmenda) => [TIPO_AUTOR[a.tipo], a.partido, a.uf, a.emExercicio === false ? 'fora do cargo' : null].filter(Boolean).join(' · ');
const doisPrecos = (previsto: number, hoje: number) => Math.abs(previsto - hoje) > 0.004;
let seq = 0;

/** Cartão de item ou kit na busca da reserva: nome do quadro (descrição no ⓘ), preço numa coluna fixa e saldo no pé. */
function CartaoResultado(props: {
  nome: React.ReactNode;
  descricao: string;
  rotuloDescricao: string;
  meta: React.ReactNode;
  previsto: number;
  hoje: number;
  unidade: string;
  notaPreco?: string | null;
  saldo: React.ReactNode;
  noPedido: number;
  pode: boolean;
  acao: React.ReactNode;
}) {
  const { nome, descricao, rotuloDescricao, meta, previsto, hoje, unidade, notaPreco, saldo, noPedido, pode, acao } = props;
  return (
    <div className={`reserva-resultado${pode ? '' : ' reserva-resultado--off'}${noPedido ? ' reserva-resultado--no-pedido' : ''}`}>
      <div className="reserva-resultado__nome">
        <span className="reserva-resultado__titulo">{nome}</span>
        <InfoHint content={descricao} label={rotuloDescricao} testId="emendas-pedido-descricao" />
      </div>
      <div className="reserva-resultado__meta reserva-mudo">{meta}</div>
      <div className="reserva-resultado__preco" title={notaPreco ?? undefined}>
        <span className="reserva-resultado__valor">{formatCurrency(previsto)}</span>
        <span className="reserva-mudo">{unidade} · previsto</span>
        {doisPrecos(previsto, hoje) && <span className="reserva-mudo">hoje {formatCurrency(hoje)}</span>}
      </div>
      <div className="reserva-resultado__acao">{acao}</div>
      <div className="reserva-resultado__saldo">{saldo}</div>
    </div>
  );
}

const Etiqueta = ({ texto, variante }: { texto: string; variante: 'danger' | 'info' }) => <StatusBadge label={texto} variant={variante} size="sm" dot={false} testId="emendas-pedido-etiqueta" />;

function lerRascunho(): Rascunho | null {
  try {
    const r = localStorage.getItem(CHAVE_RASCUNHO);
    return r ? (JSON.parse(r) as Rascunho) : null;
  } catch {
    return null;
  }
}
function guardarRascunho(r: Rascunho | null) {
  try {
    if (r) localStorage.setItem(CHAVE_RASCUNHO, JSON.stringify(r));
    else localStorage.removeItem(CHAVE_RASCUNHO);
  } catch {
    // Sem armazenamento no navegador (janela anônima): a reserva funciona sem rascunho.
  }
}

/**
 * Nova reserva ou alteração das linhas de um pedido (protótipo aprovado em 24/10/2026): à esquerda a busca dos itens e
 * kits da CAEP, à direita o pedido, com o total no rodapé. O beneficiário é escolhido uma vez para o pedido e só muda na
 * linha que vai para outro órgão; item repetido soma na mesma linha. Os valores são os previstos para a emenda, os
 * mesmos do quadro do parlamentar. A trava de saldo é conferida aqui e de novo no banco.
 */
export const PedidoModal: React.FC<Props> = ({ pedido, autores, itens, kits, beneficiarios, reservadoFora, ultimoContato, hoje, onClose }) => {
  const salvar = useSalvarPedido();
  const toast = useToast();
  const { precos, ipca, semPrevisao } = usePrecosParaEmenda();
  const semAutorGravado = Boolean(pedido && !pedido.autorId);

  // Linhas gravadas: o beneficiário que todas têm em comum vira o do pedido.
  const inicio = useMemo(() => {
    const gravadas: LinhaEdicao[] =
      pedido?.linhas
        .filter((l) => !l.cancelada)
        .map((l) => ({ chave: l.id, id: l.id, tipo: l.tipo, itemKey: l.itemKey, kitId: l.kitId, kitNome: l.kitNome, kitComposicao: l.kitComposicao, quantidade: l.quantidade, beneficiarioId: l.beneficiarioId })) ?? [];
    const bens = new Set(gravadas.map((l) => l.beneficiarioId));
    const comum = bens.size === 1 ? [...bens][0] : null;
    return { linhas: comum ? gravadas.map((l) => ({ ...l, beneficiarioId: null })) : gravadas, beneficiario: comum };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [rascunhoAntigo] = useState(() => (pedido ? null : lerRascunho()));

  const [autorId, setAutorId] = useState(pedido?.autorId ?? '');
  // Reserva para um órgão (migration 163): nova reserva sem parlamentar.
  const [paraOrgao, setParaOrgao] = useState(false);
  const [buscaAutor, setBuscaAutor] = useState('');
  const [observacao, setObservacao] = useState(pedido?.observacao ?? '');
  const [obsAberta, setObsAberta] = useState(Boolean(pedido?.observacao));
  const [contatoNome, setContatoNome] = useState(pedido?.contatoNome ?? '');
  const [contatoTelefone, setContatoTelefone] = useState(pedido?.contatoTelefone ? formatarTelefone(pedido.contatoTelefone) : '');
  const [contatoEmail, setContatoEmail] = useState(pedido?.contatoEmail ?? '');
  const [contatoSugerido, setContatoSugerido] = useState(false);
  const [editarContato, setEditarContato] = useState(false);
  const [beneficiarioDoPedido, setBeneficiarioDoPedido] = useState<string | null>(inicio.beneficiario);
  const [linhas, setLinhas] = useState<LinhaEdicao[]>(inicio.linhas);
  const [motivo, setMotivo] = useState('');
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('tudo');
  const [lado, setLado] = useState<'itens' | 'pedido'>('itens');
  const [seletorAberto, setSeletorAberto] = useState<string | null>(null);
  const [buscaBeneficiario, setBuscaBeneficiario] = useState('');
  const [abertas, setAbertas] = useState<ReadonlySet<string>>(new Set());
  const [recado, setRecado] = useState<{ texto: string; desfazer?: () => void } | null>(null);
  const [confirmarSaida, setConfirmarSaida] = useState(false);
  const [tentou, setTentou] = useState(false);
  const [piscando, setPiscando] = useState<string | null>(null);
  const [rascunhoEm, setRascunhoEm] = useState<string | null>(null);
  const buscaRef = useRef<HTMLInputElement>(null);

  const porChave = useMemo(() => new Map(itens.map((i) => [i.itemKey, i])), [itens]);
  const porBeneficiario = useMemo(() => new Map(beneficiarios.map((b) => [b.id, b])), [beneficiarios]);
  const autor = autores.find((a) => a.id === autorId);
  const saldoAntes = useCallback((k: string) => (porChave.get(k)?.alocado ?? 0) - (reservadoFora.get(k) ?? 0), [porChave, reservadoFora]);
  const nomeDoBeneficiario = (id: string) => {
    const b = porBeneficiario.get(id);
    return b ? rotuloBeneficiario(b) : undefined;
  };
  const tituloDoPedido = pedido ? (pedido.autorId ? autor?.nome ?? '' : orgaoDoPedido(pedido, nomeDoBeneficiario) ?? 'órgão') : '';
  const orgaoNaFrente = (paraOrgao && !pedido) || (semAutorGravado && !autorId);
  const preco = (k: string) => precoParaEmenda(k, porChave, precos);

  // Consumo do saldo por item com as linhas desta tela.
  const consumo = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of linhas) if (l.quantidade > 0) for (const x of itensDaLinha(l)) m.set(x.itemKey, (m.get(x.itemKey) ?? 0) + x.quantidade);
    return m;
  }, [linhas]);
  const livre = (k: string) => saldoAntes(k) - (consumo.get(k) ?? 0);
  const passaDoSaldo = (l: LinhaEdicao) => itensDaLinha(l).some((x) => livre(x.itemKey) < 0);
  const unidadeDaLinha = (l: LinhaEdicao) => (l.tipo === 'ITEM' ? (l.itemKey ? [{ itemKey: l.itemKey, quantidade: 1 }] : []) : (l.kitComposicao ?? []));
  const cabeMaisUm = (l: LinhaEdicao) => unidadeDaLinha(l).every((x) => livre(x.itemKey) >= x.quantidade);

  // Notas do preço na ordem em que os itens aparecem no pedido, como no quadro do parlamentar.
  const notas = useMemo(() => {
    const n: string[] = [];
    for (const l of linhas)
      for (const x of itensDaLinha(l)) {
        const t = notaDoPreco(precos?.get(x.itemKey), ipca);
        if (t && !n.includes(t)) n.push(t);
      }
    return n;
  }, [linhas, precos, ipca]);
  const marcasDaLinha = (l: LinhaEdicao) => [...new Set(itensDaLinha(l).map((x) => notaDoPreco(precos?.get(x.itemKey), ipca)).filter((t): t is string => Boolean(t)).map((t) => MARCAS[notas.indexOf(t)] ?? ''))].join('');

  const total = valorTotal(linhas, porChave, precos);
  const totalHoje = valorTotal(linhas, porChave);
  const unidades = linhas.reduce((s, l) => s + (l.quantidade || 0), 0);
  const tirou = pedido ? pedido.linhas.filter((l) => !l.cancelada && !linhas.some((x) => x.id === l.id)).length : 0;

  const autoresEncontrados = useMemo(() => {
    const t = semAcento(buscaAutor.trim());
    if (!t) return [];
    return autores
      .filter((a) => semAcento(`${a.nome} ${a.nomeCivil ?? ''} ${a.uf ?? ''} ${a.partido ?? ''}`).includes(t))
      .sort((a, b) => Number(b.emExercicio ?? true) - Number(a.emExercicio ?? true) || a.nome.localeCompare(b.nome, 'pt-BR'))
      .slice(0, 8);
  }, [autores, buscaAutor]);

  // Kits ativos com pelo menos um item em ata vigente e itens de ata vigente.
  const kitsOferecidos = useMemo(
    () =>
      kits
        .filter((k) => k.ativo)
        .map((k) => ({ k, c: calcularKit(k, porChave, hoje, (i) => saldoAntes(i.itemKey) - (consumo.get(i.itemKey) ?? 0), precos) }))
        .filter((x) => x.c.situacao !== 'indisponivel' || x.c.kitsPossiveis > 0 || linhas.some((l) => l.kitId === x.k.id)),
    [kits, porChave, hoje, saldoAntes, consumo, precos, linhas]
  );
  const t = semAcento(busca.trim());
  const kitsEncontrados = filtro === 'itens' ? [] : kitsOferecidos.filter((x) => !t || semAcento(x.k.nome).includes(t));
  const itensEncontrados = filtro === 'kits' ? [] : buscarItensCaep(itens.filter((i) => !i.ataEncerrada), busca);
  // Ata a menos do corte do fim (migration 162): aparece na busca, mas não pode ser escolhida.
  const foraDoPrazo = (i: ItemCaep) => Boolean(i.vigenciaFinal) && passouDoCorte(diasEntre(hoje, i.vigenciaFinal!));
  // Quem cadastra o nome curto (Emendas › Itens) vê quais itens ainda saem no quadro pelo começo da descrição.
  const avisarSemNomeCurto = usePodeGerirEmendas();
  const podeItem = (i: ItemCaep) => !foraDoPrazo(i) && livre(i.itemKey) > 0;

  const ativosBen = useMemo(() => beneficiarios.filter((b) => b.ativo).sort((a, b) => rotuloBeneficiario(a).localeCompare(rotuloBeneficiario(b), 'pt-BR')), [beneficiarios]);
  const beneficiariosEncontrados = ativosBen.filter((b) => casaBusca(textoDeBuscaDoBeneficiario(b), buscaBeneficiario)).slice(0, MAX_BENEFICIARIOS);

  const tel = soDigitos(contatoTelefone);
  const pendencias: Pendencia[] = [];
  if (!autorId && !pedido && !paraOrgao) pendencias.push({ texto: 'o parlamentar', alvo: 'emendas-pedido-busca-autor', lado: 'pedido' });
  if (orgaoNaFrente && (!beneficiarioDoPedido && linhas.some((l) => !l.beneficiarioId))) pendencias.push({ texto: 'o órgão que pediu', alvo: 'emendas-pedido-beneficiario-pedido', lado: 'pedido' });
  if (linhas.length === 0) pendencias.push({ texto: 'pelo menos um item', alvo: 'emendas-pedido-busca', lado: 'itens' });
  if (linhas.some((l) => !(Number.isInteger(l.quantidade) && l.quantidade > 0))) pendencias.push({ texto: 'quantidade inteira maior que zero em cada item', alvo: 'emendas-pedido-linhas', lado: 'pedido' });
  if (linhas.some(passaDoSaldo)) pendencias.push({ texto: 'quantidade dentro do saldo livre da CAEP', alvo: 'emendas-pedido-linhas', lado: 'pedido' });
  if (tel && (tel.length < 10 || tel.length > 11)) pendencias.push({ texto: 'telefone do contato com DDD (10 ou 11 números)', alvo: 'emendas-pedido-contato-telefone', lado: 'pedido' });
  if (contatoEmail.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contatoEmail.trim())) pendencias.push({ texto: 'e-mail do contato válido', alvo: 'emendas-pedido-contato-email', lado: 'pedido' });

  const temConteudo = linhas.length > 0 || Boolean(autorId && !pedido) || Boolean(contatoNome || contatoTelefone || contatoEmail);
  const mudou = pedido ? tirou > 0 || linhas.length !== inicio.linhas.length || linhas.some((l) => !l.id) : temConteudo;

  // Rascunho só da reserva nova: some ao reservar ou descartar.
  useEffect(() => {
    if (pedido || rascunhoAntigo) return;
    if (!temConteudo) return guardarRascunho(null);
    const salvoEm = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    guardarRascunho({ autorId, paraOrgao, contato: { nome: contatoNome, telefone: contatoTelefone, email: contatoEmail }, beneficiarioDoPedido, linhas, observacao, salvoEm });
    setRascunhoEm(salvoEm);
  }, [pedido, rascunhoAntigo, temConteudo, autorId, paraOrgao, contatoNome, contatoTelefone, contatoEmail, beneficiarioDoPedido, linhas, observacao]);
  const [rascunhoPendente, setRascunhoPendente] = useState(Boolean(rascunhoAntigo));
  const recuperarRascunho = () => {
    const r = rascunhoAntigo!;
    setAutorId(r.autorId);
    setParaOrgao(r.paraOrgao);
    setContatoNome(r.contato.nome);
    setContatoTelefone(r.contato.telefone);
    setContatoEmail(r.contato.email);
    setBeneficiarioDoPedido(r.beneficiarioDoPedido);
    setLinhas(r.linhas.map((l) => ({ ...l, chave: `r${++seq}` })));
    setObservacao(r.observacao);
    setObsAberta(Boolean(r.observacao));
    setRascunhoPendente(false);
  };

  useEffect(() => {
    if (!recado) return;
    const id = window.setTimeout(() => setRecado(null), recado.desfazer ? 8000 : 4000);
    return () => window.clearTimeout(id);
  }, [recado]);
  useEffect(() => {
    if (!piscando) return;
    const id = window.setTimeout(() => setPiscando(null), 1200);
    return () => window.clearTimeout(id);
  }, [piscando]);
  // Tecla "/" vai para a busca dos itens (fora de um campo de texto).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement;
      if (e.key !== '/' || /INPUT|TEXTAREA|SELECT/.test(alvo.tagName)) return;
      e.preventDefault();
      setLado('itens');
      buscaRef.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  /** Escolher o autor sugere o último contato da assessoria usado com ele (só se os campos estiverem vazios). */
  const escolherAutor = (id: string) => {
    setAutorId(id);
    setBuscaAutor('');
    const c = ultimoContato.get(id);
    if (c && !contatoNome && !contatoTelefone && !contatoEmail) {
      setContatoNome(c.contatoNome ?? '');
      setContatoTelefone(c.contatoTelefone ? formatarTelefone(c.contatoTelefone) : '');
      setContatoEmail(c.contatoEmail ?? '');
      setContatoSugerido(true);
    }
  };

  const avisarNoCelular = (texto: string) => setRecado({ texto });
  const adicionarItem = (i: ItemCaep) => {
    const ja = linhas.find((l) => l.tipo === 'ITEM' && l.itemKey === i.itemKey);
    if (ja) {
      setLinhas((ls) => ls.map((l) => (l.chave === ja.chave ? { ...l, quantidade: l.quantidade + 1 } : l)));
      setPiscando(ja.chave);
      avisarNoCelular(`Já estava no pedido: ${curto(i.nomeCurto || i.descricao, 40).toLowerCase()} passou para ${formatNumber(ja.quantidade + 1)}.`);
      return;
    }
    const chave = `n${++seq}`;
    setLinhas((ls) => [...ls, { chave, tipo: 'ITEM', itemKey: i.itemKey, kitId: null, kitNome: null, kitComposicao: null, quantidade: 1, beneficiarioId: null }]);
    setPiscando(chave);
    avisarNoCelular(`${curto(i.nomeCurto || i.descricao, 40)} entrou no pedido.`);
  };
  const adicionarKit = (k: KitEmenda) => {
    const ja = linhas.find((l) => l.tipo === 'KIT' && l.kitId === k.id);
    if (ja) {
      setLinhas((ls) => ls.map((l) => (l.chave === ja.chave ? { ...l, quantidade: l.quantidade + 1 } : l)));
      setPiscando(ja.chave);
      avisarNoCelular(`Já estava no pedido: ${k.nome} passou para ${formatNumber(ja.quantidade + 1)}.`);
      return;
    }
    const chave = `n${++seq}`;
    setLinhas((ls) => [...ls, { chave, tipo: 'KIT', itemKey: null, kitId: k.id, kitNome: k.nome, kitComposicao: k.itens.map((i) => ({ ...i })), quantidade: 1, beneficiarioId: null }]);
    setPiscando(chave);
    avisarNoCelular(`${k.nome} entrou no pedido.`);
  };
  const muda = (chave: string, parcial: Partial<LinhaEdicao>) => setLinhas((ls) => ls.map((l) => (l.chave === chave ? { ...l, ...parcial } : l)));
  const tirar = (l: LinhaEdicao) => {
    const posicao = linhas.indexOf(l);
    setLinhas((ls) => ls.filter((x) => x.chave !== l.chave));
    setRecado({
      texto: `${l.tipo === 'KIT' ? l.kitNome ?? 'Kit' : curto(porChave.get(l.itemKey ?? '')?.descricao ?? 'Item', 40)} saiu do pedido.`,
      desfazer: () => {
        setLinhas((ls) => [...ls.slice(0, posicao), l, ...ls.slice(posicao)]);
        setPiscando(l.chave);
      }
    });
  };
  const separar = (l: LinhaEdicao) => {
    const nova: LinhaEdicao = { ...l, chave: `n${++seq}`, id: undefined, quantidade: 1, beneficiarioId: null };
    setLinhas((ls) => ls.flatMap((x) => (x.chave === l.chave ? [{ ...x, quantidade: x.quantidade - 1 }, nova] : [x])));
    abrirSeletor(nova.chave);
  };
  const abrirSeletor = (alvo: string | null) => {
    setSeletorAberto(alvo);
    setBuscaBeneficiario('');
  };
  const escolherBeneficiario = (alvo: string, id: string | null) => {
    if (alvo === 'pedido') setBeneficiarioDoPedido(id);
    else muda(alvo, { beneficiarioId: id && id !== beneficiarioDoPedido ? id : null });
    setSeletorAberto(null);
  };

  const irPara = (p: Pendencia) => {
    setLado(p.lado);
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(`[data-testid="${p.alvo}"]`);
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      if (el && /INPUT|BUTTON|TEXTAREA/.test(el.tagName)) el.focus({ preventScroll: true });
    });
  };

  const pedirParaFechar = () => {
    if (salvar.isPending) return;
    if (mudou) setConfirmarSaida(true);
    else onClose();
  };
  const descartar = () => {
    if (!pedido) guardarRascunho(null);
    onClose();
  };

  const enviar = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setTentou(true);
    if (pendencias.length) {
      irPara(pendencias[0]);
      return;
    }
    try {
      await salvar.mutateAsync({
        id: pedido?.id,
        versao: pedido?.versao,
        autorId: autorId || null,
        paraOrgao: !pedido && paraOrgao,
        observacao: observacao.trim() || null,
        contatoNome: contatoNome.trim() || null,
        contatoTelefone: tel || null,
        contatoEmail: contatoEmail.trim() || null,
        motivo: motivo.trim() || null,
        linhas: linhas.map((l) => ({ id: l.id, tipo: l.tipo, itemKey: l.itemKey, kitId: l.kitId, quantidade: l.quantidade, beneficiarioId: l.beneficiarioId ?? beneficiarioDoPedido }))
      });
      if (!pedido) guardarRascunho(null);
      const para = autor?.nome ?? (pedido ? orgaoDoPedido(pedido, nomeDoBeneficiario) : beneficiarioDoPedido ? nomeDoBeneficiario(beneficiarioDoPedido) : null) ?? 'o órgão';
      toast.success(semAutorGravado && autorId ? `Parlamentar indicado: ${autor?.nome ?? ''}.` : pedido ? `Pedido de ${para} atualizado.` : `Reserva para ${para} registrada.`);
      onClose();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  // Função que devolve o JSX (não um componente): assim o campo de busca não é recriado a cada letra.
  const seletor = ({ alvo, atual, vazio, erro, testId }: { alvo: string; atual: string | null; vazio: string; erro?: boolean; testId: string }) => {
    const b = atual ? porBeneficiario.get(atual) : undefined;
    const aberto = seletorAberto === alvo;
    return (
      <div className="reserva-seletor">
        <button type="button" className={`reserva-seletor__botao${erro ? ' reserva-erro' : ''}`} aria-expanded={aberto} onClick={() => abrirSeletor(aberto ? null : alvo)} data-testid={testId}>
          <span className="reserva-seletor__texto">
            {b ? (
              <>
                <b>{nomeESigla(b)}</b>
                {localDoBeneficiario(b) && <small>{localDoBeneficiario(b)}</small>}
              </>
            ) : (
              <span className="reserva-mudo">{vazio}</span>
            )}
          </span>
          <ChevronDown size={16} aria-hidden="true" />
        </button>
        {aberto && (
          <div className="reserva-seletor__lista" role="listbox">
            <input
              autoFocus
              className="reserva-campo"
              placeholder="Buscar órgão, sigla ou cidade"
              value={buscaBeneficiario}
              onChange={(e) => setBuscaBeneficiario(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (beneficiariosEncontrados[0]) escolherBeneficiario(alvo, beneficiariosEncontrados[0].id);
                } else if (e.key === 'Escape') {
                  e.stopPropagation();
                  setSeletorAberto(null);
                }
              }}
              data-testid={`${testId}-busca`}
            />
            <div className="reserva-lista">
              {beneficiariosEncontrados.map((x) => (
                <button type="button" key={x.id} role="option" aria-selected={x.id === atual} onClick={() => escolherBeneficiario(alvo, x.id)}>
                  <b>{nomeESigla(x)}</b>
                  {localDoBeneficiario(x) && <small>{localDoBeneficiario(x)}</small>}
                </button>
              ))}
              {beneficiariosEncontrados.length === 0 && <div className="reserva-mudo reserva-lista__vazia">Nenhum órgão encontrado. Cadastre em Ajustes › Beneficiários.</div>}
              {alvo !== 'pedido' ? (
                <button type="button" role="option" aria-selected={!atual} onClick={() => escolherBeneficiario(alvo, null)}>
                  <b>Usar o do pedido</b>
                  <small>{beneficiarioDoPedido ? nomeDoBeneficiario(beneficiarioDoPedido) : 'A informar'}</small>
                </button>
              ) : (
                !orgaoNaFrente && (
                  <button type="button" role="option" aria-selected={!atual} onClick={() => escolherBeneficiario(alvo, null)}>
                    <b>A informar depois</b>
                    <small>O gabinete ainda não disse para quem é</small>
                  </button>
                )
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  const falta = (alvo: string) => tentou && pendencias.some((p) => p.alvo === alvo);
  const primeiroDisponivel = () => kitsEncontrados.find((x) => x.c.kitsPossiveis > 0)?.k ?? itensEncontrados.find(podeItem);

  return (
    <Modal
      isOpen
      onClose={pedirParaFechar}
      dismissible={!salvar.isPending}
      size="xxl"
      className="reserva-modal"
      testId="emendas-pedido-modal"
      title={pedido ? `${semAutorGravado ? 'Reserva para' : 'Alterar o pedido de'} ${tituloDoPedido} · ${identificacaoDoPedido(pedido)}` : 'Nova reserva'}
      footer={
        <div className="reserva-rodape">
          {tentou && pendencias.length > 0 && (
            <div className="reserva-falta" role="alert" data-testid="emendas-pedido-pendencias">
              Falta:{' '}
              {pendencias.map((p, i) => (
                <React.Fragment key={p.texto}>
                  {i > 0 && ', '}
                  <AppButton type="button" variant="link" size="xs" className="reserva-link--falta" onClick={() => irPara(p)}>
                    {p.texto}
                  </AppButton>
                </React.Fragment>
              ))}
              .
            </div>
          )}
          {confirmarSaida && (
            <div className="reserva-confirmar" role="alertdialog" aria-label="Descartar a reserva" data-testid="emendas-pedido-confirmar-saida">
              <span>{pedido ? 'Sair sem salvar? As mudanças neste pedido se perdem.' : `Descartar esta reserva? ${linhas.length ? `${linhas.length === 1 ? 'O item some' : `Os ${linhas.length} itens somem`} e nada fica reservado.` : ''}`}</span>
              <AppButton type="button" variant="outline" size="sm" onClick={() => setConfirmarSaida(false)}>
                Continuar editando
              </AppButton>
              <ActionButton action="descartar" type="button" size="sm" label={pedido ? 'Sair sem salvar' : undefined} onClick={descartar} data-testid="emendas-pedido-descartar" />
            </div>
          )}
          <div className="reserva-total" data-testid="emendas-pedido-total">
            <span className="reserva-total__rotulo">Total previsto para a emenda</span> <b>{formatCurrency(total)}</b>
            <div className="reserva-mudo">
              {linhas.length} {linhas.length === 1 ? 'item' : 'itens'} · {formatNumber(unidades)} {unidades === 1 ? 'unidade' : 'unidades'}
              {doisPrecos(total, totalHoje) && ` · pelo preço de hoje ${formatCurrency(totalHoje)} (+${formatCurrency(total - totalHoje)})`}
              {rascunhoEm && !pedido && ` · rascunho guardado às ${rascunhoEm}`}
            </div>
          </div>
          <div className="reserva-botoes">
            <ActionButton action="cancelar" type="button" onClick={pedirParaFechar} disabled={salvar.isPending} />
            <AppButton type="submit" form="emendas-pedido-form" disabled={salvar.isPending} isLoading={salvar.isPending} data-testid="emendas-pedido-salvar">
              {pedido ? 'Salvar pedido' : linhas.length ? `Reservar ${linhas.length} ${linhas.length === 1 ? 'item' : 'itens'}` : 'Reservar'}
            </AppButton>
          </div>
        </div>
      }
    >
      <div className="reserva-abas" role="tablist" aria-label="Partes da reserva">
        <button type="button" role="tab" aria-selected={lado === 'itens'} onClick={() => setLado('itens')}>
          Itens da CAEP
        </button>
        <button type="button" role="tab" aria-selected={lado === 'pedido'} onClick={() => setLado('pedido')} data-testid="emendas-pedido-aba-pedido">
          Pedido · {linhas.length}
        </button>
      </div>
      <form id="emendas-pedido-form" onSubmit={enviar} className="reserva-colunas" data-lado={lado}>
        {/* Esquerda: escolher os itens e kits. */}
        <section className="reserva-catalogo" aria-label="Itens e kits da CAEP">
          <div className="reserva-catalogo__topo">
            <span className="reserva-rotulo">Itens e kits da CAEP</span>
            <div className="reserva-busca">
              <Search size={16} aria-hidden="true" />
              <input
                ref={buscaRef}
                type="search"
                className="reserva-campo"
                aria-label="Buscar kit ou item"
                placeholder="Kit, descrição, ata (ex.: 31/2025) ou item (ex.: item 2)"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  e.preventDefault();
                  const p = primeiroDisponivel();
                  if (!p) return;
                  if ('itemKey' in p) adicionarItem(p);
                  else adicionarKit(p);
                }}
                data-testid="emendas-pedido-busca"
              />
              <kbd className="reserva-tecla">/</kbd>
            </div>
            <div className="reserva-filtros">
              {(['tudo', 'itens', 'kits'] as const).map((f) => (
                <button type="button" key={f} className="reserva-chip" aria-pressed={filtro === f} onClick={() => setFiltro(f)}>
                  {f === 'tudo' ? 'Tudo' : f === 'itens' ? 'Itens' : 'Kits'}
                </button>
              ))}
              <span className="reserva-mudo reserva-filtros__conta">
                {formatNumber(kitsEncontrados.length + itensEncontrados.length)} encontrados{itensEncontrados.length > MAX_RESULTADOS ? `; mostrando ${MAX_RESULTADOS} itens, refine a busca` : ''}
              </span>
            </div>
          </div>
          <div className="reserva-resultados" data-testid="emendas-pedido-resultados">
            {kitsEncontrados.map(({ k, c }) => {
              const noPedido = linhas.filter((l) => l.kitId === k.id).reduce((s, l) => s + l.quantidade, 0);
              const pode = c.kitsPossiveis > 0;
              const nomeDe = (x: ItemDoKit) => porChave.get(x.itemKey);
              return (
                <CartaoResultado
                  key={k.id}
                  nome={
                    <>
                      <span className="reserva-kit">KIT</span>
                      {k.nome}
                    </>
                  }
                  descricao={k.itens.map((x) => `${formatNumber(x.quantidade)} × ${nomeDe(x) ? descricaoItemEmFrase(nomeDe(x)!.descricao) : x.itemKey}`).join('; ')}
                  rotuloDescricao={`Itens do kit ${k.nome}`}
                  meta={k.itens.map((x) => `${x.quantidade} ${curto(nomeDoItem(nomeDe(x), x.itemKey), 28).toLowerCase()}`).join(' · ')}
                  previsto={c.valorPorKit}
                  hoje={c.valorPorKitHoje}
                  unidade="por kit"
                  saldo={
                    <>
                      {pode ? (
                        <span className="reserva-mudo">
                          Dá para mais {formatNumber(c.kitsPossiveis)} {c.kitsPossiveis === 1 ? 'kit' : 'kits'}
                        </span>
                      ) : (
                        <>
                          <Etiqueta texto="Indisponível" variante="danger" />
                          <span className="reserva-mudo">{c.motivo || 'Algum item do kit está sem saldo livre.'}</span>
                        </>
                      )}
                      {noPedido > 0 && <Etiqueta texto={`${formatNumber(noPedido)} no pedido`} variante="info" />}
                    </>
                  }
                  noPedido={noPedido}
                  pode={pode}
                  acao={<ActionButton action="adicionar" type="button" size="sm" label={noPedido ? 'Mais um' : undefined} onClick={() => adicionarKit(k)} disabled={!pode} data-testid={`emendas-pedido-kit-${k.id}`} />}
                />
              );
            })}
            {itensEncontrados.slice(0, MAX_RESULTADOS).map((i) => {
              const noPedido = consumo.get(i.itemKey) ?? 0;
              const saldo = saldoAntes(i.itemKey);
              const fica = livre(i.itemKey);
              const p = preco(i.itemKey);
              const fora = foraDoPrazo(i);
              const pode = podeItem(i);
              return (
                <CartaoResultado
                  key={i.itemKey}
                  nome={nomeDoItem(i, i.itemKey)}
                  descricao={descricaoItemEmFrase(i.descricao)}
                  rotuloDescricao="Descrição completa na ata"
                  meta={
                    <>
                      Ata {i.numeroAta} · Item {String(i.numeroItem).padStart(5, '0')}
                      {avisarSemNomeCurto && !i.nomeCurto?.trim() && (
                        <>
                          {' · '}
                          <span className="reserva-sem-nome-curto" title="Cadastre o nome curto em Emendas › Itens. Sem ele, o quadro do parlamentar usa o começo da descrição.">
                            sem nome curto
                          </span>
                        </>
                      )}
                    </>
                  }
                  previsto={p.previsto}
                  hoje={p.hoje}
                  unidade="por unidade"
                  notaPreco={notaDoPreco(p.preco, ipca)}
                  saldo={
                    fora ? (
                      <>
                        <Etiqueta texto="Prazo de indicação vencido" variante="danger" />
                        <span className="reserva-mudo">
                          Em {dataBR(limiteDaIndicacao(i.vigenciaFinal!))}: a ata termina em {dataBR(i.vigenciaFinal)}.
                        </span>
                      </>
                    ) : saldo <= 0 ? (
                      <>
                        <Etiqueta texto="Sem saldo da CAEP" variante="danger" />
                        <span className="reserva-mudo">Peça alocação ao gestor de saldo.</span>
                      </>
                    ) : (
                      <>
                        <span className="reserva-medidor__barra">
                          <i style={{ width: `${Math.max(0, Math.min(100, (fica / saldo) * 100))}%` }} className={fica / saldo < 0.2 ? 'reserva-pouco' : undefined} />
                        </span>
                        <span className="reserva-mudo">
                          {fica <= 0 ? `Todo o saldo livre já está neste pedido (${formatNumber(saldo)})` : `${formatNumber(fica)} ${fica === 1 ? 'livre' : 'livres'} de ${formatNumber(saldo)}`}
                        </span>
                        {noPedido > 0 && <Etiqueta texto={`${formatNumber(noPedido)} no pedido`} variante="info" />}
                      </>
                    )
                  }
                  noPedido={noPedido}
                  pode={pode}
                  acao={<ActionButton action="adicionar" type="button" size="sm" label={noPedido ? 'Mais um' : undefined} onClick={() => adicionarItem(i)} disabled={!pode} data-testid={`emendas-pedido-item-${i.itemKey}`} />}
                />
              );
            })}
            {kitsEncontrados.length === 0 && itensEncontrados.length === 0 && (
              <div className="reserva-vazio">Nada encontrado. Tente a descrição, o número da ata (31/2025) ou "item 6".</div>
            )}
          </div>
        </section>

        {/* Direita: o pedido. */}
        <section className="reserva-pedido" aria-label="Pedido">
          {rascunhoPendente && rascunhoAntigo && (
            <div className="reserva-aviso" role="status" data-testid="emendas-pedido-rascunho">
              <span>
                Há uma reserva que não foi concluída ({rascunhoAntigo.linhas.length} {rascunhoAntigo.linhas.length === 1 ? 'item' : 'itens'}, guardada às {rascunhoAntigo.salvoEm}).
              </span>
              <AppButton type="button" size="sm" onClick={recuperarRascunho}>
                Continuar
              </AppButton>
              <ActionButton
                action="descartar"
                type="button"
                size="sm"
                onClick={() => {
                  guardarRascunho(null);
                  setRascunhoPendente(false);
                }}
              />
            </div>
          )}

          <div className="reserva-secao">
            <span className="reserva-rotulo">{semAutorGravado ? 'Parlamentar que assumiu a reserva (quando houver)' : 'Para quem é a reserva'}</span>
            {!pedido && (
              <div className="reserva-segmentos" role="group" aria-label="Tipo de reserva">
                <button
                  type="button"
                  aria-pressed={!paraOrgao}
                  onClick={() => setParaOrgao(false)}
                  data-testid="emendas-pedido-para-parlamentar"
                >
                  Parlamentar
                </button>
                <button
                  type="button"
                  aria-pressed={paraOrgao}
                  onClick={() => {
                    setParaOrgao(true);
                    setAutorId('');
                  }}
                  data-testid="emendas-pedido-para-orgao"
                >
                  Órgão (parlamentar a definir)
                </button>
              </div>
            )}
            {paraOrgao ? (
              <p className="reserva-mudo reserva-texto">O órgão pediu e a CAEP separa os itens enquanto procura o parlamentar. Ele é indicado depois, antes da minuta.</p>
            ) : autor ? (
              <div className="reserva-autor" data-testid="emendas-pedido-autor">
                <span className="reserva-avatar" aria-hidden="true">
                  {iniciais(autor.nome)}
                </span>
                <span className="reserva-autor__nome">
                  <b>{autor.nome}</b>
                  <small>{metaDoAutor(autor)}</small>
                </span>
                {(!pedido || semAutorGravado) && (
                  <ActionButton action="editar" type="button" size="sm" label="Trocar" onClick={() => setAutorId('')} />
                )}
              </div>
            ) : (
              <>
                <input
                  type="search"
                  className={`reserva-campo${falta('emendas-pedido-busca-autor') ? ' reserva-erro' : ''}`}
                  aria-label="Buscar autor"
                  placeholder="Buscar deputado, senador ou bancada (nome, partido ou UF)"
                  value={buscaAutor}
                  onChange={(e) => setBuscaAutor(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (autoresEncontrados[0]) escolherAutor(autoresEncontrados[0].id);
                    }
                  }}
                  data-testid="emendas-pedido-busca-autor"
                />
                {autoresEncontrados.length > 0 ? (
                  <div className="reserva-lista reserva-lista--borda">
                    {autoresEncontrados.map((a) => (
                      <button type="button" key={a.id} onClick={() => escolherAutor(a.id)} data-testid={`emendas-pedido-autor-${a.id}`}>
                        <b>{a.nome}</b>
                        <small>{metaDoAutor(a)}</small>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="reserva-mudo reserva-texto">{buscaAutor.trim() ? `Ninguém encontrado com "${buscaAutor.trim()}".` : 'Digite e tecle Enter para escolher o primeiro.'}</p>
                )}
              </>
            )}
          </div>

          <div className="reserva-secao">
            <span className="reserva-rotulo">
              {orgaoNaFrente ? 'Contato no órgão' : 'Contato na assessoria'} <span className="reserva-opcional">opcional</span>
            </span>
            {(contatoNome || contatoTelefone || contatoEmail) && !editarContato && !falta('emendas-pedido-contato-telefone') && !falta('emendas-pedido-contato-email') ? (
              <>
                <div className="reserva-contato">
                  <b>{contatoNome || 'Sem nome'}</b>
                  {contatoTelefone && <span>{contatoTelefone}</span>}
                  {contatoEmail && <span>{contatoEmail}</span>}
                  <span className="reserva-espaco" />
                  <ActionButton action="editar" type="button" size="sm" onClick={() => setEditarContato(true)} data-testid="emendas-pedido-contato-editar" />
                </div>
                {contatoSugerido && <span className="reserva-ok">Último contato usado com {autor ? 'este autor' : 'este órgão'}. Confira se continua o mesmo.</span>}
              </>
            ) : (
              <div className="reserva-grade3">
                <AppInput label="Nome" placeholder="Com quem a CAEP combinou" value={contatoNome} onChange={(e) => setContatoNome(e.target.value)} data-testid="emendas-pedido-contato-nome" />
                <AppInput
                  label="Telefone"
                  inputMode="tel"
                  placeholder="(00) 00000-0000"
                  value={contatoTelefone}
                  onChange={(e) => {
                    setContatoTelefone(e.target.value);
                    setContatoSugerido(false);
                  }}
                  onBlur={() => setContatoTelefone(formatarTelefone(contatoTelefone))}
                  data-testid="emendas-pedido-contato-telefone"
                />
                <AppInput label="E-mail" type="email" placeholder="nome@camara.leg.br" value={contatoEmail} onChange={(e) => setContatoEmail(e.target.value)} data-testid="emendas-pedido-contato-email" />
              </div>
            )}
          </div>

          <div className="reserva-secao">
            <span className="reserva-rotulo">{orgaoNaFrente ? 'Órgão que pediu' : 'Beneficiário'}</span>
            {seletor({ alvo: 'pedido', atual: beneficiarioDoPedido, vazio: orgaoNaFrente ? 'Escolha o órgão' : 'A informar', erro: falta('emendas-pedido-beneficiario-pedido'), testId: 'emendas-pedido-beneficiario-pedido' })}
            <p className="reserva-mudo reserva-texto">Vale para todos os itens. Se um item for para outro órgão, troque só nele.</p>
          </div>

          <div className="reserva-secao" data-testid="emendas-pedido-linhas">
            <span className="reserva-rotulo">Itens do pedido ({linhas.length})</span>
            {linhas.length === 0 && (
              <div className="reserva-vazio">
                Nenhum item ainda. Busque {lado === 'pedido' ? 'em Itens da CAEP' : 'ao lado'} e toque em <b>Adicionar</b>.
                <br />
                Atalho: tecla <kbd className="reserva-tecla">/</kbd> para buscar e Enter para adicionar o primeiro.
              </div>
            )}
            {linhas.map((l) => {
              const passa = passaDoSaldo(l);
              const item = l.itemKey ? porChave.get(l.itemKey) : undefined;
              const valor = valorDaLinha(l, porChave, precos);
              const valorHoje = valorDaLinha(l, porChave);
              const umKit = l.tipo === 'KIT' ? valorDaLinha({ ...l, quantidade: 1 }, porChave, precos) : 0;
              const propria = l.beneficiarioId ? porBeneficiario.get(l.beneficiarioId) : undefined;
              const doPedido = beneficiarioDoPedido ? porBeneficiario.get(beneficiarioDoPedido) : undefined;
              const kitsLivres = l.tipo === 'KIT' ? Math.min(...(l.kitComposicao ?? []).map((c) => Math.floor(livre(c.itemKey) / c.quantidade))) : 0;
              return (
                <div key={l.chave} className={`reserva-linha${passa ? ' reserva-linha--erro' : ''}${piscando === l.chave ? ' reserva-linha--nova' : ''}`} data-testid={`emendas-pedido-linha-${l.chave}`}>
                  <div className="reserva-linha__item">
                    {l.tipo === 'KIT' ? (
                      <>
                        <div className="reserva-linha__codigo">
                          <span className="reserva-kit">KIT</span>
                          {l.kitNome ?? 'Kit'}
                        </div>
                        <div className="reserva-mudo">
                          {(l.kitComposicao ?? []).map((c) => `${formatNumber(c.quantidade * (l.quantidade || 0))} ${curto(porChave.get(c.itemKey)?.nomeCurto || porChave.get(c.itemKey)?.descricao || c.itemKey, 28).toLowerCase()}`).join(' · ')}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="reserva-linha__codigo">{item ? rotuloItemDaAta(item) : `${l.itemKey} · item sem alocação da CAEP`}</div>
                        {item && (
                          <button
                            type="button"
                            className={`reserva-linha__descricao${abertas.has(l.chave) ? ' reserva-linha__descricao--aberta' : ''}`}
                            title={abertas.has(l.chave) ? 'Recolher' : 'Ver a descrição inteira'}
                            onClick={() =>
                              setAbertas((a) => {
                                const n = new Set(a);
                                if (n.has(l.chave)) n.delete(l.chave);
                                else n.add(l.chave);
                                return n;
                              })
                            }
                          >
                            {descricaoItemEmFrase(item.descricao)}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                  <div className={`reserva-passo${passa ? ' reserva-erro' : ''}`}>
                    <button type="button" aria-label="Diminuir" disabled={l.quantidade <= 1} onClick={() => muda(l.chave, { quantidade: l.quantidade - 1 })}>
                      −
                    </button>
                    <input
                      inputMode="numeric"
                      aria-label={l.tipo === 'KIT' ? 'Kits' : 'Quantidade'}
                      value={l.quantidade || ''}
                      onChange={(e) => {
                        const n = parseInt(e.target.value.replace(/\D/g, ''), 10);
                        muda(l.chave, { quantidade: Number.isFinite(n) ? n : 0 });
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'ArrowUp' && cabeMaisUm(l)) {
                          e.preventDefault();
                          muda(l.chave, { quantidade: l.quantidade + 1 });
                        } else if (e.key === 'ArrowDown' && l.quantidade > 1) {
                          e.preventDefault();
                          muda(l.chave, { quantidade: l.quantidade - 1 });
                        }
                      }}
                      data-testid={`emendas-pedido-qtd-${l.chave}`}
                    />
                    <button type="button" aria-label="Aumentar" disabled={!cabeMaisUm(l)} onClick={() => muda(l.chave, { quantidade: l.quantidade + 1 })}>
                      +
                    </button>
                  </div>
                  <div className="reserva-linha__valor">
                    {formatCurrency(valor)}
                    {marcasDaLinha(l)}
                    <small>{doisPrecos(valor, valorHoje) ? `previsto · hoje ${formatCurrency(valorHoje)}` : l.tipo === 'KIT' ? `${formatCurrency(umKit)} por kit` : item ? `${formatCurrency(preco(item.itemKey).previsto)} un.` : ''}</small>
                  </div>
                  <div className="reserva-linha__pe">
                    {propria ? (
                      <span className="reserva-etiqueta reserva-etiqueta--propria">{propria.sigla || propria.nome} · só nesta linha</span>
                    ) : (
                      <span className="reserva-etiqueta">{doPedido ? `${doPedido.sigla || doPedido.nome} · do pedido` : 'Beneficiário a informar'}</span>
                    )}
                    <span className={passa ? 'reserva-alerta' : 'reserva-mudo'}>
                      {l.tipo === 'KIT'
                        ? passa
                          ? 'Algum item do kit passa do saldo livre'
                          : `Dá para mais ${formatNumber(Math.max(0, kitsLivres))}`
                        : passa
                          ? `Passa ${formatNumber(-livre(l.itemKey!))} do saldo livre (${formatNumber(saldoAntes(l.itemKey!) - ((consumo.get(l.itemKey!) ?? 0) - l.quantidade))})`
                          : livre(l.itemKey!) === 0
                            ? `Nenhum fica livre de ${formatNumber(saldoAntes(l.itemKey!))}`
                            : `${livre(l.itemKey!) === 1 ? 'Fica 1 livre' : `Ficam ${formatNumber(livre(l.itemKey!))} livres`} de ${formatNumber(saldoAntes(l.itemKey!))}`}
                    </span>
                    <span className="reserva-espaco" />
                    <AppButton type="button" variant="link" size="xs" onClick={() => abrirSeletor(seletorAberto === l.chave ? null : l.chave)}>
                      {propria ? 'Trocar beneficiário' : 'Outro beneficiário'}
                    </AppButton>
                    {l.tipo === 'ITEM' && l.quantidade > 1 && (
                      <AppButton type="button" variant="link" size="xs" onClick={() => separar(l)} data-testid={`emendas-pedido-separar-${l.chave}`}>
                        Separar 1 para outro órgão
                      </AppButton>
                    )}
                    <ActionButton action="remover" type="button" size="xs" label="Tirar" onClick={() => tirar(l)} data-testid={`emendas-pedido-tirar-${l.chave}`} />
                  </div>
                  {seletorAberto === l.chave && (
                    <div className="reserva-linha__seletor">
                      {seletor({ alvo: l.chave, atual: l.beneficiarioId, vazio: 'Usar o do pedido', testId: `emendas-pedido-beneficiario-${l.chave}` })}
                    </div>
                  )}
                </div>
              );
            })}
            {notas.length > 0 && (
              <div className="reserva-notas" data-testid="emendas-pedido-notas">
                <b>Preço previsto para a emenda</b>, o mesmo do quadro do parlamentar:
                <ol>
                  {notas.map((n, i) => (
                    <li key={n}>
                      <span>{MARCAS[i] ?? `(${i + 1})`}</span>
                      {n}
                    </li>
                  ))}
                </ol>
              </div>
            )}
            {semPrevisao && <div className="reserva-aviso">Não foi possível ler o reajuste previsto: os valores são pelo preço de hoje das atas.</div>}
          </div>

          {tirou > 0 && (
            <AppInput label="Por que os itens foram tirados?" placeholder="Ex.: parlamentar desistiu do item; ata vencida sem substituto" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          )}
          {pedido && VOLTA_AO_OFICIO.has(pedido.etapa) && (
            <div className="reserva-aviso">Mudar itens ou quantidades volta o pedido para "Ofício recebido": o ofício e a emenda citam os itens antigos e precisam ser conferidos de novo. Só trocar o beneficiário não volta.</div>
          )}
          {obsAberta ? (
            <AppTextarea label="Observação" rows={2} value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Opcional. Ex.: o gabinete pediu entrega em março" />
          ) : (
            <ActionButton action="adicionar" type="button" size="sm" label="Adicionar observação" className="reserva-sozinho" onClick={() => setObsAberta(true)} />
          )}

          {linhas.length > 0 && (
            <details className="reserva-quadro">
              <summary>Quadro para o parlamentar</summary>
              <QuadroGabinete
                autor={autor}
                linhas={linhas.map((l) => ({ ...l, beneficiarioId: l.beneficiarioId ?? beneficiarioDoPedido }))}
                data={pedido?.reservadoEm ?? hoje}
                devolvidoEm={pedido?.devolvidoEm}
              />
            </details>
          )}

        </section>
      </form>
      {recado && (
        <div className="reserva-recado" role="status" data-testid="emendas-pedido-recado">
          <span>{recado.texto}</span>
          {recado.desfazer && (
            <ActionButton
              action="desfazer"
              type="button"
              size="sm"
              onClick={() => {
                recado.desfazer!();
                setRecado(null);
              }}
              data-testid="emendas-pedido-desfazer"
            />
          )}
          {!recado.desfazer && lado === 'itens' && (
            <AppButton type="button" variant="link" size="sm" className="reserva-recado__celular" onClick={() => setLado('pedido')}>
              Ver pedido
            </AppButton>
          )}
        </div>
      )}
    </Modal>
  );
};

function valorTotal(linhas: LinhaEdicao[], itens: Map<string, ItemCaep>, precos?: Parameters<typeof valorDaLinha>[2]): number {
  return Math.round(linhas.reduce((s, l) => s + valorDaLinha(l, itens, precos), 0) * 100) / 100;
}
