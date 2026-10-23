import React, { useMemo, useState } from 'react';
import { Building } from 'lucide-react';
import { PageContainer } from '../../design-system/components/PageContainer';
import { PageHeader } from '../../design-system/components/PageHeader';
import { HeaderRefreshAction } from '../../design-system/components/HeaderRefreshAction';
import { DataTable, type Column } from '../../design-system/components/DataTable';
import { StatusBadge } from '../../design-system/components/StatusBadge';
import { ActionButton } from '../../design-system/components/ActionButton';
import { CarteiraFilterBar, carteiraCounter } from '../carteira/CarteiraFilterBar';
import { CarteiraFilterButton } from '../carteira/CarteiraFilterButton';
import { CarteiraSegmentTabs } from '../carteira/CarteiraSegmentTabs';
import { CarteiraPagination } from '../carteira/CarteiraPagination';
import { useCarteiraPagination } from '../carteira/useCarteiraPagination';
import { useCarteiraSort, type CarteiraSortColumn } from '../carteira/useCarteiraSort';
import { carteiraFornecedor, carteiraSubtitle } from '../carteira/carteiraStyles';
import { AdminListShell } from '../admin/shared/AdminListShell';
import { useToast } from '../../design-system/components/Toast';
import {
  useBeneficiariosDiferentes,
  useBeneficiariosEmendas,
  useMarcarBeneficiariosDiferentes,
  usePedidosEmendas,
  usePodeGerirEmendas,
  useSalvarBeneficiario
} from '../../hooks/useEmendas';
import { formatarCep, localDoBeneficiario, rotuloBeneficiario, type BeneficiarioEmenda } from '../../services/emendasService';
import { faltasDoBeneficiario, paresParecidos, type FaltaDoBeneficiario } from '../../utils/emendasBeneficiarios';
import { BeneficiarioModal } from './BeneficiarioModal';
import { ContatoDoResponsavel } from './ContatoDoResponsavel';
import { JuntarBeneficiariosModal } from './JuntarBeneficiariosModal';
import { NomeComSigla } from './emendasPartes';

type Segmento = 'completos' | 'faltam' | 'parecidos' | 'inativos' | 'todos';

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
// Colunas além do nome no padrão das carteiras (como Itens e Vigência na Carteira de Atas): valor em negrito e, embaixo,
// o detalhe menor em cinza.
const principal: React.CSSProperties = { fontWeight: 700 };
const detalhe: React.CSSProperties = { fontSize: '0.75rem', color: '#64748b' };
const falta: React.CSSProperties = { ...detalhe, fontStyle: 'italic' };
const POR_PAGINA = 25;
const chaveDoBeneficiario = (b: BeneficiarioEmenda) => b.id;
const ROTULO_FALTA: Record<FaltaDoBeneficiario, string> = { CNPJ: 'Falta CNPJ', endereço: 'Falta endereço', contato: 'Falta contato' };

/**
 * Órgãos que recebem o material das emendas (migrations 155 e 166). Só o nome é obrigatório: a lista mostra o que
 * falta completar e aponta os nomes parecidos no mesmo lugar, para a CAEP juntar ou marcar como diferentes.
 */
export const EmendasBeneficiariosPage: React.FC = () => {
  const { data: lista = [], isLoading, isFetching, isError, error, refetch, dataUpdatedAt } = useBeneficiariosEmendas();
  const { data: diferentes = [] } = useBeneficiariosDiferentes();
  const { data: pedidos = [] } = usePedidosEmendas();
  const podeGerir = usePodeGerirEmendas();
  const salvar = useSalvarBeneficiario();
  const marcar = useMarcarBeneficiariosDiferentes();
  const toast = useToast();
  const [segmento, setSegmento] = useState<Segmento | null>(null);
  const [uf, setUf] = useState('');
  const [oQueFalta, setOQueFalta] = useState('');
  const [busca, setBusca] = useState('');
  const [editando, setEditando] = useState<BeneficiarioEmenda | 'novo' | null>(null);
  const [juntando, setJuntando] = useState<{ base: BeneficiarioEmenda; outro?: BeneficiarioEmenda } | null>(null);

  const linhasPorBeneficiario = useMemo(() => {
    const c = new Map<string, number>();
    for (const p of pedidos) for (const l of p.linhas) if (l.beneficiarioId && !l.cancelada) c.set(l.beneficiarioId, (c.get(l.beneficiarioId) ?? 0) + 1);
    return c;
  }, [pedidos]);

  const faltas = useMemo(() => new Map(lista.map((b) => [b.id, faltasDoBeneficiario(b)])), [lista]);
  // Cada beneficiário com o primeiro parecido dele: a linha mostra "Parecido com" e as ações Juntar / São diferentes.
  const parecidoDe = useMemo(() => {
    const m = new Map<string, BeneficiarioEmenda>();
    for (const [a, b] of paresParecidos(lista, diferentes)) {
      if (!m.has(a.id)) m.set(a.id, b);
      if (!m.has(b.id)) m.set(b.id, a);
    }
    return m;
  }, [lista, diferentes]);

  const ativos = lista.filter((b) => b.ativo);
  const contagem = {
    completos: ativos.filter((b) => !faltas.get(b.id)?.length).length,
    faltam: ativos.filter((b) => faltas.get(b.id)?.length).length,
    parecidos: ativos.filter((b) => parecidoDe.has(b.id)).length
  };
  // Abre onde há trabalho: faltando dados enquanto houver; depois, os completos.
  const ativo: Segmento = segmento ?? (contagem.faltam > 0 ? 'faltam' : 'completos');

  const doSegmento = useMemo(
    () =>
      lista.filter((b) => {
        if (ativo === 'todos') return true;
        if (ativo === 'inativos') return !b.ativo;
        if (!b.ativo) return false;
        if (ativo === 'parecidos') return parecidoDe.has(b.id);
        const n = faltas.get(b.id)?.length ?? 0;
        return ativo === 'faltam' ? n > 0 : n === 0;
      }),
    [lista, ativo, parecidoDe, faltas]
  );

  const filtrados = useMemo(() => {
    const termo = semAcento(busca.trim());
    const digitos = busca.replace(/\D/g, '');
    return doSegmento
      .filter((b) => !uf || (b.entregaUf ?? '') === uf)
      .filter((b) => !oQueFalta || (faltas.get(b.id) ?? []).includes(oQueFalta as FaltaDoBeneficiario))
      .filter(
        (b) =>
          !termo ||
          semAcento([b.nome, b.sigla, b.nomeCurto, b.razaoSocial, b.entregaMunicipio, b.responsavelNome, ...b.outrosNomes].filter(Boolean).join(' ')).includes(termo) ||
          (digitos.length >= 4 && (b.cnpj ?? '').includes(digitos))
      );
  }, [doSegmento, uf, oQueFalta, busca, faltas]);

  const ufs = useMemo(() => {
    const c = new Map<string, number>();
    for (const b of doSegmento) {
      const u = b.entregaUf ?? '';
      if (u) c.set(u, (c.get(u) ?? 0) + 1);
    }
    return [...c.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([value, count]) => ({ value, label: value, count }));
  }, [doSegmento]);

  const opcoesFalta = (['CNPJ', 'endereço', 'contato'] as FaltaDoBeneficiario[]).map((f) => ({
    value: f,
    label: ROTULO_FALTA[f],
    count: doSegmento.filter((b) => (faltas.get(b.id) ?? []).includes(f)).length
  }));

  // Como nas carteiras: ordena pelo cabeçalho (guardado em ?ordem=) antes de paginar, para valer na lista toda.
  const ordem = useMemo<Record<string, CarteiraSortColumn<BeneficiarioEmenda>>>(
    () => ({
      nome: { value: (b) => b.nome },
      entrega: { value: (b) => localDoBeneficiario(b) },
      contato: { value: (b) => b.responsavelNome },
      indicacoes: { value: (b) => linhasPorBeneficiario.get(b.id) ?? 0, firstDir: 'desc' }
    }),
    [linhasPorBeneficiario]
  );
  const { sorted, sortKey, sortDir, toggle } = useCarteiraSort(filtrados, ordem);
  const { currentPage, setPage, pageItems } = useCarteiraPagination(sorted, chaveDoBeneficiario, POR_PAGINA);

  const filtrosAtivos = Boolean(busca.trim() || uf || oQueFalta);

  const alternarAtivo = async (b: BeneficiarioEmenda) => {
    try {
      await salvar.mutateAsync({ ...b, ativo: !b.ativo });
      toast.success(b.ativo ? `${rotuloBeneficiario(b)} desativado.` : `${rotuloBeneficiario(b)} reativado.`);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const marcarDiferentes = async (a: BeneficiarioEmenda, b: BeneficiarioEmenda) => {
    try {
      await marcar.mutateAsync({ aId: a.id, bId: b.id });
      toast.success(`${rotuloBeneficiario(a)} e ${rotuloBeneficiario(b)} ficam como unidades diferentes.`);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  // Três colunas alinhadas pelo topo (className emendas-tabela-topo): quem é, onde entrega, com quem falar.
  const colunas: Column<BeneficiarioEmenda>[] = [
    {
      key: 'nome',
      header: 'Beneficiário',
      priority: 'primary',
      width: '36%',
      sortValue: ordem.nome.value,
      render: (b) => {
        const parecido = parecidoDe.get(b.id);
        // Quem é: nome · sigla e, embaixo, a razão social do CNPJ vinculado (como o fornecedor nas carteiras). A cidade
        // fica só na coluna Entrega; o CNPJ aparece ao passar o mouse e na edição.
        return (
          <>
            {/* Mesmo espaçamento da coluna Ata: altura de linha da página e 0,15rem entre o nome e a razão social. */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
              <NomeComSigla b={b} destaque />
              {b.razaoSocial && <div style={carteiraFornecedor}>{b.razaoSocial}</div>}
            </div>
            {parecido && (
              <div style={{ ...carteiraSubtitle, color: 'var(--color-info-text, #155bcb)' }}>
                Parecido com {rotuloBeneficiario(parecido)}
                {localDoBeneficiario(parecido) ? ` (${localDoBeneficiario(parecido)})` : ''}
              </div>
            )}
            {!b.cnpj && (
              <div style={{ marginTop: '0.25rem' }}>
                <StatusBadge label="Falta CNPJ" variant="neutral" size="sm" dot={false} />
              </div>
            )}
          </>
        );
      }
    },
    {
      key: 'entrega',
      header: 'Entrega',
      width: '34%',
      sortValue: ordem.entrega.value,
      // Onde entrega: a cidade sempre em destaque (é o mesmo campo do endereço) e, embaixo, o endereço ou o que falta.
      render: (b) => {
        const local = localDoBeneficiario(b);
        const temEndereco = Boolean(b.entregaCep && b.entregaLogradouro);
        return (
          <>
            {local ? <div style={principal}>{local}</div> : <div style={falta}>Falta cidade</div>}
            {temEndereco ? (
              <div style={{ ...detalhe, marginTop: '0.2rem' }}>
                <div>{[`${b.entregaLogradouro}${b.entregaNumero ? `, ${b.entregaNumero}` : ''}`, b.entregaComplemento].filter(Boolean).join(' · ')}</div>
                <div>{[b.entregaBairro, b.entregaCep && `CEP ${formatarCep(b.entregaCep)}`].filter(Boolean).join(' · ')}</div>
              </div>
            ) : (
              // Bairro sem o resto do endereço (veio do nome da planilha): com o rótulo, para não parecer outra coisa.
              <div style={{ ...detalhe, marginTop: '0.2rem' }}>
                {b.entregaBairro && <>Bairro {b.entregaBairro} · </>}
                <span style={falta}>{b.entregaBairro ? 'falta o endereço de entrega' : 'Falta endereço de entrega'}</span>
              </div>
            )}
          </>
        );
      }
    },
    {
      key: 'contato',
      header: 'Contato',
      width: '22%',
      sortValue: ordem.contato.value,
      render: (b) =>
        b.responsavelNome ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <span style={principal}>{b.responsavelNome}</span>
              <ContatoDoResponsavel nome={b.responsavelNome} telefone={b.responsavelTelefone} email={b.responsavelEmail} />
            </div>
            {b.responsavelCargo && <div style={{ ...detalhe, marginTop: '0.2rem' }}>{b.responsavelCargo}</div>}
          </>
        ) : (
          <span style={falta}>Falta contato</span>
        )
    },
    {
      key: 'indicacoes',
      header: 'Indicações',
      align: 'right',
      sortValue: ordem.indicacoes.value,
      sortFirstDir: 'desc',
      nowrap: true,
      render: (b) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{linhasPorBeneficiario.get(b.id) ?? 0}</span>
    },
    ...(ativo === 'todos'
      ? [
          {
            key: 'situacao',
            header: 'Situação',
            nowrap: true,
            render: (b: BeneficiarioEmenda) => <StatusBadge label={b.ativo ? 'Ativo' : 'Desativado'} variant={b.ativo ? 'success' : 'neutral'} size="sm" dot={false} />
          }
        ]
      : [])
  ];

  return (
    <PageContainer style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <PageHeader
        title="Beneficiários"
        subtitle="Órgãos que recebem o material das emendas."
        hint="Só o nome da unidade é obrigatório; a sigla, o CNPJ (que traz o nome do beneficiário pela Receita), o endereço de entrega e o contato podem ser completados depois. O mesmo nome na mesma cidade não se repete. Nomes parecidos no mesmo lugar aparecem em Parecidos, para juntar ou marcar como diferentes. Cada alteração fica no histórico."
        icon={<Building size={26} color="var(--primary)" aria-hidden="true" />}
        actions={
          <>
            {podeGerir && <ActionButton action="novo" label="Novo beneficiário" onClick={() => setEditando('novo')} data-testid="emendas-beneficiarios-novo" />}
            <HeaderRefreshAction onRefresh={() => refetch()} isRefreshing={isFetching} lastUpdated={dataUpdatedAt || null} dataTestId="emendas-beneficiarios-atualizar" tooltipTitle="Recarregar os beneficiários" />
          </>
        }
      />

      <CarteiraSegmentTabs<Segmento>
        testIdPrefix="emendas-beneficiarios-situacao"
        ariaLabel="Situação dos beneficiários"
        active={ativo}
        onSelect={setSegmento}
        segments={[
          { id: 'completos', label: 'Completos', count: contagem.completos, dot: 'var(--color-success)' },
          { id: 'faltam', label: 'Faltam dados', count: contagem.faltam, dot: 'var(--color-warning)' },
          { id: 'parecidos', label: 'Parecidos', count: contagem.parecidos, dot: 'var(--color-info, #155bcb)' },
          { id: 'inativos', label: 'Desativados', count: lista.length - ativos.length },
          { id: 'todos', label: 'Todos', count: lista.length }
        ]}
      />

      <CarteiraFilterBar
        busca={busca}
        searchPlaceholder="Buscar por nome, sigla, cidade, CNPJ ou contato..."
        onChangeBusca={setBusca}
        hasActiveFilters={filtrosAtivos}
        onResetFilters={() => {
          setBusca('');
          setUf('');
          setOQueFalta('');
        }}
        counter={carteiraCounter(filtrados.length, doSegmento.length, filtrosAtivos, 'beneficiário', 'beneficiários')}
        testIdPrefix="emendas-beneficiarios"
      >
        <CarteiraFilterButton label="UF" value={uf} emptyValue="" options={ufs} onChange={setUf} testId="emendas-beneficiarios-filtro-uf" />
        {ativo !== 'completos' && (
          <CarteiraFilterButton label="O que falta" value={oQueFalta} emptyValue="" options={opcoesFalta} onChange={setOQueFalta} testId="emendas-beneficiarios-filtro-falta" />
        )}
      </CarteiraFilterBar>

      <AdminListShell
        testId="emendas-beneficiarios-lista"
        isLoading={isLoading}
        isError={isError}
        errorTitle="Não foi possível carregar os beneficiários"
        errorMessage={(error as Error | null)?.message || 'Falha ao consultar os beneficiários.'}
        onRetry={() => refetch()}
        isEmpty={!isLoading && filtrados.length === 0}
        emptyTitle={lista.length === 0 ? 'Nenhum beneficiário cadastrado.' : ativo === 'parecidos' && !filtrosAtivos ? 'Nenhum nome parecido a conferir.' : 'Nenhum beneficiário encontrado.'}
        emptyDescription={lista.length === 0 ? (podeGerir ? 'Use "Novo beneficiário".' : 'A CAEP cadastra os órgãos que recebem o material.') : 'Ajuste a busca ou os filtros.'}
      >
        <DataTable<BeneficiarioEmenda>
          testId="emendas-beneficiarios-tabela"
          className="data-table-container--flush emendas-tabela-topo"
          data={pageItems}
          keyExtractor={(b) => b.id}
          sort={{ key: sortKey, dir: sortDir }}
          onSort={toggle}
          rowStyle={(b) => (b.ativo ? undefined : { opacity: 0.7 })}
          rowOpen={podeGerir ? (b) => () => setEditando(b) : undefined}
          columns={colunas}
          rowActions={
            podeGerir
              ? (b) => {
                  const parecido = parecidoDe.get(b.id);
                  return (
                    <div style={{ display: 'flex', gap: '0.25rem', justifyContent: 'flex-end', flexWrap: ativo === 'parecidos' ? 'wrap' : 'nowrap' }}>
                      {parecido && ativo === 'parecidos' && (
                        <>
                          <ActionButton action="juntar" size="sm" onClick={() => setJuntando({ base: b, outro: parecido })} data-testid={`emendas-beneficiarios-juntar-par-${b.id}`} />
                          <ActionButton action="saoDiferentes" size="sm" onClick={() => void marcarDiferentes(b, parecido)} disabled={marcar.isPending} data-testid={`emendas-beneficiarios-diferentes-${b.id}`} />
                        </>
                      )}
                      <ActionButton action="editar" iconOnly label={`Editar ${rotuloBeneficiario(b)}`} onClick={() => setEditando(b)} disabled={salvar.isPending} />
                      {!(parecido && ativo === 'parecidos') && (
                        <ActionButton action="juntar" iconOnly label={`Juntar ${rotuloBeneficiario(b)} com outro cadastro`} onClick={() => setJuntando({ base: b })} data-testid={`emendas-beneficiarios-juntar-${b.id}`} />
                      )}
                      <ActionButton
                        action={b.ativo ? 'desativarCadastro' : 'reativarCadastro'}
                        iconOnly
                        label={`${b.ativo ? 'Desativar' : 'Reativar'} ${rotuloBeneficiario(b)}`}
                        onClick={() => void alternarAtivo(b)}
                        disabled={salvar.isPending}
                        data-testid={`emendas-beneficiarios-ativo-${b.id}`}
                      />
                    </div>
                  );
                }
              : undefined
          }
        />
        <CarteiraPagination page={currentPage} pageSize={POR_PAGINA} total={sorted.length} onChange={setPage} testIdPrefix="emendas-beneficiarios" />
      </AdminListShell>

      {editando && <BeneficiarioModal key={editando === 'novo' ? 'novo' : editando.id} beneficiario={editando === 'novo' ? null : editando} lista={lista} onAbrir={(b) => setEditando(b)} onClose={() => setEditando(null)} />}
      {juntando && <JuntarBeneficiariosModal base={juntando.base} outro={juntando.outro} lista={lista} linhasPorBeneficiario={linhasPorBeneficiario} onClose={() => setJuntando(null)} />}
    </PageContainer>
  );
};
