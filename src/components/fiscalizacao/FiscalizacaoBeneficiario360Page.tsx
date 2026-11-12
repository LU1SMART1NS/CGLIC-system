import React, { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { MapPin } from 'lucide-react';
import { NoticeBar } from '../../design-system/components/NoticeBar';
import { CarteiraSegmentTabs } from '../carteira/CarteiraSegmentTabs';
import { carteiraDetalhe } from '../carteira/carteiraStyles';
import { Instrument360Page } from '../instrument360/Instrument360Page';
import { InstrumentPageState } from '../instrument360/InstrumentPageState';
import { Instrument360Head } from '../instrument360/Instrument360Head';
import { Instrument360Hero } from '../instrument360/Instrument360Hero';
import { HealthTile, HealthTileGrid } from '../instrument360/HealthStripParts';
import { JanelaDoItem } from './JanelaDoItem';
import { CarteiraDetailLabel } from '../carteira/CarteiraDetailLabel';
import { useBackTarget } from '../../hooks/useDetailOrigin';
import { useContratosFiscalizacao, useEntregasFiscalizacao } from '../../hooks/useFiscalizacao';
import type { EntregaFiscalizacao } from '../../services/fiscalizacaoService';
import { NOME_SFC } from '../../utils/fiscalizacao';
import { foiEntregue } from '../../utils/fiscalizacaoEntregas';
import { agrupar, chaveDoBeneficiario, contratosDe, numero, pct, programasDe, qtdTexto, resumir, semCadastro, enderecoDeEntrega } from '../../utils/fiscalizacaoResumo';
import { ItensPorContrato, type GrupoDeItens } from './FiscalizacaoCelulas';

// ── Beneficiário 360: o que ele recebe, por contrato ─────────────────────────────────────────────

type SegItens = 'A_ENTREGAR' | 'ENTREGUES' | 'TODOS';

export const FiscalizacaoBeneficiario360Page: React.FC = () => {
  const { chave = '' } = useParams<{ chave: string }>();
  const back = useBackTarget({ path: '/fiscalizacao/beneficiarios', label: 'Voltar para Beneficiários' });
  const { data: entregas = [], isLoading, isError, error, refetch } = useEntregasFiscalizacao(null);
  const { data: contratos = [] } = useContratosFiscalizacao();
  const todos = useMemo(() => entregas.filter((e) => chaveDoBeneficiario(e) === chave), [entregas, chave]);
  const [seg, setSeg] = useState<SegItens>('A_ENTREGAR');
  const [aberto, setAberto] = useState<EntregaFiscalizacao | null>(null);
  if (isLoading) return <Instrument360Page><InstrumentPageState kind="loading" title="Carregando o beneficiário" /></Instrument360Page>;
  if (isError) return <Instrument360Page><InstrumentPageState kind="error" title="Não foi possível carregar o beneficiário" message={error?.message} onRetry={() => void refetch()} backLabel={back.label} onBack={back.back} /></Instrument360Page>;
  if (todos.length === 0) return <Instrument360Page><InstrumentPageState kind="notFound" title="Beneficiário sem itens na Fiscalização" message="O endereço não corresponde a nenhum beneficiário com itens acompanhados pela SFC/CGLIC." backLabel={back.label} onBack={back.back} /></Instrument360Page>;
  const aEntregar = (e: EntregaFiscalizacao) => e.responsavel === 'SFC' && !foiEntregue(e);
  const noSeg = (e: EntregaFiscalizacao, s: SegItens) => s === 'TODOS' || (s === 'A_ENTREGAR' ? aEntregar(e) : !aEntregar(e));
  const segAtivo = todos.some((e) => noSeg(e, seg)) ? seg : 'TODOS';
  const es = todos.filter((e) => noSeg(e, segAtivo));
  const r = resumir(todos);
  const faltam = todos.filter(aEntregar);
  const noExercito = faltam.filter((e) => e.etapa === 'CONTROLADO').length;
  const e0 = todos[0];
  const sem = semCadastro(e0);
  const endereco = enderecoDeEntrega(e0);
  const emendas = [...new Set(todos.map((e) => e.emenda).filter((x): x is string => Boolean(x)))];
  const progs = programasDe(todos);
  const grupos: GrupoDeItens[] = [...agrupar(es, (e) => e.contractKey).entries()].map(([k, l]) => ({ chave: k, contrato: contratos.find((x) => x.contractKey === k), es: l }));

  return (
    <Instrument360Page>
      <Instrument360Head resumoNoCelular>
        <Instrument360Hero
          backLabel={back.label}
          onBack={back.back}
          backTestId="fisc-benef-360-voltar"
          identifiers={[]}
          identifiersTestId="fisc-benef-360-ids"
          title={sem ? e0.beneficiarioTexto ?? 'Beneficiário a informar' : e0.beneficiarioNome ?? '—'}
          eyebrow={sem ? 'Beneficiário da planilha' : [e0.beneficiarioSigla, e0.municipio && e0.uf ? `${e0.municipio}/${e0.uf}` : e0.uf].filter(Boolean).join(' · ')}
          subtitle={sem ? `nome escrito à mão na planilha da ${NOME_SFC}` : e0.beneficiarioRazao ?? undefined}
          notice={
            sem ? (
              <NoticeBar tone="warning" testId="fisc-benef-360-sem-cadastro">
                Sem cadastro: os itens deste nome não somam com os do mesmo órgão escrito de outro jeito, e o endereço de entrega não aparece. A ligação ao cadastro é feita em Ajustes › Beneficiários.
              </NoticeBar>
            ) : undefined
          }
          manager={
            sem ? undefined : (
              <div data-testid="fisc-benef-360-endereco">
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Endereço de entrega</div>
                <div style={{ fontWeight: 700, marginTop: '0.15rem', display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                  <MapPin size={14} aria-hidden="true" /> {endereco.rua ?? endereco.detalhe}
                </div>
                <div style={carteiraDetalhe}>{endereco.rua ? `${endereco.detalhe} · ` : ''}do cadastro do beneficiário</div>
              </div>
            )
          }
          dates={[
            ...(emendas.length ? [{ label: emendas.length === 1 ? 'Emenda' : 'Emendas', value: emendas.join(', ') }] : []),
            ...(progs.length ? [{ label: progs.length === 1 ? 'Programa' : 'Programas', value: progs.join(', ') }] : [])
          ]}
        >
          <div data-testid="fisc-benef-360-indicadores">
            <HealthTileGrid columns={4}>
              <HealthTile label="Entregue" value={`${pct(r.entregues, r.acompanhadas)}%`} hint={`${numero(r.entregues)} de ${numero(r.acompanhadas)} unidades`} onClick={() => setSeg('ENTREGUES')} testId="fisc-benef-360-entregue" />
              <HealthTile label="A entregar" value={numero(faltam.reduce((t, e) => t + e.quantidade, 0))} hint={faltam.length ? `unidades em ${qtdTexto(faltam.length, 'item', 'itens')}${noExercito ? ` · ${noExercito} no Exército` : ''}` : 'nada a entregar'} compact onClick={() => setSeg('A_ENTREGAR')} testId="fisc-benef-360-a-entregar" />
              <HealthTile label="Prazo vencido" value={String(r.vencidas)} hint={r.vencidas ? (r.vencidas === 1 ? 'item' : 'itens') : r.proxima ? `próximo: ${r.proxima.texto.toLowerCase()}` : 'nenhum item a entregar'} tone={r.vencidas ? 'CRITICA' : undefined} compact onClick={() => setSeg('A_ENTREGAR')} testId="fisc-benef-360-vencidos" />
              <HealthTile label="Contratos" value={String(contratosDe(todos).length)} hint={[...new Set(todos.map((e) => e.fornecedor ?? ''))].filter(Boolean).slice(0, 2).join(' · ')} compact testId="fisc-benef-360-contratos" />
            </HealthTileGrid>
          </div>
        </Instrument360Hero>
      </Instrument360Head>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '1rem 0' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem 1rem' }}>
          <CarteiraDetailLabel>O que ele recebe, por contrato</CarteiraDetailLabel>
          <CarteiraSegmentTabs<SegItens>
            testIdPrefix="fisc-benef-360-seg"
            ariaLabel="Quais itens mostrar"
            active={segAtivo}
            onSelect={setSeg}
            segments={[
              { id: 'A_ENTREGAR', label: 'A entregar', count: todos.filter((e) => noSeg(e, 'A_ENTREGAR')).length, dot: 'var(--primary)' },
              { id: 'ENTREGUES', label: 'Entregues', count: todos.filter((e) => noSeg(e, 'ENTREGUES')).length, dot: 'var(--color-success)' },
              { id: 'TODOS', label: 'Todos', count: todos.length }
            ]}
          />
        </div>
        <ItensPorContrato grupos={grupos} abrir={setAberto} testId="fisc-benef-360-itens" />
      </div>
      {aberto && <JanelaDoItem e={aberto} onClose={() => setAberto(null)} />}
    </Instrument360Page>
  );
};
