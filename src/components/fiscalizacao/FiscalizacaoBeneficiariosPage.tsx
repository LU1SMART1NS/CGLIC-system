import React, { useMemo, useState } from 'react';
import { Building2 } from 'lucide-react';
import { PageContainer } from '../../design-system/components/PageContainer';
import { PageHeader } from '../../design-system/components/PageHeader';
import { HeaderRefreshAction } from '../../design-system/components/HeaderRefreshAction';
import { DataTable, type Column } from '../../design-system/components/DataTable';
import { NoticeBar } from '../../design-system/components/NoticeBar';
import { AppButton } from '../../design-system/components/AppButton';
import { CarteiraSegmentTabs } from '../carteira/CarteiraSegmentTabs';
import { CarteiraFilterBar, carteiraCounter } from '../carteira/CarteiraFilterBar';
import { CarteiraFilterButton } from '../carteira/CarteiraFilterButton';
import { AdminListShell } from '../admin/shared/AdminListShell';
import { CelulaBeneficiario } from './EntregasTabela';
import { useNavigateWithOrigin } from '../../hooks/useDetailOrigin';
import { useEntregasFiscalizacao } from '../../hooks/useFiscalizacao';
import type { EntregaFiscalizacao } from '../../services/fiscalizacaoService';
import { NOME_SFC } from '../../utils/fiscalizacao';
import { type Resumo, agrupar, chaveDoBeneficiario, nomeDoBeneficiario, passaPrazo, pct, programasDe, resumir, rotaDoBeneficiario, semCadastro, opcoesDePrazo } from '../../utils/fiscalizacaoResumo';
import { CelulaEntregaResumo, CelulaItens, CelulaQuemDestinou } from './FiscalizacaoCelulas';
import { LigarBeneficiarioModal } from './LigarBeneficiarioModal';
import { gruposSemCadastro } from '../../utils/fiscalizacaoBeneficiarioLigacao';
import { useAuth } from '../../context/AuthContext';
const POR_PAGINA = 25;

// ── Fiscalização › Beneficiários ─────────────────────────────────────────────────────────────────

type SegBenef = 'PENDENTES' | 'ENTREGUES' | 'TODOS';
interface LinhaBenef { chave: string; es: EntregaFiscalizacao[]; r: Resumo; contratos: string[]; uf: string | null; semCadastro: boolean }

export const FiscalizacaoBeneficiariosPage: React.FC = () => {
  const navigate = useNavigateWithOrigin();
  const entregasQ = useEntregasFiscalizacao(null);
  const entregas = useMemo(() => entregasQ.data ?? [], [entregasQ.data]);
  const [seg, setSeg] = useState<SegBenef>('PENDENTES');
  const [busca, setBusca] = useState('');
  const [uf, setUf] = useState('');
  const [programa, setPrograma] = useState('');
  const [cadastro, setCadastro] = useState('');
  const [prazo, setPrazo] = useState('');
  const [ligando, setLigando] = useState(false);
  const { role } = useAuth();
  const podeLigar = role === 'admin' || role === 'gestor_fiscalizacao';

  const linhas = useMemo<LinhaBenef[]>(
    () =>
      [...agrupar(entregas, chaveDoBeneficiario).entries()].map(([chave, es]) => ({
        chave,
        es,
        r: resumir(es),
        contratos: [...new Set(es.map((e) => e.contratoNumero))],
        uf: es[0].uf,
        semCadastro: semCadastro(es[0])
      })),
    [entregas]
  );
  const pendente = (l: LinhaBenef) => l.r.entregues < l.r.acompanhadas;
  const conta = (s: SegBenef) => linhas.filter((l) => s === 'TODOS' || (s === 'PENDENTES' ? pendente(l) : !pendente(l))).length;
  const doSeg = linhas.filter((l) => seg === 'TODOS' || (seg === 'PENDENTES' ? pendente(l) : !pendente(l)));
  const q = busca.trim().toLowerCase();
  const filtradas = doSeg
    .filter((l) => !q || l.es.some((e) => `${nomeDoBeneficiario(e)} ${e.beneficiarioNome ?? ''} ${e.beneficiarioRazao ?? ''} ${e.municipio ?? ''} ${e.contratoNumero}`.toLowerCase().includes(q)))
    .filter((l) => !uf || l.uf === uf)
    .filter((l) => !programa || programasDe(l.es).includes(programa))
    .filter((l) => !cadastro || (cadastro === 'sem') === l.semCadastro)
    .filter((l) => passaPrazo(l.r, prazo))
    .sort((a, b) => b.r.vencidas - a.r.vencidas || (a.r.proxima?.dias ?? 99999) - (b.r.proxima?.dias ?? 99999));
  const ativos = Boolean(busca || uf || programa || cadastro || prazo);
  const ufs = [...new Set(doSeg.map((l) => l.uf).filter((x): x is string => Boolean(x)))].sort();
  const progs = [...new Set(doSeg.flatMap((l) => programasDe(l.es)))];
  const qtdSem = linhas.filter((l) => l.semCadastro).length;
  // Nomes a ligar: as grafias do mesmo nome (com e sem a UF no fim, acento, caixa) contam uma vez, como na janela.
  const nomesSem = useMemo(() => gruposSemCadastro(entregas).length, [entregas]);

  const colunas: Column<LinhaBenef>[] = [
    { key: 'beneficiario', header: 'Beneficiário', minWidth: '260px', priority: 'primary', sortValue: (l) => l.es[0].beneficiarioNome ?? l.es[0].beneficiarioTexto, render: (l) => <CelulaBeneficiario e={l.es[0]} destaque /> },
    { key: 'recebe', header: 'O que recebe', minWidth: '220px', render: (l) => <CelulaItens es={l.es} /> },
    { key: 'destinou', header: 'Quem destinou', minWidth: '180px', render: (l) => <CelulaQuemDestinou es={l.es} /> },
    { key: 'entrega', header: 'Entrega', sortValue: (l) => (l.r.vencidas ? -l.r.vencidas * 1000 : pct(l.r.entregues, l.r.acompanhadas)), render: (l) => <CelulaEntregaResumo es={l.es} r={l.r} /> }
  ];

  return (
    <PageContainer style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <PageHeader
        title="Beneficiários"
        subtitle="Quem recebe: o que já chegou e o que falta, em todos os contratos."
        hint={`Responde quando o órgão ou o gabinete pergunta pelo que foi destinado a ele. O beneficiário vem do cadastro (Ajustes › Beneficiários). Nos itens da planilha da ${NOME_SFC}, o beneficiário foi escrito à mão: até ser ligado a um cadastro, cada grafia aparece numa linha, com a etiqueta Sem cadastro.`}
        icon={<Building2 size={26} color="var(--primary)" aria-hidden="true" />}
        actions={<HeaderRefreshAction onRefresh={() => entregasQ.refetch()} isRefreshing={entregasQ.isFetching} lastUpdated={entregasQ.dataUpdatedAt || null} dataTestId="fisc-benef-atualizar" tooltipTitle="Recarregar os beneficiários" />}
      />
      {qtdSem > 0 && (
        <NoticeBar
          tone="warning"
          testId="fisc-benef-sem-cadastro"
          action={
            <span style={{ display: 'inline-flex', gap: '0.75rem' }}>
              <AppButton size="xs" variant="link" onClick={() => setCadastro('sem')}>Ver os {qtdSem}</AppButton>
              {podeLigar && <AppButton size="xs" variant="link" onClick={() => setLigando(true)} data-testid="fisc-benef-ligar">Ligar ao cadastro</AppButton>}
            </span>
          }
        >
          {nomesSem} {nomesSem === 1 ? 'nome de beneficiário escrito na planilha está' : 'nomes de beneficiário escritos na planilha estão'} fora do cadastro: sem endereço de entrega e sem somar com o mesmo órgão escrito de outro jeito.
        </NoticeBar>
      )}
      <CarteiraSegmentTabs<SegBenef>
        testIdPrefix="fisc-benef-seg"
        ariaLabel="Situação dos beneficiários"
        active={seg}
        onSelect={setSeg}
        segments={[
          { id: 'PENDENTES', label: 'A entregar', count: conta('PENDENTES'), dot: 'var(--primary)' },
          { id: 'ENTREGUES', label: 'Tudo entregue', count: conta('ENTREGUES'), dot: 'var(--color-success)' },
          { id: 'TODOS', label: 'Todos', count: conta('TODOS') }
        ]}
      />
      <CarteiraFilterBar
        busca={busca}
        searchPlaceholder="Buscar por beneficiário, cidade ou contrato..."
        onChangeBusca={setBusca}
        hasActiveFilters={ativos}
        onResetFilters={() => { setBusca(''); setUf(''); setPrograma(''); setCadastro(''); setPrazo(''); }}
        counter={carteiraCounter(filtradas.length, doSeg.length, ativos, 'beneficiário', 'beneficiários')}
        testIdPrefix="fisc-benef"
      >
        <CarteiraFilterButton label="UF" value={uf} emptyValue="" options={ufs.map((u) => ({ value: u, label: u, count: doSeg.filter((l) => l.uf === u).length }))} onChange={setUf} testId="fisc-benef-filtro-uf" />
        <CarteiraFilterButton label="Prazo" value={prazo} emptyValue="" options={opcoesDePrazo((t) => doSeg.filter((l) => passaPrazo(l.r, t)).length)} onChange={setPrazo} testId="fisc-benef-filtro-prazo" />
        <CarteiraFilterButton label="Programa" value={programa} emptyValue="" options={progs.map((p) => ({ value: p, label: p, count: doSeg.filter((l) => programasDe(l.es).includes(p)).length }))} onChange={setPrograma} testId="fisc-benef-filtro-programa" />
        <CarteiraFilterButton label="Cadastro" value={cadastro} emptyValue="" options={[{ value: 'com', label: 'Com cadastro', count: doSeg.filter((l) => !l.semCadastro).length }, { value: 'sem', label: 'Sem cadastro (planilha)', count: doSeg.filter((l) => l.semCadastro).length }]} onChange={setCadastro} testId="fisc-benef-filtro-cadastro" />
      </CarteiraFilterBar>
      <AdminListShell testId="fisc-benef-lista" isLoading={entregasQ.isLoading} isError={entregasQ.isError} errorTitle="Não foi possível carregar os beneficiários" errorMessage={entregasQ.error?.message} onRetry={() => entregasQ.refetch()} isEmpty={!entregasQ.isLoading && filtradas.length === 0} emptyTitle="Nenhum beneficiário nesta situação." emptyDescription="Ajuste a busca ou os filtros.">
        <DataTable<LinhaBenef> testId="fisc-benef-tabela" className="data-table-container--flush" data={filtradas.slice(0, POR_PAGINA)} keyExtractor={(l) => l.chave} columns={colunas} rowOpen={(l) => () => navigate(rotaDoBeneficiario(l.chave))} />
      </AdminListShell>
      {ligando && <LigarBeneficiarioModal onClose={() => setLigando(false)} />}
    </PageContainer>
  );
};
