import React, { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FileText } from 'lucide-react';
import { PageContainer } from '../../../design-system/components/PageContainer';
import { PageHeader } from '../../../design-system/components/PageHeader';
import { HeaderRefreshAction } from '../../../design-system/components/HeaderRefreshAction';
import { DataTable, type Column } from '../../../design-system/components/DataTable';
import { StatusBadge, type StatusBadgeVariant } from '../../../design-system/components/StatusBadge';
import { ActionButton } from '../../../design-system/components/ActionButton';
import { CarteiraFilterBar, carteiraCounter } from '../../carteira/CarteiraFilterBar';
import { CarteiraFilterButton } from '../../carteira/CarteiraFilterButton';
import { CarteiraSegmentTabs } from '../../carteira/CarteiraSegmentTabs';
import { CarteiraPagination } from '../../carteira/CarteiraPagination';
import { useCarteiraPagination } from '../../carteira/useCarteiraPagination';
import { carteiraDetalhe, carteiraIdentificacao, carteiraNumero, carteiraSubtitle, carteiraValor } from '../../carteira/carteiraStyles';
import { AdminListShell } from '../../admin/shared/AdminListShell';
import { useCarteiraSort, type CarteiraSortColumn } from '../../carteira/useCarteiraSort';
import { useNavigateWithOrigin } from '../../../hooks/useDetailOrigin';
import {
  hojeEmBrasilia,
  useAutoresEmendas,
  useBeneficiariosEmendas,
  useContatosDasEmendas,
  useEmendasSiop,
  useItensCaep,
  useMapaGruposBeneficiarios,
  useNotasDasLinhas,
  usePedidosEmendas,
  usePodeGerirEmendas
} from '../../../hooks/useEmendas';
import { formatCurrency } from '../../../utils/format';
import { dataBR } from '../../../utils/emendasKits';
import { casaBusca } from '../../../utils/emendasBeneficiarios';
import { diasSemContatoParaUrgente, emendasNaLista, numeroDaEmenda, ROTULO_SITUACAO_EMENDA, semPedido, type EmendaNaLista } from '../../../utils/emendasSemPedido';
import { execucaoDosPedidos } from '../../../utils/emendasParlamentar';
import { contarPorGti, passaFiltroGti, resumirFatias, type FatiasDaAta } from '../../../config/gruposGti';
import { GRUPOS_CAPTACAO, fatiasDaCaptacao, lerFiltroCaptacao, lerModoCaptacao, type GrupoBeneficiario } from '../../../config/captacaoEmendas';
import type { EmendaSiop, NotaDaLinha } from '../../../services/emendasService';
import { AutorDoPedido, LARGURA_AUTOR } from '../emendasPartes';
import { CelulaCaptacao, FiltroCaptacao } from '../CaptacaoDoPedido';
import { EmendaSiopModal } from '../EmendaSiopModal';
import { useSobraDasEmendas } from '../parlamentares/useSobraDasEmendas';
import { rotaDaEmenda } from './rotaDaEmenda';

type Segmento = 'sem' | 'com' | 'todas';
const POR_PAGINA = 25;
const SEM_NOTAS = new Map<string, NotaDaLinha>();
const chave = (l: EmendaNaLista) => l.chave;
const VARIANTE: Record<EmendaNaLista['situacao'], StatusBadgeVariant> = { SEM_CONTATO: 'warning', EM_CONVERSA: 'warning', COM_PEDIDO: 'success' };
const PESO_SITUACAO: Record<EmendaNaLista['situacao'], number> = { SEM_CONTATO: 2, EM_CONVERSA: 1, COM_PEDIDO: 0 };

/**
 * Emendas › Emendas (protótipo aprovado em 27/10/2026): uma linha por emenda, as registradas no SIOP (com ou sem pedido)
 * e os números que só existem nos pedidos, no padrão das carteiras; a linha abre a Emenda 360. Substitui Pedidos › Por
 * emenda. Situação, ano e Captação principal ficam no endereço (?situacao=, ?ano=, ?captacao=).
 */
export const EmendasListaPage: React.FC = () => {
  const { data: pedidos = [], isLoading: carregandoPedidos, isError: erroPedidos, refetch } = usePedidosEmendas();
  const emendasQ = useEmendasSiop();
  const { data: contatos = [] } = useContatosDasEmendas();
  const { data: autores = [] } = useAutoresEmendas();
  const { data: beneficiarios = [] } = useBeneficiariosEmendas();
  const { data: notas = SEM_NOTAS } = useNotasDasLinhas();
  const { data: itensLista = [] } = useItensCaep();
  const grupos = useMapaGruposBeneficiarios();
  const podeGerir = usePodeGerirEmendas();
  const hoje = hojeEmBrasilia();
  const navegar = useNavigateWithOrigin();
  const [searchParams, setSearchParams] = useSearchParams();
  const daUrl = searchParams.get('situacao');
  const segmento: Segmento = daUrl === 'sem' || daUrl === 'com' ? daUrl : 'todas';
  const filtroAno = searchParams.get('ano') ?? '';
  const filtroCaptacao = lerFiltroCaptacao(searchParams.get('captacao'));
  const modoCaptacao = lerModoCaptacao(searchParams.get('captacaoConta'));
  const mudarUrl = (mudar: (p: URLSearchParams) => void) =>
    setSearchParams((atual) => {
      const prox = new URLSearchParams(atual);
      mudar(prox);
      return prox;
    });
  const [busca, setBusca] = useState('');
  const [editando, setEditando] = useState<EmendaSiop | 'nova' | null>(null);

  const autorPorId = useMemo(() => new Map(autores.map((a) => [a.id, a])), [autores]);
  const itens = useMemo(() => new Map(itensLista.map((i) => [i.itemKey, i])), [itensLista]);
  const lista = useMemo(() => emendasNaLista(emendasQ.data ?? [], pedidos, contatos, hoje), [emendasQ.data, pedidos, contatos, hoje]);
  const anos = useMemo(() => [...new Set(lista.map((l) => l.ano).filter((a): a is number => a != null))].sort((a, b) => b - a), [lista]);
  const { emendas: sobras, precos } = useSobraDasEmendas(pedidos, itens, notas, anos);
  const sobraPorCodigo = useMemo(() => new Map(sobras.map((s) => [s.codigo, s])), [sobras]);
  const sobraDe = (l: EmendaNaLista) => (l.ano ? sobraPorCodigo.get(`${l.ano}${l.numero}`) : undefined);

  // Captação principal (migration 218): pelos pedidos da emenda; sem pedido, pelo beneficiário indicado na emenda.
  const captacao = useMemo(() => {
    const m = new Map<string, FatiasDaAta>();
    for (const l of lista) {
      if (l.pedidos.length) m.set(l.chave, fatiasDaCaptacao(l.pedidos, grupos, itens, precos));
      else if (l.emenda?.beneficiarioId) {
        const grupo: GrupoBeneficiario | 'A_CONFIRMAR' = grupos.get(l.emenda.beneficiarioId) ?? 'A_CONFIRMAR';
        m.set(l.chave, { ...resumirFatias([{ grupo, quantidade: l.valor ?? 1, orgaos: 1 }]), medida: 'VALOR' });
      }
    }
    return m;
  }, [lista, grupos, itens, precos]);
  const pagoPorChave = useMemo(() => new Map(lista.map((l) => [l.chave, execucaoDosPedidos(l.pedidos, notas)])), [lista, notas]);

  const doAno = lista.filter((l) => !filtroAno || String(l.ano ?? 'sem') === filtroAno);
  const conta = { sem: doAno.filter(semPedido).length, com: doAno.filter((l) => !semPedido(l)).length, todas: doAno.length };
  const doSegmento = doAno.filter((l) => segmento === 'todas' || (segmento === 'sem') === semPedido(l));
  const contagemCaptacao = contarPorGti(doSegmento.map((l) => captacao.get(l.chave)), modoCaptacao, GRUPOS_CAPTACAO);
  const doGrupo = doSegmento.filter((l) => passaFiltroGti(captacao.get(l.chave), filtroCaptacao, modoCaptacao));
  const termo = busca.trim();
  const filtradas = termo
    ? doGrupo.filter((l) => {
        const a = l.autorId ? autorPorId.get(l.autorId) : undefined;
        return casaBusca(`${l.numero} ${numeroDaEmenda(l.numero)} ${a?.nome ?? ''} ${a?.uf ?? ''} ${l.emenda?.objeto ?? ''}`, termo);
      })
    : doGrupo;
  const filtrosAtivos = Boolean(termo) || filtroCaptacao !== 'TODOS' || Boolean(filtroAno);
  const ordem = useMemo<Record<string, CarteiraSortColumn<EmendaNaLista>>>(
    () => ({
      emenda: { value: (l) => `${l.ano ?? 0}${l.numero}`, firstDir: 'desc' },
      autor: { value: (l) => (l.autorId ? autorPorId.get(l.autorId)?.nome ?? l.autorId : null) },
      valor: { value: (l) => l.valor, firstDir: 'desc' },
      empenhado: { value: (l) => sobraPorCodigo.get(`${l.ano}${l.numero}`)?.empenhado ?? null, firstDir: 'desc' },
      pago: { value: (l) => pagoPorChave.get(l.chave)?.pago ?? null, firstDir: 'desc' },
      sobra: { value: (l) => sobraPorCodigo.get(`${l.ano}${l.numero}`)?.sobra ?? null, firstDir: 'desc' },
      contato: { value: (l) => l.contatos.at(-1)?.contatoEm ?? null },
      situacao: { value: (l) => PESO_SITUACAO[l.situacao] + (l.urgente ? 10 : 0), firstDir: 'desc' }
    }),
    [autorPorId, sobraPorCodigo, pagoPorChave]
  );
  const { sorted, sortKey, sortDir, toggle } = useCarteiraSort(filtradas, ordem);
  const { currentPage, setPage, pageItems } = useCarteiraPagination(sorted, chave, POR_PAGINA);
  const limite = diasSemContatoParaUrgente();
  const valorOu = (v: number | null | undefined) => (v == null ? <span style={carteiraDetalhe}>—</span> : <span style={carteiraNumero}>{formatCurrency(v)}</span>);

  const colunas: Column<EmendaNaLista>[] = [
    {
      key: 'emenda',
      header: 'Emenda',
      priority: 'primary',
      nowrap: true,
      sortValue: ordem.emenda.value,
      sortFirstDir: 'desc',
      render: (l) => (
        <>
          <div style={carteiraIdentificacao}>{numeroDaEmenda(l.numero)}</div>
          <div style={{ ...carteiraSubtitle, marginTop: '0.15rem' }}>{l.ano ?? 'ano não informado'}{l.gnd ? ` · ${l.gnd}` : ''}</div>
        </>
      )
    },
    { key: 'autor', header: 'Parlamentar', width: LARGURA_AUTOR, minWidth: LARGURA_AUTOR, sortValue: ordem.autor.value, render: (l) => <AutorDoPedido autor={l.autorId ? autorPorId.get(l.autorId) : undefined} autorId={l.autorId} /> },
    { key: 'valor', header: 'Valor no SIOP', align: 'right', nowrap: true, sortValue: ordem.valor.value, sortFirstDir: 'desc', render: (l) => (l.valor != null ? <span style={{ ...carteiraValor, ...carteiraNumero }}>{formatCurrency(l.valor)}</span> : <span style={carteiraDetalhe}>—</span>) },
    {
      key: 'captacao',
      header: 'Captação principal',
      render: (l) => {
        const f = captacao.get(l.chave);
        return f ? <CelulaCaptacao fatias={f} testId={`emendas-por-emenda-captacao-${l.chave}`} /> : <span style={carteiraDetalhe}>—</span>;
      }
    },
    { key: 'empenhado', header: 'Empenhado', align: 'right', nowrap: true, sortValue: ordem.empenhado.value, sortFirstDir: 'desc', render: (l) => valorOu(sobraDe(l)?.empenhado) },
    {
      key: 'pago',
      header: 'Pago',
      align: 'right',
      nowrap: true,
      sortValue: ordem.pago.value,
      sortFirstDir: 'desc',
      render: (l) => {
        const e = pagoPorChave.get(l.chave);
        return valorOu(e && e.notas > 0 ? e.pago : null);
      }
    },
    { key: 'sobra', header: 'Sobra', align: 'right', nowrap: true, sortValue: ordem.sobra.value, sortFirstDir: 'desc', render: (l) => valorOu(sobraDe(l)?.sobra) },
    // Sem pedido, o que interessa é o último contato; com pedido, o andamento está no Pedido 360.
    ...(podeGerir && segmento !== 'com'
      ? [
          {
            key: 'contato',
            header: 'Último contato',
            sortValue: ordem.contato.value,
            render: (l: EmendaNaLista) => {
              const u = l.contatos.at(-1);
              if (!semPedido(l)) return <span style={carteiraDetalhe}>—</span>;
              return u ? (
                <>
                  <div style={carteiraValor}>{dataBR(u.contatoEm)}</div>
                  <div style={carteiraDetalhe}>{u.comQuem}</div>
                </>
              ) : (
                <span style={carteiraDetalhe}>nenhum</span>
              );
            }
          } satisfies Column<EmendaNaLista>
        ]
      : []),
    {
      key: 'situacao',
      header: 'Situação',
      nowrap: true,
      sortValue: ordem.situacao.value,
      sortFirstDir: 'desc',
      render: (l) => (
        <span title={l.urgente ? `${l.diasSemContato} dias sem contato registrado (urgente a partir de ${limite})` : undefined} data-testid={`emendas-emenda-situacao-${l.chave}`}>
          <StatusBadge
            label={l.situacao === 'COM_PEDIDO' ? (l.pedidos.length > 1 ? `${l.pedidos.length} pedidos` : ROTULO_SITUACAO_EMENDA.COM_PEDIDO) : ROTULO_SITUACAO_EMENDA[l.situacao]}
            variant={l.urgente ? 'danger' : VARIANTE[l.situacao]}
            size="sm"
            dot={false}
          />
          {l.urgente && <div style={{ ...carteiraDetalhe, color: 'var(--color-danger-text)' }}>{l.diasSemContato} dias sem contato</div>}
        </span>
      )
    }
  ];

  const carregando = carregandoPedidos || emendasQ.isLoading;
  return (
    <PageContainer style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <PageHeader
        title="Emendas"
        subtitle="Emendas indicadas à SENASP no SIOP, com ou sem pedido: as que ainda não viraram pedido avisam até a CAEP falar com o parlamentar."
        icon={<FileText size={26} color="var(--primary)" aria-hidden="true" />}
        actions={
          <>
            {podeGerir && <ActionButton action="novo" label="Registrar emenda do SIOP" onClick={() => setEditando('nova')} data-testid="emendas-emenda-siop-nova" />}
            <HeaderRefreshAction onRefresh={() => void refetch()} isRefreshing={false} lastUpdated={null} dataTestId="emendas-emendas-atualizar" tooltipTitle="Recarregar" />
          </>
        }
      />
      <CarteiraSegmentTabs<Segmento>
        testIdPrefix="emendas-por-emenda-situacao"
        ariaLabel="Situação das emendas"
        active={segmento}
        onSelect={(s) =>
          mudarUrl((p) => {
            if (s === 'todas') p.delete('situacao');
            else p.set('situacao', s);
          })
        }
        segments={[
          { id: 'sem', label: 'Sem pedido', count: conta.sem },
          { id: 'com', label: 'Com pedido', count: conta.com },
          { id: 'todas', label: 'Todas', count: conta.todas }
        ]}
      />
      <CarteiraFilterBar
        busca={busca}
        searchPlaceholder="Buscar pelo nº, parlamentar, UF ou objeto..."
        onChangeBusca={setBusca}
        hasActiveFilters={filtrosAtivos}
        onResetFilters={() => {
          setBusca('');
          mudarUrl((p) => {
            p.delete('captacao');
            p.delete('captacaoConta');
            p.delete('ano');
          });
        }}
        counter={carteiraCounter(filtradas.length, doSegmento.length, filtrosAtivos, 'emenda', 'emendas')}
        testIdPrefix="emendas-por-emenda"
      >
        <CarteiraFilterButton
          label="Ano"
          value={filtroAno}
          emptyValue=""
          options={[
            ...anos.map((a) => ({ value: String(a), label: String(a), count: lista.filter((l) => l.ano === a).length })),
            ...(lista.some((l) => l.ano == null) ? [{ value: 'sem', label: 'Ano não informado', count: lista.filter((l) => l.ano == null).length }] : [])
          ]}
          onChange={(v) => mudarUrl((p) => (v ? p.set('ano', v) : p.delete('ano')))}
          testId="emendas-por-emenda-filtro-ano"
        />
        <FiltroCaptacao gti={filtroCaptacao} modo={modoCaptacao} counts={contagemCaptacao} mudarUrl={mudarUrl} testIdPrefix="emendas-por-emenda" />
      </CarteiraFilterBar>
      <AdminListShell
        testId="emendas-por-emenda-lista"
        isLoading={carregando}
        isError={erroPedidos || emendasQ.isError}
        errorTitle="Não foi possível carregar as emendas"
        errorMessage={(emendasQ.error as Error | null)?.message || 'Falha ao consultar as emendas.'}
        onRetry={() => {
          void refetch();
          void emendasQ.refetch();
        }}
        isEmpty={!carregando && filtradas.length === 0}
        emptyTitle={segmento === 'sem' && !termo ? 'Nenhuma emenda sem pedido.' : 'Nenhuma emenda encontrada.'}
        emptyDescription={
          segmento === 'sem' && !termo
            ? podeGerir
              ? 'Quando vir no SIOP uma emenda que ainda não chegou à CAEP, use "Registrar emenda do SIOP".'
              : 'A CAEP registra as emendas que vê no SIOP antes do pedido.'
            : 'Ajuste a busca ou escolha outra situação.'
        }
      >
        <DataTable<EmendaNaLista>
          testId="emendas-por-emenda-tabela"
          className="data-table-container--flush"
          data={pageItems}
          keyExtractor={chave}
          sort={{ key: sortKey, dir: sortDir }}
          onSort={toggle}
          columns={colunas}
          rowOpen={(l) => () => navegar(rotaDaEmenda(l))}
        />
        <CarteiraPagination page={currentPage} pageSize={POR_PAGINA} total={sorted.length} onChange={setPage} testIdPrefix="emendas-por-emenda" />
      </AdminListShell>
      {editando && (
        <EmendaSiopModal emenda={editando === 'nova' ? null : editando} emendas={emendasQ.data ?? []} pedidos={pedidos} autores={autores} beneficiarios={beneficiarios} onClose={() => setEditando(null)} />
      )}
    </PageContainer>
  );
};
