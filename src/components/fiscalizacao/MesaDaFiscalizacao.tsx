import React, { useMemo, useState } from 'react';
import { AppButton } from '../../design-system/components/AppButton';
import { StatusBadge } from '../../design-system/components/StatusBadge';
import { NumeroSeiEtiqueta } from '../../design-system/components/NumeroSeiEtiqueta';
import { RowActionsMenu } from '../../design-system/components/RowActionsMenu';
import { CarteiraDetailLabel } from '../carteira/CarteiraDetailLabel';
import { carteiraDetalhe, carteiraNumero } from '../carteira/carteiraStyles';
import { useAuth } from '../../context/AuthContext';
import { useEntregasFiscalizacao, useFiscalizacaoDoContrato } from '../../hooks/useFiscalizacao';
import type { EntregaFiscalizacao } from '../../services/fiscalizacaoService';
import { NOME_SFC, ehDoFiscal } from '../../utils/fiscalizacao';
import { nomeDoItem, prazoDaEntrega, rotuloDoBeneficiario } from '../../utils/fiscalizacaoEntregas';
import { MudarEtapaModal, PrevistaModal } from './EntregasModais';
import { COR, comQuemEstaOItem, itens, linhasDoContrato, type Linha, type Tom } from '../../utils/fiscalizacaoMesa';
import { DefinirFiscalizacaoModal, RegistrarProcessoModal } from './FiscalizacaoModais';
import { JanelaDoItem } from './JanelaDoItem';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { DataTable } from '../../design-system/components/DataTable';
import { CelulaItem, CelulaSituacaoDoItem } from './EntregasTabela';
import { ordemDaSituacao } from '../../utils/fiscalizacaoResumo';

type Janela = { tipo: 'etapa' | 'prevista'; itens: EntregaFiscalizacao[] } | { tipo: 'item'; item: EntregaFiscalizacao } | { tipo: 'processo' } | { tipo: 'quem' } | null;

const lista: React.CSSProperties = { border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' };
const bloco: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '0.4rem' };
const marca = (tom: Tom): React.CSSProperties => ({ width: 10, height: 10, borderRadius: '50%', marginTop: '0.3rem', boxSizing: 'border-box', ...(tom === 'espera' ? { border: `2px solid ${COR[tom]}` } : { background: COR[tom] }) });
const chaveDoGrupo = (g: EntregaFiscalizacao[]) => g[0].beneficiarioId ?? `planilha:${g[0].beneficiarioTexto}`;
/** Acima disto, a lista abre só nos beneficiários com pendência (como o Andamento do Pedido 360). */
const GRUPOS_SEM_FILTRO = 5;
const LinhaDaMesa: React.FC<{ l: Linha; podeAgir: boolean }> = ({ l, podeAgir }) => (
  <div style={{ display: 'grid', gridTemplateColumns: '12px minmax(0, 1fr)', gap: '0.2rem 0.7rem', padding: '0.65rem 0.75rem', borderTop: '1px solid var(--border)', alignItems: 'start' }} data-testid={`fisc-mesa-${l.chave}`}>
    <span style={marca(l.tom)} aria-hidden="true" />
    <div style={{ minWidth: 0, display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: '0.4rem 0.8rem' }}>
      <div style={{ minWidth: 0, flex: '1 1 260px' }}>
        <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>
          {l.quem && <span style={{ display: 'inline-block', fontSize: '0.75rem', fontWeight: 800, border: '1px solid var(--border)', borderRadius: 4, padding: '0 0.35rem', marginRight: '0.4rem', color: '#64748b', verticalAlign: '1px' }}>{l.quem}</span>}
          {l.titulo}
        </div>
        {l.detalhe && <div style={{ ...carteiraDetalhe, fontSize: '0.8rem' }}>{l.detalhe}</div>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.3rem', marginLeft: 'auto' }}>
        {l.prazo && l.prazo !== '—' && <span style={{ fontSize: '0.8rem', fontWeight: 700, whiteSpace: 'nowrap', color: l.vencido ? 'var(--color-danger-text)' : '#64748b' }}>{l.vencido ? `venceu em ${l.prazo}` : `até ${l.prazo}`}</span>}
        {podeAgir && l.acoes.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center', gap: '0.5rem' }}>
            {l.acoes.map((a) => (
              <AppButton key={a.rotulo} size={a.principal ? 'sm' : 'xs'} variant={a.principal ? 'primary' : 'link'} onClick={a.faz} data-testid={`fisc-mesa-${l.chave}-${a.rotulo}`}>
                {a.rotulo}
              </AppButton>
            ))}
          </div>
        )}
      </div>
    </div>
  </div>
);

const Campo: React.FC<{ rotulo: string; children: React.ReactNode }> = ({ rotulo, children }) => (
  <div style={{ minWidth: 0 }}>
    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{rotulo}</div>
    <div style={{ fontSize: '0.88rem', fontWeight: 600, marginTop: '0.1rem' }}>{children}</div>
  </div>
);

/**
 * Contrato 360 › Fiscalização como mesa de trabalho (o mesmo desenho da aba Andamento do Pedido 360): uma faixa com
 * quem fiscaliza; Com você (o próximo passo, juntando os itens que estão no mesmo ponto, com o botão que age em todos);
 * Com outros (CAEP, Exército, fornecedor, financeiro, área requisitante); e Onde está cada item, por beneficiário,
 * com a régua. O item abre a janela do item. O histórico do contrato fica na aba Histórico.
 */
export const MesaDaFiscalizacao: React.FC<{ contractKey: string }> = ({ contractKey }) => {
  const { user, role } = useAuth();
  const { contrato: c } = useFiscalizacaoDoContrato(contractKey);
  const { data: es = [] } = useEntregasFiscalizacao(contractKey);
  const [janela, setJanela] = useState<Janela>(null);
  const coordenador = role === 'admin';
  const podeAgir = Boolean(c && (coordenador || (role === 'gestor_fiscalizacao' && ehDoFiscal(c, user?.id))));
  const { comVoce, comOutros } = useMemo(() => linhasDoContrato(es, Boolean(c && !c.processoSei), (tipo, l) => setJanela({ tipo, itens: l }), () => setJanela({ tipo: 'processo' })), [es, c]);
  const grupos = useMemo(() => {
    const m = new Map<string, EntregaFiscalizacao[]>();
    for (const e of es) {
      const k = e.beneficiarioId ?? `planilha:${e.beneficiarioTexto}`;
      m.set(k, [...(m.get(k) ?? []), e]);
    }
    // Com pendência primeiro (os com prazo vencido no topo); os que acabaram, por último e fechados (como no Andamento).
    const pendente = (g: EntregaFiscalizacao[]) => g.some((e) => e.responsavel === 'SFC' && comQuemEstaOItem(e) !== 'FIM');
    const vencidos = (g: EntregaFiscalizacao[]) => g.filter((e) => prazoDaEntrega(e).tom === 'danger').length;
    return [...m.values()].sort((a, b) => Number(pendente(b)) - Number(pendente(a)) || vencidos(b) - vencidos(a));
  }, [es]);
  const [soPendentes, setSoPendentes] = useState(true);
  const [abertos, setAbertos] = useState<Record<string, boolean>>({});
  if (!c) return null;
  const fechar = () => setJanela(null);
  const pendentes = grupos.filter((g) => g.some((e) => e.responsavel === 'SFC' && comQuemEstaOItem(e) !== 'FIM'));
  const mostrados = grupos.length > GRUPOS_SEM_FILTRO && soPendentes && pendentes.length ? pendentes : grupos;
  const resto = grupos.length - mostrados.length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }} data-testid="fisc-mesa">
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem 1.75rem', alignItems: 'flex-start', padding: '0.75rem 1rem', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-card)' }} data-testid="fisc-mesa-faixa">
        <Campo rotulo="Fiscalização"><StatusBadge label={c.situacao === 'MISTA' ? 'Mista' : NOME_SFC} variant={c.situacao === 'MISTA' ? 'purple' : 'info'} size="sm" dot={false} /></Campo>
        <Campo rotulo="Fiscal">{c.fiscalNome ?? '—'}{c.substitutoNome && <span style={carteiraDetalhe}> · substituto {c.substitutoNome}</span>}</Campo>
        <Campo rotulo="Portaria">{c.portariaSei ? <NumeroSeiEtiqueta numero={c.portariaSei} testId="fisc-mesa-portaria" /> : <span style={carteiraDetalhe}>não registrada</span>}</Campo>
        <Campo rotulo="SEI do contrato">{c.processoSei ? <NumeroSeiEtiqueta numero={c.processoSei} testId="fisc-mesa-processo" /> : <span style={{ color: 'var(--color-warning-text)' }}>a autuar</span>}</Campo>
        <Campo rotulo="Origem">{c.emendas.length ? `${c.emendas.length === 1 ? 'Emenda' : 'Emendas'} ${c.emendas.slice(0, 3).join(', ')}${c.emendas.length > 3 ? ` +${c.emendas.length - 3}` : ''}` : 'Sem emenda'}</Campo>
        <span style={{ flex: 1 }} />
        {podeAgir && (
          <RowActionsMenu
            label="Mais ações da fiscalização"
            testId="fisc-mesa-mais"
            actions={[
              ...(coordenador ? [{ label: 'Alterar quem fiscaliza', onClick: () => setJanela({ tipo: 'quem' }) }] : []),
              ...(c.processoSei ? [{ label: 'Corrigir o SEI do contrato', onClick: () => setJanela({ tipo: 'processo' }) }] : [])
            ]}
          />
        )}
      </div>

      <section style={bloco} data-testid="fisc-mesa-com-voce">
        <CarteiraDetailLabel>Com {podeAgir ? 'você' : 'o fiscal'}{comVoce.length ? ` · ${comVoce.length}` : ''}</CarteiraDetailLabel>
        <div style={{ ...lista, borderLeft: '4px solid var(--primary)' }}>
          <div style={{ marginTop: '-1px' }}>
            {comVoce.length === 0 ? <div style={{ padding: '0.65rem 0.75rem', borderTop: '1px solid var(--border)', fontWeight: 600 }}>Nada com {podeAgir ? 'você' : 'o fiscal'} agora.</div> : comVoce.map((l) => <LinhaDaMesa key={l.chave} l={l} podeAgir={podeAgir} />)}
          </div>
        </div>
      </section>

      {comOutros.length > 0 && (
        <section style={bloco} data-testid="fisc-mesa-com-outros">
          <CarteiraDetailLabel>Com outros · {comOutros.length}</CarteiraDetailLabel>
          <div style={lista}><div style={{ marginTop: '-1px' }}>{comOutros.map((l) => <LinhaDaMesa key={l.chave} l={l} podeAgir={false} />)}</div></div>
        </section>
      )}

      <section style={bloco} data-testid="fisc-mesa-itens">
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '0.4rem 1rem' }}>
          <CarteiraDetailLabel>Onde está cada item · {es.length}</CarteiraDetailLabel>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
            {grupos.length > GRUPOS_SEM_FILTRO && pendentes.length > 0 && (
              <span role="group" aria-label="Quais beneficiários mostrar" style={{ display: 'inline-flex', gap: '0.5rem' }}>
                <AppButton size="xs" variant={soPendentes ? 'secondary' : 'ghost'} aria-pressed={soPendentes} onClick={() => setSoPendentes(true)}>Com pendência · {pendentes.length}</AppButton>
                <AppButton size="xs" variant={soPendentes ? 'ghost' : 'secondary'} aria-pressed={!soPendentes} onClick={() => setSoPendentes(false)}>Todos · {grupos.length}</AppButton>
              </span>
            )}
            {mostrados.length > 1 && (
              <span style={{ ...carteiraDetalhe, marginTop: 0, display: 'inline-flex', gap: '0.4rem' }}>
                <AppButton size="xs" variant="link" onClick={() => setAbertos(Object.fromEntries(mostrados.map((g) => [chaveDoGrupo(g), true])))}>Abrir todos</AppButton>·
                <AppButton size="xs" variant="link" onClick={() => setAbertos(Object.fromEntries(mostrados.map((g) => [chaveDoGrupo(g), false])))}>Recolher todos</AppButton>
              </span>
            )}
          </span>
        </div>
        {/* Um bloco por beneficiário, no padrão dos "Itens por ata" do Pedido 360; a régua fica na janela do item. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {mostrados.map((g) => {
            const k = chaveDoGrupo(g);
            const vencidos = g.filter((e) => prazoDaEntrega(e).tom === 'danger').length;
            const noExercito = g.filter((e) => e.etapa === 'CONTROLADO').length;
            const pendente = g.some((e) => e.responsavel === 'SFC' && comQuemEstaOItem(e) !== 'FIM');
            const aberto = abertos[k] ?? pendente;
            const emendas = [...new Set(g.map((e) => e.emenda).filter(Boolean))];
            const umaEmenda = emendas.length === 1 && g.every((e) => e.emenda === emendas[0]) ? emendas[0] : null;
            const un = g.reduce((t, e) => t + e.quantidade, 0);
            const entregues = g.filter((e) => e.entregueEm).reduce((t, e) => t + e.quantidade, 0);
            return (
              <section key={k} className={`emendas-bloco-ata${vencidos ? ' emendas-bloco-ata--pend' : ''}`} data-testid={`fisc-mesa-grupo-${k}`}>
                <button type="button" className="emendas-bloco-ata__cab" aria-expanded={aberto} onClick={() => setAbertos((x) => ({ ...x, [k]: !aberto }))}>
                  {aberto ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
                  <span className="emendas-bloco-ata__nome">
                    <strong style={{ color: 'var(--primary)' }}>{g[0].beneficiarioNome ?? rotuloDoBeneficiario(g[0]).principal}</strong>
                    {g[0].beneficiarioSigla && <span className="emendas-bloco-ata__forn"> · {g[0].beneficiarioSigla}</span>}
                    {g[0].municipio && <span className="emendas-bloco-ata__forn"> · {g[0].municipio}/{g[0].uf}</span>}
                    {umaEmenda && <span className="emendas-bloco-ata__forn"> · Emenda {umaEmenda}</span>}
                  </span>
                  <span className="emendas-bloco-ata__num">{itens(g.length)} · {un.toLocaleString('pt-BR')} un · {entregues.toLocaleString('pt-BR')} entregues</span>
                  <span className="emendas-bloco-ata__sit">
                    {vencidos > 0 && <StatusBadge label={vencidos === 1 ? '1 com prazo vencido' : `${vencidos} com prazo vencido`} variant="warning" size="sm" dot={false} />}
                    {noExercito > 0 && <StatusBadge label="aguardando o Exército" variant="danger" size="sm" dot={false} />}
                    {!pendente && <StatusBadge label="concluído" variant="success" size="sm" dot={false} />}
                  </span>
                </button>
                {aberto && (
                  <div className="emendas-bloco-ata__corpo">
                    <DataTable<EntregaFiscalizacao>
                      testId={`fisc-mesa-tabela-${k}`}
                      data={g}
                      keyExtractor={(e) => e.id}
                      className="data-table-container--flush emendas-tabela-topo"
                      rowOpen={(e) => () => setJanela({ tipo: 'item', item: e })}
                      columns={[
                        { key: 'item', header: 'Item', minWidth: '260px', priority: 'primary', sortValue: (e) => nomeDoItem(e), render: (e) => <CelulaItem e={e} comOrigem={!umaEmenda} /> },
                        { key: 'qtd', header: 'Qtd.', align: 'right', nowrap: true, sortValue: (e) => e.quantidade, sortFirstDir: 'desc', render: (e) => <span style={carteiraNumero}>{e.quantidade.toLocaleString('pt-BR')}</span> },
                        { key: 'etapa', header: 'Etapa', minWidth: '230px', sortValue: (e) => ordemDaSituacao(e), render: (e) => <CelulaSituacaoDoItem e={e} /> }
                      ]}
                    />
                  </div>
                )}
              </section>
            );
          })}
          {resto > 0 && (
            <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
              E mais {resto === 1 ? '1 beneficiário' : `${resto} beneficiários`} sem pendência.{' '}
              <AppButton size="xs" variant="link" onClick={() => setSoPendentes(false)}>Ver todos</AppButton>
            </div>
          )}
        </div>
      </section>

      {janela?.tipo === 'etapa' && <MudarEtapaModal entregas={janela.itens} onClose={fechar} />}
      {janela?.tipo === 'prevista' && <PrevistaModal entregas={janela.itens} onClose={fechar} />}
      {janela?.tipo === 'item' && <JanelaDoItem e={janela.item} onClose={fechar} noContrato />}
      {janela?.tipo === 'processo' && <RegistrarProcessoModal contrato={c} onClose={fechar} />}
      {janela?.tipo === 'quem' && <DefinirFiscalizacaoModal contrato={c} onClose={fechar} />}
    </div>
  );
};
