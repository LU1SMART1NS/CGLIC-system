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
import { carteiraFornecedor, carteiraIdentificacao, carteiraSubtitle } from '../carteira/carteiraStyles';
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
import { formatarCep, formatarCnpj, localDoBeneficiario, rotuloBeneficiario, type BeneficiarioEmenda } from '../../services/emendasService';
import { faltasDoBeneficiario, orgaoAbaixoDoNome, paresParecidos, type FaltaDoBeneficiario } from '../../utils/emendasBeneficiarios';
import { BeneficiarioModal } from './BeneficiarioModal';
import { ContatoDoResponsavel } from './ContatoDoResponsavel';
import { JuntarBeneficiariosModal } from './JuntarBeneficiariosModal';

type Segmento = 'completos' | 'faltam' | 'parecidos' | 'inativos' | 'todos';

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const falta: React.CSSProperties = { ...carteiraSubtitle, fontStyle: 'italic' };
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
          semAcento([b.nome, b.nomeCurto, b.razaoSocial, b.orgao, b.entregaMunicipio, b.responsavelNome, ...b.outrosNomes].filter(Boolean).join(' ')).includes(termo) ||
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
      render: (b) => {
        const local = localDoBeneficiario(b);
        const orgao = orgaoAbaixoDoNome(b, rotuloBeneficiario(b));
        const parecido = parecidoDe.get(b.id);
        return (
          <>
            <div style={carteiraIdentificacao}>{rotuloBeneficiario(b)}</div>
            {orgao && <div style={carteiraSubtitle}>{orgao}</div>}
            {local && <div style={carteiraSubtitle}>{local}</div>}
            {b.cnpj && (
              <div style={carteiraFornecedor}>
                {b.razaoSocial ? `${b.razaoSocial} · ` : ''}CNPJ {formatarCnpj(b.cnpj)}
              </div>
            )}
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
      render: (b) =>
        b.entregaCep && b.entregaLogradouro ? (
          <>
            <div style={{ fontWeight: 600 }}>{localDoBeneficiario(b)}</div>
            <div style={carteiraSubtitle}>{[`${b.entregaLogradouro}${b.entregaNumero ? `, ${b.entregaNumero}` : ''}`, b.entregaComplemento].filter(Boolean).join(' · ')}</div>
            <div style={carteiraSubtitle}>{[b.entregaBairro, `CEP ${formatarCep(b.entregaCep)}`].filter(Boolean).join(' · ')}</div>
          </>
        ) : (
          <span style={falta}>Falta endereço de entrega</span>
        )
    },
    {
      key: 'contato',
      header: 'Contato',
      width: '22%',
      render: (b) =>
        b.responsavelNome ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 600 }}>{b.responsavelNome}</span>
              <ContatoDoResponsavel nome={b.responsavelNome} telefone={b.responsavelTelefone} email={b.responsavelEmail} />
            </div>
            {b.responsavelCargo && <div style={carteiraSubtitle}>{b.responsavelCargo}</div>}
          </>
        ) : (
          <span style={falta}>Falta contato</span>
        )
    },
    {
      key: 'indicacoes',
      header: 'Indicações',
      align: 'right',
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
        hint="Só o nome curto é obrigatório; o CNPJ (que traz o nome do beneficiário pela Receita), o endereço de entrega e o contato podem ser completados depois. O mesmo nome curto na mesma cidade não se repete. Nomes parecidos no mesmo lugar aparecem em Parecidos, para juntar ou marcar como diferentes. Cada alteração fica no histórico."
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
        searchPlaceholder="Buscar por nome, cidade, CNPJ ou contato..."
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
          data={filtrados}
          keyExtractor={(b) => b.id}
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
      </AdminListShell>

      {editando && <BeneficiarioModal key={editando === 'novo' ? 'novo' : editando.id} beneficiario={editando === 'novo' ? null : editando} lista={lista} onAbrir={(b) => setEditando(b)} onClose={() => setEditando(null)} />}
      {juntando && <JuntarBeneficiariosModal base={juntando.base} outro={juntando.outro} lista={lista} linhasPorBeneficiario={linhasPorBeneficiario} onClose={() => setJuntando(null)} />}
    </PageContainer>
  );
};
