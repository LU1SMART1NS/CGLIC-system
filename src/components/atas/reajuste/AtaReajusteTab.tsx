import React from 'react';
import { AppButton, DataTable, EmptyState, MetricStrip, NoticeBar, SectionHeader, StatusBadge, type Column } from '../../../design-system';
import type { ArpItemRecord } from '../../../types';
import type { CicloReajuste, ItemReajuste, ReajusteDaAta } from '../../../services/reajusteAtasService';
import { formatCurrency, formatCurrencyCompact, formatNumber } from '../../../utils/format';
import { formatDateBR } from '../../../services/temporalEngineService';
import { ReajusteLinhaDoTempo } from './ReajusteLinhaDoTempo';
import { InformarTermoModal } from './InformarTermoModal';
import { InformarPercentualModal } from './InformarPercentualModal';
import {
  avisoDaAba,
  dataBaseNaTela,
  diasAte,
  impactoDoItem,
  mesPorExtenso,
  origemDaBase,
  percentual,
  proximoCiclo,
  publicadoDoCiclo,
  ROTULO_SITUACAO_CICLO,
  ROTULO_SITUACAO_ITEM,
  totaisDaAta,
  ultimoReajuste,
  VARIANTE_SITUACAO_CICLO,
  VARIANTE_SITUACAO_ITEM,
  type SaldoDoItem
} from './reajusteRotulos';

interface Props {
  dados: ReajusteDaAta;
  isLoading: boolean;
  numeroAta: string;
  uasg: string;
  inicioVigencia: string;
  fimVigencia: string;
  itensDaAta: ArpItemRecord[];
  saldos: SaldoDoItem[];
  /** Gestor desta ata ou coordenador: informa o termo e o percentual (as RPCs conferem de novo). */
  podeEditar: boolean;
}

const celula: React.CSSProperties = { padding: '0.55rem 0.75rem', borderBottom: '1px solid var(--border)', verticalAlign: 'top', fontVariantNumeric: 'tabular-nums' };
const cabecalho: React.CSSProperties = { padding: '0.55rem 0.75rem', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--text-muted)', whiteSpace: 'nowrap', background: 'var(--bg-card-hover)', textAlign: 'left' };
const sub: React.CSSProperties = { color: 'var(--text-muted)', fontSize: '0.75rem' };

/** Aba Reajuste da Ata 360 (protótipo aprovado em 23/10/2026; ON AGU nº 100/2025). */
export const AtaReajusteTab: React.FC<Props> = ({ dados, isLoading, numeroAta, uasg, inicioVigencia, fimVigencia, itensDaAta, saldos, podeEditar }) => {
  const [termoAberto, setTermoAberto] = React.useState(false);
  const [percentualDe, setPercentualDe] = React.useState<{ ciclo: CicloReajuste | null } | null>(null);
  const [mesesAbertos, setMesesAbertos] = React.useState<Set<number>>(new Set());

  if (isLoading && !dados.parametros) {
    return <div style={{ padding: '1rem', color: 'var(--text-secondary)' }}>Carregando o reajuste da ata…</div>;
  }
  if (!dados.ataId || !dados.parametros) {
    return (
      <EmptyState
        title="Reajuste ainda não lido"
        description="A leitura do edital e dos apostilamentos desta ata no PNCP ainda não foi feita. Ela roda de 3 em 3 horas."
      />
    );
  }

  const { parametros, ciclos, itens, publicados } = dados;
  const ataId = dados.ataId;
  const origem = origemDaBase(parametros);
  const ultimo = ultimoReajuste(ciclos);
  const prox = proximoCiclo(ciclos);
  const aviso = avisoDaAba(dados, saldos);
  const totais = totaisDaAta(itens, saldos);
  const cicloSemPercentual = ciclos.find((c) => c.situacao === 'PUBLICADO_SEM_PERCENTUAL') ?? null;

  const seloDaBase =
    origem === 'INFORMADO' ? <StatusBadge label={`Informado · SEI ${parametros.termoSei}`} variant="success" size="sm" dot={false} />
      : origem === 'APOSTILAMENTO' ? <StatusBadge label="Mês pelo apostilamento" variant="success" size="sm" dot={false} />
        : origem === 'EDITAL' ? <StatusBadge label="Sugestão do edital" variant="warning" size="sm" dot={false} />
          : <StatusBadge label="A informar" variant="warning" size="sm" dot={false} />;

  const abrirTermo = podeEditar ? () => setTermoAberto(true) : undefined;
  const abrirPercentual = (ciclo: CicloReajuste | null) => (podeEditar ? setPercentualDe({ ciclo }) : undefined);

  const descricao = (numeroItem: string) => itensDaAta.find((i) => Number(i.numeroItem) === Number(numeroItem));

  const colunasItens: Column<ItemReajuste>[] = [
    { key: 'item', header: 'Item', priority: 'primary', render: (i) => String(Number(i.numeroItem) || i.numeroItem), sortValue: (i) => Number(i.numeroItem) },
    {
      key: 'descricao',
      header: 'Descrição e fornecedor',
      minWidth: '220px',
      render: (i) => {
        const d = descricao(i.numeroItem);
        return (
          <div style={{ maxWidth: 340 }}>
            <div>{d?.descricaoItem ? (d.descricaoItem.length > 90 ? `${d.descricaoItem.slice(0, 90)}…` : d.descricaoItem) : '—'}</div>
            {d?.nomeRazaoSocialFornecedor && <div style={sub}>{d.nomeRazaoSocialFornecedor}</div>}
          </div>
        );
      }
    },
    { key: 'situacao', header: 'Situação', render: (i) => <StatusBadge label={ROTULO_SITUACAO_ITEM[i.situacao]} variant={VARIANTE_SITUACAO_ITEM[i.situacao]} size="sm" /> },
    {
      key: 'homologado',
      header: 'Homologado',
      align: 'right',
      nowrap: true,
      render: (i) => (
        <>
          {formatCurrency(i.precoHomologado)}
          {!i.homologadoLido && <div style={sub} title="O PNCP não trouxe o resultado do item: a conta usa o preço atual.">preço atual</div>}
        </>
      )
    },
    {
      key: 'atual',
      header: 'Preço atual',
      align: 'right',
      nowrap: true,
      render: (i) => (
        <>
          {formatCurrency(i.precoAtual)}
          <div style={sub}>{i.percentualNoPreco && i.percentualNoPreco > 0.005 ? `+${percentual(i.percentualNoPreco)} já aplicado` : 'sem reajuste'}</div>
        </>
      )
    },
    {
      key: 'devido',
      header: 'Devido hoje',
      align: 'right',
      nowrap: true,
      render: (i) =>
        i.precoDevido - i.precoAtual > 0.005 ? (
          <>
            <strong>{formatCurrency(i.precoDevido)}</strong>
            <div style={sub}>+{percentual((i.precoDevido / Math.max(i.precoAtual, 0.0001) - 1) * 100)} sobre o atual</div>
          </>
        ) : (
          <>
            {formatCurrency(i.precoDevido)}
            <div style={sub}>igual ao atual</div>
          </>
        )
    },
    {
      key: 'proximo',
      header: 'Próximo reajuste',
      nowrap: true,
      render: (i) =>
        i.proximoEfeito ? (
          <>
            {formatDateBR(i.proximoEfeito)}
            <div style={sub}>
              {percentual(i.proximoPercentual)}
              {i.proximoMesesEstimados ? ' · estimado' : ''}
              {i.proximoSituacao === 'SE_PRORROGAR' ? ' · se prorrogar' : ''}
            </div>
          </>
        ) : (
          <span style={sub}>nenhum na vigência</span>
        ),
      sortValue: (i) => i.proximoEfeito ?? ''
    },
    { key: 'projetado', header: 'Preço projetado', align: 'right', nowrap: true, render: (i) => (i.precoProjetado != null ? formatCurrency(i.precoProjetado) : '—') },
    {
      key: 'saldo',
      header: 'Saldo',
      align: 'right',
      render: (i) => formatNumber(impactoDoItem(i, saldos).saldo),
      sortValue: (i) => impactoDoItem(i, saldos).saldo,
      sortFirstDir: 'desc'
    },
    {
      key: 'impacto',
      header: 'Impacto no saldo',
      align: 'right',
      nowrap: true,
      render: (i) => {
        const imp = impactoDoItem(i, saldos);
        if (!imp.devido && !imp.proximo) return '—';
        return (
          <>
            {imp.devido > 0 && (<><strong>{formatCurrencyCompact(imp.devido)}</strong><div style={sub}>a aplicar</div></>)}
            {imp.proximo > 0 && (<><div>{formatCurrencyCompact(imp.proximo)}</div><div style={sub}>no próximo</div></>)}
          </>
        );
      },
      sortValue: (i) => {
        const imp = impactoDoItem(i, saldos);
        return imp.devido + imp.proximo;
      },
      sortFirstDir: 'desc'
    }
  ];

  const alternarMeses = (n: number) =>
    setMesesAbertos((atual) => {
      const novo = new Set(atual);
      if (novo.has(n)) novo.delete(n);
      else novo.add(n);
      return novo;
    });

  const mesesDoCiclo = (c: CicloReajuste) => {
    const inicio = (c.periodoInicio ?? `${c.dataBase.slice(0, 7)}-01`).slice(0, 7);
    const [y, m] = inicio.split('-').map(Number);
    return Array.from({ length: 12 }, (_, k) => {
      const t = y * 12 + (m - 1) + k;
      const mes = `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}-01`;
      return { mes, indice: dados.indices.find((x) => x.mes === mes) ?? null };
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }} data-testid="ata-reajuste">
      <MetricStrip
        testId="reajuste-base"
        items={[
          { label: 'Índice do edital', value: parametros.indice ?? '—', hint: parametros.clausula === 'COM_REAJUSTE' ? 'Cláusula de reajuste no edital' : parametros.clausula === 'SEM_REAJUSTE' ? 'Edital sem reajuste' : 'Cláusula a conferir' },
          {
            label: 'Termo de Conformidade',
            value: dataBaseNaTela(parametros),
            tone: origem === 'INFORMADO' || origem === 'APOSTILAMENTO' ? 'default' : 'warning',
            hint: (
              <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: '0.35rem', alignItems: 'center' }}>
                {seloDaBase}
                {abrirTermo && (
                  <AppButton variant="outline" size="xs" onClick={abrirTermo} data-testid="reajuste-informar-termo">
                    {origem === 'INFORMADO' ? 'Corrigir' : 'Informar termo'}
                  </AppButton>
                )}
              </span>
            ),
            testId: 'reajuste-base-termo'
          },
          {
            label: 'Último reajuste',
            value: ultimo ? (ultimo.percentual != null ? percentual(ultimo.percentual) : 'Sem percentual') : 'Nenhum',
            hint: ultimo ? `efeitos desde ${formatDateBR(ultimo.efeitoInicio)}` : 'preço homologado em vigor'
          },
          {
            label: 'Próximo marco',
            value: prox ? formatDateBR(prox.efeitoInicio) : '—',
            hint: prox ? (prox.situacao === 'SE_PRORROGAR' ? 'na prorrogação, se houver' : `${diasAte(prox.efeitoInicio)} dias`) : 'nenhum na vigência'
          }
        ]}
      />

      <NoticeBar
        tone={aviso.tone}
        testId="reajuste-aviso"
        action={
          podeEditar && aviso.acao === 'INFORMAR_PERCENTUAL' && cicloSemPercentual ? (
            <AppButton variant="primary" size="sm" onClick={() => abrirPercentual(cicloSemPercentual)} data-testid="reajuste-aviso-percentual">Informar percentual</AppButton>
          ) : podeEditar && aviso.acao === 'INFORMAR_TERMO' ? (
            <AppButton variant="primary" size="sm" onClick={() => setTermoAberto(true)} data-testid="reajuste-aviso-termo">Informar termo</AppButton>
          ) : undefined
        }
      >
        {aviso.texto}
      </NoticeBar>

      <ReajusteLinhaDoTempo parametros={parametros} ciclos={ciclos} inicioVigencia={inicioVigencia} fimVigencia={fimVigencia} />

      <section>
        <SectionHeader
          title="Ciclos de reajuste"
          subtitle="12 meses a partir dos efeitos do reajuste anterior"
          actions={podeEditar ? <AppButton variant="outline" size="sm" onClick={() => abrirPercentual(null)} data-testid="reajuste-registrar">Registrar reajuste fora do PNCP</AppButton> : undefined}
        />
        {ciclos.length === 0 ? (
          <NoticeBar tone="info" testId="reajuste-sem-ciclos">Nenhum aniversário cai dentro da vigência possível da ata.</NoticeBar>
        ) : (
          <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', minWidth: 820 }} data-testid="reajuste-ciclos">
              <thead>
                <tr>
                  <th style={cabecalho}>Ciclo</th>
                  <th style={cabecalho}>Data-base</th>
                  <th style={cabecalho}>Efeitos</th>
                  <th style={cabecalho}>Meses do índice</th>
                  <th style={{ ...cabecalho, textAlign: 'right' }}>Percentual</th>
                  <th style={cabecalho}>Situação</th>
                  <th style={cabecalho}>Documento</th>
                </tr>
              </thead>
              <tbody>
                {ciclos.map((c, idx) => {
                  const pub = publicadoDoCiclo(c, publicados);
                  const aberto = mesesAbertos.has(c.ciclo);
                  const soMes = idx === 0 && origem === 'APOSTILAMENTO';
                  const conferePercentual = c.percentual != null && c.percentualCalculado != null && Math.abs(c.percentual - c.percentualCalculado) < 0.01;
                  return (
                    <React.Fragment key={c.ciclo}>
                      <tr>
                        <td style={celula}>{c.ciclo}º</td>
                        <td style={celula}>
                          {soMes ? mesPorExtenso(c.dataBase) : formatDateBR(c.dataBase)}
                          <div style={sub}>{idx === 0 ? 'Termo de Conformidade' : 'efeitos do reajuste anterior'}</div>
                          <div style={sub}>aniversário {soMes ? mesPorExtenso(c.aniversario) : formatDateBR(c.aniversario)}</div>
                        </td>
                        <td style={celula}>{formatDateBR(c.efeitoInicio)}</td>
                        <td style={celula}>
                          {c.periodoInicio && c.periodoFim ? `${mesPorExtenso(c.periodoInicio)} a ${mesPorExtenso(c.periodoFim)}` : '—'}
                          <div>
                            <AppButton variant="link" size="xs" onClick={() => alternarMeses(c.ciclo)} aria-expanded={aberto} data-testid={`reajuste-meses-${c.ciclo}`}>
                              {aberto ? 'Esconder os meses' : 'Ver os 12 meses'}
                            </AppButton>
                          </div>
                        </td>
                        <td style={{ ...celula, textAlign: 'right' }}>
                          {c.percentual != null ? percentual(c.percentual) : 'Não informado'}
                          <div style={sub}>
                            {c.situacao === 'APLICADO' || c.situacao === 'PUBLICADO_SEM_PERCENTUAL'
                              ? c.percentualCalculado != null ? `conta do sistema: ${percentual(c.percentualCalculado)}${conferePercentual ? ', confere' : ''}` : ''
                              : c.mesesEstimados > 0 ? <span style={{ color: 'var(--color-warning-text)', fontWeight: 600 }}>{c.mesesEstimados} de 12 meses estimados</span> : 'índice oficial'}
                          </div>
                        </td>
                        <td style={celula}><StatusBadge label={ROTULO_SITUACAO_CICLO[c.situacao]} variant={VARIANTE_SITUACAO_CICLO[c.situacao]} size="sm" /></td>
                        <td style={celula}>
                          {pub ? (
                            <>
                              {pub.documentoTitulo ? (pub.documentoTitulo.length > 70 ? `${pub.documentoTitulo.slice(0, 70)}…` : pub.documentoTitulo) : pub.origem === 'INFORMADO' ? 'Informado pelo gestor' : 'Documento do PNCP'}
                              <div style={sub}>
                                {pub.documentoPublicadoEm ? `publicado em ${formatDateBR(pub.documentoPublicadoEm)}` : ''}
                                {pub.seiApostilamento ? `${pub.documentoPublicadoEm ? ' · ' : ''}SEI ${pub.seiApostilamento}` : ''}
                              </div>
                              {podeEditar && (
                                <AppButton variant="outline" size="xs" onClick={() => abrirPercentual(c)} data-testid={`reajuste-corrigir-${c.ciclo}`}>
                                  {c.situacao === 'PUBLICADO_SEM_PERCENTUAL' ? 'Informar percentual' : 'Corrigir'}
                                </AppButton>
                              )}
                            </>
                          ) : c.situacao === 'DEVIDO' ? 'Sem apostilamento' : '—'}
                        </td>
                      </tr>
                      {aberto && (
                        <tr>
                          <td colSpan={7} style={{ padding: 0, borderBottom: '1px solid var(--border)' }}>
                            <div className="reaj-meses">
                              {mesesDoCiclo(c).map(({ mes, indice }) => (
                                <div key={mes} className={`reaj-mes${indice && !indice.oficial ? ' reaj-mes--focus' : ''}`}>
                                  <span>{mesPorExtenso(mes)}{indice && !indice.oficial ? ' · Focus' : ''}</span>
                                  <b>{indice ? `${indice.variacao.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%` : '—'}</b>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <SectionHeader
          title="Projeção por item"
          subtitle="Impacto sobre o saldo ainda não contratado da cota da SENASP."
          countBadge={totais.devido + totais.proximo > 0 ? `${totais.devido > 0 ? `${formatCurrencyCompact(totais.devido)} a aplicar` : ''}${totais.devido > 0 && totais.proximo > 0 ? ' · ' : ''}${totais.proximo > 0 ? `${formatCurrencyCompact(totais.proximo)} no próximo` : ''}` : undefined}
        />
        <DataTable
          columns={colunasItens}
          data={itens}
          keyExtractor={(i) => i.numeroItem}
          mobileLayout="scroll"
          minTableWidth="1100px"
          stickyFirstColumn
          emptyMessage="Nenhum item nesta ata."
          testId="reajuste-itens"
        />
      </section>

      {podeEditar && (
        <>
          <InformarTermoModal
            aberto={termoAberto}
            ataId={ataId}
            numeroAta={numeroAta}
            uasg={uasg}
            inicioVigencia={inicioVigencia}
            parametros={parametros}
            onFechar={() => setTermoAberto(false)}
          />
          <InformarPercentualModal
            aberto={Boolean(percentualDe)}
            ataId={ataId}
            numeroAta={numeroAta}
            uasg={uasg}
            ciclo={percentualDe?.ciclo ?? null}
            publicado={percentualDe?.ciclo ? publicadoDoCiclo(percentualDe.ciclo, publicados) : null}
            versao={parametros.versao}
            onFechar={() => setPercentualDe(null)}
          />
        </>
      )}
    </div>
  );
};
