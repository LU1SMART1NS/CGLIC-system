import React, { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AppButton } from '../../design-system/components/AppButton';
import { ActionButton } from '../../design-system/components/ActionButton';
import { NoticeBar } from '../../design-system/components/NoticeBar';
import { CarteiraSegmentTabs } from '../carteira/CarteiraSegmentTabs';
import { CarteiraFilterButton } from '../carteira/CarteiraFilterButton';
import { CarteiraDetailLabel } from '../carteira/CarteiraDetailLabel';
import { Instrument360Page } from '../instrument360/Instrument360Page';
import { Instrument360Head } from '../instrument360/Instrument360Head';
import { Instrument360Hero } from '../instrument360/Instrument360Hero';
import { InstrumentPageState } from '../instrument360/InstrumentPageState';
import { HealthTile, HealthTileGrid } from '../instrument360/HealthStripParts';
import { useAuth } from '../../context/AuthContext';
import { useBackTarget } from '../../hooks/useDetailOrigin';
import { useContratosFiscalizacao, useEntregasFiscalizacao, useProgramasFiscalizacao } from '../../hooks/useFiscalizacao';
import type { EntregaFiscalizacao } from '../../services/fiscalizacaoService';
import { foiEntregue, rotuloDoBeneficiario } from '../../utils/fiscalizacaoEntregas';
import { agrupar, chaveDoBeneficiario, contratosDe, numero, pct, qtdTexto, resumir, ufsDe } from '../../utils/fiscalizacaoResumo';
import { ItensPorContrato, type GrupoDeItens } from './FiscalizacaoCelulas';
import { JanelaDoItem } from './JanelaDoItem';
import { IncluirItensNoProgramaModal } from './IncluirItensNoProgramaModal';

type SegItens = 'A_ENTREGAR' | 'ENTREGUES' | 'TODOS';

/**
 * Programa 360 (protótipo aprovado em 11/11/2026): o mesmo desenho do Beneficiário 360. Itens do programa por contrato
 * (padrão dos Itens por ata do Pedido 360), Beneficiário e UF como filtros, e "Incluir itens no programa".
 */
export const FiscalizacaoPrograma360Page: React.FC = () => {
  const { id = '' } = useParams<{ id: string }>();
  const back = useBackTarget({ path: '/fiscalizacao/programas', label: 'Voltar para Programas' });
  const { role } = useAuth();
  const podeCadastrar = role === 'admin' || role === 'gestor_fiscalizacao';
  const programasQ = useProgramasFiscalizacao();
  const entregasQ = useEntregasFiscalizacao(null);
  const { data: contratos = [] } = useContratosFiscalizacao();
  const entregas = useMemo(() => entregasQ.data ?? [], [entregasQ.data]);
  const prog = (programasQ.data ?? []).find((p) => p.id === id);
  const todos = useMemo(() => entregas.filter((e) => e.programaId === id), [entregas, id]);
  const [seg, setSeg] = useState<SegItens>('A_ENTREGAR');
  const [uf, setUf] = useState('');
  const [benef, setBenef] = useState('');
  const [aberto, setAberto] = useState<EntregaFiscalizacao | null>(null);
  const [incluindo, setIncluindo] = useState(false);

  if (programasQ.isLoading || entregasQ.isLoading) return <Instrument360Page><InstrumentPageState kind="loading" title="Carregando o programa" /></Instrument360Page>;
  const falha = programasQ.error ?? entregasQ.error;
  if (falha) return <Instrument360Page><InstrumentPageState kind="error" title="Não foi possível carregar o programa" message={falha.message} onRetry={() => { void programasQ.refetch(); void entregasQ.refetch(); }} backLabel={back.label} onBack={back.back} /></Instrument360Page>;
  if (!prog) return <Instrument360Page><InstrumentPageState kind="notFound" title="Programa não encontrado" message="O endereço não corresponde a nenhum programa do cadastro (Ajustes › Gestão › Programas)." backLabel={back.label} onBack={back.back} /></Instrument360Page>;

  const aEntregar = (e: EntregaFiscalizacao) => e.responsavel === 'SFC' && !foiEntregue(e);
  const noSeg = (e: EntregaFiscalizacao, s: SegItens) => s === 'TODOS' || (s === 'A_ENTREGAR' ? aEntregar(e) : !aEntregar(e));
  const filtrados = todos.filter((e) => (!uf || e.uf === uf) && (!benef || chaveDoBeneficiario(e) === benef));
  const segAtivo = filtrados.some((e) => noSeg(e, seg)) ? seg : 'TODOS';
  const es = filtrados.filter((e) => noSeg(e, segAtivo));
  const r = resumir(todos);
  const faltam = todos.filter(aEntregar);
  const benefs = [...agrupar(todos, chaveDoBeneficiario).entries()].map(([k, l]) => ({ value: k, label: rotuloDoBeneficiario(l[0]).principal, count: l.length })).sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
  const grupos: GrupoDeItens[] = [...agrupar(es, (e) => e.contractKey).entries()].map(([k, l]) => ({ chave: k, contrato: contratos.find((x) => x.contractKey === k), es: l }));
  const ativos = Boolean(uf || benef);

  return (
    <Instrument360Page>
      <Instrument360Head resumoNoCelular>
        <Instrument360Hero
          backLabel={back.label}
          onBack={back.back}
          backTestId="fisc-prog-360-voltar"
          identifiers={[]}
          identifiersTestId="fisc-prog-360-ids"
          title={prog.nome}
          eyebrow={['Programa', prog.unidadeSigla].filter(Boolean).join(' · ')}
          subtitle={todos.length ? `${qtdTexto(r.unidades, 'unidade', 'unidades')} para ${qtdTexto(new Set(todos.map(chaveDoBeneficiario)).size, 'beneficiário', 'beneficiários')} em ${qtdTexto(ufsDe(todos).length, 'UF', 'UFs')}` : 'Nenhum item no programa ainda.'}
          notice={prog.ativo ? undefined : <NoticeBar tone="info" testId="fisc-prog-360-inativo">Programa inativo: não aparece nas listas da Fiscalização. Para incluir itens, ative em Ajustes › Gestão › Programas.</NoticeBar>}
          actions={podeCadastrar && prog.ativo ? <AppButton size="sm" variant="secondary" onClick={() => setIncluindo(true)} data-testid="fisc-prog-360-incluir">Incluir itens no programa</AppButton> : undefined}
        >
          <div data-testid="fisc-prog-360-indicadores">
            <HealthTileGrid columns={4}>
              <HealthTile label="Entregue" value={`${pct(r.entregues, r.acompanhadas)}%`} hint={`${numero(r.entregues)} de ${numero(r.acompanhadas)} unidades${r.area ? ` · ${numero(r.area)} com a área requisitante, fora do %` : ''}`} onClick={() => setSeg('ENTREGUES')} testId="fisc-prog-360-entregue" />
              <HealthTile label="A entregar" value={numero(faltam.reduce((t, e) => t + e.quantidade, 0))} hint={faltam.length ? `unidades em ${qtdTexto(faltam.length, 'item', 'itens')}` : 'nada a entregar'} compact onClick={() => setSeg('A_ENTREGAR')} testId="fisc-prog-360-a-entregar" />
              <HealthTile label="Prazo vencido" value={String(r.vencidas)} hint={r.vencidas ? (r.vencidas === 1 ? 'item' : 'itens') : r.proxima ? `próximo: ${r.proxima.texto.toLowerCase()}` : 'nenhum item a entregar'} tone={r.vencidas ? 'CRITICA' : undefined} compact onClick={() => setSeg('A_ENTREGAR')} testId="fisc-prog-360-vencidos" />
              <HealthTile label="Contratos" value={String(contratosDe(todos).length)} hint={[...new Set(todos.map((e) => e.fornecedor ?? ''))].filter(Boolean).slice(0, 2).join(' · ')} compact testId="fisc-prog-360-contratos" />
            </HealthTileGrid>
          </div>
        </Instrument360Hero>
      </Instrument360Head>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '1rem 0' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem 1rem' }}>
          <CarteiraDetailLabel>Itens do programa, por contrato</CarteiraDetailLabel>
          <CarteiraSegmentTabs<SegItens>
            testIdPrefix="fisc-prog-360-seg"
            ariaLabel="Quais itens mostrar"
            active={segAtivo}
            onSelect={setSeg}
            segments={[
              { id: 'A_ENTREGAR', label: 'A entregar', count: filtrados.filter((e) => noSeg(e, 'A_ENTREGAR')).length, dot: 'var(--primary)' },
              { id: 'ENTREGUES', label: 'Entregues', count: filtrados.filter((e) => noSeg(e, 'ENTREGUES')).length, dot: 'var(--color-success)' },
              { id: 'TODOS', label: 'Todos', count: filtrados.length }
            ]}
          />
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem' }}>
          <CarteiraFilterButton label="Beneficiário" value={benef} emptyValue="" options={benefs} onChange={setBenef} testId="fisc-prog-360-filtro-beneficiario" />
          <CarteiraFilterButton label="UF" value={uf} emptyValue="" options={ufsDe(todos).map((u) => ({ value: u, label: u, count: todos.filter((e) => e.uf === u).length }))} onChange={setUf} testId="fisc-prog-360-filtro-uf" />
          {ativos && <ActionButton action="limparFiltros" size="sm" onClick={() => { setUf(''); setBenef(''); }} data-testid="fisc-prog-360-limpar" />}
        </div>
        <ItensPorContrato grupos={grupos} abrir={setAberto} testId="fisc-prog-360-itens" vazio={todos.length ? 'Nenhum item com esses filtros.' : 'Nenhum item no programa ainda. Use "Incluir itens no programa".'} comBeneficiario semPrograma />
      </div>
      {aberto && <JanelaDoItem e={aberto} onClose={() => setAberto(null)} />}
      {incluindo && <IncluirItensNoProgramaModal programa={prog} contratos={contratos} entregas={entregas} onClose={() => setIncluindo(false)} />}
    </Instrument360Page>
  );
};
