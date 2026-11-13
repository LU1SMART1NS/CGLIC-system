import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { DataTable, type Column } from '../../design-system/components/DataTable';
import { StatusBadge } from '../../design-system/components/StatusBadge';
import { NoticeBar } from '../../design-system/components/NoticeBar';
import { ProgressBar } from '../../design-system/components/ProgressBar';
import { AppButton } from '../../design-system/components/AppButton';
import { carteiraDetalhe, carteiraNumero, carteiraValor } from '../carteira/carteiraStyles';
import { CelulaBeneficiario, CelulaItem, CelulaSituacaoDoItem } from './EntregasTabela';
import { CarteiraDetailLabel } from '../carteira/CarteiraDetailLabel';
import type { ContratoFiscalizacao, EntregaFiscalizacao } from '../../services/fiscalizacaoService';
import { NOME_SFC, rotaDoContrato } from '../../utils/fiscalizacao';
import { foiEntregue, nomeDoItem, rotuloDoBeneficiario } from '../../utils/fiscalizacaoEntregas';
import { type Resumo, ordemDaSituacao, textoQuantidade, chaveDoBeneficiario, contratosDe, numero, pct, PROGRAMA_DAS_EMENDAS, programasDe, qtdTexto, resumir, ufsDe } from '../../utils/fiscalizacaoResumo';
/* Células e blocos das listas e telas 360 da Fiscalização (Contratos, Beneficiários, Beneficiário 360). */


// ── Células em comum ─────────────────────────────────────────────────────────────────────────────

/** Entrega com o alerta junto: "2 de 8 itens", a barra e, embaixo, os itens com prazo vencido (ou "tudo entregue"). */
export const CelulaEntregaResumo: React.FC<{ es: EntregaFiscalizacao[]; r: Resumo }> = ({ es, r }) => {
  const sfc = es.filter((e) => e.responsavel === 'SFC');
  const feitos = sfc.filter(foiEntregue).length;
  if (es.length === 0) return <span style={carteiraDetalhe}>—</span>;
  if (sfc.length === 0) return <span style={carteiraDetalhe}>com a área requisitante</span>;
  const tudo = feitos === sfc.length;
  return (
    <div style={{ minWidth: 150 }}>
      <span style={{ ...carteiraValor, ...carteiraNumero }}>{feitos} de {qtdTexto(sfc.length, 'item', 'itens')}</span>
      <span style={{ ...carteiraDetalhe, marginLeft: '0.35rem' }}>{pct(feitos, sfc.length)}%</span>
      <div style={{ margin: '0.3rem 0 0.2rem' }}><ProgressBar value={pct(feitos, sfc.length)} colorScheme={tudo ? 'success' : 'primary'} height="6px" showPercent={false} /></div>
      {tudo ? (
        <div style={{ ...carteiraDetalhe, color: 'var(--color-success-text)', fontWeight: 700 }}>tudo entregue</div>
      ) : r.vencidas ? (
        <div style={{ ...carteiraDetalhe, color: 'var(--color-danger-text)', fontWeight: 700 }}>{r.vencidas === 1 ? '1 item com prazo vencido' : `${r.vencidas} itens com prazo vencido`}</div>
      ) : r.noExercito ? (
        <div style={carteiraDetalhe}>{r.noExercito === 1 ? '1 item no Exército' : `${r.noExercito} itens no Exército`} · prazo suspenso</div>
      ) : (
        <div style={carteiraDetalhe}>{r.proxima ? r.proxima.texto.toLowerCase() : 'sem data prevista'}</div>
      )}
    </div>
  );
};

/** Quem destinou: emenda e parlamentar; sem emenda, o programa; sem nenhum, a planilha. O programa das emendas não se
 * repete embaixo da emenda que já aparece. */
export const CelulaQuemDestinou: React.FC<{ es: EntregaFiscalizacao[] }> = ({ es }) => {
  const emendas = [...new Map(es.filter((e) => e.emenda).map((e) => [e.emenda!, e.parlamentarNome ?? null])).entries()];
  const progs = programasDe(es.filter((e) => !(e.emenda && e.programaId === PROGRAMA_DAS_EMENDAS)));
  const linhas = [...emendas.map(([n, quem]) => (quem ? { t: quem, d: `Emenda ${n}` } : { t: `Emenda ${n}`, d: 'emenda parlamentar' })), ...progs.map((p) => ({ t: p, d: 'Programa' }))];
  if (linhas.length === 0) return <span style={carteiraDetalhe}>Planilha da {NOME_SFC}</span>;
  return (
    <>
      {linhas.slice(0, 2).map((x) => (
        <div key={x.d + x.t} style={{ marginBottom: '0.3rem' }}>
          <div style={{ ...carteiraValor, fontSize: '0.85rem' }}>{x.t}</div>
          <div style={{ ...carteiraDetalhe, marginTop: 0 }}>{x.d}</div>
        </div>
      ))}
      {linhas.length > 2 && <div style={carteiraDetalhe}>e mais {linhas.length - 2}</div>}
    </>
  );
};

/** Beneficiários do programa: quantos, e embaixo as UFs onde estão. */
export const CelulaOnde: React.FC<{ es: EntregaFiscalizacao[] }> = ({ es }) => {
  if (es.length === 0) return <span style={carteiraDetalhe}>—</span>;
  const ufs = ufsDe(es);
  const benef = new Set(es.map(chaveDoBeneficiario)).size;
  return (
    <>
      <span style={carteiraValor}>{qtdTexto(benef, 'beneficiário', 'beneficiários')}</span>
      <div style={carteiraDetalhe}>{ufs.length > 8 ? `${ufs.slice(0, 8).join(', ')} e mais ${ufs.length - 8}` : ufs.join(', ')}</div>
    </>
  );
};

export const CelulaContratado: React.FC<{ es: EntregaFiscalizacao[]; r: Resumo }> = ({ es, r }) => {
  if (es.length === 0) return <span style={carteiraDetalhe}>nenhum item ainda: inclua pela tela do programa</span>;
  const t = textoQuantidade(es);
  return (
    <>
      {t.primeiros.map((l) => (
        <div key={l} style={{ ...carteiraValor, fontWeight: 600, fontSize: '0.85rem' }}>{l}</div>
      ))}
      <div style={carteiraDetalhe}>{qtdTexto(t.total, 'item', 'itens')} · {numero(r.unidades)} un. em {qtdTexto(contratosDe(es).length, 'contrato', 'contratos')}</div>
    </>
  );
};

export const CelulaItens: React.FC<{ es: EntregaFiscalizacao[] }> = ({ es }) => {
  const t = textoQuantidade(es);
  return (
    <>
      {t.primeiros.map((l) => (
        <div key={l} style={{ ...carteiraValor, fontWeight: 600, fontSize: '0.85rem' }}>
          {l}
        </div>
      ))}
      {t.resto > 0 && <div style={carteiraDetalhe}>e mais {t.resto} {t.resto === 1 ? 'item' : 'itens'}</div>}
    </>
  );
};

// ── Itens por contrato: o mesmo padrão dos "Itens por ata" do Pedido 360 (bloco que abre e fecha + tabela) ──

export interface GrupoDeItens { chave: string; contrato: ContratoFiscalizacao | undefined; es: EntregaFiscalizacao[] }

export const ItensPorContrato: React.FC<{ grupos: GrupoDeItens[]; abrir: (e: EntregaFiscalizacao) => void; testId: string; vazio?: string; comBeneficiario?: boolean; semPrograma?: boolean }> = ({ grupos, abrir, testId, vazio, comBeneficiario, semPrograma }) => {
  const [fechados, setFechados] = useState<Record<string, boolean>>({});
  const colunas: Column<EntregaFiscalizacao>[] = [
    {
      key: 'item',
      header: 'Item',
      minWidth: '260px',
      width: comBeneficiario ? '40%' : '60%',
      priority: 'primary',
      sortValue: (e) => nomeDoItem(e),
      render: (e) => <CelulaItem e={e} comOrigem={!semPrograma || Boolean(e.emenda)} />
    },
    ...(comBeneficiario ? [{ key: 'ben', header: 'Beneficiário', width: '33%', sortValue: (e: EntregaFiscalizacao) => rotuloDoBeneficiario(e).principal, render: (e: EntregaFiscalizacao) => <CelulaBeneficiario e={e} /> }] : []),
    { key: 'qtd', header: 'Qtd.', align: 'right', nowrap: true, width: comBeneficiario ? '7%' : '10%', sortValue: (e) => e.quantidade, sortFirstDir: 'desc', render: (e) => <span style={carteiraNumero}>{numero(e.quantidade)}</span> },
    { key: 'etapa', header: 'Etapa', minWidth: '210px', width: comBeneficiario ? '20%' : '30%', sortValue: (e) => ordemDaSituacao(e), render: (e) => <CelulaSituacaoDoItem e={e} /> }
  ];
  const todos = (abrirTodos: boolean) => setFechados(Object.fromEntries(grupos.map((g) => [g.chave, !abrirTodos])));
  if (grupos.length === 0) return <NoticeBar tone="info">{vazio ?? 'Nenhum item.'}</NoticeBar>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }} data-testid={testId}>
      {grupos.length > 1 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.5rem', flexWrap: 'wrap' }}>
          <CarteiraDetailLabel>{grupos.length} contratos</CarteiraDetailLabel>
          <span style={{ ...carteiraDetalhe, display: 'inline-flex', gap: '0.4rem' }}>
            <AppButton size="xs" variant="link" onClick={() => todos(true)}>Abrir todos</AppButton>·<AppButton size="xs" variant="link" onClick={() => todos(false)}>Recolher todos</AppButton>
          </span>
        </div>
      )}
      {grupos.map((g) => {
        const r = resumir(g.es);
        const aberto = !fechados[g.chave];
        const e0 = g.es[0];
        return (
          <section key={g.chave} className={`emendas-bloco-ata${r.vencidas ? ' emendas-bloco-ata--pend' : ''}`} data-testid={`${testId}-${g.chave}`}>
            <button type="button" className="emendas-bloco-ata__cab" aria-expanded={aberto} onClick={() => setFechados((f) => ({ ...f, [g.chave]: aberto }))}>
              {aberto ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
              <span className="emendas-bloco-ata__nome">
                {g.contrato ? (
                  <Link to={rotaDoContrato(g.contrato)} onClick={(ev) => ev.stopPropagation()} className="emendas-bloco-ata__ata" title="Abrir o Contrato 360">
                    Contrato {e0.contratoNumero}
                  </Link>
                ) : (
                  <strong>Contrato {e0.contratoNumero}</strong>
                )}
                <span className="emendas-bloco-ata__forn"> · {e0.fornecedor}</span>
                {g.contrato?.fiscalNome && <span className="emendas-bloco-ata__forn"> · fiscal {g.contrato.fiscalNome}</span>}
              </span>
              <span className="emendas-bloco-ata__num">
                {qtdTexto(g.es.length, 'item', 'itens')} · {numero(r.unidades)} un · {numero(r.entregues)} entregues
              </span>
              <span className="emendas-bloco-ata__sit">
                {r.vencidas > 0 && <StatusBadge label={r.vencidas === 1 ? '1 com prazo vencido' : `${r.vencidas} com prazo vencido`} variant="warning" size="sm" dot={false} />}
                {r.noExercito > 0 && <StatusBadge label="aguardando o Exército" variant="danger" size="sm" dot={false} />}
              </span>
            </button>
            {aberto && (
              <div className="emendas-bloco-ata__corpo">
                <DataTable<EntregaFiscalizacao> testId={`${testId}-${g.chave}-tabela`} data={g.es} keyExtractor={(e) => e.id} columns={colunas} className="data-table-container--flush emendas-tabela-topo tabela-colunas-fixas" rowOpen={(e) => () => abrir(e)} />
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
};
