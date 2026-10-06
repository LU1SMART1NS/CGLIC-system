import React from 'react';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Link2, Loader2, RotateCcw, Search, UserPlus, X, XCircle } from 'lucide-react';
import { CarteiraFilterBar, carteiraCounter } from '../../carteira/CarteiraFilterBar';
import { CarteiraFilterButton } from '../../carteira/CarteiraFilterButton';
import { CarteiraNoResults } from '../../carteira/CarteiraNoResults';
import { CarteiraPagination } from '../../carteira/CarteiraPagination';
import { CarteiraSortHeader } from '../../carteira/CarteiraSortHeader';
import { CarteiraIdLink } from '../../carteira/CarteiraRowLink';
import { carteiraButton, carteiraSelect, carteiraTableShell, carteiraTd, carteiraTh } from '../../carteira/carteiraStyles';
import { hasActiveCarteiraFilters, useCarteiraFilters, type CarteiraFilterSchema } from '../../carteira/carteiraFilters';
import { useCarteiraPagination } from '../../carteira/useCarteiraPagination';
import { useCarteiraSort, type CarteiraSortColumn } from '../../carteira/useCarteiraSort';
import { AppButton } from '../../../design-system';
import { useConfirmDialog } from '../../../design-system/components/ConfirmDialog';
import { useToast } from '../../../design-system/components/Toast';
import { useConfirmarContratoSemAta, useDesfazerContratoSemAta } from '../../../hooks/useContratosSemAta';
import { useDescartarAta } from '../../../hooks/useDescartesAtaContrato';
import { useNavigateWithOrigin } from '../../../hooks/useDetailOrigin';
import { useVinculoEmMassa } from '../../../hooks/useVinculoEmMassa';
import { fetchContractItemQuantities, type ContractItemQuantities } from '../../../services/contractItemsService';
import type { ContratoSemAtaConfirmacao } from '../../../services/contratoSemAtaService';
import type { PlanoVinculo } from '../../../services/vinculoEmMassaService';
import type { ContractDashboardRecord } from '../../../types';
import { formatDateBR } from '../../../utils/format';
import { ConferenciaAtaModal } from './ConferenciaAtaModal';
import type { AtaSugerida, FilaAta, ItemFila, MotivoSugestao, PendenciasDistribuicao } from './contratosSemAta';
import { DescartadosLista } from './DescartadosLista';
import { SELECIONADA_BG, SelecaoCell, SelecaoHeaderCell, useSelecaoFila } from './DistribuicaoSelecao';
import { contemBusca, PAGE_SIZE, TODAS } from './filaComum';
import { efeitoGestorDoVinculo, preverVinculo, semZeros, textoItemQtd, type ItemDaAta, type PrevisaoVinculo } from './vinculoEmMassa';

/** Mesma chave do hook useContractItemQuantities: a consulta é compartilhada com o modal "Vincular Contrato". */
const chaveApi = (c: Pick<ContractDashboardRecord, 'uasg' | 'numero' | 'ano'>) => `${c.uasg}-${c.numero}-${c.ano}`;

/**
 * ATA_PROVAVEL: mesma compra e mesmo fornecedor de uma ou mais atas (candidato ao vínculo em lote);
 * PARCIAL: só a compra ou só o fornecedor batem; SEM_PISTA: nenhuma ata parecida;
 * NAO_PERTENCE: o coordenador marcou que o contrato não veio de ata (só aparece quando escolhido no filtro).
 */
type Grupo = 'ATA_PROVAVEL' | 'PARCIAL' | 'SEM_PISTA' | 'NAO_PERTENCE';

const ROTULO_GRUPO: Record<Grupo, string> = {
  ATA_PROVAVEL: 'Ata provável',
  PARCIAL: 'Pista parcial',
  SEM_PISTA: 'Sem ata provável',
  NAO_PERTENCE: 'Não pertence a ata'
};

const ROTULO_MOTIVO: Record<MotivoSugestao, string> = {
  COMPRA_E_FORNECEDOR: 'mesma compra e fornecedor',
  COMPRA: 'mesma compra',
  FORNECEDOR: 'mesmo fornecedor'
};

type Linha = ItemFila & {
  grupo: Grupo;
  /** Atas com mesma compra e fornecedor. */
  fortes: AtaSugerida[];
};

interface Filtros {
  busca: string;
  situacao: string;
  gestor: string;
}

const SCHEMA: CarteiraFilterSchema<Filtros> = {
  busca: { param: 'busca', default: '' },
  situacao: { param: 'situacao', default: TODAS, values: [TODAS, 'ATA_PROVAVEL', 'PARCIAL', 'SEM_PISTA', 'NAO_PERTENCE'] },
  gestor: { param: 'gestor', default: TODAS }
};

const SEM_GESTOR_DA_ATA = '__SEM_GESTOR__';

const COLUNAS: Record<string, CarteiraSortColumn<Linha>> = {
  contrato: { value: (l) => l.numero },
  ata: { value: (l) => (l.fortes[0] ?? l.sugestoes[0])?.numeroAta }
};

const chave = (l: Linha) => l.contractKey;
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

const linkAta: React.CSSProperties = {
  background: 'none',
  border: 'none',
  padding: 0,
  font: 'inherit',
  fontWeight: 700,
  color: 'var(--primary)',
  textDecoration: 'underline',
  cursor: 'pointer'
};

/** Resultado da conferência pela API, numa linha curta embaixo da ata. */
const StatusApi: React.FC<{ previsao: PrevisaoVinculo; testId: string }> = ({ previsao, testId }) => {
  if (previsao.status === 'CONFERINDO') {
    return (
      <span data-testid={testId} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem', color: '#64748b' }}>
        <Loader2 size={11} className="animate-spin" aria-hidden="true" /> Conferindo na API...
      </span>
    );
  }
  if (previsao.status === 'PRONTO') {
    const itens = previsao.itens;
    const texto =
      itens.length === 1
        ? `Item ${semZeros(itens[0].numeroItem)} · Qtd ${itens[0].quantidade != null ? itens[0].quantidade.toLocaleString('pt-BR') : '—'}`
        : `${itens.length} itens confirmados`;
    return (
      <span data-testid={testId} title={itens.map(textoItemQtd).join('\n')} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem', color: 'var(--color-success-text)' }}>
        <CheckCircle2 size={11} aria-hidden="true" /> {texto}
      </span>
    );
  }
  return (
    <span data-testid={testId} style={{ fontSize: '0.75rem', color: 'var(--color-warning-text)', fontWeight: 600 }}>
      {previsao.motivo}
    </span>
  );
};

interface ContratosSemVinculoFilaProps {
  pendencias: PendenciasDistribuicao;
  confirmacoes: Record<string, ContratoSemAtaConfirmacao>;
  /** Só o coordenador vincula, descarta, marca e atribui; o leitor consulta. */
  podeAgir: boolean;
  /** Abre o "Para quem atribuo?" para os contratos. */
  onAtribuir: (itens: ItemFila[], done?: () => void) => void;
  /** Itens da ata no banco (a previsão do vínculo cruza com os itens do contrato na API). */
  itensDaAta: (numeroAta: string, uasg: string) => ItemDaAta[];
  /** Dados completos da ata, para o painel de conferência. */
  ataDe: (numeroAta: string, uasg: string) => FilaAta | undefined;
}

/**
 * Contratos sem vínculo: uma fila só para a pergunta "este contrato pertence a qual ata, ou a nenhuma?". Primeiro os
 * que têm ata provável (mesma compra e fornecedor; os que a API confirma entram no vínculo em lote), depois os de pista
 * parcial e os sem pista (o coordenador confere a ata ou marca "não pertence a nenhuma ata" e escolhe o gestor). O nome
 * da ata abre o painel de conferência; descartar tira a ata das sugestões do contrato.
 */
export const ContratosSemVinculoFila: React.FC<ContratosSemVinculoFilaProps> = ({ pendencias, confirmacoes, podeAgir, onAtribuir, itensDaAta, ataDe: ataCompleta }) => {
  const navigate = useNavigateWithOrigin();
  const queryClient = useQueryClient();
  const confirmDialog = useConfirmDialog();
  const toast = useToast();
  const { filters, setFilter, resetFilters } = useCarteiraFilters(SCHEMA);
  const hasActive = hasActiveCarteiraFilters(SCHEMA, filters);
  const lote = useVinculoEmMassa();
  const descartar = useDescartarAta();
  const confirmar = useConfirmarContratoSemAta();
  const desfazer = useDesfazerContratoSemAta();
  const [ataEscolhida, setAtaEscolhida] = React.useState<Record<string, string>>({});
  const [conferindo, setConferindo] = React.useState<{ item: ItemFila; ata: FilaAta } | null>(null);

  const todas = React.useMemo<Linha[]>(() => {
    const comFortes = (i: ItemFila, grupo: Grupo): Linha => ({ ...i, grupo, fortes: i.sugestoes.filter((s) => s.motivo === 'COMPRA_E_FORNECEDOR') });
    return [
      ...pendencias.aVincular.map((i) => comFortes(i, 'ATA_PROVAVEL')),
      ...pendencias.precisamDecisao.map((i) => comFortes(i, i.sugestoes.length > 0 ? 'PARCIAL' : 'SEM_PISTA')),
      ...pendencias.naoPertencem.map((i) => comFortes(i, 'NAO_PERTENCE'))
    ];
  }, [pendencias]);
  const pendentes = React.useMemo(() => todas.filter((l) => l.grupo !== 'NAO_PERTENCE'), [todas]);
  // Sem escolha de situação, os pendentes; com escolha, o grupo escolhido (inclusive os marcados).
  const universo = filters.situacao === TODAS ? pendentes : todas.filter((l) => l.grupo === filters.situacao);

  /** Ata que o vínculo usaria: a única provável, a escolhida na linha quando há várias, ou a da pista parcial. */
  const ataDaLinha = React.useCallback(
    (l: Linha): AtaSugerida | undefined =>
      l.fortes.find((s) => `${s.numeroAta}|${s.uasg}` === ataEscolhida[l.contractKey]) ?? l.fortes[0] ?? l.sugestoes[0],
    [ataEscolhida]
  );
  const conferir = (l: Linha, s?: AtaSugerida) => {
    const alvo = s ?? ataDaLinha(l);
    const ata = alvo && ataCompleta(alvo.numeroAta, alvo.uasg);
    if (ata) setConferindo({ item: l, ata });
  };

  const gestoresDasAtas = React.useMemo(
    () => Array.from(new Set(pendentes.flatMap((l) => l.fortes.map((s) => s.gestorNome).filter((g): g is string => Boolean(g))))).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [pendentes]
  );
  const temAtaSemGestor = pendentes.some((l) => l.fortes.some((s) => !s.gestorNome));
  const contagem = (g: Grupo) => todas.filter((l) => l.grupo === g).length;

  const filtradas = React.useMemo(
    () =>
      universo.filter((l) => {
        if (filters.gestor !== TODAS) {
          const bate = l.fortes.some((s) => (filters.gestor === SEM_GESTOR_DA_ATA ? !s.gestorNome : s.gestorNome === filters.gestor));
          if (!bate) return false;
        }
        return contemBusca(filters.busca, l.numero, l.fornecedorNome, l.fornecedorCnpj, l.objeto, ...l.sugestoes.map((s) => s.numeroAta), ...l.sugestoes.map((s) => s.gestorNome));
      }),
    [universo, filters]
  );
  const { sorted, sortKey, sortDir, toggle } = useCarteiraSort(filtradas, COLUNAS);
  const { currentPage, setPage, pageItems } = useCarteiraPagination(sorted, chave, PAGE_SIZE);
  const sort = { activeKey: sortKey, activeDir: sortDir, onSort: toggle };

  // Itens do contrato na API oficial, só das linhas da página com uma ata provável que tem itens: é a conferência do lote.
  const paraConsultar = React.useMemo(
    () => pageItems.filter((l) => l.fortes.length === 1 && itensDaAta(l.fortes[0].numeroAta, l.fortes[0].uasg).length > 0),
    [pageItems, itensDaAta]
  );
  const consultas = useQueries({
    queries: paraConsultar.map((l) => ({
      queryKey: ['contract-item-quantities', chaveApi(l.contract)] as const,
      queryFn: () => fetchContractItemQuantities(l.contract),
      staleTime: 10 * 60 * 1000,
      retry: 1
    }))
  });
  const consultaPorContrato = React.useMemo(() => new Map(paraConsultar.map((l, i) => [l.contractKey, consultas[i]])), [paraConsultar, consultas]);

  /** Previsão do vínculo (só para ata provável); a das linhas de outras páginas sai do cache da consulta. */
  const previsaoDe = (l: Linha): PrevisaoVinculo | null => {
    if (l.grupo !== 'ATA_PROVAVEL') return null;
    const ata = ataDaLinha(l) as AtaSugerida;
    const consulta = consultaPorContrato.get(l.contractKey);
    const doCache = queryClient.getQueryData<ContractItemQuantities>(['contract-item-quantities', chaveApi(l.contract)]);
    return preverVinculo({
      numeroAta: ata.numeroAta,
      uasg: ata.uasg,
      atasProvaveis: l.fortes.length,
      itensDaAta: itensDaAta(ata.numeroAta, ata.uasg),
      apiQuantidades: consulta?.data ?? doCache,
      apiCarregando: consulta ? consulta.isLoading : false,
      apiErro: consulta?.isError
    });
  };
  const pronta = (l: Linha) => previsaoDe(l)?.status === 'PRONTO';
  const decidivel = (l: Linha) => l.grupo === 'PARCIAL' || l.grupo === 'SEM_PISTA';
  const selecionavel = (l: Linha) => pronta(l) || decidivel(l);

  const chavesSelecionaveisDaPagina = pageItems.filter(selecionavel).map(chave);
  const selecao = useSelecaoFila(React.useMemo(() => todas.map(chave), [todas]));
  const selecionadas = todas.filter((l) => selecao.selecionadas.has(chave(l)));
  const selecionadasProntas = selecionadas.filter(pronta);
  const selecionadasDecisao = selecionadas.filter(decidivel);

  const planoDe = (l: Linha): PlanoVinculo | null => {
    const previsao = previsaoDe(l);
    if (previsao?.status !== 'PRONTO') return null;
    const ata = ataDaLinha(l) as AtaSugerida;
    return {
      contractKey: l.contractKey,
      numero: l.numero,
      contract: l.contract,
      numeroAta: ata.numeroAta,
      uasg: ata.uasg,
      itens: previsao.itens.map((i) => ({ itemKey: i.itemKey, numeroItem: i.numeroItem, valorUnitario: i.valorUnitario, quantidade: i.quantidade }))
    };
  };

  const vincular = async (alvo: Linha[]) => {
    const prontos = alvo.map((l) => ({ linha: l, plano: planoDe(l) })).filter((x): x is { linha: Linha; plano: PlanoVinculo } => Boolean(x.plano));
    if (prontos.length === 0) {
      toast.error('Nenhum dos contratos marcados está pronto para vincular. Clique no nome da ata para conferir um a um.');
      return;
    }
    const efeitos = prontos.map((x) => efeitoGestorDoVinculo(x.linha.gestorNome, ataDaLinha(x.linha)?.gestorNome));
    const muda = efeitos.filter((e) => e.tipo === 'MUDA').length;
    const ataAssume = efeitos.filter((e) => e.tipo === 'ATA_ASSUME').length;
    const ok = await confirmDialog({
      title: prontos.length === 1 ? 'Vincular contrato à ata' : `Vincular ${prontos.length} contratos às atas`,
      message: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          <div style={{ maxHeight: '220px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }} data-testid="sem-vinculo-confirmar-lista">
            {prontos.map((x) => (
              <div key={x.plano.contractKey}>
                <strong>Contrato {x.plano.numero} ↔ Ata {x.plano.numeroAta}</strong>
                {x.plano.itens.map((i) => (
                  <div key={i.itemKey} style={{ paddingLeft: '1.1rem', fontSize: '0.85rem', color: '#334155' }}>
                    {textoItemQtd({ numeroItem: i.numeroItem, quantidade: i.quantidade ?? null })}
                  </div>
                ))}
              </div>
            ))}
          </div>
          <span>A quantidade contratada passa a contar no saldo e {prontos.length === 1 ? 'o contrato passa' : 'os contratos passam'} ao gestor da ata.</span>
          {muda > 0 && <strong style={{ color: 'var(--color-warning-text)' }}>{plural(muda, 'contrato muda', 'contratos mudam')} de gestor para seguir a ata.</strong>}
          {ataAssume > 0 && (
            <strong style={{ color: 'var(--color-warning-text)' }}>{plural(ataAssume, 'ata sem gestor passa', 'atas sem gestor passam')} a ser do gestor do contrato vinculado.</strong>
          )}
        </div>
      ),
      confirmLabel: prontos.length === 1 ? 'Vincular' : `Vincular ${prontos.length}`
    });
    if (!ok) return;
    const resultados = await lote.executar(prontos.map((x) => x.plano));
    selecao.limpar();
    const feitos = resultados.filter((r) => r.ok).length;
    if (feitos > 0) toast.success(`${plural(feitos, 'contrato vinculado', 'contratos vinculados')}.`);
  };

  /** "Não pertence a nenhuma ata": o coordenador confirma, o contrato é marcado e abre o "Para quem atribuo?". */
  const naoPertence = async (alvo: Linha[], done?: () => void) => {
    const ok = await confirmDialog({
      title: alvo.length === 1 ? 'Contrato que não pertence a nenhuma ata' : `${alvo.length} contratos que não pertencem a nenhuma ata`,
      message: (
        <>
          {alvo.length === 1 ? (
            <>Confirmar que o contrato <strong>{alvo[0].numero}</strong> não veio de ata de registro de preços?</>
          ) : (
            <>Confirmar que estes {alvo.length} contratos não vieram de ata de registro de preços?</>
          )}{' '}
          {alvo.length === 1 ? 'Ele deixa' : 'Eles deixam'} de aparecer nas sugestões de vínculo e {alvo.length === 1 ? 'recebe' : 'recebem'} gestor direto,
          escolhido a seguir. Dá para desfazer filtrando a situação "Não pertence a ata".
        </>
      ),
      confirmLabel: 'Confirmar e escolher o gestor'
    });
    if (!ok) return;
    try {
      for (const l of alvo) await confirmar.mutateAsync(l.contractKey);
    } catch (err: any) {
      toast.error(`Não foi possível marcar: ${err?.message || 'erro desconhecido'}`);
      return;
    }
    onAtribuir(alvo, done);
  };

  const descartarAta = async (l: Linha) => {
    const ata = ataDaLinha(l);
    if (!ata) return;
    try {
      await descartar.mutateAsync({ contractKey: l.contractKey, ataKey: `${ata.numeroAta}-${ata.uasg}` });
      selecao.limpar();
      toast.success(`Ata ${ata.numeroAta} descartada para o contrato ${l.numero}.`);
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível descartar a ata.');
    }
  };

  const desfazerMarcacao = async (l: Linha) => {
    try {
      await desfazer.mutateAsync(l.contractKey);
    } catch (err: any) {
      toast.error(`Não foi possível desfazer: ${err?.message || 'erro desconhecido'}`);
    }
  };

  const { estado } = lote;
  const falhas = estado.resultados.filter((r) => !r.ok);
  const comAviso = estado.resultados.filter((r) => r.ok && r.avisos.length > 0);
  const ocupado = estado.rodando;

  const nomeAta = (l: Linha, s: AtaSugerida, prefixo = 'Ata') => (
    <button type="button" onClick={() => conferir(l, s)} title="Conferir esta ata" data-testid={`sem-vinculo-ata-${l.contractKey}-${s.numeroAta}`} style={linkAta}>
      {prefixo} {s.numeroAta}
    </button>
  );

  return (
    <section data-testid="distribuicao-sem-vinculo" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <p style={{ margin: 0, fontSize: '0.82rem', color: '#64748b' }}>
        Contratos vigentes ainda sem vínculo com ata. Clique no nome da ata para conferir e vincular; os que a API confirma podem ser vinculados
        vários de uma vez. Se o contrato não veio de ata, marque "Não pertence a nenhuma ata" e escolha o gestor.
      </p>

      {(estado.rodando || estado.resultados.length > 0) && (
        <div
          role="status"
          data-testid="sem-vinculo-progresso"
          style={{ border: `1px solid ${falhas.length ? 'var(--color-danger-border)' : 'var(--color-info-border)'}`, background: falhas.length ? 'var(--color-danger-bg)' : 'var(--color-info-bg)', borderRadius: '8px', padding: '0.65rem 0.85rem', fontSize: '0.82rem', color: '#0f172a' }}
        >
          {estado.rodando ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <Loader2 size={16} className="animate-spin" aria-hidden="true" />
              <strong>Vinculando {Math.min(estado.feitos + 1, estado.total)} de {estado.total}</strong>
              {estado.atual && <span style={{ color: '#475569' }}>contrato {estado.atual}</span>}
              <progress value={estado.feitos} max={estado.total} style={{ flex: '1 1 160px', height: '8px' }} />
              <button type="button" onClick={lote.parar} data-testid="sem-vinculo-parar" style={{ ...carteiraButton, color: '#475569' }}>
                Parar depois deste
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                {falhas.length ? <AlertTriangle size={16} color="var(--color-danger-text)" aria-hidden="true" /> : <CheckCircle2 size={16} color="var(--color-success-text)" aria-hidden="true" />}
                <strong>
                  {plural(estado.resultados.filter((r) => r.ok).length, 'contrato vinculado', 'contratos vinculados')} ({estado.resultados.reduce((n, r) => n + r.itens, 0)} itens)
                  {falhas.length > 0 && `, ${plural(falhas.length, 'falha', 'falhas')}`}
                  {estado.resultados.length < estado.total && ` — parou em ${estado.resultados.length} de ${estado.total}`}
                </strong>
                <button type="button" onClick={lote.limpar} aria-label="Fechar resumo" style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', color: '#475569' }}>
                  <X size={15} />
                </button>
              </div>
              {falhas.map((r) => (
                <div key={r.contractKey} style={{ color: 'var(--color-danger-text-strong)' }}>
                  Contrato {r.numero}: {r.erro}
                </div>
              ))}
              {comAviso.length > 0 && (
                <div style={{ color: 'var(--color-warning-text-strong)' }}>
                  Vinculados, mas a API não respondeu para: {comAviso.map((r) => `${r.numero} (${r.avisos.join(', ')})`).join('; ')}. A quantidade é lida de novo ao abrir o item.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <CarteiraFilterBar
        busca={filters.busca}
        searchPlaceholder="Buscar por contrato, fornecedor, CNPJ, ata, gestor..."
        onChangeBusca={(v) => setFilter('busca', v)}
        hasActiveFilters={hasActive}
        onResetFilters={resetFilters}
        counter={carteiraCounter(filtradas.length, pendentes.length, hasActive, 'contrato', 'contratos')}
        testIdPrefix="sem-vinculo"
      >
        <CarteiraFilterButton
          label="Situação"
          value={filters.situacao}
          emptyValue={TODAS}
          options={(['ATA_PROVAVEL', 'PARCIAL', 'SEM_PISTA', 'NAO_PERTENCE'] as const).map((g) => ({ value: g, label: ROTULO_GRUPO[g], count: contagem(g) }))}
          onChange={(v) => setFilter('situacao', v)}
          testId="sem-vinculo-filter-situacao"
        />
        <CarteiraFilterButton
          label="Gestor da ata"
          value={filters.gestor}
          emptyValue={TODAS}
          options={[...(temAtaSemGestor ? [{ value: SEM_GESTOR_DA_ATA, label: 'Ata sem gestor' }] : []), ...gestoresDasAtas.map((g) => ({ value: g, label: g }))]}
          onChange={(v) => setFilter('gestor', v)}
          testId="sem-vinculo-filter-gestor"
        />
      </CarteiraFilterBar>

      {podeAgir && selecionadas.length > 0 && (
        <div
          role="region"
          aria-label="Ações em lote"
          data-testid="sem-vinculo-selecao"
          style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.6rem', padding: '0.55rem 0.85rem', background: SELECIONADA_BG, border: '1px solid var(--color-info-border)', borderRadius: '8px', fontSize: '0.8rem', color: 'var(--color-info-text-strong)' }}
        >
          <strong>{plural(selecionadas.length, 'contrato selecionado', 'contratos selecionados')}</strong>
          <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            <AppButton variant="outline" size="sm" icon={<X size={13} />} onClick={selecao.limpar} disabled={ocupado}>
              Limpar
            </AppButton>
            {selecionadasDecisao.length > 0 && (
              <AppButton
                variant="outline"
                size="sm"
                icon={<XCircle size={13} />}
                onClick={() => naoPertence(selecionadasDecisao, selecao.limpar)}
                disabled={ocupado || confirmar.isPending}
                data-testid="sem-vinculo-nao-pertencem-selecionados"
              >
                {selecionadasDecisao.length === 1 ? 'Não pertence a nenhuma ata' : `${selecionadasDecisao.length} não pertencem a nenhuma ata`}
              </AppButton>
            )}
            {selecionadasProntas.length > 0 && (
              <AppButton variant="primary" size="sm" icon={<Link2 size={13} />} onClick={() => vincular(selecionadasProntas)} disabled={ocupado} data-testid="sem-vinculo-vincular-selecionados">
                Vincular {selecionadasProntas.length}
              </AppButton>
            )}
          </span>
        </div>
      )}

      {universo.length === 0 ? (
        <div style={{ ...carteiraTableShell, padding: '1.25rem', fontSize: '0.85rem', color: '#64748b' }}>Nenhum contrato nesta situação.</div>
      ) : filtradas.length === 0 ? (
        <CarteiraNoResults title="Nenhum contrato encontrado" description="Nenhum contrato sem vínculo atende aos filtros." onResetFilters={resetFilters} />
      ) : (
        <div style={carteiraTableShell}>
          <div style={{ overflowX: 'auto' }}>
            <table className="carteira-stack" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {podeAgir && (
                    <SelecaoHeaderCell
                      chavesDaPagina={chavesSelecionaveisDaPagina}
                      selecionadas={selecao.selecionadas}
                      onToggle={() => selecao.alternarVarias(chavesSelecionaveisDaPagina)}
                      testId="sem-vinculo-selecionar-pagina"
                    />
                  )}
                  <CarteiraSortHeader label="Contrato" sortKey="contrato" {...sort} />
                  <CarteiraSortHeader label="Ata provável" sortKey="ata" {...sort} />
                  <th style={carteiraTh}>Gestor</th>
                  {podeAgir && <th style={{ ...carteiraTh, textAlign: 'right' }}>Ação</th>}
                </tr>
              </thead>
              <tbody>
                {pageItems.map((l) => {
                  const ata = ataDaLinha(l);
                  const previsao = previsaoDe(l);
                  const marcada = selecao.selecionadas.has(chave(l));
                  const conf = confirmacoes[l.contractKey];
                  const efeito = l.grupo === 'ATA_PROVAVEL' ? efeitoGestorDoVinculo(l.gestorNome, ata?.gestorNome) : null;
                  return (
                    <tr key={chave(l)} data-testid={`sem-vinculo-${l.contractKey}`} style={marcada ? { background: SELECIONADA_BG } : undefined}>
                      {podeAgir && (
                        <SelecaoCell
                          checked={marcada}
                          onToggle={() => selecao.alternar(chave(l))}
                          label={`Selecionar contrato ${l.numero}`}
                          testId={`sem-vinculo-selecionar-${l.contractKey}`}
                          disabled={!selecionavel(l) || ocupado}
                        />
                      )}
                      <td style={{ ...carteiraTd, minWidth: '180px', maxWidth: '320px' }}>
                        <CarteiraIdLink onClick={() => navigate(`/contratos/${encodeURIComponent(l.contractKey)}`)} label={`Abrir contrato ${l.numero}`}>
                          Contrato {l.numero}
                        </CarteiraIdLink>
                        {l.fornecedorNome && (
                          <div title={l.fornecedorNome} style={{ fontSize: '0.75rem', color: '#64748b', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                            {l.fornecedorNome}
                          </div>
                        )}
                      </td>
                      <td data-label="Ata provável" style={{ ...carteiraTd, fontSize: '0.8rem', minWidth: '190px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.2rem' }}>
                          {l.grupo === 'ATA_PROVAVEL' && ata && (
                            <>
                              {l.fortes.length > 1 ? (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                                  <select
                                    value={`${ata.numeroAta}|${ata.uasg}`}
                                    onChange={(e) => setAtaEscolhida((prev) => ({ ...prev, [l.contractKey]: e.target.value }))}
                                    aria-label={`Ata para o contrato ${l.numero}`}
                                    style={{ ...carteiraSelect, maxWidth: '160px' }}
                                  >
                                    {l.fortes.map((s) => (
                                      <option key={`${s.numeroAta}|${s.uasg}`} value={`${s.numeroAta}|${s.uasg}`}>
                                        Ata {s.numeroAta}
                                      </option>
                                    ))}
                                  </select>
                                </span>
                              ) : (
                                nomeAta(l, ata)
                              )}
                              {previsao && <StatusApi previsao={previsao} testId={`sem-vinculo-api-${l.contractKey}`} />}
                            </>
                          )}
                          {l.grupo === 'PARCIAL' && ata && (
                            <span>
                              Pista parcial: {nomeAta(l, ata, 'ata')} <span style={{ color: '#64748b' }}>({ROTULO_MOTIVO[ata.motivo]})</span>
                            </span>
                          )}
                          {l.grupo === 'SEM_PISTA' && <span style={{ color: '#94a3b8' }}>Nenhuma ata provável</span>}
                          {l.grupo === 'NAO_PERTENCE' && (
                            <span style={{ color: '#64748b' }}>
                              Não pertence a ata
                              {conf && <>{conf.confirmadoPorNome ? ` · marcado por ${conf.confirmadoPorNome}` : ''}{conf.confirmadoEm ? ` em ${formatDateBR(conf.confirmadoEm)}` : ''}</>}
                            </span>
                          )}
                        </div>
                      </td>
                      <td data-label="Gestor" style={{ ...carteiraTd, fontSize: '0.78rem', color: efeito?.atencao ? 'var(--color-warning-text)' : '#0f172a', fontWeight: efeito?.atencao ? 700 : 500 }}>
                        {efeito ? efeito.texto : l.gestorNome || <span style={{ color: 'var(--color-warning-text)' }}>sem gestor</span>}
                      </td>
                      {podeAgir && (
                        <td data-role="action" style={{ ...carteiraTd, textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'inline-flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
                            {l.grupo === 'ATA_PROVAVEL' && (
                              <>
                                {previsao?.status === 'PRONTO' ? (
                                  <AppButton variant="primary" size="sm" icon={<Link2 size={13} />} onClick={() => vincular([l])} disabled={ocupado} title="Vincular este contrato à ata" data-testid={`sem-vinculo-vincular-${l.contractKey}`}>
                                    Vincular
                                  </AppButton>
                                ) : (
                                  <AppButton variant="primary" size="sm" icon={<Search size={13} />} onClick={() => conferir(l)} disabled={ocupado} title="Conferir a ata e escolher os itens" data-testid={`sem-vinculo-conferir-${l.contractKey}`}>
                                    Conferir
                                  </AppButton>
                                )}
                                <AppButton variant="outline" size="sm" icon={<X size={13} />} onClick={() => descartarAta(l)} disabled={ocupado || descartar.isPending} title={`Esta ata (${ata?.numeroAta}) não é a deste contrato`} data-testid={`sem-vinculo-descartar-${l.contractKey}`}>
                                  Descartar
                                </AppButton>
                              </>
                            )}
                            {l.grupo === 'PARCIAL' && (
                              <AppButton variant="outline" size="sm" icon={<Search size={13} />} onClick={() => conferir(l)} disabled={ocupado} title="Conferir a ata da pista" data-testid={`sem-vinculo-conferir-${l.contractKey}`}>
                                Conferir
                              </AppButton>
                            )}
                            {decidivel(l) && (
                              <AppButton
                                variant={l.grupo === 'SEM_PISTA' ? 'primary' : 'outline'}
                                size="sm"
                                icon={<XCircle size={13} />}
                                onClick={() => naoPertence([l])}
                                disabled={ocupado || confirmar.isPending}
                                title="Este contrato não veio de ata: marcar e escolher o gestor"
                                data-testid={`sem-vinculo-nao-pertence-${l.contractKey}`}
                              >
                                Não pertence a nenhuma ata
                              </AppButton>
                            )}
                            {l.grupo === 'NAO_PERTENCE' && (
                              <>
                                {!l.gestorNome && (
                                  <AppButton variant="primary" size="sm" icon={<UserPlus size={13} />} onClick={() => onAtribuir([l])} title="Escolher o gestor do contrato">
                                    Atribuir gestor
                                  </AppButton>
                                )}
                                <AppButton variant="outline" size="sm" icon={<RotateCcw size={13} />} onClick={() => desfazerMarcacao(l)} disabled={desfazer.isPending} title="Voltar a tratar o contrato como possível de ata">
                                  Desfazer
                                </AppButton>
                              </>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <CarteiraPagination page={currentPage} pageSize={PAGE_SIZE} total={sorted.length} onChange={setPage} testIdPrefix="sem-vinculo" />
        </div>
      )}

      <DescartadosLista descartados={pendencias.descartados} podeRestaurar={podeAgir} testIdPrefix="sem-vinculo" />

      {conferindo && (
        <ConferenciaAtaModal
          contrato={conferindo.item}
          ata={conferindo.ata}
          itensDaAta={itensDaAta(conferindo.ata.numeroAta, conferindo.ata.uasg)}
          podeAgir={podeAgir}
          onClose={() => setConferindo(null)}
        />
      )}
    </section>
  );
};
