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
import { casaBusca, daUfDoParlamentar, textoDeBuscaDoBeneficiario } from '../../utils/emendasBeneficiarios';
import { identificacaoDoPedido, itensDaLinha, numeroDaEmendaEmTexto, orgaoDoPedido, precoParaEmenda, valorDaLinha, VOLTA_AO_OFICIO } from '../../utils/emendasPedidos';
import { nomeDoItem, notaDoPreco } from '../../utils/emendasQuadro';
import type { SobraDaEmenda } from '../../utils/emendasSobra';
import { agruparPorBeneficiario, beneficiarioDaLinha, chaveDoConteudo, definirNoGrupo, gradePorItem, moverLinha, repartirLinha, type GrupoReserva } from '../../utils/emendasReserva';
import { formatarTelefone, localDoBeneficiario, nomeESigla, rotuloBeneficiario, soDigitos } from '../../services/emendasService';
import type { AutorEmenda, BeneficiarioEmenda, EmendaSiop, ItemCaep, ItemDoKit, KitEmenda, PedidoEmenda } from '../../services/emendasService';
import { numeroDaEmenda } from '../../utils/emendasSemPedido';
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
  /** Pedido novo criado a partir da emenda registrada (migration 205): o parlamentar vem dela e não muda. */
  emenda?: EmendaSiop | null;
  /** "Novo pedido com a sobra" (migration 204): o parlamentar e a emenda já escolhidos, e o disponível dela no topo. */
  sobra?: SobraDaEmenda | null;
  /** Nova reserva aberta pelo Parlamentar 360: o parlamentar já vem escolhido e não troca. */
  autorInicial?: string | null;
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
  /** Grupo (beneficiário) em que a linha está; ao gravar, a linha leva o beneficiário do grupo. */
  grupo: string;
}

interface Rascunho {
  autorId: string;
  paraOrgao: boolean;
  contato: { nome: string; telefone: string; email: string };
  grupos?: GrupoReserva[];
  ativo?: string;
  linhas: LinhaEdicao[];
  /** Rascunho de antes dos grupos (26/10/2026): beneficiário do pedido + beneficiário próprio por linha. */
  beneficiarioDoPedido?: string | null;
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
const novaChave = () => `n${++seq}`;
const novoGrupo = () => `g${++seq}`;

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
 * Nova reserva ou alteração das linhas de um pedido (protótipos aprovados em 24 e 26/10/2026): à esquerda a busca dos
 * itens e kits da CAEP, à direita o pedido agrupado por beneficiário, com o total no rodapé. O item tocado no catálogo
 * entra no grupo marcado ("Itens novos entram aqui") e soma na linha igual do grupo; Repartir divide uma linha entre os
 * beneficiários, Mover para leva a linha inteira, e a visão Por item mostra a grade item × beneficiário. Os valores são
 * os previstos para a emenda, os mesmos do quadro do parlamentar. A trava de saldo é conferida aqui e de novo no banco.
 */
export const PedidoModal: React.FC<Props> = ({ pedido, autores, itens, kits, beneficiarios, reservadoFora, ultimoContato, hoje, emenda = null, sobra, autorInicial = null, onClose }) => {
  const salvar = useSalvarPedido();
  const toast = useToast();
  const { precos, ipca, semPrevisao } = usePrecosParaEmenda();
  const semAutorGravado = Boolean(pedido && !pedido.autorId);

  // Linhas gravadas: um grupo por beneficiário, na ordem em que aparecem.
  const inicio = useMemo(() => {
    const gravadas =
      pedido?.linhas
        .filter((l) => !l.cancelada)
        .map((l) => ({ chave: l.id, id: l.id, tipo: l.tipo, itemKey: l.itemKey, kitId: l.kitId, kitNome: l.kitNome, kitComposicao: l.kitComposicao, quantidade: l.quantidade, beneficiarioId: l.beneficiarioId })) ?? [];
    return agruparPorBeneficiario(gravadas, novoGrupo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // O pedido da emenda e o da sobra não usam o rascunho da reserva comum: abrem já com o parlamentar.
  const [rascunhoAntigo] = useState(() => (pedido || emenda || sobra || autorInicial ? null : lerRascunho()));
  // Pedido da emenda ou do Parlamentar 360: o contato da assessoria vem do último pedido do parlamentar.
  const contatoDaEmenda = emenda ? ultimoContato.get(emenda.autorId) : autorInicial ? ultimoContato.get(autorInicial) : undefined;

  const [autorId, setAutorId] = useState(pedido?.autorId ?? emenda?.autorId ?? sobra?.autorId ?? autorInicial ?? '');
  // Reserva para um órgão (migration 163): nova reserva sem parlamentar.
  const [paraOrgao, setParaOrgao] = useState(false);
  const [buscaAutor, setBuscaAutor] = useState('');
  const [observacao, setObservacao] = useState(pedido?.observacao ?? '');
  const [obsAberta, setObsAberta] = useState(Boolean(pedido?.observacao));
  const [contatoNome, setContatoNome] = useState(pedido?.contatoNome ?? contatoDaEmenda?.contatoNome ?? '');
  const [contatoTelefone, setContatoTelefone] = useState(() => {
    const t = pedido ? pedido.contatoTelefone : contatoDaEmenda?.contatoTelefone;
    return t ? formatarTelefone(t) : '';
  });
  const [contatoEmail, setContatoEmail] = useState(pedido?.contatoEmail ?? contatoDaEmenda?.contatoEmail ?? '');
  const [contatoSugerido, setContatoSugerido] = useState(Boolean(contatoDaEmenda));
  const [editarContato, setEditarContato] = useState(false);
  const [grupos, setGrupos] = useState<GrupoReserva[]>(inicio.grupos);
  const [ativo, setAtivo] = useState(inicio.grupos[0].chave);
  const [linhas, setLinhas] = useState<LinhaEdicao[]>(inicio.linhas);
  const [vista, setVista] = useState<'beneficiario' | 'item'>('beneficiario');
  const [repartindo, setRepartindo] = useState<{ chave: string; partes: Record<string, string> } | null>(null);
  const [movendo, setMovendo] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('tudo');
  const [lado, setLado] = useState<'itens' | 'pedido'>('itens');
  const [seletorAberto, setSeletorAberto] = useState<string | null>(null);
  const [buscaBeneficiario, setBuscaBeneficiario] = useState('');
  const [todasUfs, setTodasUfs] = useState(false);
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
  const grupoAtivo = grupos.find((g) => g.chave === ativo) ?? grupos[0];
  const benDoGrupo = (g: GrupoReserva) => (g.beneficiarioId ? porBeneficiario.get(g.beneficiarioId) : undefined);
  const nomeDoGrupo = (g: GrupoReserva) => {
    const b = benDoGrupo(g);
    return b ? b.sigla || b.nome : orgaoNaFrente ? 'Órgão a escolher' : 'Beneficiário a informar';
  };
  const temSemBeneficiario = grupos.some((g) => !g.beneficiarioId);

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
  // Quem cadastra o nome na ata assinada (Emendas › Itens) vê quais itens ainda saem no quadro pelo começo da descrição.
  const avisarSemNomeCurto = usePodeGerirEmendas();
  const podeItem = (i: ItemCaep) => !foraDoPrazo(i) && livre(i.itemKey) > 0;

  const ativosBen = useMemo(() => beneficiarios.filter((b) => b.ativo).sort((a, b) => rotuloBeneficiario(a).localeCompare(rotuloBeneficiario(b), 'pt-BR')), [beneficiarios]);
  const beneficiariosNaBusca = ativosBen.filter((b) => casaBusca(textoDeBuscaDoBeneficiario(b), buscaBeneficiario));
  // Com o parlamentar escolhido, a lista mostra só os órgãos da UF dele; "Mostrar todas as UFs" abre o resto.
  const ufDoAutor = autor?.uf ?? null;
  const filtraUf = Boolean(ufDoAutor) && !todasUfs;
  const beneficiariosEncontrados = (filtraUf ? beneficiariosNaBusca.filter((b) => daUfDoParlamentar(b, ufDoAutor)) : beneficiariosNaBusca).slice(0, MAX_BENEFICIARIOS);
  const deOutraUf = (b: BeneficiarioEmenda) => !daUfDoParlamentar(b, ufDoAutor);

  const tel = soDigitos(contatoTelefone);
  const pendencias: Pendencia[] = [];
  if (!autorId && !pedido && !paraOrgao) pendencias.push({ texto: 'o parlamentar', alvo: 'emendas-pedido-busca-autor', lado: 'pedido' });
  const grupoSemOrgao = orgaoNaFrente ? grupos.find((g) => !g.beneficiarioId && linhas.some((l) => l.grupo === g.chave)) : undefined;
  if (grupoSemOrgao) pendencias.push({ texto: 'o órgão que pediu', alvo: `emendas-pedido-beneficiario-${grupoSemOrgao.chave}`, lado: 'pedido' });
  if (linhas.length === 0) pendencias.push({ texto: 'pelo menos um item', alvo: 'emendas-pedido-busca', lado: 'itens' });
  if (linhas.some((l) => !(Number.isInteger(l.quantidade) && l.quantidade > 0))) pendencias.push({ texto: 'quantidade inteira maior que zero em cada item', alvo: 'emendas-pedido-linhas', lado: 'pedido' });
  if (linhas.some(passaDoSaldo)) pendencias.push({ texto: 'quantidade dentro do saldo livre da CAEP', alvo: 'emendas-pedido-linhas', lado: 'pedido' });
  if (tel && (tel.length < 10 || tel.length > 11)) pendencias.push({ texto: 'telefone do contato com DDD (10 ou 11 números)', alvo: 'emendas-pedido-contato-telefone', lado: 'pedido' });
  if (contatoEmail.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contatoEmail.trim())) pendencias.push({ texto: 'e-mail do contato válido', alvo: 'emendas-pedido-contato-email', lado: 'pedido' });

  const temConteudo = linhas.length > 0 || Boolean(autorId && !pedido) || Boolean(contatoNome || contatoTelefone || contatoEmail);
  // Pedido gravado: mudou se alguma linha mudou de quantidade ou de beneficiário, ou se entrou ou saiu linha.
  const assinatura = (ls: { id?: string; quantidade: number; grupo: string }[], gs: GrupoReserva[]) =>
    ls.map((l) => `${l.id ?? 'nova'}:${l.quantidade}:${beneficiarioDaLinha(l, gs) ?? '-'}`).sort().join('|');
  const mudou = pedido ? tirou > 0 || assinatura(linhas, grupos) !== assinatura(inicio.linhas, inicio.grupos) : temConteudo;

  // Rascunho só da reserva nova: some ao reservar ou descartar.
  useEffect(() => {
    if (pedido || emenda || rascunhoAntigo || sobra || autorInicial) return;
    if (!temConteudo) return guardarRascunho(null);
    const salvoEm = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    guardarRascunho({ autorId, paraOrgao, contato: { nome: contatoNome, telefone: contatoTelefone, email: contatoEmail }, grupos, ativo, linhas, observacao, salvoEm });
    setRascunhoEm(salvoEm);
  }, [pedido, emenda, rascunhoAntigo, sobra, autorInicial, temConteudo, autorId, paraOrgao, contatoNome, contatoTelefone, contatoEmail, grupos, ativo, linhas, observacao]);
  const [rascunhoPendente, setRascunhoPendente] = useState(Boolean(rascunhoAntigo));
  const recuperarRascunho = () => {
    const r = rascunhoAntigo!;
    setAutorId(r.autorId);
    setParaOrgao(r.paraOrgao);
    setContatoNome(r.contato.nome);
    setContatoTelefone(r.contato.telefone);
    setContatoEmail(r.contato.email);
    if (r.grupos?.length) {
      setGrupos(r.grupos);
      setAtivo(r.ativo && r.grupos.some((g) => g.chave === r.ativo) ? r.ativo : r.grupos[0].chave);
      setLinhas(r.linhas.map((l) => ({ ...l, chave: `r${++seq}` })));
    } else {
      // Rascunho antigo: a linha sem beneficiário próprio usa o do pedido.
      const antigas = r.linhas as (LinhaEdicao & { beneficiarioId?: string | null })[];
      const g = agruparPorBeneficiario(
        antigas.map(({ grupo: _g, beneficiarioId, ...l }) => ({ ...l, chave: `r${++seq}`, beneficiarioId: beneficiarioId ?? r.beneficiarioDoPedido ?? null })),
        novoGrupo
      );
      setGrupos(g.grupos);
      setAtivo(g.grupos[0].chave);
      setLinhas(g.linhas);
    }
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
  // Item ou kit tocado no catálogo entra no grupo marcado; se o grupo já tem, soma na mesma linha.
  const adicionarNoGrupo = (nova: Omit<LinhaEdicao, 'chave' | 'grupo' | 'quantidade'>, nome: string) => {
    const g = grupoAtivo.chave;
    const para = grupos.length > 1 ? ` (${nomeDoGrupo(grupoAtivo)})` : '';
    const ja = linhas.find((l) => l.grupo === g && chaveDoConteudo(l) === chaveDoConteudo(nova));
    if (ja) {
      setLinhas((ls) => ls.map((l) => (l.chave === ja.chave ? { ...l, quantidade: l.quantidade + 1 } : l)));
      setPiscando(ja.chave);
      avisarNoCelular(`Já estava no pedido${para}: ${nome} passou para ${formatNumber(ja.quantidade + 1)}.`);
      return;
    }
    const chave = novaChave();
    const ultima = linhas.map((l) => l.grupo).lastIndexOf(g);
    const linha: LinhaEdicao = { ...nova, chave, quantidade: 1, grupo: g };
    setLinhas((ls) => (ultima < 0 ? [...ls, linha] : [...ls.slice(0, ultima + 1), linha, ...ls.slice(ultima + 1)]));
    setPiscando(chave);
    avisarNoCelular(`${nome} entrou no pedido${para}.`);
  };
  const adicionarItem = (i: ItemCaep) =>
    adicionarNoGrupo({ tipo: 'ITEM', itemKey: i.itemKey, kitId: null, kitNome: null, kitComposicao: null }, curto(i.nomeCurto || i.descricao, 40));
  const adicionarKit = (k: KitEmenda) =>
    adicionarNoGrupo({ tipo: 'KIT', itemKey: null, kitId: k.id, kitNome: k.nome, kitComposicao: k.itens.map((i) => ({ ...i })) }, k.nome);
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
  const abrirSeletor = (alvo: string | null) => {
    setSeletorAberto(alvo);
    setBuscaBeneficiario('');
    setTodasUfs(false);
  };
  const escolherBeneficiario = (grupo: string, id: string | null) => {
    setGrupos((gs) => gs.map((g) => (g.chave === grupo ? { ...g, beneficiarioId: id } : g)));
    setSeletorAberto(null);
  };
  const desfazivel = (texto: string) => {
    const antes = { linhas, grupos, ativo };
    setRecado({
      texto,
      desfazer: () => {
        setLinhas(antes.linhas);
        setGrupos(antes.grupos);
        setAtivo(antes.ativo);
      }
    });
  };
  const nomeDaLinha = (l: LinhaEdicao) => (l.tipo === 'KIT' ? l.kitNome ?? 'Kit' : nomeDoItem(porChave.get(l.itemKey ?? ''), l.itemKey ?? 'Item'));
  /** Bloco novo: passa a receber os itens do catálogo e já abre a escolha do órgão. */
  const novoBeneficiario = () => {
    const g = novoGrupo();
    setGrupos((gs) => [...gs, { chave: g, beneficiarioId: null }]);
    setAtivo(g);
    setVista('beneficiario');
    abrirSeletor(g);
  };
  const tirarGrupo = (g: GrupoReserva) => {
    const n = linhas.filter((l) => l.grupo === g.chave).length;
    desfazivel(`${nomeDoGrupo(g)} saiu do pedido${n ? ` com ${n === 1 ? '1 item' : `${n} itens`}` : ''}.`);
    const resto = grupos.filter((x) => x !== g);
    setGrupos(resto);
    setLinhas((ls) => ls.filter((l) => l.grupo !== g.chave));
    if (ativo === g.chave) setAtivo(resto[0].chave);
  };
  const confirmarRepartir = () => {
    if (!repartindo) return;
    const l = linhas.find((x) => x.chave === repartindo.chave);
    if (!l) return;
    const partes = new Map(grupos.map((g) => [g.chave, parseInt(repartindo.partes[g.chave] ?? '0', 10) || 0]));
    desfazivel(`${curto(nomeDaLinha(l), 40)} repartido entre ${[...partes.values()].filter((q) => q > 0).length} beneficiários.`);
    setLinhas((ls) => repartirLinha(ls, l.chave, partes, novaChave));
    setRepartindo(null);
  };
  const moverPara = (l: LinhaEdicao, destino: GrupoReserva) => {
    desfazivel(`${curto(nomeDaLinha(l), 40)} foi para ${nomeDoGrupo(destino)}.`);
    setLinhas((ls) => moverLinha(ls, l.chave, destino.chave));
    setMovendo(null);
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
        emendaId: !pedido && emenda ? emenda.id : null,
        emendaDaSobra: sobra ? { numero: sobra.emenda, ano: sobra.ano } : null,
        linhas: linhas.map((l) => ({ id: l.id, tipo: l.tipo, itemKey: l.itemKey, kitId: l.kitId, quantidade: l.quantidade, beneficiarioId: beneficiarioDaLinha(l, grupos) }))
      });
      if (!pedido && !emenda && !sobra && !autorInicial) guardarRascunho(null);
      const primeiro = grupos.find((g) => g.beneficiarioId)?.beneficiarioId;
      const para = autor?.nome ?? (pedido ? orgaoDoPedido(pedido, nomeDoBeneficiario) : primeiro ? nomeDoBeneficiario(primeiro) : null) ?? 'o órgão';
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
    // Cada órgão aparece num bloco só: os que já estão em outro bloco saem da lista.
    const emOutro = new Set(grupos.filter((g) => g.chave !== alvo && g.beneficiarioId).map((g) => g.beneficiarioId));
    const opcoes = beneficiariosEncontrados.filter((x) => !emOutro.has(x.id));
    const podeAInformar = !orgaoNaFrente && !grupos.some((g) => g.chave !== alvo && !g.beneficiarioId);
    return (
      <div className="reserva-seletor">
        <button type="button" className={`reserva-seletor__botao${erro ? ' reserva-erro' : ''}`} aria-expanded={aberto} onClick={() => abrirSeletor(aberto ? null : alvo)} data-testid={testId}>
          <span className="reserva-seletor__texto">
            {b ? (
              <>
                <b>{nomeESigla(b)}</b>
                {localDoBeneficiario(b) && (
                  <small>
                    {localDoBeneficiario(b)}
                    {deOutraUf(b) && ' · outra UF'}
                  </small>
                )}
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
                  if (opcoes[0]) escolherBeneficiario(alvo, opcoes[0].id);
                } else if (e.key === 'Escape') {
                  e.stopPropagation();
                  setSeletorAberto(null);
                }
              }}
              data-testid={`${testId}-busca`}
            />
            <div className="reserva-lista">
              {opcoes.map((x) => (
                <button type="button" key={x.id} role="option" aria-selected={x.id === atual} onClick={() => escolherBeneficiario(alvo, x.id)}>
                  <b>{nomeESigla(x)}</b>
                  {localDoBeneficiario(x) && <small>{localDoBeneficiario(x)}</small>}
                </button>
              ))}
              {opcoes.length === 0 && (
                <div className="reserva-mudo reserva-lista__vazia">
                  {filtraUf ? `Nenhum órgão de ${ufDoAutor} encontrado.` : 'Nenhum órgão encontrado. Cadastre em Ajustes › Beneficiários.'}
                </div>
              )}
              {podeAInformar && (
                <button type="button" role="option" aria-selected={!atual} onClick={() => escolherBeneficiario(alvo, null)}>
                  <b>A informar depois</b>
                  <small>O gabinete ainda não disse para quem é</small>
                </button>
              )}
            </div>
            {ufDoAutor && (
              <div className="reserva-seletor__uf" data-testid={`${testId}-uf`}>
                <span className="reserva-mudo">{filtraUf ? `Só órgãos de ${ufDoAutor}, a UF do parlamentar.` : 'Órgãos de todas as UFs.'}</span>
                <AppButton type="button" variant="link" size="xs" onClick={() => setTodasUfs((v) => !v)} data-testid={`${testId}-todas-ufs`}>
                  {filtraUf ? 'Mostrar todas as UFs' : `Só ${ufDoAutor}`}
                </AppButton>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // Uma linha do pedido (dentro do bloco do seu beneficiário).
  const linhaDoPedido = (l: LinhaEdicao) => {
    const passa = passaDoSaldo(l);
    const item = l.itemKey ? porChave.get(l.itemKey) : undefined;
    const valor = valorDaLinha(l, porChave, precos);
    const valorHoje = valorDaLinha(l, porChave);
    const umKit = l.tipo === 'KIT' ? valorDaLinha({ ...l, quantidade: 1 }, porChave, precos) : 0;
    // O mesmo item (ou kit) em outros blocos, para quem reparte saber onde mais ele está.
    const tambem = grupos.filter((g) => g.chave !== l.grupo && linhas.some((x) => x.grupo === g.chave && chaveDoConteudo(x) === chaveDoConteudo(l))).map(nomeDoGrupo);
    const outrosGrupos = grupos.filter((g) => g.chave !== l.grupo);
    const rep = repartindo?.chave === l.chave ? repartindo : null;
    const somaRep = rep ? grupos.reduce((s, g) => s + (parseInt(rep.partes[g.chave] ?? '0', 10) || 0), 0) : 0;
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
          {tambem.length > 0 && <span className="reserva-etiqueta reserva-etiqueta--propria">Também em {tambem.join(', ')}</span>}
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
          {outrosGrupos.length > 0 && (
            <>
              <AppButton
                type="button"
                variant="link"
                size="xs"
                onClick={() => {
                  setMovendo(null);
                  setRepartindo(rep ? null : { chave: l.chave, partes: Object.fromEntries(grupos.map((g) => [g.chave, g.chave === l.grupo ? String(l.quantidade) : ''])) });
                }}
                data-testid={`emendas-pedido-repartir-${l.chave}`}
              >
                Repartir
              </AppButton>
              <AppButton
                type="button"
                variant="link"
                size="xs"
                onClick={() => {
                  setRepartindo(null);
                  setMovendo(movendo === l.chave ? null : l.chave);
                }}
                data-testid={`emendas-pedido-mover-${l.chave}`}
              >
                Mover para…
              </AppButton>
            </>
          )}
          <ActionButton action="remover" type="button" size="xs" label="Tirar" onClick={() => tirar(l)} data-testid={`emendas-pedido-tirar-${l.chave}`} />
        </div>
        {rep && (
          <div className="reserva-repartir" data-testid={`emendas-pedido-repartir-painel-${l.chave}`}>
            <span className="reserva-rotulo">
              Repartir {formatNumber(l.quantidade)} {l.tipo === 'KIT' ? (l.quantidade === 1 ? 'kit' : 'kits') : nomeDaLinha(l).toLowerCase()}
            </span>
            {grupos.map((g) => (
              <label key={g.chave} className="reserva-repartir__linha">
                <span>
                  {nomeDoGrupo(g)}
                  {benDoGrupo(g) && localDoBeneficiario(benDoGrupo(g)!) && <small className="reserva-mudo"> · {localDoBeneficiario(benDoGrupo(g)!)}</small>}
                </span>
                <input
                  className="reserva-campo reserva-repartir__qtd"
                  inputMode="numeric"
                  placeholder="0"
                  value={rep.partes[g.chave] ?? ''}
                  onChange={(e) => setRepartindo({ ...rep, partes: { ...rep.partes, [g.chave]: e.target.value.replace(/\D/g, '') } })}
                  data-testid={`emendas-pedido-repartir-${l.chave}-${g.chave}`}
                />
              </label>
            ))}
            <div className="reserva-repartir__pe">
              <span className={somaRep === l.quantidade ? 'reserva-ok' : 'reserva-alerta'}>
                Soma {formatNumber(somaRep)} de {formatNumber(l.quantidade)}
                {somaRep < l.quantidade ? ` · faltam ${formatNumber(l.quantidade - somaRep)}` : somaRep > l.quantidade ? ` · sobram ${formatNumber(somaRep - l.quantidade)}` : ''}
              </span>
              <span className="reserva-espaco" />
              <ActionButton action="cancelar" type="button" size="sm" onClick={() => setRepartindo(null)} />
              <AppButton type="button" size="sm" disabled={somaRep !== l.quantidade} onClick={confirmarRepartir} data-testid={`emendas-pedido-repartir-ok-${l.chave}`}>
                Repartir
              </AppButton>
            </div>
            <small className="reserva-mudo">Para um órgão que ainda não está no pedido, use antes “+ Outro beneficiário”.</small>
          </div>
        )}
        {movendo === l.chave && (
          <div className="reserva-repartir" data-testid={`emendas-pedido-mover-painel-${l.chave}`}>
            <span className="reserva-rotulo">Mover a linha inteira para</span>
            <div className="reserva-repartir__pe">
              {outrosGrupos.map((g) => (
                <AppButton key={g.chave} type="button" variant="outline" size="sm" onClick={() => moverPara(l, g)} data-testid={`emendas-pedido-mover-${l.chave}-${g.chave}`}>
                  {nomeDoGrupo(g)}
                </AppButton>
              ))}
              <span className="reserva-espaco" />
              <ActionButton action="cancelar" type="button" size="sm" onClick={() => setMovendo(null)} />
            </div>
          </div>
        )}
      </div>
    );
  };

  // Visão "Por item": grade item × beneficiário; a célula define a quantidade daquele órgão (vazio ou 0 tira).
  const gradeDoPedido = () => {
    const linhasDaGrade = gradePorItem(linhas);
    return (
      <div className="reserva-grade" data-testid="emendas-pedido-grade">
        <table>
          <thead>
            <tr>
              <th>Item</th>
              {grupos.map((g) => (
                <th key={g.chave}>{nomeDoGrupo(g)}</th>
              ))}
              <th>Total</th>
              <th>Valor</th>
            </tr>
          </thead>
          <tbody>
            {linhasDaGrade.map((x) => {
              const passa = passaDoSaldo(x.modelo);
              return (
                <tr key={x.conteudo} className={passa ? 'reserva-grade__erro' : undefined}>
                  <td>
                    <b>{nomeDaLinha(x.modelo)}</b>
                    {x.modelo.tipo === 'ITEM' && x.modelo.itemKey && porChave.get(x.modelo.itemKey) && <small className="reserva-mudo">{rotuloItemDaAta(porChave.get(x.modelo.itemKey)!)}</small>}
                    {passa && <small className="reserva-alerta">Passa do saldo livre</small>}
                  </td>
                  {grupos.map((g) => (
                    <td key={g.chave}>
                      <input
                        className="reserva-campo reserva-grade__qtd"
                        inputMode="numeric"
                        placeholder="0"
                        aria-label={`${nomeDaLinha(x.modelo)} para ${nomeDoGrupo(g)}`}
                        value={x.porGrupo.get(g.chave) || ''}
                        onChange={(e) => {
                          const q = parseInt(e.target.value.replace(/\D/g, ''), 10) || 0;
                          setLinhas((ls) => definirNoGrupo(ls, x.modelo, g.chave, q, novaChave));
                        }}
                        data-testid={`emendas-pedido-grade-${x.conteudo}-${g.chave}`}
                      />
                    </td>
                  ))}
                  <td className="reserva-grade__total">{formatNumber(x.total)}</td>
                  <td className="reserva-grade__total">{formatCurrency(valorDaLinha({ ...x.modelo, quantidade: x.total }, porChave, precos))}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td>Subtotal</td>
              {grupos.map((g) => (
                <td key={g.chave}>{formatCurrency(valorTotal(linhas.filter((l) => l.grupo === g.chave), porChave, precos))}</td>
              ))}
              <td />
              <td>{formatCurrency(total)}</td>
            </tr>
          </tfoot>
        </table>
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
      title={
        pedido
          ? `${semAutorGravado ? 'Reserva para' : 'Alterar o pedido de'} ${tituloDoPedido} · ${identificacaoDoPedido(pedido)}`
          : sobra
            ? `Novo pedido com a sobra da emenda ${numeroDaEmendaEmTexto(sobra.emenda)} / ${sobra.ano}`
            : emenda
              ? `Novo pedido da emenda ${numeroDaEmenda(emenda.numero)} / ${emenda.ano}`
              : 'Nova reserva'
      }
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
            {grupos.length > 1 && (
              <span className="reserva-mudo reserva-destino" data-testid="emendas-pedido-destino">
                Itens novos entram em <b>{nomeDoGrupo(grupoAtivo)}</b>
              </span>
            )}
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
                          <span className="reserva-sem-nome-curto" title="Cadastre o nome na ata assinada em Emendas › Itens. Sem ele, o quadro do parlamentar usa o começo da descrição.">
                            sem nome da ata assinada
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
            {emenda && (
              <p className="reserva-ok" data-testid="emendas-pedido-da-emenda">
                Pedido da emenda {numeroDaEmenda(emenda.numero)} / {emenda.ano} · {formatCurrency(emenda.valor)} · {emenda.gnd}, vista no SIOP.
              </p>
            )}
            {!pedido && !emenda && !sobra && !autorInicial && (
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
                {((!pedido && !emenda && !sobra && !autorInicial) || semAutorGravado) && (
                  <ActionButton action="editar" type="button" size="sm" label="Trocar" onClick={() => setAutorId('')} />
                )}
              </div>
            ) : (
              <>
                <input
                  type="search"
                  className={`reserva-campo${falta('emendas-pedido-busca-autor') ? ' reserva-erro' : ''}`}
                  aria-label="Buscar parlamentar"
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
                {contatoSugerido && <span className="reserva-ok">Último contato usado com {autor ? 'este parlamentar' : 'este órgão'}. Confira se continua o mesmo.</span>}
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

          {sobra && (
            <div className={`reserva-teto${total > sobra.sobra + 0.004 ? ' reserva-teto--passa' : ''}`} data-testid="emendas-pedido-teto">
              <div className="reserva-barra">
                <b>Disponível da emenda: {formatCurrency(sobra.sobra)}</b>
                <span className="reserva-espaco" />
                <span className="reserva-mudo">
                  Pedido: {formatCurrency(total)} ·{' '}
                  {total > sobra.sobra + 0.004 ? <b className="reserva-alerta">passa {formatCurrency(total - sobra.sobra)}</b> : `restam ${formatCurrency(sobra.sobra - total)}`}
                </span>
              </div>
              <div className="reserva-teto__barra">
                <i style={{ width: `${Math.min(100, sobra.sobra > 0 ? (total / sobra.sobra) * 100 : 100)}%` }} />
              </div>
              <span className="reserva-mudo">
                Valor da emenda {formatCurrency(sobra.valor ?? 0)} − empenhado {formatCurrency(sobra.empenhado)} − em andamento {formatCurrency(sobra.emAndamento)}. Preço previsto, como no quadro do parlamentar.
                {total > sobra.sobra + 0.004 ? ' O pedido passa do disponível: reduza as quantidades ou confirme com o parlamentar outra fonte para a diferença.' : ''}
              </span>
            </div>
          )}
          <div className="reserva-secao" data-testid="emendas-pedido-linhas">
            <div className="reserva-barra">
              <span className="reserva-rotulo">
                {grupos.length === 1 ? (orgaoNaFrente ? 'Órgão que pediu' : 'Beneficiário') : `${grupos.length} beneficiários`} · {linhas.length} {linhas.length === 1 ? 'item' : 'itens'}
              </span>
              <span className="reserva-espaco" />
              {grupos.length > 1 && linhas.length > 0 && (
                <div className="reserva-segmentos reserva-segmentos--sm" role="group" aria-label="Ver o pedido">
                  <button type="button" aria-pressed={vista === 'beneficiario'} onClick={() => setVista('beneficiario')} data-testid="emendas-pedido-vista-beneficiario">
                    Por beneficiário
                  </button>
                  <button
                    type="button"
                    aria-pressed={vista === 'item'}
                    onClick={() => {
                      setVista('item');
                      setRepartindo(null);
                      setMovendo(null);
                    }}
                    data-testid="emendas-pedido-vista-item"
                  >
                    Por item
                  </button>
                </div>
              )}
            </div>
            {vista === 'item' && grupos.length > 1 ? (
              gradeDoPedido()
            ) : (
              grupos.map((g, n) => {
                const doGrupo = linhas.filter((l) => l.grupo === g.chave);
                const b = benDoGrupo(g);
                const eAtivo = g.chave === grupoAtivo.chave;
                return (
                  <div key={g.chave} className={`reserva-grupo${eAtivo && grupos.length > 1 ? ' reserva-grupo--ativo' : ''}`} data-testid={`emendas-pedido-grupo-${g.chave}`}>
                    <div className="reserva-grupo__topo">
                      {grupos.length > 1 && <span className="reserva-grupo__num">{n + 1}</span>}
                      <div className="reserva-grupo__seletor">
                        {seletor({
                          alvo: g.chave,
                          atual: g.beneficiarioId,
                          vazio: orgaoNaFrente && n === 0 ? 'Escolha o órgão que pediu' : orgaoNaFrente ? 'Escolha o órgão' : 'Beneficiário a informar',
                          erro: falta(`emendas-pedido-beneficiario-${g.chave}`),
                          testId: `emendas-pedido-beneficiario-${g.chave}`
                        })}
                      </div>
                      {grupos.length > 1 && (
                        <>
                          {eAtivo ? (
                            <span className="reserva-grupo__destino">Itens novos entram aqui</span>
                          ) : (
                            <AppButton type="button" variant="link" size="xs" onClick={() => setAtivo(g.chave)} data-testid={`emendas-pedido-ativar-${g.chave}`}>
                              Adicionar itens aqui
                            </AppButton>
                          )}
                          <b className="reserva-grupo__subtotal">{formatCurrency(valorTotal(doGrupo, porChave, precos))}</b>
                          <ActionButton action="remover" type="button" size="xs" label="Tirar" iconOnly onClick={() => tirarGrupo(g)} data-testid={`emendas-pedido-tirar-grupo-${g.chave}`} />
                        </>
                      )}
                    </div>
                    {b && !localDoBeneficiario(b) && <span className="reserva-mudo reserva-texto">Sem endereço de entrega no cadastro.</span>}
                    {doGrupo.length === 0 ? (
                      <div className="reserva-vazio">
                        {linhas.length === 0 ? (
                          <>
                            Nenhum item ainda. Busque {lado === 'pedido' ? 'em Itens da CAEP' : 'ao lado'} e toque em <b>Adicionar</b>.
                            <br />
                            Atalho: tecla <kbd className="reserva-tecla">/</kbd> para buscar e Enter para adicionar o primeiro.
                          </>
                        ) : eAtivo ? (
                          <>
                            Os itens tocados em <b>Adicionar</b> entram aqui. Para trazer itens que já estão no pedido, use <b>Repartir</b> ou <b>Mover para…</b> na linha.
                          </>
                        ) : (
                          'Sem itens.'
                        )}
                      </div>
                    ) : (
                      doGrupo.map(linhaDoPedido)
                    )}
                  </div>
                );
              })
            )}
            <div className="reserva-novo-grupo">
                <ActionButton
                  action="adicionar"
                  type="button"
                  size="sm"
                  label="Outro beneficiário"
                  disabled={temSemBeneficiario}
                  title={temSemBeneficiario ? 'Escolha antes o órgão do bloco que está sem beneficiário.' : undefined}
                  onClick={novoBeneficiario}
                  data-testid="emendas-pedido-novo-grupo"
                />
                <span className="reserva-mudo">{temSemBeneficiario ? 'Escolha o órgão do bloco acima antes de abrir outro.' : 'O mesmo item pode ir para vários órgãos: use Repartir na linha.'}</span>
              </div>
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
                linhas={linhas.map((l) => ({ ...l, beneficiarioId: beneficiarioDaLinha(l, grupos) }))}
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
