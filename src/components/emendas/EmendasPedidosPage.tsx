import React, { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { Check, ChevronDown, ChevronRight, Circle, ClipboardList, Clock, RotateCcw } from 'lucide-react';
import { PageContainer } from '../../design-system/components/PageContainer';
import { PageHeader } from '../../design-system/components/PageHeader';
import { HeaderRefreshAction } from '../../design-system/components/HeaderRefreshAction';
import { DataTable, type Column } from '../../design-system/components/DataTable';
import { StatusBadge, type StatusBadgeVariant } from '../../design-system/components/StatusBadge';
import { ActionButton } from '../../design-system/components/ActionButton';
import { AppButton } from '../../design-system/components/AppButton';
import { ProgressBar } from '../../design-system/components/ProgressBar';
import { numeroDaChave } from '../../utils/contractKeyUtils';
import { CarteiraFilterBar, carteiraCounter } from '../carteira/CarteiraFilterBar';
import { CarteiraFilterButton } from '../carteira/CarteiraFilterButton';
import { CarteiraSegmentTabs } from '../carteira/CarteiraSegmentTabs';
import { CarteiraPagination } from '../carteira/CarteiraPagination';
import { useCarteiraPagination } from '../carteira/useCarteiraPagination';
import { carteiraDetalhe, carteiraSubtitle, carteiraValor } from '../carteira/carteiraStyles';
import { useCarteiraSort, type CarteiraSortColumn } from '../carteira/useCarteiraSort';
import { AdminListShell } from '../admin/shared/AdminListShell';
import {
  hojeEmBrasilia,
  useAutoresEmendas,
  useBeneficiariosEmendas,
  useItensCaep,
  useKitsEmendas,
  usePedidosEmendas,
  usePodeGerirEmendas,
  usePodeVerContratos,
  useNotasDasLinhas
} from '../../hooks/useEmendas';
import { formatCurrency } from '../../utils/format';
import { avisoIndicacaoDias, corteIndicacaoDias, curto, dataBR } from '../../utils/emendasKits';
import {
  ataDaLinha,
  avisoGrave,
  AUTOR_A_DEFINIR,
  avisosDoPedido,
  dataDaEtapa,
  ETAPAS,
  ETAPAS_COM_VARIOS_SEI,
  FASES_PEDIDO,
  faseDaEtapa,
  type FasePedido,
  TOTAL_ETAPAS_PEDIDO,
  contratosDoPedido,
  jaEmpenhado,
  linhasAtivas,
  orgaoDoPedido,
  ORDEM_ETAPA,
  proximaAcao,
  rodadaDoPedido,
  reservadoPorItem,
  ROTULO_ETAPA,
  seiDaEtapa,
  ultimoContatoPorAutor,
  valorDaLinha,
  valorDoPedidoNaEtapa,
  execucaoDoPedido,
  type AvisoPedido
} from '../../utils/emendasPedidos';
import { rotuloBeneficiario, type AutorEmenda, type BeneficiarioEmenda, type EtapaPedido, type ItemCaep, type NotaDaLinha, type PedidoEmenda } from '../../services/emendasService';

const SEM_NOTAS = new Map<string, NotaDaLinha>();
import { AConferirDaLinha, AutorDoPedido, BeneficiarioDaLinha, EmpenhoDaLinha, ExecucaoDoPedidoResumo, LinhaDoPedido, ValorDoPedido, ValorPrevisto } from './emendasPartes';
import { usePrecosParaEmenda } from '../../hooks/useEmendasQuadro';
import { ContatoDoResponsavel } from './ContatoDoResponsavel';
import { AUTOR_A_DEFINIR_CHAVE, PedidosPorAutor } from './PedidosPorAutor';
import { PedidoModal } from './PedidoModal';
import { EtapaPedidoModal, type AcaoDaJanela } from './EtapaPedidoModal';
import { NumeroSeiEtiqueta } from '../../design-system/components/NumeroSeiEtiqueta';

type Segmento = 'todos' | FasePedido | 'CANCELADO';
/** Filtro de etapa dentro da fase; na Contratação separa quem aguarda o contrato de quem já está contratado. */
type FiltroEtapa = '' | Exclude<EtapaPedido, 'CANCELADO' | 'CONTRATACAO'> | 'AGUARDANDO_CONTRATO' | 'CONTRATADO';
type Linha = PedidoEmenda & { valor: number; fonteDoValor: 'EMENDA' | 'PREVISTO'; avisos: AvisoPedido[] };

const POR_PAGINA = 25;
/** Filtro de aviso da lista: um tipo, 'com' (qualquer aviso) ou 'grave' (só os vermelhos, como no cartão do Início). */
const temAviso = (l: { avisos: AvisoPedido[] }, filtro: string) =>
  filtro === 'com' ? l.avisos.length > 0 : filtro === 'grave' ? l.avisos.some(avisoGrave) : l.avisos.some((a) => a.tipo === filtro);
const chaveDaLinha = (p: { id: string }) => p.id;
const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const VARIANTE_ETAPA: Record<EtapaPedido, StatusBadgeVariant> = {
  RESERVADO: 'info',
  MINUTA: 'info',
  OFICIO: 'info',
  CONFERIDO: 'info',
  SOLICITADO: 'info',
  AUTORIZADO: 'info',
  CGOFI: 'info',
  EMPENHADO: 'success',
  CONTRATACAO: 'success',
  CANCELADO: 'neutral'
};

/** Número SEI com o rótulo à esquerda, para todos os números da etapa começarem na mesma coluna. */
const SeiDaEtapa: React.FC<{ rotulo: string; numero: string; testId: string }> = ({ rotulo, numero, testId }) => (
  <div className="emendas-etapa__sei">
    <span style={carteiraDetalhe}>{rotulo}</span>
    <NumeroSeiEtiqueta numero={numero} testId={testId} />
  </div>
);

/**
 * Linha do tempo do pedido em três fases (Interlocução · Empenho · Contratação), com o SEI de cada etapa e as
 * tentativas devolvidas (migration 174). A última etapa, Contratado, vem dos contratos das notas no Contratos.gov.br.
 * Fase concluída começa recolhida; a fase em que o pedido está fica sempre aberta.
 */
const EtapasDoPedido: React.FC<{ p: PedidoEmenda; notas: Map<string, NotaDaLinha>; podeGerir: boolean; podeVerContratos: boolean; onAcao: (acao: AcaoDaJanela) => void }> = ({
  p,
  notas,
  podeGerir,
  podeVerContratos,
  onAcao
}) => {
  const cancelado = p.etapa === 'CANCELADO';
  const atual = ORDEM_ETAPA[p.etapa];
  const rodada = rodadaDoPedido(p);
  const contratos = p.etapa === 'CONTRATACAO' ? contratosDoPedido(p, notas) : null;
  const contratado = Boolean(contratos?.contratado);
  const [abertas, setAbertas] = useState<Record<string, boolean>>({});
  const doPlanilha = p.origem === 'PLANILHA';
  const linhaDaEtapa = (feita: boolean, atualAqui: boolean, voltou: boolean): string =>
    ['emendas-etapa', feita ? 'emendas-etapa--feita' : '', atualAqui ? 'emendas-etapa--atual' : '', voltou ? 'emendas-etapa--voltou' : '', cancelado ? 'emendas-etapa--cancelada' : '']
      .filter(Boolean)
      .join(' ');
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }} data-testid={`emendas-pedido-etapas-${p.id}`}>
      {FASES_PEDIDO.map((fase) => {
        const indices = fase.etapas.map((e) => ORDEM_ETAPA[e]);
        const ultimaFase = fase.etapas.includes('CONTRATACAO');
        const total = fase.etapas.length + (ultimaFase ? 1 : 0);
        const feitas = cancelado ? 0 : indices.filter((i) => i <= atual).length + (ultimaFase && contratado ? 1 : 0);
        const completa = !cancelado && feitas === total;
        const temAtual = !cancelado && (indices.includes(atual) || (ultimaFase && p.etapa === 'CONTRATACAO'));
        const aberta = abertas[fase.nome] ?? (cancelado ? indices.some((i) => i <= atual) || indices[0] === 0 : !completa || (temAtual && !contratado));
        return (
          <section key={fase.nome} className="emendas-fase" data-testid={`emendas-pedido-fase-${fase.nome}`}>
            <button
              type="button"
              className="emendas-fase__cabecalho"
              aria-expanded={aberta}
              onClick={() => setAbertas((a) => ({ ...a, [fase.nome]: !aberta }))}
            >
              {aberta ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
              <span className="emendas-fase__nome">{fase.nome}</span>
              <span className={completa ? 'emendas-fase__conta emendas-fase__conta--completa' : 'emendas-fase__conta'}>
                {feitas}/{total}
                {completa && <Check size={12} aria-hidden="true" />}
              </span>
            </button>
            {aberta && (
              <ol className="emendas-fase__etapas">
                {fase.etapas.map((etapa) => {
                  const e = ETAPAS[ORDEM_ETAPA[etapa]];
                  const i = ORDEM_ETAPA[etapa];
                  const feita = !cancelado && i <= atual;
                  const feitaAntes = cancelado && Boolean(dataDaEtapa(p, etapa) || seiDaEtapa(p, etapa).length);
                  const atualAqui = !cancelado && i === atual;
                  const proxima = !cancelado && i === atual + 1;
                  // Ofício devolvido: a próxima etapa é a nova minuta.
                  const voltou = proxima && etapa === 'MINUTA' && p.devolucoes.length > 0;
                  const comRodada = rodada > 1 && (etapa === 'MINUTA' || etapa === 'OFICIO') && (feita || proxima);
                  // Na carga das planilhas a data da reserva é a da carga, não a da conversa com o parlamentar.
                  const data = doPlanilha && etapa === 'RESERVADO' ? null : dataDaEtapa(p, etapa);
                  const mostraDados = feita || feitaAntes;
                  const seis = mostraDados ? seiDaEtapa(p, etapa) : [];
                  // Nota nova (outro fornecedor): mais um número no empenho ou no envio para contratação.
                  const acrescentar =
                    podeGerir && feita && ETAPAS_COM_VARIOS_SEI.has(etapa) && (etapa === 'EMPENHADO' ? jaEmpenhado(p.etapa) : p.etapa === 'CONTRATACAO');
                  return (
                    <li key={etapa}>
                      <div className={linhaDaEtapa(mostraDados, atualAqui, voltou)}>
                        <span className="emendas-etapa__icone" aria-hidden="true">
                          {mostraDados ? <Check size={14} /> : voltou ? <RotateCcw size={13} /> : <Circle size={10} />}
                        </span>
                        <span className="emendas-etapa__nome">
                          {e.rotulo}
                          {comRodada && <span className="emendas-etapa__rodada">{etapa === 'MINUTA' ? `${rodada}ª minuta` : `${rodada}º ofício`}</span>}
                        </span>
                        <span className="emendas-etapa__data">{mostraDados && data ? dataBR(data) : feita && !doPlanilha && !data ? 'não houve' : ''}</span>
                      </div>
                      {voltou && <div className="emendas-etapa__nota emendas-etapa__nota--aviso">fazer a nova minuta · ofício devolvido</div>}
                      {mostraDados && etapa === 'CONFERIDO' && p.siopEmenda && (
                        <div className="emendas-etapa__nota">
                          emenda {p.siopEmenda}
                          {p.siopGnd ? ` · ${p.siopGnd}` : ''}
                          {p.siopValor != null ? ` · ${formatCurrency(p.siopValor)}` : ''}
                        </div>
                      )}
                      {seis.map((n) => (
                        <SeiDaEtapa key={n} rotulo="Doc." numero={n} testId={`emendas-pedido-sei-${etapa}`} />
                      ))}
                      {mostraDados && etapa === 'OFICIO' && p.oficioProcessoSei && (
                        <SeiDaEtapa rotulo="Processo" numero={p.oficioProcessoSei} testId="emendas-pedido-sei-processo" />
                      )}
                      {acrescentar && (
                        <div className="emendas-etapa__mais">
                          <AppButton size="xs" variant="link" onClick={() => onAcao(`MAIS_${etapa}` as AcaoDaJanela)} data-testid={`emendas-pedido-mais-sei-${etapa}`}>
                            + número SEI
                          </AppButton>
                        </div>
                      )}
                      {etapa === 'MINUTA' && p.devolucoes.length > 0 && (
                        <details className="emendas-etapa__devolucoes" open={voltou} data-testid={`emendas-pedido-devolucoes-${p.id}`}>
                          <summary>{p.devolucoes.length === 1 ? 'Tentativa anterior' : `${p.devolucoes.length} tentativas anteriores`}</summary>
                          <ul>
                            {p.devolucoes.map((d) => (
                              <li key={d.rodada}>
                                <div>
                                  <strong>{d.rodada}ª minuta</strong> {d.minutaEm ? `enviada em ${dataBR(d.minutaEm)}` : 'sem data'}
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', alignItems: 'center' }}>
                                  <strong>{d.rodada}º ofício</strong> {d.oficioEm ? dataBR(d.oficioEm) : ''}
                                  {d.oficioDocumentoSei && <NumeroSeiEtiqueta numero={d.oficioDocumentoSei} testId="emendas-pedido-sei-devolvido" />}
                                </div>
                                <div style={{ color: 'var(--color-danger-text)' }}>
                                  Devolvido em {dataBR(d.devolvidoEm)}: {d.motivo}
                                </div>
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </li>
                  );
                })}
                {ultimaFase && (
                  <li data-testid={`emendas-pedido-contratado-${p.id}`}>
                    <div className={linhaDaEtapa(contratado, false, false)}>
                      <span className="emendas-etapa__icone" aria-hidden="true">
                        {contratado ? <Check size={14} /> : contratos ? <Clock size={13} /> : <Circle size={10} />}
                      </span>
                      <span className="emendas-etapa__nome">Contratado</span>
                      <span className="emendas-etapa__data" />
                    </div>
                    {contratos && (
                      <div className="emendas-etapa__nota">
                        pelo Contratos.gov.br
                        {!contratado && ` · ${contratos.comContrato} de ${contratos.notas} ${contratos.notas === 1 ? 'nota' : 'notas'} com contrato`}
                      </div>
                    )}
                    {contratos?.contratos.map((chave) => (
                      <div key={chave} className="emendas-etapa__sei">
                        <span style={carteiraDetalhe}>Contrato</span>
                        {podeVerContratos ? (
                          <Link to={`/contratos/${encodeURIComponent(chave)}`} className="emendas-etapa__contrato">
                            {numeroDaChave(chave)}
                          </Link>
                        ) : (
                          <span className="emendas-etapa__contrato">{numeroDaChave(chave)}</span>
                        )}
                      </div>
                    ))}
                  </li>
                )}
              </ol>
            )}
          </section>
        );
      })}
    </div>
  );
};

/** Onde o pedido está: a etapa, o progresso e as ações. Fica no topo da coluna das etapas. */
const OndeEstaOPedido: React.FC<{
  p: PedidoEmenda;
  notas: Map<string, NotaDaLinha>;
  podeGerir: boolean;
  onAcao: (acao: AcaoDaJanela) => void;
  onAlterar: () => void;
}> = ({ p, notas, podeGerir, onAcao, onAlterar }) => {
  if (p.etapa === 'CANCELADO') {
    return (
      <div className="emendas-onde emendas-onde--cancelado" data-testid={`emendas-pedido-onde-${p.id}`}>
        Cancelado em {dataBR(p.canceladoEm)}: {p.canceladoMotivo}. A quantidade voltou ao saldo da CAEP.
      </div>
    );
  }
  // Reserva para um órgão (migration 163): antes da minuta, a CAEP indica o parlamentar que assumiu.
  const semAutor = !p.autorId;
  const prox = semAutor ? null : proximaAcao(p.etapa, rodadaDoPedido(p));
  const contratado = p.etapa === 'CONTRATACAO' && contratosDoPedido(p, notas).contratado;
  const posicao = contratado ? TOTAL_ETAPAS_PEDIDO : ORDEM_ETAPA[p.etapa] + 1;
  const semData = p.origem === 'PLANILHA' && ETAPAS.some((e) => e.etapa !== 'RESERVADO' && ORDEM_ETAPA[e.etapa] <= ORDEM_ETAPA[p.etapa] && !dataDaEtapa(p, e.etapa));
  return (
    <div className="emendas-onde" data-testid={`emendas-pedido-onde-${p.id}`}>
      <div className="emendas-onde__topo">
        <StatusBadge label={contratado ? 'Contratado' : ROTULO_ETAPA[p.etapa]} variant={contratado ? 'success' : 'info'} size="sm" dot={false} />
        <span style={carteiraDetalhe}>
          etapa {posicao} de {TOTAL_ETAPAS_PEDIDO}
        </span>
      </div>
      <ProgressBar value={posicao} max={TOTAL_ETAPAS_PEDIDO} showPercent={false} height="4px" colorScheme={contratado ? 'success' : 'primary'} testId={`emendas-pedido-progresso-${p.id}`} />
      {p.etapa === 'CONTRATACAO' && (
        <div style={carteiraDetalhe}>
          {contratado ? 'A CAEP acompanha a execução.' : 'Aguardando a CCGA gerar o contrato no Contratos.gov.br. Atualiza sozinho de hora em hora.'}
        </div>
      )}
      {podeGerir && p.etapa !== 'CONTRATACAO' && (
        <>
          {semAutor && (
            <AppButton size="sm" fullWidth onClick={onAlterar} data-testid={`emendas-pedido-indicar-autor-${p.id}`}>
              Indicar o parlamentar
            </AppButton>
          )}
          {prox && (
            <AppButton size="sm" fullWidth onClick={() => onAcao(prox.acao)} data-testid={`emendas-pedido-proximo-${p.id}`}>
              {prox.rotulo}
            </AppButton>
          )}
          <div style={{ display: 'flex', gap: '0.25rem 0.5rem', flexWrap: 'wrap' }}>
            {/* Às vezes o parlamentar manda o ofício sem minuta da CAEP. */}
            {p.etapa === 'RESERVADO' && !semAutor && <ActionButton action="avancarEtapa" size="xs" label="Já chegou o ofício" onClick={() => onAcao('OFICIO')} />}
            {/* O ofício com divergência volta para a minuta (migration 174). */}
            {p.etapa === 'OFICIO' && (
              <AppButton size="xs" variant="ghostDanger" onClick={() => onAcao('DIVERGENCIA')} data-testid={`emendas-pedido-divergencia-${p.id}`}>
                Ofício com divergência
              </AppButton>
            )}
            {!jaEmpenhado(p.etapa) && (
              <>
                <ActionButton action="editar" size="xs" label="Alterar linhas" onClick={onAlterar} data-testid={`emendas-pedido-alterar-${p.id}`} />
                <ActionButton action="cancelarCiclo" size="xs" label="Cancelar pedido" onClick={() => onAcao('CANCELAR')} data-testid={`emendas-pedido-cancelar-${p.id}`} />
              </>
            )}
          </div>
        </>
      )}
      {semData && <div className="emendas-onde__anterior">Pedido trazido do controle anterior da CAEP: as etapas sem data não tinham data registrada lá.</div>}
    </div>
  );
};

interface DetalheProps {
  p: Linha;
  itens: Map<string, ItemCaep>;
  beneficiarios: Map<string, BeneficiarioEmenda>;
  notas: Map<string, NotaDaLinha>;
  podeGerir: boolean;
  podeVerContratos: boolean;
  hoje: string;
  onAcao: (acao: AcaoDaJanela) => void;
  onAlterar: () => void;
}

const DetalheDoPedido: React.FC<DetalheProps> = ({ p, itens, beneficiarios, notas, podeGerir, podeVerContratos, hoje, onAcao, onAlterar }) => {
  const { precos } = usePrecosParaEmenda();
  const semAutor = !p.autorId;
  const colunas: Column<PedidoEmenda['linhas'][number]>[] = [
    {
      key: 'linha',
      header: 'Item ou kit',
      priority: 'primary',
      width: '42%',
      render: (l) => {
        const ata = ataDaLinha(p, l, itens, hoje);
        return (
          <>
            <LinhaDoPedido linha={l} itens={itens} />
            <AConferirDaLinha linha={l} />
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
    {
      key: 'ben',
      header: 'Beneficiário',
      render: (l) => <BeneficiarioDaLinha linha={l} beneficiarios={beneficiarios} />
    },
    { key: 'valor', header: 'Valor', align: 'right', nowrap: true, render: (l) => <ValorPrevisto previsto={valorDaLinha(l, itens, precos)} hoje={valorDaLinha(l, itens)} nota="Previsto para a emenda, com o reajuste das atas (o mesmo do quadro do parlamentar)" /> },
    { key: 'ne', header: 'Empenho e contrato', nowrap: true, render: (l) => <EmpenhoDaLinha linha={l} achada={notas.get(l.id)} podeVerContratos={podeVerContratos} /> }
  ];
  const canceladas = p.linhas.filter((l) => l.cancelada);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.8fr) minmax(240px, 1fr)', gap: '1rem', padding: '0.4rem 0' }} className="emendas-detalhe-pedido" data-testid={`emendas-pedido-detalhe-${p.id}`}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', minWidth: 0 }}>
        {p.avisos
          .filter((a) => a.tipo === 'semOficio' || a.tipo === 'divergencia')
          .map((a) => (
            <div key={a.tipo} style={{ fontSize: '0.8rem', fontWeight: 600, borderRadius: 6, padding: '0.5rem 0.7rem', color: avisoGrave(a) ? 'var(--color-danger-text)' : 'var(--color-warning-text)', background: avisoGrave(a) ? 'var(--color-danger-bg)' : 'var(--color-warning-bg)' }}>
              {a.texto}
            </div>
          ))}
        <DataTable testId={`emendas-pedido-linhas-${p.id}`} data={linhasAtivas(p)} keyExtractor={(l) => l.id} columns={colunas} className="emendas-tabela-topo" />
        {canceladas.length > 0 && (
          <div style={carteiraSubtitle}>
            {canceladas.length} {canceladas.length === 1 ? 'linha tirada' : 'linhas tiradas'} do pedido: {canceladas.map((l) => l.canceladaMotivo).filter(Boolean).join('; ')}
          </div>
        )}
        {jaEmpenhado(p.etapa) && <ExecucaoDoPedidoResumo execucao={execucaoDoPedido(p, notas)} />}
        {semAutor && (
          <div style={{ fontSize: '0.8rem', color: 'var(--color-warning-text)', background: 'var(--color-warning-bg)', borderRadius: 6, padding: '0.5rem 0.7rem', fontWeight: 600 }}>
            Reserva feita a pedido do órgão, ainda sem parlamentar. Quando um parlamentar ou bancada assumir, use "Indicar o parlamentar" para seguir com a minuta.
          </div>
        )}
        {p.observacao && <div style={carteiraSubtitle}>Observação: {p.observacao}</div>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }} className="emendas-detalhe-pedido__etapas">
        {(p.contatoNome || p.contatoTelefone || p.contatoEmail) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }} data-testid={`emendas-pedido-contato-${p.id}`}>
            <span style={carteiraSubtitle}>Contato na assessoria{p.contatoNome ? `: ${p.contatoNome}` : ''}</span>
            <ContatoDoResponsavel nome={p.contatoNome ?? 'assessoria'} telefone={p.contatoTelefone} email={p.contatoEmail} />
          </div>
        )}
        <OndeEstaOPedido p={p} notas={notas} podeGerir={podeGerir} onAcao={onAcao} onAlterar={onAlterar} />
        <EtapasDoPedido p={p} notas={notas} podeGerir={podeGerir} podeVerContratos={podeVerContratos} onAcao={onAcao} />
      </div>
    </div>
  );
};

/**
 * Pedidos dos parlamentares (migration 157): a reserva já ocupa o saldo da CAEP; o pedido segue até o empenho e então
 * a CAEP só acompanha. Cancelar devolve o saldo.
 */
export const EmendasPedidosPage: React.FC = () => {
  const { data: pedidos = [], isLoading, isFetching, isError, error, refetch, dataUpdatedAt } = usePedidosEmendas();
  const { data: notas = SEM_NOTAS } = useNotasDasLinhas();
  const { data: itensLista = [], isLoading: carregandoItens } = useItensCaep();
  const { data: autores = [] } = useAutoresEmendas();
  const { data: beneficiariosLista = [] } = useBeneficiariosEmendas();
  const { data: kits = [] } = useKitsEmendas();
  const podeGerir = usePodeGerirEmendas();
  const podeVerContratos = usePodeVerContratos();
  const hoje = hojeEmBrasilia();
  // Vindo do Início: ?aviso= (tipo, 'com' ou 'grave'), ?etapa= e ?pedido= (só aquele pedido, já aberto).
  const [searchParams, setSearchParams] = useSearchParams();
  // ?etapa= abre a aba da fase com o filtro daquela etapa (a etapa de contratação abre a fase inteira).
  const etapaDaUrl = searchParams.get('etapa');
  const etapaValida = etapaDaUrl && etapaDaUrl in ORDEM_ETAPA ? (etapaDaUrl as EtapaPedido) : null;
  const [segmento, setSegmentoBruto] = useState<Segmento>(() => (etapaValida === 'CANCELADO' ? 'CANCELADO' : etapaValida ? faseDaEtapa(etapaValida) ?? 'todos' : 'todos'));
  const [filtroEtapa, setFiltroEtapa] = useState<FiltroEtapa>(() =>
    etapaValida && etapaValida !== 'CANCELADO' && etapaValida !== 'CONTRATACAO' ? etapaValida : ''
  );
  const setSegmento = (s: Segmento) => {
    setSegmentoBruto(s);
    setFiltroEtapa('');
  };
  const [filtroAviso, setFiltroAviso] = useState(() => searchParams.get('aviso') ?? '');
  const [soPedido, setSoPedido] = useState(() => searchParams.get('pedido'));
  const [abertos, setAbertos] = useState<ReadonlySet<string>>(() => new Set(soPedido ? [soPedido] : []));
  const [busca, setBusca] = useState('');
  // Ver por autor e filtro de autor ficam no endereço (?ver=autor, ?autor=), para o Voltar do navegador funcionar.
  const porAutor = searchParams.get('ver') === 'autor';
  const filtroAutor = searchParams.get('autor') ?? '';
  const mudarUrl = (mudar: (p: URLSearchParams) => void) =>
    setSearchParams((atual) => {
      const prox = new URLSearchParams(atual);
      mudar(prox);
      return prox;
    });
  const [editando, setEditando] = useState<PedidoEmenda | 'novo' | null>(null);
  const [janela, setJanela] = useState<{ pedido: PedidoEmenda; acao: AcaoDaJanela } | null>(null);

  const itens = useMemo(() => new Map(itensLista.map((i) => [i.itemKey, i])), [itensLista]);
  const autorPorId = useMemo(() => new Map<string, AutorEmenda>(autores.map((a) => [a.id, a])), [autores]);
  const beneficiarios = useMemo(() => new Map(beneficiariosLista.map((b) => [b.id, b])), [beneficiariosLista]);
  const nomeDoBeneficiario = (id: string) => {
    const b = beneficiarios.get(id);
    return b ? rotuloBeneficiario(b) : undefined;
  };
  const { precos } = usePrecosParaEmenda();
  const linhas: Linha[] = useMemo(
    () =>
      pedidos.map((p) => {
        const v = valorDoPedidoNaEtapa(p, itens, precos);
        return { ...p, valor: v.valor, fonteDoValor: v.fonte, avisos: avisosDoPedido(p, itens, hoje, notas) };
      }),
    [pedidos, itens, hoje, notas, precos]
  );

  const contagem = useMemo(() => {
    const c: Record<string, number> = { todos: 0, CANCELADO: 0 };
    for (const l of linhas) {
      const fase = faseDaEtapa(l.etapa);
      if (fase) c[fase] = (c[fase] ?? 0) + 1;
      else c.CANCELADO++;
      if (l.etapa !== 'CANCELADO') c.todos++;
    }
    return c;
  }, [linhas]);

  const doSegmento = useMemo(
    () => linhas.filter((l) => (segmento === 'todos' ? l.etapa !== 'CANCELADO' : segmento === 'CANCELADO' ? l.etapa === 'CANCELADO' : faseDaEtapa(l.etapa) === segmento)),
    [linhas, segmento]
  );
  const etapaDoFiltro = useCallback(
    (l: Linha): FiltroEtapa => (l.etapa === 'CONTRATACAO' ? (contratosDoPedido(l, notas).contratado ? 'CONTRATADO' : 'AGUARDANDO_CONTRATO') : (l.etapa as FiltroEtapa)),
    [notas]
  );
  // Opções do filtro de etapa: as etapas da fase da aba, com a contagem.
  const opcoesDeEtapa = useMemo(() => {
    const fase = FASES_PEDIDO.find((f) => f.id === segmento);
    if (!fase) return [];
    const valores: { value: FiltroEtapa; label: string }[] =
      fase.id === 'CONTRATACAO'
        ? [
            { value: 'AGUARDANDO_CONTRATO', label: 'Aguardando contrato' },
            { value: 'CONTRATADO', label: 'Contratado' }
          ]
        : fase.etapas.map((e) => ({ value: e as FiltroEtapa, label: ROTULO_ETAPA[e] }));
    return valores.map((v) => ({ ...v, count: doSegmento.filter((l) => etapaDoFiltro(l) === v.value).length }));
  }, [segmento, doSegmento, etapaDoFiltro]);
  const filtradas = useMemo(() => {
    const termo = semAcento(busca.trim());
    const textoDoBeneficiario = (id: string | null) => {
      const b = id ? beneficiarios.get(id) : undefined;
      return b ? [b.nome, b.sigla, b.razaoSocial, b.entregaMunicipio, ...b.outrosNomes].filter(Boolean).join(' ') : '';
    };
    return doSegmento
      .filter((l) => !filtroEtapa || etapaDoFiltro(l) === filtroEtapa)
      .filter((l) => !soPedido || l.id === soPedido)
      .filter((l) => !filtroAutor || (filtroAutor === AUTOR_A_DEFINIR_CHAVE ? !l.autorId : l.autorId === filtroAutor))
      .filter((l) => !filtroAviso || temAviso(l, filtroAviso))
      .filter((l) => {
        if (!termo) return true;
        const a = l.autorId ? autorPorId.get(l.autorId) : undefined;
        const textoLinhas = linhasAtivas(l)
          .map((x) => `${(x.tipo === 'KIT' ? x.kitNome : itens.get(x.itemKey ?? '')?.descricao) ?? ''} ${textoDoBeneficiario(x.beneficiarioId)} ${x.contratoNumero ?? ''}`)
          .join(' ');
        return semAcento(`${a?.nome ?? AUTOR_A_DEFINIR} ${l.contatoNome ?? ''} ${a?.uf ?? ''} ${l.oficioProcessoSei ?? ''} ${l.siopEmenda ?? ''} ${ETAPAS.flatMap((e) => seiDaEtapa(l, e.etapa)).join(' ')} ${textoLinhas}`).includes(termo);
      });
  }, [doSegmento, filtroEtapa, etapaDoFiltro, soPedido, filtroAutor, filtroAviso, busca, autorPorId, itens, beneficiarios]);

  // Como nas carteiras: ordena pelo cabeçalho (?ordem=) antes de paginar.
  const ordem = useMemo<Record<string, CarteiraSortColumn<Linha>>>(
    () => ({
      autor: { value: (l) => (l.autorId ? autorPorId.get(l.autorId)?.nome ?? l.autorId : null) },
      valor: { value: (l) => l.valor, firstDir: 'desc' },
      etapa: { value: (l) => ORDEM_ETAPA[l.etapa] },
      aviso: { value: (l) => (l.avisos.length ? l.avisos.length + (l.avisos.some(avisoGrave) ? 100 : 0) : null), firstDir: 'desc' }
    }),
    [autorPorId]
  );
  const { sorted, sortKey, sortDir, toggle } = useCarteiraSort(filtradas, ordem);
  const { currentPage, setPage, pageItems } = useCarteiraPagination(sorted, chaveDaLinha, POR_PAGINA);
  const filtrosAtivos = Boolean(busca.trim() || filtroEtapa || filtroAviso || soPedido || filtroAutor);
  // Autores com pedido na etapa escolhida, os que têm mais pedidos primeiro; "Parlamentar a definir" no fim.
  const opcoesDeAutor = useMemo(() => {
    const conta = new Map<string, number>();
    for (const l of doSegmento) conta.set(l.autorId ?? AUTOR_A_DEFINIR_CHAVE, (conta.get(l.autorId ?? AUTOR_A_DEFINIR_CHAVE) ?? 0) + 1);
    if (filtroAutor && !conta.has(filtroAutor)) conta.set(filtroAutor, 0);
    return [...conta.entries()]
      .map(([value, count]) => ({ value, count, label: value === AUTOR_A_DEFINIR_CHAVE ? AUTOR_A_DEFINIR : autorPorId.get(value)?.nome ?? value }))
      .sort((a, b) => Number(a.value === AUTOR_A_DEFINIR_CHAVE) - Number(b.value === AUTOR_A_DEFINIR_CHAVE) || a.label.localeCompare(b.label, 'pt-BR'));
  }, [doSegmento, filtroAutor, autorPorId]);
  const contaAviso = (tipo: string) => doSegmento.filter((l) => temAviso(l, tipo)).length;

  const colunas: Column<Linha>[] = [
    {
      key: 'autor',
      header: 'Autor',
      priority: 'primary',
      minWidth: '200px',
      sortValue: ordem.autor.value,
      render: (l) => <AutorDoPedido autor={l.autorId ? autorPorId.get(l.autorId) : undefined} autorId={l.autorId} orgao={orgaoDoPedido(l, nomeDoBeneficiario)} destaque />
    },
    {
      key: 'linhas',
      header: 'Itens e kits',
      minWidth: '240px',
      render: (l) => {
        const ativas = linhasAtivas(l);
        const resumo = ativas
          .slice(0, 2)
          .map((x) => (x.tipo === 'KIT' ? `${x.quantidade} ${x.kitNome}` : `${x.quantidade} ${curto(itens.get(x.itemKey ?? '')?.descricao ?? x.itemKey ?? '', 34)}`))
          .join(' · ');
        return (
          <>
            <div style={carteiraValor}>{resumo}</div>
            {ativas.length > 2 && <div style={carteiraDetalhe}>+{ativas.length - 2} {ativas.length - 2 === 1 ? 'linha' : 'linhas'}</div>}
          </>
        );
      }
    },
    { key: 'valor', header: 'Valor', align: 'right', nowrap: true, sortValue: ordem.valor.value, sortFirstDir: 'desc', render: (l) => <ValorDoPedido valor={l.valor} fonte={l.fonteDoValor} /> },
    {
      key: 'etapa',
      header: 'Etapa',
      nowrap: true,
      sortValue: ordem.etapa.value,
      // Sem coluna própria para a reserva (repetia a etapa): o documento que marca a etapa fica embaixo dela.
      render: (l) => {
        // Uma linha só, em texto: a emenda quando já há; antes dela, o processo. O SEI para copiar fica no detalhe.
        const documento = l.siopEmenda ? `Emenda ${l.siopEmenda}` : l.oficioProcessoSei ? `Processo ${l.oficioProcessoSei}` : null;
        return (
          <>
            {etapaDoFiltro(l) === 'CONTRATADO' ? (
              <StatusBadge label="Contratado" variant="success" size="sm" dot={false} />
            ) : (
              <StatusBadge label={ROTULO_ETAPA[l.etapa]} variant={VARIANTE_ETAPA[l.etapa]} size="sm" dot={false} />
            )}
            {documento && <div style={carteiraDetalhe}>{documento}</div>}
          </>
        );
      }
    },
    {
      // Etiqueta curta: o aviso mais grave e "+N"; a frase completa aparece ao parar o mouse e no detalhe da linha.
      key: 'aviso',
      header: 'Aviso',
      nowrap: true,
      sortValue: ordem.aviso.value,
      sortFirstDir: 'desc',
      render: (l) => {
        const [primeiro, ...outros] = l.avisos;
        if (!primeiro) return <span style={carteiraDetalhe}>—</span>;
        return (
          <span title={l.avisos.map((a) => a.texto).join('\n')} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }} data-testid={`emendas-pedido-aviso-${l.id}`}>
            <StatusBadge label={primeiro.curto} variant={avisoGrave(primeiro) ? 'danger' : 'warning'} size="sm" dot={false} />
            {outros.length > 0 && <span style={{ ...carteiraDetalhe, fontWeight: 700 }}>+{outros.length}</span>}
          </span>
        );
      }
    }
  ];

  const nomeDoAutor = (id: string | null) => (id ? autorPorId.get(id)?.nome ?? id : AUTOR_A_DEFINIR);

  return (
    <PageContainer style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <PageHeader
        title="Pedidos"
        subtitle={porAutor ? 'Quanto cada parlamentar ou bancada tem na fase escolhida.' : 'Reservas e ofícios dos parlamentares, da reserva ao empenho.'}
        hint={`A reserva já ocupa o saldo da CAEP: o total reservado de um item nunca passa do alocado à CAEP, e a alocação da CAEP não pode baixar para menos do que está reservado. Etapas em três fases: Interlocução (itens reservados → minuta enviada ao parlamentar → ofício recebido), Empenho (emenda conferida no SIOP → empenho solicitado → empenho autorizado → processo enviado à CGOFI → nota de empenho emitida) e Contratação (processo enviado à CCGA → contratado, quando o contrato de cada nota aparece no Contratos.gov.br). Prazo: o contrato precisa ser assinado antes do fim da ata; a ${avisoIndicacaoDias()} dias do fim o pedido avisa, e a menos de ${corteIndicacaoDias()} dias o sistema não aceita nova reserva nem ofício com itens da ata (os dois prazos ficam em Ajustes > Regras de Alertas). A CAEP também reserva a pedido de um órgão (o beneficiário final) antes de haver parlamentar: a reserva fica com "Parlamentar a definir" e só segue para a minuta quando o parlamentar for indicado. Avisos: mais de 30 dias sem ofício (ou sem parlamentar), divergência com o SIOP, ata vencendo, ata que passou do prazo de indicação ou vencida antes do empenho e linhas a conferir com o controle anterior da CAEP. Pedidos trazidos do controle anterior da CAEP (antes do sistema) trazem o documento SEI do empenho (a nota é achada pelo contrato) e o contrato. Cancelar devolve o saldo. Ver por autor soma os pedidos da fase escolhida pelo preço das atas e o clique no autor abre os pedidos dele; Já empenhado (só em Todos) = pedidos que chegaram ao empenho.`}
        icon={<ClipboardList size={26} color="var(--primary)" aria-hidden="true" />}
        viewToggle={
          <CarteiraSegmentTabs<'pedido' | 'autor'>
            testIdPrefix="emendas-pedidos-ver"
            ariaLabel="Ver por"
            active={porAutor ? 'autor' : 'pedido'}
            onSelect={(v) =>
              mudarUrl((p) => {
                if (v === 'autor') p.set('ver', 'autor');
                else p.delete('ver');
              })
            }
            segments={[
              { id: 'pedido', label: 'Por pedido', title: 'Uma linha por pedido, com as etapas e os botões' },
              { id: 'autor', label: 'Por autor', title: 'Uma linha por parlamentar ou bancada, com os totais' }
            ]}
          />
        }
        actions={
          <>
            {podeGerir && <ActionButton action="novo" label="Nova reserva" onClick={() => setEditando('novo')} disabled={carregandoItens} data-testid="emendas-pedidos-novo" />}
            <HeaderRefreshAction onRefresh={() => refetch()} isRefreshing={isFetching} lastUpdated={dataUpdatedAt || null} dataTestId="emendas-pedidos-atualizar" tooltipTitle="Recarregar os pedidos" />
          </>
        }
      />

      <CarteiraSegmentTabs<Segmento>
        testIdPrefix="emendas-pedidos-etapa"
        ariaLabel="Fase dos pedidos"
        active={segmento}
        onSelect={setSegmento}
        segments={[
          ...FASES_PEDIDO.map((f) => ({ id: f.id as Segmento, label: f.nome, count: contagem[f.id] ?? 0 })),
          { id: 'todos', label: 'Todos', count: contagem.todos },
          { id: 'CANCELADO', label: 'Cancelados', count: contagem.CANCELADO ?? 0 }
        ]}
      />

      {porAutor ? (
        <PedidosPorAutor
          pedidos={doSegmento}
          todasAsEtapas={segmento === 'todos'}
          autores={autores}
          itens={itens}
          isLoading={isLoading || carregandoItens}
          isError={isError}
          errorMessage={(error as Error | null)?.message || 'Falha ao consultar os pedidos.'}
          onRetry={() => refetch()}
          onAbrirAutor={(chave) =>
            mudarUrl((p) => {
              p.delete('ver');
              p.set('autor', chave);
            })
          }
        />
      ) : (
        <>
          <CarteiraFilterBar
            busca={busca}
            searchPlaceholder="Buscar por autor, contato, ofício, SEI, emenda ou item..."
            onChangeBusca={setBusca}
            hasActiveFilters={filtrosAtivos}
            onResetFilters={() => {
              setBusca('');
              setFiltroEtapa('');
              setFiltroAviso('');
              setSoPedido(null);
              if (searchParams.toString()) setSearchParams({}, { replace: true });
            }}
            counter={carteiraCounter(filtradas.length, doSegmento.length, filtrosAtivos, 'pedido', 'pedidos')}
            testIdPrefix="emendas-pedidos"
          >
            {opcoesDeEtapa.length > 0 && (
              <CarteiraFilterButton
                label="Etapa"
                value={filtroEtapa}
                emptyValue=""
                options={opcoesDeEtapa}
                onChange={(v) => setFiltroEtapa(v as FiltroEtapa)}
                testId="emendas-pedidos-filtro-etapa"
              />
            )}
            <CarteiraFilterButton
              label="Autor"
              value={filtroAutor}
              emptyValue=""
              options={opcoesDeAutor}
              onChange={(v) =>
                mudarUrl((p) => {
                  if (v) p.set('autor', v);
                  else p.delete('autor');
                })
              }
              testId="emendas-pedidos-filtro-autor"
            />
            <CarteiraFilterButton
              label="Aviso"
              value={filtroAviso}
              emptyValue=""
              options={[
                { value: 'com', label: 'Com algum aviso', count: contaAviso('com') },
                { value: 'grave', label: 'Pedem ação já (avisos vermelhos)', count: contaAviso('grave') },
                { value: 'semOficio', label: 'Mais de 30 dias sem ofício ou parlamentar', count: contaAviso('semOficio') },
                { value: 'divergencia', label: 'Ofício devolvido (nova minuta)', count: contaAviso('divergencia') },
                { value: 'ataNoCorte', label: 'Passou do prazo de indicação', count: contaAviso('ataNoCorte') },
                { value: 'ataVencendo', label: 'Ata vencendo', count: contaAviso('ataVencendo') },
                { value: 'ataVencida', label: 'Ata vencida', count: contaAviso('ataVencida') },
                { value: 'aConferir', label: 'Linhas a conferir (controle anterior da CAEP)', count: contaAviso('aConferir') },
                { value: 'semNota', label: 'Empenhado com linha sem nota', count: contaAviso('semNota') }
              ]}
              onChange={setFiltroAviso}
              testId="emendas-pedidos-filtro-aviso"
            />
          </CarteiraFilterBar>

          <AdminListShell
            testId="emendas-pedidos-lista"
            isLoading={isLoading || carregandoItens}
            isError={isError}
            errorTitle="Não foi possível carregar os pedidos"
            errorMessage={(error as Error | null)?.message || 'Falha ao consultar os pedidos.'}
            onRetry={() => refetch()}
            isEmpty={!isLoading && !carregandoItens && filtradas.length === 0}
            emptyTitle={pedidos.length === 0 ? 'Nenhum pedido ainda.' : 'Nenhum pedido nesta situação.'}
            emptyDescription={pedidos.length === 0 ? (podeGerir ? 'Use "Nova reserva" quando combinar itens ou kits com um parlamentar.' : 'A CAEP registra as reservas dos parlamentares.') : 'Ajuste a busca ou escolha outra etapa.'}
          >
            <DataTable<Linha>
              testId="emendas-pedidos-tabela"
              className="data-table-container--flush emendas-tabela-topo"
              data={pageItems}
              keyExtractor={chaveDaLinha}
              sort={{ key: sortKey, dir: sortDir }}
              onSort={toggle}
              rowStyle={(l) => (l.etapa === 'CANCELADO' ? { opacity: 0.7 } : undefined)}
              expandedKeys={abertos}
              onToggleExpand={(id) =>
                setAbertos((atual) => {
                  const prox = new Set(atual);
                  if (prox.has(id)) prox.delete(id);
                  else prox.add(id);
                  return prox;
                })
              }
              columns={colunas}
              renderExpanded={(l) => (
                <DetalheDoPedido
                  p={l}
                  itens={itens}
                  beneficiarios={beneficiarios}
                  notas={notas}
                  podeGerir={podeGerir}
                  podeVerContratos={podeVerContratos}
                  hoje={hoje}
                  onAcao={(acao) => setJanela({ pedido: l, acao })}
                  onAlterar={() => setEditando(l)}
                />
              )}
            />
            <CarteiraPagination page={currentPage} pageSize={POR_PAGINA} total={sorted.length} onChange={setPage} testIdPrefix="emendas-pedidos" />
          </AdminListShell>
        </>
      )}

      {editando && (
        <PedidoModal
          pedido={editando === 'novo' ? null : editando}
          autores={autores}
          itens={itensLista}
          kits={kits}
          beneficiarios={beneficiariosLista}
          reservadoFora={reservadoPorItem(pedidos, editando === 'novo' ? undefined : editando.id)}
          ultimoContato={ultimoContatoPorAutor(pedidos)}
          hoje={hoje}
          onClose={() => setEditando(null)}
        />
      )}
      {janela && <EtapaPedidoModal pedido={janela.pedido} acao={janela.acao} itens={itens} nomeDoAutor={nomeDoAutor(janela.pedido.autorId)} onClose={() => setJanela(null)} />}
    </PageContainer>
  );
};
