import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ChevronDown, ChevronRight, Circle, CircleDashed, CircleDot, Minus, RotateCcw } from 'lucide-react';
import { InfoHint } from '../../../design-system/components/InfoHint';
import { AppButton } from '../../../design-system/components/AppButton';
import { ActionButton } from '../../../design-system/components/ActionButton';
import { NoticeBar } from '../../../design-system/components/NoticeBar';
import { ProgressBar } from '../../../design-system/components/ProgressBar';
import { NumeroSeiEtiqueta } from '../../../design-system/components/NumeroSeiEtiqueta';
import { carteiraDetalhe } from '../../carteira/carteiraStyles';
import { AcaoEtiqueta, PlanoContadores } from '../../plan/modeloGestaoPlano';
import type { GrupoTarefa } from '../../../utils/modeloGestao';
import { numeroDaChave } from '../../../utils/contractKeyUtils';
import { formatCurrency } from '../../../utils/format';
import { dataBR } from '../../../utils/emendasKits';
import { contratosDoPedido, documentosDaEtapa, ETAPAS_COM_VARIOS_SEI, jaEmpenhado, rodadaDoPedido, seiDaEtapa, solicitacoesSemAta, avisoGrave, type AvisoPedido } from '../../../utils/emendasPedidos';
import { andamentoDoPedido, grupoDaTarefaDoPedido, type EstadoDaTarefa, type TarefaDoAndamento } from '../../../utils/emendasAndamento';
import type { ItemCaep, NotaDaLinha, PedidoEmenda } from '../../../services/emendasService';
import { BotaoDaPendencia, RodadasDoPedido, type AoAgir } from '../PedidoAberto';
import { proximaAcaoDaJanela } from '../proximaAcaoDaJanela';
import type { AcaoDaJanela } from '../EtapaPedidoModal';

interface Props {
  p: PedidoEmenda;
  itens: Map<string, ItemCaep>;
  notas: Map<string, NotaDaLinha>;
  avisos: AvisoPedido[];
  hoje: string;
  podeGerir: boolean;
  podeVerContratos: boolean;
  onAcao: AoAgir;
  onAlterar: () => void;
  onAnular: () => void;
}

const ICONE: Record<EstadoDaTarefa, React.ReactNode> = {
  FEITA: <Check size={14} aria-hidden="true" />,
  COMIGO: <CircleDot size={14} aria-hidden="true" />,
  COBRAR: <CircleDot size={14} aria-hidden="true" />,
  AGUARDANDO: <CircleDot size={14} aria-hidden="true" />,
  FONTE: <CircleDashed size={14} aria-hidden="true" />,
  SEM_FONTE: <CircleDashed size={14} aria-hidden="true" />,
  DEPOIS: <Circle size={12} aria-hidden="true" />,
  NAO_HOUVE: <Minus size={14} aria-hidden="true" />
};
const COR: Record<EstadoDaTarefa, string> = {
  FEITA: 'var(--color-success)',
  COMIGO: 'var(--primary)',
  COBRAR: 'var(--color-danger)',
  AGUARDANDO: 'var(--color-warning)',
  FONTE: '#64748b',
  SEM_FONTE: '#94a3b8',
  DEPOIS: '#cbd5e1',
  NAO_HOUVE: '#cbd5e1'
};
const SITUACAO: Partial<Record<EstadoDaTarefa, string>> = {
  COMIGO: 'com a CAEP',
  COBRAR: 'cobrar resposta',
  AGUARDANDO: 'aguardando resposta',
  FONTE: 'fecha sozinha',
  SEM_FONTE: 'sem fonte',
  NAO_HOUVE: 'não houve'
};

const linhaDaTarefa: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '22px minmax(0, 1fr) auto',
  gap: '0.25rem 0.6rem',
  padding: '0.65rem 0.75rem',
  borderTop: '1px solid var(--border)',
  alignItems: 'start'
};

/** Documentos SEI de uma etapa, com a data de cada um. */
const Documentos: React.FC<{ p: PedidoEmenda; etapa: Parameters<typeof documentosDaEtapa>[1] }> = ({ p, etapa }) => {
  const docs = documentosDaEtapa(p, etapa);
  if (docs.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem 0.6rem', marginTop: '0.35rem' }} data-testid={`pedido360-docs-${etapa}`}>
      {docs.map((d) => (
        <span key={d.numero} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
          <NumeroSeiEtiqueta numero={d.numero} testId={`pedido360-sei-${etapa}`} />
          <span style={carteiraDetalhe}>{d.data ? dataBR(d.data) : 'sem data'}</span>
        </span>
      ))}
    </div>
  );
};

/**
 * Aba Andamento do Pedido 360: as etapas como tarefas, no desenho do Plano de gestão das atas. Junta o "O que falta"
 * e a linha do tempo de antes; os botões abrem as mesmas janelas.
 */
export const AndamentoDoPedido: React.FC<Props> = ({ p, itens, notas, avisos, hoje, podeGerir, podeVerContratos, onAcao, onAlterar, onAnular }) => {
  const andamento = useMemo(() => andamentoDoPedido(p, itens, notas, hoje, podeGerir), [p, itens, notas, hoje, podeGerir]);
  const [filtro, setFiltro] = useState<GrupoTarefa | null>(null);
  const [abertas, setAbertas] = useState<Record<string, boolean>>({});
  const cancelado = p.etapa === 'CANCELADO';

  const extras = (t: TarefaDoAndamento): React.ReactNode => {
    switch (t.chave) {
      case 'minuta': {
        const rodada = rodadaDoPedido(p);
        return (
          <>
            <div style={{ ...carteiraDetalhe, display: 'flex', flexWrap: 'wrap', gap: '0.2rem 0.9rem', marginTop: '0.3rem' }}>
              <span>
                {p.minutaEm ? '✓' : '○'} {rodada > 1 ? `${rodada}ª minuta` : 'Minuta'} {p.minutaEm ? `enviada em ${dataBR(p.minutaEm)}` : p.origem === 'PLANILHA' && t.estado === 'FEITA' ? 'sem data na planilha' : 'ainda não enviada'}
              </span>
              <span>
                {p.oficioEm || t.estado === 'FEITA' ? '✓' : '○'} Ofício {p.oficioEm ? `recebido em ${dataBR(p.oficioEm)}` : t.estado === 'FEITA' ? 'recebido' : 'ainda não chegou'}
              </span>
            </div>
            {p.oficioProcessoSei && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '0.3rem' }}>
                <span style={carteiraDetalhe}>Processo</span>
                <NumeroSeiEtiqueta numero={p.oficioProcessoSei} testId="pedido360-sei-processo" />
              </div>
            )}
            {p.devolucoes.length > 0 && (
              <details style={{ marginTop: '0.35rem' }} data-testid="pedido360-devolucoes">
                <summary style={{ ...carteiraDetalhe, cursor: 'pointer' }}>
                  <RotateCcw size={12} aria-hidden="true" /> {p.devolucoes.length === 1 ? 'Ofício devolvido uma vez' : `Ofício devolvido ${p.devolucoes.length} vezes`}
                </summary>
                <ul style={{ margin: '0.3rem 0 0', paddingLeft: '1.1rem' }}>
                  {p.devolucoes.map((d) => (
                    <li key={d.rodada} style={carteiraDetalhe}>
                      {d.rodada}ª minuta {d.minutaEm ? `em ${dataBR(d.minutaEm)}` : 'sem data'} · ofício {d.oficioEm ? dataBR(d.oficioEm) : 'sem data'} · devolvido em {dataBR(d.devolvidoEm)}: {d.motivo}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {podeGerir && p.etapa === 'RESERVADO' && p.autorId && (
              <div style={{ marginTop: '0.35rem' }}>
                {/* Às vezes o parlamentar manda o ofício sem minuta da CAEP. */}
                <ActionButton action="avancarEtapa" size="xs" label="Já chegou o ofício" onClick={() => onAcao('OFICIO')} />
              </div>
            )}
          </>
        );
      }
      case 'conferir':
        return (
          <>
            {t.estado === 'FEITA' && p.siopEmenda && (
              <div style={{ ...carteiraDetalhe, marginTop: '0.3rem' }}>
                emenda {p.siopEmendaAno ? `${p.siopEmendaAno} · ` : ''}
                {p.siopEmenda.slice(0, 4)} {p.siopEmenda.slice(4)}
                {p.siopGnd ? ` · ${p.siopGnd}` : ''}
                {p.siopValor != null ? ` · ${formatCurrency(p.siopValor)}` : ''}
              </div>
            )}
            {podeGerir && p.etapa === 'OFICIO' && (
              <div style={{ marginTop: '0.35rem' }}>
                {/* O ofício com divergência volta para a minuta (migration 174). */}
                <AppButton size="xs" variant="ghostDanger" onClick={() => onAcao('DIVERGENCIA')} data-testid={`emendas-pedido-divergencia-${p.id}`}>
                  Ofício com divergência
                </AppButton>
              </div>
            )}
          </>
        );
      case 'solicitacao': {
        const soltas = solicitacoesSemAta(p);
        return (
          <>
            <Documentos p={p} etapa="SOLICITADO" />
            {soltas.length > 0 && (
              <div style={{ ...carteiraDetalhe, color: 'var(--color-warning-text)', marginTop: '0.3rem' }}>
                {soltas.length === 1 ? 'Solicitação sem ata' : `${soltas.length} solicitações sem ata`}: {soltas.join(', ')}
                {podeGerir && (
                  <>
                    {' '}
                    <AppButton size="xs" variant="link" onClick={() => onAcao('SOLICITACAO_ATA', { numero: soltas[0] })}>
                      Ligar a uma ata
                    </AppButton>
                  </>
                )}
              </div>
            )}
          </>
        );
      }
      case 'cgofi':
        return (
          <>
            <Documentos p={p} etapa="CGOFI" />
            {/* Envio comprovado pela nota (migration 230): a CAEP completa o documento depois. */}
            {podeGerir && jaEmpenhado(p.etapa) && !p.cgofiDocumentoSei && (
              <AppButton size="xs" variant="link" onClick={() => onAcao('MAIS_CGOFI' as AcaoDaJanela)} data-testid="emendas-pedido-mais-sei-CGOFI">
                Completar o número SEI
              </AppButton>
            )}
            <div style={{ marginTop: '0.4rem' }}>
              <RodadasDoPedido p={p} notas={notas} podeGerir={podeGerir} onAcao={onAcao} />
            </div>
          </>
        );
      case 'empenho':
        return (
          <>
            <Documentos p={p} etapa="EMPENHADO" />
            {podeGerir && jaEmpenhado(p.etapa) && ETAPAS_COM_VARIOS_SEI.has('EMPENHADO') && (
              <AppButton size="xs" variant="link" onClick={() => onAcao('MAIS_EMPENHADO' as AcaoDaJanela)} data-testid="emendas-pedido-mais-sei-EMPENHADO">
                {seiDaEtapa(p, 'EMPENHADO').length ? '+ número SEI' : 'Completar o número SEI'}
              </AppButton>
            )}
          </>
        );
      case 'despacho':
        return (
          <>
            <Documentos p={p} etapa="CONTRATACAO" />
            {podeGerir && p.etapa === 'CONTRATACAO' && (
              <AppButton size="xs" variant="link" onClick={() => onAcao('MAIS_CONTRATACAO' as AcaoDaJanela)} data-testid="emendas-pedido-mais-sei-CONTRATACAO">
                {seiDaEtapa(p, 'CONTRATACAO').length ? '+ número SEI' : 'Completar o número SEI'}
              </AppButton>
            )}
          </>
        );
      case 'contrato': {
        if (p.etapa !== 'CONTRATACAO') return null;
        const contratos = contratosDoPedido(p, notas).contratos;
        if (contratos.length === 0) return null;
        return (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem 0.7rem', marginTop: '0.3rem' }}>
            {contratos.map((chave) =>
              podeVerContratos ? (
                <Link key={chave} to={`/contratos/${encodeURIComponent(chave)}`} style={{ fontWeight: 700, color: 'var(--primary)', fontSize: '0.85rem' }}>
                  Contrato {numeroDaChave(chave)}
                </Link>
              ) : (
                <span key={chave} style={{ fontWeight: 700, fontSize: '0.85rem' }}>
                  Contrato {numeroDaChave(chave)}
                </span>
              )
            )}
          </div>
        );
      }
      default:
        return null;
    }
  };

  const tarefaVisivel = (t: TarefaDoAndamento) => !filtro || grupoDaTarefaDoPedido(t) === filtro;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }} data-testid={`pedido360-andamento-${p.id}`}>
      {cancelado && (
        <NoticeBar tone="info" testId="pedido360-cancelado">
          Cancelado em {dataBR(p.canceladoEm)}: {p.canceladoMotivo}. A quantidade voltou ao saldo da CAEP.
        </NoticeBar>
      )}
      {avisos
        .filter((a) => a.tipo === 'empenhoAnulado')
        .map((a) => (
          <NoticeBar
            key={a.tipo}
            tone="danger"
            testId={`emendas-pedido-aviso-faixa-${a.tipo}`}
            action={
              podeGerir ? (
                <AppButton size="sm" onClick={onAnular} data-testid={`emendas-pedido-registrar-anulacao-${p.id}`}>
                  Registrar anulação
                </AppButton>
              ) : undefined
            }
          >
            <b>Empenho anulado.</b> {a.texto}. Se a nota foi refeita, o aviso some quando o sistema ligar a nota nova.
          </NoticeBar>
        ))}
      {p.pedidoOrigemId && (
        <NoticeBar tone="info" testId={`emendas-pedido-reaberto-${p.id}`}>
          <b>Reaberto da anulação de empenho{p.pedidoOrigemNome ? ` do ${p.pedidoOrigemNome}` : ''}.</b> Combine com o parlamentar os itens e os beneficiários; depois seguem a minuta, o ofício e a conferência no SIOP, como num pedido novo.
        </NoticeBar>
      )}
      {!p.autorId && !cancelado && (
        <NoticeBar tone="warning" testId={`emendas-pedido-sem-autor-${p.id}`}>
          Reserva feita a pedido do órgão, ainda sem parlamentar. Quando um parlamentar ou bancada assumir, use "Indicar o parlamentar" para seguir com a minuta.
        </NoticeBar>
      )}
      {andamento.avisos.map((a) => (
        <NoticeBar key={a.chave} tone={a.tom === 'atencao' && avisos.some((x) => avisoGrave(x) && a.titulo === x.curto) ? 'danger' : a.tom === 'espera' ? 'info' : 'warning'} testId={`pedido360-aviso-${a.chave}`}>
          <b>{a.titulo}.</b> {a.detalhe}
        </NoticeBar>
      ))}

      {!cancelado && <PlanoContadores contagem={andamento.contagem} ativo={filtro} onChange={setFiltro} />}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <span style={carteiraDetalhe}>
          <b style={{ color: 'var(--text-primary, #0f172a)' }}>
            {andamento.feitas} de {andamento.total}
          </b>{' '}
          tarefas feitas
        </span>
        <div style={{ width: '160px', maxWidth: '40vw' }}>
          <ProgressBar value={andamento.feitas} max={Math.max(andamento.total, 1)} showPercent={false} height="6px" colorScheme="primary" testId="pedido360-progresso" />
        </div>
        {filtro && (
          <AppButton size="xs" variant="link" onClick={() => setFiltro(null)}>
            Mostrar todas
          </AppButton>
        )}
      </div>

      {andamento.fases.map((fase) => {
        const visiveis = fase.tarefas.filter(tarefaVisivel);
        if (filtro && visiveis.length === 0) return null;
        const feitas = fase.tarefas.filter((t) => t.estado === 'FEITA').length;
        const contaveis = fase.tarefas.filter((t) => t.estado !== 'NAO_HOUVE').length;
        const completa = contaveis > 0 && feitas === contaveis;
        const aberta = filtro ? true : (abertas[fase.id] ?? !completa);
        return (
          <section key={fase.id} style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }} data-testid={`pedido360-fase-${fase.id}`}>
            <button
              type="button"
              aria-expanded={aberta}
              onClick={() => setAbertas((a) => ({ ...a, [fase.id]: !aberta }))}
              style={{
                all: 'unset',
                boxSizing: 'border-box',
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.55rem 0.75rem',
                background: 'var(--bg-page, #f8fafc)',
                cursor: 'pointer',
                fontWeight: 700,
                fontSize: '0.9rem'
              }}
            >
              {aberta ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
              {fase.nome}
              <span style={{ ...carteiraDetalhe, marginLeft: 'auto', fontWeight: 600 }}>
                {feitas} de {contaveis}
                {completa ? ' · concluída' : ''}
              </span>
            </button>
            {aberta &&
              visiveis.map((t) => {
                const situacao = SITUACAO[t.estado];
                const apagada = t.estado === 'DEPOIS' || t.estado === 'NAO_HOUVE';
                return (
                  <div key={t.chave} style={{ ...linhaDaTarefa, opacity: apagada ? 0.6 : 1 }} data-testid={`pedido360-tarefa-${t.chave}`} data-estado={t.estado}>
                    <span style={{ color: COR[t.estado], display: 'inline-flex', paddingTop: '0.15rem' }} title={situacao}>
                      {ICONE[t.estado]}
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{t.nome}</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.25rem 0.6rem', marginTop: '0.2rem' }}>
                        <AcaoEtiqueta acao={t.acao} comQuem={t.comQuem} />
                        {t.progresso && <span style={carteiraDetalhe}>{t.progresso}</span>}
                      </div>
                      {t.regra && !apagada && t.estado !== 'FEITA' && <div style={{ ...carteiraDetalhe, color: '#94a3b8', marginTop: '0.2rem' }}>Regra: {t.regra}</div>}
                      {extras(t)}
                      {t.pendencias.length > 0 && (
                        <ul style={{ listStyle: 'none', margin: '0.4rem 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                          {t.pendencias.map((x) => (
                            <li
                              key={x.chave}
                              style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '0.3rem 0.6rem', borderLeft: '3px solid var(--border)', paddingLeft: '0.6rem' }}
                              data-testid={`emendas-pedido-falta-${x.chave}`}
                            >
                              <div style={{ minWidth: 0, flex: '1 1 220px' }}>
                                <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{x.titulo}</div>
                                <div style={carteiraDetalhe}>{x.detalhe}</div>
                              </div>
                              {podeGerir && <BotaoDaPendencia p={p} t={x} onAcao={onAcao} onAlterar={onAlterar} />}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.3rem', textAlign: 'right', fontSize: '0.8rem' }}>
                      {t.estado === 'FEITA' ? (
                        <>
                          <span style={{ color: 'var(--color-success-text)', fontWeight: 700 }}>feita</span>
                          {t.feito && <span style={{ fontWeight: 700 }}>{t.feito}</span>}
                        </>
                      ) : (
                        <>
                          {situacao && <span style={{ color: COR[t.estado], fontWeight: 700 }}>{situacao}</span>}
                          {t.prazo && (
                            <span style={{ color: t.vencido ? 'var(--color-danger-text)' : undefined, fontWeight: t.vencido ? 800 : 600 }}>
                              {t.vencido ? `venceu em ${t.prazo}` : `prazo ${t.prazo}`}
                            </span>
                          )}
                          {t.proxima && (
                            <AppButton size="sm" variant={t.estado === 'AGUARDANDO' || t.estado === 'COBRAR' ? 'outline' : 'primary'} onClick={() => onAcao(proximaAcaoDaJanela(p))} data-testid={`emendas-pedido-proximo-${p.id}`}>
                              {t.proxima}
                            </AppButton>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
          </section>
        );
      })}
      {p.observacao && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          <span style={carteiraDetalhe}>Observação</span>
          <InfoHint label="Ver a observação do pedido" content={p.observacao} testId={`emendas-pedido-observacao-${p.id}`} />
        </div>
      )}
      {p.origem === 'PLANILHA' && (
        <div style={carteiraDetalhe}>Pedido trazido do controle anterior da CAEP: as etapas sem data não tinham data registrada lá.</div>
      )}
    </div>
  );
};
