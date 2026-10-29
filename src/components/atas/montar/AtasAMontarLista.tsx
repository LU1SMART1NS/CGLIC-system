import React, { useMemo, useState } from 'react';
import { Package } from 'lucide-react';
import { PageContainer } from '../../../design-system/components/PageContainer';
import { PageHeader } from '../../../design-system/components/PageHeader';
import { DataTable, type Column } from '../../../design-system/components/DataTable';
import { CarteiraFilterBar, carteiraCounter } from '../../carteira/CarteiraFilterBar';
import { carteiraDetalhe, carteiraFornecedor, carteiraIdentificacao, carteiraNumero, carteiraSubtitle, carteiraValor } from '../../carteira/carteiraStyles';
import { AdminListShell } from '../../admin/shared/AdminListShell';
import { useCarteiraSort, type CarteiraSortColumn } from '../../carteira/useCarteiraSort';
import { useNavigateWithOrigin } from '../../../hooks/useDetailOrigin';
import { useAtasAMontar } from '../../../hooks/useAtasAMontar';
import { formatCnpj, formatCurrency, formatDateBR } from '../../../utils/format';
import { toSentenceCaseIfAllCaps } from '../../../utils/textCase';
import type { AtaAMontar } from '../../../services/atasAMontarService';
import { SituacaoDaMinuta } from './SituacaoDaMinuta';
import { ehEstrangeiro } from '../../../utils/ataAMontarQuadros';
import { pregaoDaAta, rotaDaAtaAMontar } from './ataAMontarRotas';

const chave = (a: AtaAMontar) => `${a.numeroControleCompra}|${a.fornecedorNi}`;
interface Props {
  /** Seletor "Ver: Registradas · A montar" (fica no cabeçalho, como na Alocação). */
  seletor: React.ReactNode;
}

/**
 * Carteira › Atas › A montar (protótipo aprovado em 28/10/2026, D1): uma linha por fornecedor vencedor de pregão de
 * registro de preços homologado no PNCP que ainda não tem ata. A linha some quando a ata é publicada e chega pela
 * sincronização. A linha abre a montagem dos quadros da ata.
 */
export const AtasAMontarLista: React.FC<Props> = ({ seletor }) => {
  const { data: atas = [], isLoading, isError, error, refetch } = useAtasAMontar();
  const navegar = useNavigateWithOrigin();
  const [busca, setBusca] = useState('');
  const termo = busca.trim().toLocaleLowerCase('pt-BR');
  const filtradas = termo
    ? atas.filter((a) => `${pregaoDaAta(a)} ${a.fornecedorNome} ${a.fornecedorNi} ${a.objeto ?? ''} ${a.processo ?? ''}`.toLocaleLowerCase('pt-BR').includes(termo))
    : atas;
  const ordem = useMemo<Record<string, CarteiraSortColumn<AtaAMontar>>>(
    () => ({
      pregao: { value: (a) => a.anoCompra * 1e6 + a.sequencialCompra, firstDir: 'desc' },
      fornecedor: { value: (a) => a.fornecedorNome },
      itens: { value: (a) => a.itens, firstDir: 'desc' },
      valor: { value: (a) => a.valorTotal, firstDir: 'desc' },
      homologado: { value: (a) => a.homologadoEm, firstDir: 'desc' },
      montagem: { value: (a) => a.rascunhoAtualizadoEm, firstDir: 'desc' }
    }),
    []
  );
  // Padrão: as homologadas há mais tempo primeiro (a ata está mais perto de sair).
  const porData = useMemo(() => [...filtradas].sort((a, b) => String(a.homologadoEm ?? '').localeCompare(String(b.homologadoEm ?? ''))), [filtradas]);
  const { sorted, sortKey, sortDir, toggle } = useCarteiraSort(porData, ordem);

  const colunas: Column<AtaAMontar>[] = [
    {
      key: 'pregao',
      header: 'Pregão',
      priority: 'primary',
      sortValue: ordem.pregao.value,
      sortFirstDir: 'desc',
      render: (a) => (
        <>
          <div style={carteiraIdentificacao}>Pregão {pregaoDaAta(a)}</div>
          {a.objeto && (
            <div style={{ ...carteiraSubtitle, marginTop: '0.15rem' }} title={a.objeto}>
              {toSentenceCaseIfAllCaps(a.objeto)}
            </div>
          )}
        </>
      )
    },
    {
      key: 'fornecedor',
      header: 'Fornecedor',
      sortValue: ordem.fornecedor.value,
      render: (a) => (
        <>
          <div style={carteiraValor}>{a.fornecedorNome}</div>
          <div style={{ ...carteiraFornecedor, marginTop: '0.15rem' }}>{ehEstrangeiro(a.fornecedorNi) ? 'Empresa estrangeira' : formatCnpj(a.fornecedorNi)}</div>
        </>
      )
    },
    { key: 'itens', header: 'Itens', align: 'right', nowrap: true, sortValue: ordem.itens.value, sortFirstDir: 'desc', render: (a) => <span style={{ ...carteiraValor, ...carteiraNumero }}>{a.itens}</span> },
    {
      key: 'valor',
      header: 'Valor homologado',
      align: 'right',
      nowrap: true,
      sortValue: ordem.valor.value,
      sortFirstDir: 'desc',
      render: (a) => <span style={{ ...carteiraValor, ...carteiraNumero }}>{formatCurrency(a.valorTotal)}</span>
    },
    {
      key: 'homologado',
      header: 'Homologado em',
      nowrap: true,
      sortValue: ordem.homologado.value,
      sortFirstDir: 'desc',
      render: (a) => (a.homologadoEm ? <span style={carteiraValor}>{formatDateBR(a.homologadoEm)}</span> : <span style={carteiraDetalhe}>—</span>)
    },
    {
      key: 'minuta',
      header: 'Minuta do edital',
      nowrap: true,
      render: (a) => <SituacaoDaMinuta estado={a.minutaEstado} aConferir={a.itensAConferir} />
    },
    {
      key: 'montagem',
      header: 'Montagem',
      sortValue: ordem.montagem.value,
      sortFirstDir: 'desc',
      render: (a) =>
        a.rascunhoAtualizadoEm ? (
          <>
            <div style={carteiraValor}>Salva em {formatDateBR(a.rascunhoAtualizadoEm)}</div>
            {a.rascunhoAtualizadoPorNome && <div style={carteiraDetalhe}>{a.rascunhoAtualizadoPorNome}</div>}
          </>
        ) : (
          <span style={carteiraDetalhe}>Não começada</span>
        )
    }
  ];

  return (
    <PageContainer style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <PageHeader
        title="Carteira de Atas"
        subtitle="Pregões homologados no PNCP que ainda não têm ata: monte os quadros da ata para colar no SEI."
        hint="Uma linha por fornecedor vencedor. O sistema lê o resultado do pregão e a minuta da ata no edital (PNCP) de 2 em 2 horas; a linha sai sozinha quando a ata é publicada."
        icon={<Package size={26} color="var(--primary)" aria-hidden="true" />}
        actions={seletor}
      />
      <CarteiraFilterBar
        busca={busca}
        searchPlaceholder="Buscar pelo pregão, fornecedor, objeto ou processo..."
        onChangeBusca={setBusca}
        hasActiveFilters={Boolean(termo)}
        onResetFilters={() => setBusca('')}
        counter={carteiraCounter(filtradas.length, atas.length, Boolean(termo), 'ata a montar', 'atas a montar')}
        testIdPrefix="atas-a-montar"
      />
      <AdminListShell
        testId="atas-a-montar-lista"
        isLoading={isLoading}
        isError={isError}
        errorTitle="Não foi possível carregar as atas a montar"
        errorMessage={error?.message || 'Falha ao consultar as atas a montar.'}
        onRetry={() => void refetch()}
        isEmpty={!isLoading && filtradas.length === 0}
        emptyTitle={termo ? 'Nenhuma ata a montar encontrada.' : 'Nenhuma ata a montar.'}
        emptyDescription={termo ? 'Ajuste a busca.' : 'Quando um pregão de registro de preços for homologado no PNCP, os fornecedores vencedores aparecem aqui até a ata ser publicada.'}
      >
        <DataTable<AtaAMontar>
          testId="atas-a-montar-tabela"
          className="data-table-container--flush"
          data={sorted}
          keyExtractor={chave}
          sort={{ key: sortKey, dir: sortDir }}
          onSort={toggle}
          columns={colunas}
          rowOpen={(a) => () => navegar(rotaDaAtaAMontar(a))}
        />
      </AdminListShell>
    </PageContainer>
  );
};
