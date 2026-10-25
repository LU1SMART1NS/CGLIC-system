import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { DataTable, type Column } from '../../design-system/components/DataTable';
import { StatusBadge, type StatusBadgeVariant } from '../../design-system/components/StatusBadge';
import { AppButton } from '../../design-system/components/AppButton';
import { ActionButton } from '../../design-system/components/ActionButton';
import { NumeroSeiEtiqueta } from '../../design-system/components/NumeroSeiEtiqueta';
import { carteiraDetalhe, carteiraNumero } from '../carteira/carteiraStyles';
import { CarteiraDetailLabel } from '../carteira/CarteiraDetailLabel';
import { buildAtaPath } from '../../hooks/useAta';
import { formatCurrency, formatNumber } from '../../utils/format';
import { avisoIndicacaoDias, dataBR, diasEntre } from '../../utils/emendasKits';
import { numeroDaChave } from '../../utils/contractKeyUtils';
import {
  ataDaLinha,
  avisoGrave,
  chaveDoContratoDaEmenda,
  itensDaLinha,
  jaEmpenhado,
  linhasPorAta,
  ORDEM_ETAPA,
  rodadasDoPedido,
  situacaoDaLinha,
  solicitacoesAssinadasSemEnvio,
  valorDaLinha,
  type GrupoDeLinhas,
  type RodadaDoPedido,
  type TarefaDoPedido
} from '../../utils/emendasPedidos';
import type { BeneficiarioEmenda, ConferenciaEmpenho, ItemCaep, LinhaPedido, NotaDaLinha, PedidoEmenda } from '../../services/emendasService';
import { chaveAvisoEmpenho, etiquetaDaConferencia, type EtiquetaConferencia } from '../../utils/emendasEmpenho';
import type { PrecoPrevisto } from '../../services/emendasQuadroService';
import { BeneficiarioDaLinha, LinhaDoPedido, SituacaoDaLinhaEtiqueta, ValorPrevisto } from './emendasPartes';
import type { AcaoDaJanela, ContextoDaJanela } from './EtapaPedidoModal';

export type AoAgir = (acao: AcaoDaJanela, contexto?: ContextoDaJanela) => void;

/** Contrato da linha: o achado no Contratos.gov.br (link para quem vê contratos) ou o número do controle anterior. */
const ContratoDaLinha: React.FC<{ linha: LinhaPedido; nota: NotaDaLinha | undefined; podeVerContratos: boolean }> = ({ linha, nota, podeVerContratos }) => {
  const chave = nota?.contractKey ?? chaveDoContratoDaEmenda(linha.contratoNumero);
  const numero = nota?.contractKey ? numeroDaChave(nota.contractKey) : linha.contratoNumero;
  if (!numero) return null;
  return (
    <div style={carteiraDetalhe}>
      Contrato{' '}
      {podeVerContratos && chave ? (
        <Link to={`/contratos/${encodeURIComponent(chave)}`} onClick={(e) => e.stopPropagation()} style={{ color: 'var(--primary)', fontWeight: 700 }}>
          {numero}
        </Link>
      ) : (
        numero
      )}
      {!nota?.contractKey && ' · do controle anterior da CAEP'}
    </div>
  );
};

/** Quanto a nota da emenda tem do item da linha (soma da emenda), só depois do empenho. */
const ConferenciaDaLinha: React.FC<{ p: PedidoEmenda; linha: LinhaPedido; conferencia?: Map<string, ConferenciaEmpenho>; resolvidos?: { has: (chave: string) => boolean } }> = ({ p, linha, conferencia, resolvidos }) => {
  if (!conferencia || !p.siopEmenda || !linha.itemKey || !jaEmpenhado(p.etapa)) return null;
  const c = conferencia.get(`${p.siopEmenda}|${linha.itemKey}`);
  const e = etiquetaDaConferencia(c, Boolean(c && resolvidos?.has(chaveAvisoEmpenho(c))));
  if (!e) return null;
  return (
    <div style={{ marginTop: '0.25rem' }} title={e.dica} data-testid={`emendas-linha-conferencia-${linha.id}`}>
      <StatusBadge label={e.texto} variant={VARIANTE_CONFERENCIA[e.tom]} size="sm" dot={false} />
    </div>
  );
};

interface BlocosProps {
  p: PedidoEmenda;
  itens: Map<string, ItemCaep>;
  beneficiarios: Map<string, BeneficiarioEmenda>;
  notas: Map<string, NotaDaLinha>;
  precos?: Map<string, PrecoPrevisto>;
  podeGerir: boolean;
  podeVerContratos: boolean;
  hoje: string;
  /** Item de onde o gestor veio (Item 360 › Emendas): as linhas dele ficam em destaque e a ata delas abre. */
  itemDeOrigem?: string | null;
  onAcao: AoAgir;
  /** Empenhado × pedido (migration 187), por `emenda|item`: a etiqueta "X de Y na nota" de cada linha. */
  conferencia?: Map<string, ConferenciaEmpenho>;
  resolvidos?: { has: (chave: string) => boolean };
}

const VARIANTE_CONFERENCIA: Record<EtiquetaConferencia['tom'], StatusBadgeVariant> = { ok: 'success', mais: 'danger', menos: 'warning', cinza: 'neutral' };

/** Pendências da ata para o cabeçalho do bloco: sem beneficiário, aguardando a solicitação, sem nota ligada, ata vencendo. */
function pendenciasDoGrupo(p: PedidoEmenda, g: GrupoDeLinhas, notas: Map<string, NotaDaLinha>, hoje: string): string[] {
  const out: string[] = [];
  const situacoes = g.linhas.map((l) => situacaoDaLinha(p, l, notas));
  const semBeneficiario = g.linhas.filter((l) => !l.beneficiarioId).length;
  if (semBeneficiario) out.push(semBeneficiario === 1 ? '1 sem beneficiário' : `${semBeneficiario} sem beneficiário`);
  const aguardam = situacoes.filter((s) => s.situacao === 'SOLICITACAO_A_INFORMAR' || s.situacao === 'AGUARDANDO_ASSINATURA').length;
  if (aguardam) out.push(aguardam === 1 ? '1 aguarda a solicitação' : `${aguardam} aguardam a solicitação`);
  const semNota = situacoes.filter((s) => s.pendente && ['EMPENHADO', 'NA_CCGA', 'CONTRATADO'].includes(s.situacao)).length;
  if (semNota) out.push(semNota === 1 ? '1 sem nota ligada' : `${semNota} sem nota ligada`);
  if (g.vigenciaFinal && p.etapa !== 'CANCELADO' && situacoes.some((s) => s.situacao !== 'CONTRATADO')) {
    const dias = diasEntre(hoje, g.vigenciaFinal);
    if (dias < 0) out.push('ata encerrada');
    else if (dias <= avisoIndicacaoDias()) out.push(`vence em ${dias} ${dias === 1 ? 'dia' : 'dias'}`);
  }
  return out;
}

/**
 * Linhas do pedido em blocos por ata, que recolhem (migration 180): o cabeçalho já diz fornecedor, vigência, itens,
 * valor e pendências; dentro, as solicitações de empenho da ata (uma por rodada, com as linhas que cada uma cobre) e
 * as linhas com a situação de cada uma. O bloco nasce aberto só com pendência ou com o item de onde o gestor veio.
 */
export const LinhasPorAta: React.FC<BlocosProps> = ({ p, itens, beneficiarios, notas, precos, podeGerir, podeVerContratos, hoje, itemDeOrigem, onAcao, conferencia, resolvidos }) => {
  const grupos = linhasPorAta(p, itens);
  const temItem = (l: LinhaPedido) => Boolean(itemDeOrigem) && itensDaLinha(l).some((x) => x.itemKey === itemDeOrigem);
  const depoisDaSolicitacao = ORDEM_ETAPA[p.etapa] >= ORDEM_ETAPA.SOLICITADO;
  const autorizado = ORDEM_ETAPA[p.etapa] >= ORDEM_ETAPA.AUTORIZADO;
  const nenhumaInformada = !p.documentos.some((d) => d.etapa === 'AUTORIZACAO');
  // Pedido pequeno (até 3 atas) nasce todo aberto; nos grandes, só a ata com pendência ou com o item de onde o gestor veio.
  const inicial = (g: GrupoDeLinhas) => grupos.length <= 3 || pendenciasDoGrupo(p, g, notas, hoje).length > 0 || g.linhas.some(temItem);
  const [abertos, setAbertos] = useState<Record<string, boolean>>({});
  const aberto = (g: GrupoDeLinhas) => abertos[g.chave] ?? inicial(g);
  const todos = (v: boolean) => setAbertos(Object.fromEntries(grupos.map((g) => [g.chave, v])));

  const colunas: Column<LinhaPedido>[] = [
    {
      key: 'linha',
      header: 'Item ou kit',
      priority: 'primary',
      width: '38%',
      render: (l) => {
        const ata = ataDaLinha(p, l, itens, hoje);
        const s = situacaoDaLinha(p, l, notas);
        return (
          <>
            <LinhaDoPedido linha={l} itens={itens} comLinks />
            {s.solicitacao && (p.documentos.filter((d) => d.etapa === 'AUTORIZACAO' && d.ataKey && itensDaLinha(l).some((x) => d.ataKey === x.itemKey.split('-').slice(0, 2).join('-'))).length > 1) && (
              <div style={carteiraDetalhe}>solicitação {s.solicitacao.numero}</div>
            )}
            {ata && (
              <div style={{ marginTop: '0.3rem' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, borderRadius: 4, padding: '0.25rem 0.45rem', display: 'inline-block', color: avisoGrave(ata) ? 'var(--color-danger-text)' : 'var(--color-warning-text)', background: avisoGrave(ata) ? 'var(--color-danger-bg)' : 'var(--color-warning-bg)' }}>
                  {ata.texto}
                </span>
              </div>
            )}
          </>
        );
      }
    },
    { key: 'ben', header: 'Beneficiário', render: (l) => <BeneficiarioDaLinha linha={l} beneficiarios={beneficiarios} /> },
    { key: 'qtd', header: 'Qtd.', align: 'right', nowrap: true, render: (l) => <span style={carteiraNumero}>{formatNumber(l.quantidade)}</span> },
    { key: 'valor', header: 'Valor', align: 'right', nowrap: true, render: (l) => <ValorPrevisto previsto={valorDaLinha(l, itens, precos)} hoje={valorDaLinha(l, itens)} nota="Previsto para a emenda, com o reajuste das atas (o mesmo do quadro do parlamentar)" /> },
    {
      key: 'situacao',
      header: 'Situação',
      minWidth: '200px',
      render: (l) => (
        <>
          <SituacaoDaLinhaEtiqueta s={situacaoDaLinha(p, l, notas)} testId={`emendas-linha-situacao-${l.id}`} />
          <ContratoDaLinha linha={l} nota={notas.get(l.id)} podeVerContratos={podeVerContratos} />
          <ConferenciaDaLinha p={p} linha={l} conferencia={conferencia} resolvidos={resolvidos} />
        </>
      )
    }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }} data-testid={`emendas-pedido-atas-${p.id}`}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.5rem', flexWrap: 'wrap' }}>
        <CarteiraDetailLabel>
          {grupos.length === 1 ? 'Itens do pedido' : `Itens por ata · ${grupos.length} ${grupos.some((g) => g.chave === 'KITS') ? 'grupos' : 'atas'}`}
        </CarteiraDetailLabel>
        {grupos.length > 1 && (
          <span style={{ ...carteiraDetalhe, display: 'inline-flex', gap: '0.4rem' }}>
            <AppButton size="xs" variant="link" onClick={() => todos(true)} data-testid={`emendas-pedido-abrir-atas-${p.id}`}>
              Abrir todas
            </AppButton>
            ·
            <AppButton size="xs" variant="link" onClick={() => todos(false)} data-testid={`emendas-pedido-recolher-atas-${p.id}`}>
              Recolher todas
            </AppButton>
          </span>
        )}
      </div>
      {grupos.map((g) => {
        const pend = pendenciasDoGrupo(p, g, notas, hoje);
        const estaAberto = aberto(g);
        const un = g.linhas.reduce((s, l) => s + l.quantidade, 0);
        const valor = g.linhas.reduce((s, l) => s + valorDaLinha(l, itens, precos), 0);
        const falta = g.chave !== 'KITS' && depoisDaSolicitacao && g.situacao === 'falta';
        return (
          <section key={g.chave} className={`emendas-bloco-ata${pend.length ? ' emendas-bloco-ata--pend' : ''}`} data-testid={`emendas-pedido-ata-${g.numeroAta ?? 'kits'}`}>
            <button type="button" className="emendas-bloco-ata__cab" aria-expanded={estaAberto} onClick={() => setAbertos((a) => ({ ...a, [g.chave]: !estaAberto }))}>
              {estaAberto ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
              <span className="emendas-bloco-ata__nome">
                {g.numeroAta && g.codigoUasg ? (
                  <Link to={buildAtaPath(g.numeroAta, g.codigoUasg)} onClick={(e) => e.stopPropagation()} className="emendas-bloco-ata__ata" title="Abrir a Ata 360">
                    Ata {g.numeroAta}
                  </Link>
                ) : (
                  <strong>Kits</strong>
                )}
                {g.fornecedor && <span className="emendas-bloco-ata__forn"> · {g.fornecedor}</span>}
                {g.vigenciaFinal && <span className="emendas-bloco-ata__forn"> · até {dataBR(g.vigenciaFinal)}</span>}
              </span>
              <span className="emendas-bloco-ata__num">
                {g.linhas.length} {g.linhas.length === 1 ? 'item' : 'itens'} · {formatNumber(un)} un · {formatCurrency(valor)}
              </span>
              <span className="emendas-bloco-ata__sit">
                {pend.map((x) => (
                  <StatusBadge key={x} label={x} variant="warning" size="sm" dot={false} />
                ))}
              </span>
            </button>
            {estaAberto && (
              <div className="emendas-bloco-ata__corpo">
                {g.chave !== 'KITS' && depoisDaSolicitacao && (
                  <div className="emendas-bloco-ata__sols" data-testid={`emendas-pedido-sols-${g.numeroAta}`}>
                    <span style={{ ...carteiraDetalhe, fontWeight: 700 }}>Solicitação de empenho</span>
                    {g.solicitacoes.map((x, i) => {
                      const cobre = g.linhas.filter((l) => situacaoDaLinha(p, l, notas).solicitacao?.numero === x.numero).length;
                      return (
                        <span key={x.numero} className="emendas-bloco-ata__sol">
                          <NumeroSeiEtiqueta numero={x.numero} testId="emendas-pedido-sei-AUTORIZACAO" />
                          {x.assinadaEm ? (
                            <span>
                              assinada pela Diretora do FNSP em <strong>{dataBR(x.assinadaEm)}</strong>
                            </span>
                          ) : (
                            <span className="emendas-ata__aviso">aguardando a assinatura da Diretora do FNSP</span>
                          )}
                          {g.solicitacoes.length > 1 && <span style={carteiraDetalhe}>· {i + 1}ª rodada</span>}
                          <span style={carteiraDetalhe}>
                            · cobre {cobre} de {g.linhas.length} {g.linhas.length === 1 ? 'item' : 'itens'}
                          </span>
                          {podeGerir && (
                            <AppButton size="xs" variant="link" onClick={() => onAcao('SOLICITACAO_ATA', { ataKey: g.chave, numero: x.numero, troca: true })} data-testid={`emendas-pedido-ata-alterar-${x.numero}`}>
                              {!x.assinadaEm && autorizado ? 'Informar a assinatura' : 'Alterar'}
                            </AppButton>
                          )}
                        </span>
                      );
                    })}
                    {falta && (
                      <span className="emendas-bloco-ata__sol">
                        <span className="emendas-ata__falta">falta</span>
                        {!nenhumaInformada && <span className="emendas-ata__aviso">Esta ata ainda não tem solicitação de empenho.</span>}
                        {podeGerir && (
                          <AppButton size="xs" variant="link" onClick={() => onAcao('SOLICITACAO_ATA', { ataKey: g.chave })} data-testid={`emendas-pedido-ata-informar-${g.numeroAta}`}>
                            Informar a solicitação desta ata
                          </AppButton>
                        )}
                      </span>
                    )}
                    {podeGerir && !falta && (
                      <AppButton size="xs" variant="link" onClick={() => onAcao('SOLICITACAO_ATA', { ataKey: g.chave })} data-testid={`emendas-pedido-ata-mais-${g.numeroAta}`}>
                        + solicitação desta ata (nova rodada)
                      </AppButton>
                    )}
                  </div>
                )}
                <DataTable<LinhaPedido>
                  testId={`emendas-pedido-linhas-${p.id}-${g.chave}`}
                  data={g.linhas}
                  keyExtractor={(l) => l.id}
                  columns={colunas}
                  className="emendas-tabela-topo"
                  // Vindo do Item 360: a linha do item fica com o azul claro de seleção (não é aviso, então não é amarelo).
                  rowStyle={(l) => (temItem(l) ? { background: 'var(--primary-light)' } : undefined)}
                />
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
};

/** A lista "O que falta" do pedido: cada tarefa com o botão da janela de hoje, ou só o aviso. */
export const OQueFalta: React.FC<{ p: PedidoEmenda; tarefas: TarefaDoPedido[]; onAcao: AoAgir; onAlterar: () => void }> = ({ p, tarefas, onAcao, onAlterar }) => {
  if (tarefas.length === 0) return null;
  const botao = (t: TarefaDoPedido) => {
    const b = t.botao;
    if (!b) return null;
    if (b.tipo === 'proxima') {
      return (
        <AppButton size="sm" onClick={() => onAcao(proximaAcaoDaJanela(p))} data-testid={`emendas-pedido-proximo-${p.id}`}>
          {b.rotulo}
        </AppButton>
      );
    }
    if (b.tipo === 'solicitacao') {
      return (
        <AppButton size="sm" variant="outline" onClick={() => onAcao('SOLICITACAO_ATA', { ataKey: b.ataKey, numero: b.numero, troca: b.troca })} data-testid={`emendas-pedido-tarefa-${t.chave}`}>
          {b.rotulo}
        </AppButton>
      );
    }
    if (b.tipo === 'envio') {
      return (
        <AppButton size="sm" onClick={() => onAcao('CGOFI')} data-testid={`emendas-pedido-tarefa-${t.chave}`}>
          {b.rotulo}
        </AppButton>
      );
    }
    return <ActionButton action="editar" size="sm" label={b.rotulo} onClick={onAlterar} data-testid={`emendas-pedido-tarefa-${t.chave}`} />;
  };
  return (
    <div className="emendas-falta" data-testid={`emendas-pedido-falta-${p.id}`}>
      <div className="emendas-falta__topo">
        <CarteiraDetailLabel>O que falta</CarteiraDetailLabel>
        <span style={carteiraDetalhe}>
          {tarefas.length} {tarefas.length === 1 ? 'tarefa' : 'tarefas'}
        </span>
      </div>
      <ol className="emendas-falta__lista">
        {tarefas.map((t) => (
          <li key={t.chave} className={`emendas-falta__item emendas-falta__item--${t.tom}`} data-testid={`emendas-pedido-falta-${t.chave}`}>
            <div style={{ minWidth: 0, flex: '1 1 200px' }}>
              <div className="emendas-falta__titulo">{t.titulo}</div>
              <div style={carteiraDetalhe}>{t.detalhe}</div>
            </div>
            {botao(t)}
          </li>
        ))}
      </ol>
    </div>
  );
};

/**
 * Rodadas de empenho do pedido (protótipo M6 aprovado em 25/10/2026): as solicitações assinadas no mesmo dia, os
 * envios à CGOFI que as levaram e a situação das suas linhas, com o botão para registrar um envio novo.
 */
export const RodadasDoPedido: React.FC<{ p: PedidoEmenda; notas: Map<string, NotaDaLinha>; podeGerir: boolean; onAcao: AoAgir }> = ({ p, notas, podeGerir, onAcao }) => {
  if (p.etapa === 'CANCELADO' || ORDEM_ETAPA[p.etapa] < ORDEM_ETAPA.SOLICITADO) return null;
  const rodadas = rodadasDoPedido(p, notas);
  if (!rodadas.some((r) => r.assinadaEm)) return null;
  const podeEnviar = podeGerir && ORDEM_ETAPA[p.etapa] >= ORDEM_ETAPA.AUTORIZADO && solicitacoesAssinadasSemEnvio(p).length > 0;
  const datas = (xs: Array<{ data: string | null }>) => [...new Set(xs.map((x) => (x.data ? dataBR(x.data) : null)).filter(Boolean))].join(', ');
  const colunas: Column<RodadaDoPedido>[] = [
    {
      key: 'rodada',
      header: 'Rodada',
      priority: 'primary',
      render: (r, i) => (
        <>
          <div style={{ fontWeight: 700 }}>{r.assinadaEm ? `${i + 1}ª rodada` : 'Aguardando a assinatura'}</div>
          {r.assinadaEm && <div style={carteiraDetalhe}>assinada em {dataBR(r.assinadaEm)}</div>}
        </>
      )
    },
    {
      key: 'solicitacoes',
      header: 'Solicitações',
      minWidth: '200px',
      render: (r) => (
        <>
          <div>
            {r.solicitacoes.length === 1 ? '1 solicitação' : `${r.solicitacoes.length} solicitações`} · {r.solicitacoes.length === 1 ? 'ata' : 'atas'}{' '}
            {[...new Set(r.solicitacoes.map((d) => d.ataKey?.split('-')[0]))].join(', ')}
          </div>
          <div style={carteiraDetalhe}>SEI {r.solicitacoes.map((d) => d.numero).join(', ')}</div>
        </>
      )
    },
    {
      key: 'envio',
      header: 'Envio à CGOFI',
      minWidth: '180px',
      render: (r) =>
        r.envios.length > 0 || r.faltaEnvio > 0 ? (
          <>
            {r.envios.length > 0 && (
              <>
                <div>
                  {r.envios.length === 1 ? '1 envio' : `${r.envios.length} envios`} em {datas(r.envios)}
                </div>
                <div style={carteiraDetalhe}>SEI {r.envios.map((e) => e.numero).join(', ')}</div>
              </>
            )}
            {r.faltaEnvio > 0 && (
              <div style={{ fontWeight: 700, color: 'var(--color-warning-text)' }}>
                {r.envios.length > 0 ? `Falta o envio ${r.atasSemEnvio.length === 1 ? 'da ata' : 'das atas'} ${r.atasSemEnvio.join(', ')}` : 'Falta o envio à CGOFI'}
              </div>
            )}
          </>
        ) : r.semRegistro > 0 ? (
          <span style={carteiraDetalhe}>envio não registrado por solicitação</span>
        ) : (
          <span style={carteiraDetalhe}>—</span>
        )
    },
    { key: 'linhas', header: 'Itens', minWidth: '140px', render: (r) => <span style={{ fontWeight: 600 }}>{r.linhas || '—'}</span> }
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }} data-testid={`emendas-pedido-rodadas-${p.id}`}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'space-between', alignItems: 'center' }}>
        <CarteiraDetailLabel>Rodadas de empenho</CarteiraDetailLabel>
        {podeEnviar && (
          <AppButton size="sm" variant="outline" onClick={() => onAcao('CGOFI')} data-testid={`emendas-pedido-registrar-envio-${p.id}`}>
            Registrar envio à CGOFI
          </AppButton>
        )}
      </div>
      <DataTable<RodadaDoPedido>
        testId={`emendas-pedido-rodadas-tabela-${p.id}`}
        className="data-table-container--flush"
        data={rodadas}
        keyExtractor={(r) => r.assinadaEm ?? 'aguardando'}
        columns={colunas}
      />
    </div>
  );
};

/** A ação da janela do próximo passo do pedido (as mesmas regras de proximaAcao). */
function proximaAcaoDaJanela(p: PedidoEmenda): AcaoDaJanela {
  switch (p.etapa) {
    case 'RESERVADO':
      return 'MINUTA';
    case 'MINUTA':
      return 'OFICIO';
    case 'OFICIO':
      return 'CONFERIDO';
    case 'CONFERIDO':
      return 'SOLICITADO';
    case 'SOLICITADO':
      return 'AUTORIZADO';
    case 'AUTORIZADO':
      return 'CGOFI';
    case 'CGOFI':
      return 'EMPENHADO';
    default:
      return 'CONTRATACAO';
  }
}
