import React, { useMemo, useState } from 'react';
import { usePrecosParaEmenda } from '../../../hooks/useEmendasQuadro';
import { AppButton } from '../../../design-system/components/AppButton';
import { InfoHint } from '../../../design-system/components/InfoHint';
import { NoticeBar } from '../../../design-system/components/NoticeBar';
import { NumeroSeiEtiqueta } from '../../../design-system/components/NumeroSeiEtiqueta';
import { CarteiraDetailLabel } from '../../carteira/CarteiraDetailLabel';
import { carteiraDetalhe } from '../../carteira/carteiraStyles';
import { dataBR } from '../../../utils/emendasKits';
import type { AvisoPedido } from '../../../utils/emendasPedidos';
import { mesaDoPedido, PASSOS_DO_ITEM, LIMITE_COM_VOCE, type AcaoDaMesa, type GrupoDaMesa, type ItemDaMesa, type ItensDaMesa, type LinhaDaMesa, type MesaDoPedido } from '../../../utils/emendasMesa';
import type { BeneficiarioEmenda, ItemCaep, NotaDaLinha, PedidoEmenda } from '../../../services/emendasService';
import type { AoAgir } from '../PedidoAberto';
import { proximaAcaoDaJanela } from '../proximaAcaoDaJanela';
import type { AcaoDaJanela } from '../EtapaPedidoModal';
import type { AcoesCcga } from './Pedido360Header';

interface Props {
  p: PedidoEmenda;
  itens: Map<string, ItemCaep>;
  notas: Map<string, NotaDaLinha>;
  beneficiarios: Map<string, BeneficiarioEmenda>;
  avisos: AvisoPedido[];
  hoje: string;
  podeGerir: boolean;
  onAcao: AoAgir;
  onAlterar: () => void;
  onAnular: () => void;
  /** Envio à CCGA por ata e desfazer o envio (migration 248). */
  ccga?: AcoesCcga;
  /** Informação e Ordem de Fornecimento por contrato (migration 250). */
  onOrdem?: (modo: 'INFORMACAO' | 'ORDEM', contratos: string[]) => void;
}

const COR_DO_TOM: Record<LinhaDaMesa['tom'], string> = {
  vencido: 'var(--color-danger)',
  eu: 'var(--primary)',
  espera: 'var(--color-warning)'
};

const lista: React.CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: '8px',
  overflow: 'hidden'
};
const linhaDaLista: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '12px minmax(0, 1fr)',
  gap: '0.2rem 0.7rem',
  padding: '0.65rem 0.75rem',
  borderTop: '1px solid var(--border)',
  alignItems: 'start'
};
const bloco: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.4rem'
};
const marca = (tom: LinhaDaMesa['tom']): React.CSSProperties =>
  tom === 'espera'
    ? {
        width: 10,
        height: 10,
        borderRadius: '50%',
        border: `2px solid ${COR_DO_TOM[tom]}`,
        marginTop: '0.3rem',
        boxSizing: 'border-box'
      }
    : {
        width: 10,
        height: 10,
        borderRadius: '50%',
        background: COR_DO_TOM[tom],
        marginTop: '0.3rem'
      };

/** O trilho de 6 passos do item (D5): feito em verde, onde está em azul, devolvido em vermelho. */
const Trilho: React.FC<{ passo: number; devolvido: boolean }> = ({ passo, devolvido }) => (
  <span role="img" aria-label={`Passo: ${devolvido ? 'devolvido pela CCGA' : passo < 0 ? 'sem nota' : PASSOS_DO_ITEM[passo]}`} style={{ display: 'inline-flex', gap: '3px', marginTop: '0.2rem' }}>
    {PASSOS_DO_ITEM.map((nome, i) => {
      const fim = passo === PASSOS_DO_ITEM.length - 1;
      const cor = devolvido && i === 1 ? 'var(--color-danger)' : i < passo || (fim && i === passo) ? 'var(--color-success)' : i === passo ? 'var(--primary)' : 'var(--border)';
      return <i key={nome} style={{ width: 16, height: 5, borderRadius: 3, background: cor }} />;
    })}
  </span>
);

const LinhaDoItem: React.FC<{ x: ItemDaMesa }> = ({ x }) => {
  const passo = x.devolvido ? 'Devolvido' : x.passo < 0 ? 'Sem nota' : PASSOS_DO_ITEM[x.passo];
  const cor = x.devolvido ? 'var(--color-danger-text)' : x.passo === PASSOS_DO_ITEM.length - 1 ? 'var(--color-success-text)' : undefined;
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '0.2rem 1rem',
        padding: '0.5rem 0.75rem 0.5rem 1.5rem',
        borderTop: '1px dashed var(--border)'
      }}
      data-testid="pedido360-item"
    >
      <div style={{ minWidth: 0, fontSize: '0.85rem' }}>
        <b>
          {x.quantidade}× {x.nome}
        </b>
        {x.ata && <span style={carteiraDetalhe}> · Ata {x.ata}</span>}
        {x.comVoce && (
          <span
            style={{
              marginLeft: '0.4rem',
              fontSize: '0.75rem',
              fontWeight: 700,
              color: 'var(--primary)'
            }}
          >
            com você
          </span>
        )}
      </div>
      <div style={{ textAlign: 'right', fontSize: '0.78rem' }}>
        <b style={{ color: cor }}>{passo}</b>
        {x.onde && <span style={{ color: '#64748b' }}> · {x.onde}</span>}
        <br />
        <Trilho passo={x.passo} devolvido={x.devolvido} />
      </div>
    </div>
  );
};

const Grupo: React.FC<{
  g: GrupoDaMesa;
  aberto: boolean;
  contagem?: boolean;
}> = ({ g, aberto, contagem }) => (
  <details open={aberto} style={{ borderTop: '1px solid var(--border)' }} data-testid="pedido360-grupo">
    <summary
      style={{
        cursor: 'pointer',
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        gap: '0.2rem 1rem',
        padding: '0.55rem 0.75rem',
        background: 'var(--bg-page, #f8fafc)'
      }}
    >
      <span style={{ fontWeight: 700, fontSize: '0.88rem' }}>
        {g.nome}
        {g.nomeLongo && <span style={{ ...carteiraDetalhe, fontWeight: 400 }}> {g.nomeLongo}</span>}
        {contagem && <span style={{ ...carteiraDetalhe, fontWeight: 400 }}> · {g.itens.reduce((n, x) => n + x.quantidade, 0)} itens</span>}
      </span>
      <span style={{ ...carteiraDetalhe, marginTop: 0 }}>{g.resumo}</span>
    </summary>
    {g.itens.map((x) => (
      <LinhaDoItem key={x.chave} x={x} />
    ))}
  </details>
);

/** Onde está cada item (D5–D8): por beneficiário, um trilho por item; num pedido grande, fecha e filtra. */
const OndeEstaCadaItem: React.FC<{ it: ItensDaMesa }> = ({ it }) => {
  const [soPendentes, setSoPendentes] = useState(true);
  const titulo = (
    <CarteiraDetailLabel>
      Onde está cada item{' '}
      <InfoHint
        label="Sobre os passos dos itens"
        content="Nota, Na CCGA, Contrato, Faturado, Liquidado e Pago. Do contrato em diante, o sistema atualiza pelo Contratos.gov.br e pelo Tesouro."
        testId="pedido360-itens-info"
      />
    </CarteiraDetailLabel>
  );
  if (it.uma)
    return (
      <section style={bloco} data-testid="pedido360-itens">
        {titulo}
        <div
          style={{
            ...lista,
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            gap: '0.4rem 1rem',
            padding: '0.65rem 0.75rem',
            fontSize: '0.88rem'
          }}
        >
          <span>{it.uma.texto}</span>
          <Trilho passo={it.uma.passo} devolvido={false} />
        </div>
      </section>
    );
  if (it.unico)
    return (
      <section style={bloco} data-testid="pedido360-itens">
        {titulo}
        <div style={{ ...lista, borderTop: 'none' }}>
          {it.grupos[0].itens.map((x) => (
            <LinhaDoItem key={x.chave} x={x} />
          ))}
        </div>
      </section>
    );
  const pendentes = it.grupos.filter((g) => g.pendente);
  const mostra = it.grande && soPendentes && pendentes.length ? pendentes : it.grupos;
  const resto = it.grupos.length - mostra.length;
  return (
    <section style={bloco} data-testid="pedido360-itens">
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.4rem 1rem'
        }}
      >
        {titulo}
        {it.grande && pendentes.length > 0 && (
          <div style={{ display: 'flex', gap: '0.5rem' }} role="group" aria-label="Quais beneficiários mostrar">
            <AppButton size="xs" variant={soPendentes ? 'secondary' : 'ghost'} aria-pressed={soPendentes} onClick={() => setSoPendentes(true)} data-testid="pedido360-itens-pendentes">
              Com pendência · {pendentes.length}
            </AppButton>
            <AppButton size="xs" variant={soPendentes ? 'ghost' : 'secondary'} aria-pressed={!soPendentes} onClick={() => setSoPendentes(false)} data-testid="pedido360-itens-todos">
              Todos · {it.grupos.length}
            </AppButton>
          </div>
        )}
      </div>
      <div style={{ ...lista }}>
        {mostra.map((g, i) => (
          <div key={g.chave} style={i === 0 ? { marginTop: '-1px' } : undefined}>
            <Grupo g={g} aberto={!it.grande || g.pendente} contagem={it.grande} />
          </div>
        ))}
        {resto > 0 && (
          <div
            style={{
              padding: '0.5rem 0.75rem',
              borderTop: '1px solid var(--border)',
              fontSize: '0.8rem',
              color: '#64748b'
            }}
          >
            E mais {resto === 1 ? '1 beneficiário' : `${resto} beneficiários`} sem pendência.{' '}
            <AppButton size="xs" variant="link" onClick={() => setSoPendentes(false)}>
              Ver todos
            </AppButton>
          </div>
        )}
      </div>
    </section>
  );
};

/** Caminho do pedido (D12): as 4 fases, os passos da fase atual e o histórico fechado. */
const Caminho: React.FC<{ m: MesaDoPedido; onAcao: AoAgir }> = ({ m, onAcao }) => (
  <section style={bloco} data-testid="pedido360-caminho">
    <CarteiraDetailLabel>Caminho do pedido</CarteiraDetailLabel>
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 140px), 1fr))',
        gap: '0.4rem'
      }}
    >
      {m.fases.map((f) => (
        <div
          key={f.id}
          data-testid={`pedido360-fase-${f.id}`}
          data-estado={f.estado}
          style={{
            border: `1px solid ${f.estado === 'atual' ? 'var(--primary)' : 'var(--border)'}`,
            boxShadow: f.estado === 'atual' ? 'inset 0 3px 0 var(--primary)' : undefined,
            borderRadius: '8px',
            padding: '0.45rem 0.6rem',
            minWidth: 0
          }}
        >
          <div
            style={{
              fontSize: '0.75rem',
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              color: f.estado === 'atual' ? 'var(--primary)' : '#64748b'
            }}
          >
            {f.nome}
          </div>
          <div
            style={{
              fontSize: '0.8rem',
              fontWeight: f.estado === 'feita' ? 600 : 400,
              color: f.estado === 'feita' ? 'var(--color-success-text)' : f.estado === 'vem' ? '#94a3b8' : undefined
            }}
          >
            {f.estado === 'feita' ? '✓ ' : ''}
            {f.texto}
          </div>
        </div>
      ))}
    </div>
    {m.passos.length > 0 && (
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.2rem 0.4rem',
          fontSize: '0.78rem',
          color: '#64748b'
        }}
        data-testid="pedido360-passos"
      >
        <span>Nesta fase:</span>
        {m.passos.map((x, i) => (
          <React.Fragment key={x.nome}>
            {i > 0 && <span aria-hidden="true">›</span>}
            <span
              style={{
                color: x.feito ? 'var(--color-success-text)' : x.atual ? 'var(--primary)' : undefined,
                fontWeight: x.atual ? 700 : undefined
              }}
            >
              {x.feito ? '✓ ' : ''}
              {x.nome}
            </span>
          </React.Fragment>
        ))}
      </div>
    )}
    {m.historico.length > 0 && (
      <details style={{ border: '1px solid var(--border)', borderRadius: '8px' }} data-testid="pedido360-historico">
        <summary
          style={{
            cursor: 'pointer',
            padding: '0.5rem 0.75rem',
            fontWeight: 700,
            fontSize: '0.85rem'
          }}
        >
          Histórico <span style={{ ...carteiraDetalhe, fontWeight: 400 }}>· {m.historico.reduce((n, f) => n + f.registros.length, 0)} registros, por fase</span>
        </summary>
        <div
          style={{
            borderTop: '1px solid var(--border)',
            padding: '0.2rem 0.75rem 0.6rem'
          }}
        >
          {m.historico.map((f) => (
            <div key={f.fase}>
              <div
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: '#94a3b8',
                  paddingTop: '0.55rem'
                }}
              >
                {f.fase}
              </div>
              {f.registros.map((r) => (
                <div
                  key={r.chave}
                  data-testid={`pedido360-historico-${r.chave}`}
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '0.2rem 0.8rem',
                    padding: '0.3rem 0',
                    borderBottom: '1px dashed var(--border)',
                    fontSize: '0.83rem'
                  }}
                >
                  <span
                    style={{
                      color: r.volta ? 'var(--color-danger-text)' : undefined,
                      minWidth: 0
                    }}
                  >
                    {r.texto}
                  </span>
                  <span
                    style={{
                      display: 'inline-flex',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      gap: '0.35rem'
                    }}
                  >
                    {r.data && (
                      <span
                        style={{
                          color: '#64748b',
                          fontVariantNumeric: 'tabular-nums'
                        }}
                      >
                        {r.data}
                      </span>
                    )}
                    {r.sei.map((n) => (
                      <NumeroSeiEtiqueta key={n} numero={n} testId={`pedido360-sei-${r.chave}`} />
                    ))}
                    {r.semSei && <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>sem SEI</span>}
                    {r.maisSei && (
                      <AppButton
                        size="xs"
                        variant="link"
                        onClick={() => onAcao(r.maisSei as AcaoDaJanela)}
                        data-testid={`emendas-pedido-mais-sei-${r.maisSei === 'MAIS_EMPENHADO' ? 'EMPENHADO' : 'CONTRATACAO'}`}
                      >
                        + número SEI
                      </AppButton>
                    )}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </details>
    )}
  </section>
);

/**
 * Aba Andamento do Pedido 360 como mesa de trabalho (protótipo v7 aprovado em 29/10/2026): Com você · Com outros ·
 * Onde está cada item · Caminho do pedido. Os botões de trabalho moram só em "Com você" (D1); o cartão do topo diz
 * onde o pedido está. As linhas saem de `mesaDoPedido`, que só redistribui as regras de antes.
 */
export const AndamentoDoPedido: React.FC<Props> = ({ p, itens, notas, beneficiarios, avisos, hoje, podeGerir, onAcao, onAlterar, onAnular, ccga, onOrdem }) => {
  const { precos } = usePrecosParaEmenda();
  const m = useMemo(() => mesaDoPedido(p, itens, notas, avisos, hoje, podeGerir, beneficiarios, precos), [p, itens, notas, avisos, hoje, podeGerir, beneficiarios, precos]);
  const [todasComVoce, setTodasComVoce] = useState(false);
  const cancelado = p.etapa === 'CANCELADO';

  const agir = (a: AcaoDaMesa) => {
    const f = a.faz;
    switch (f.tipo) {
      case 'proxima':
        return onAcao(proximaAcaoDaJanela(p));
      case 'janela':
        return onAcao(f.acao as AcaoDaJanela, f.numero ? { numero: f.numero } : undefined);
      case 'ccgaEnviar':
        return ccga?.enviar ? ccga.enviar() : onAcao('CONTRATACAO');
      case 'ccgaDesfazer':
        return ccga?.desfazer?.();
      case 'anular':
        return onAnular();
      case 'ordem':
        return onOrdem?.(f.modo, f.contratos);
      case 'pendencia': {
        const b = f.tarefa.botao;
        if (!b) return undefined;
        if (b.tipo === 'proxima') return onAcao(proximaAcaoDaJanela(p));
        if (b.tipo === 'solicitacao')
          return onAcao('SOLICITACAO_ATA', {
            ataKey: b.ataKey,
            numero: b.numero,
            troca: b.troca
          });
        if (b.tipo === 'envio') return onAcao('CGOFI');
        return onAlterar();
      }
    }
  };

  const linha = (l: LinhaDaMesa) => (
    <div key={l.chave} style={linhaDaLista} data-testid={`pedido360-linha-${l.chave}`} data-tom={l.tom}>
      <span style={marca(l.tom)} aria-hidden="true" />
      {/* Texto e ações lado a lado; sem espaço (celular), as ações descem para baixo do texto. */}
      <div
        style={{
          minWidth: 0,
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'flex-start',
          gap: '0.4rem 0.8rem'
        }}
      >
        <div style={{ minWidth: 0, flex: '1 1 260px' }}>
          <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>
            {l.quem && (
              <span
                style={{
                  display: 'inline-block',
                  fontSize: '0.75rem',
                  fontWeight: 800,
                  border: '1px solid var(--border)',
                  borderRadius: '4px',
                  padding: '0 0.35rem',
                  marginRight: '0.4rem',
                  color: '#64748b',
                  verticalAlign: '1px'
                }}
              >
                {l.quem}
              </span>
            )}
            {l.titulo}
          </div>
          {l.detalhe && <div style={{ ...carteiraDetalhe, fontSize: '0.8rem' }}>{l.detalhe}</div>}
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            gap: '0.3rem',
            marginLeft: 'auto'
          }}
        >
          {l.prazo && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.2rem',
                fontSize: '0.8rem',
                fontWeight: 700,
                whiteSpace: 'nowrap',
                color: l.vencido ? 'var(--color-danger-text)' : '#64748b'
              }}
            >
              {l.vencido ? `venceu em ${l.prazo}` : `até ${l.prazo}`}
              {l.regra && <InfoHint label="Regra do prazo" content={l.regra} testId={`pedido360-regra-${l.chave}`} />}
            </span>
          )}
          {l.acoes.length > 0 && (
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'flex-end',
                alignItems: 'center',
                gap: '0.5rem'
              }}
            >
              {l.acoes.map((a) => (
                <AppButton
                  key={a.testId}
                  size={a.jeito === 'botao' ? 'sm' : 'xs'}
                  variant={a.jeito === 'botao' ? 'primary' : a.jeito === 'perigo' ? 'ghostDanger' : 'link'}
                  onClick={() => agir(a)}
                  data-testid={a.testId}
                >
                  {a.rotulo}
                </AppButton>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const comVoce = todasComVoce ? m.comVoce : m.comVoce.slice(0, LIMITE_COM_VOCE);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }} data-testid={`pedido360-andamento-${p.id}`}>
      {cancelado && (
        <NoticeBar tone="info" testId="pedido360-cancelado">
          Cancelado em {dataBR(p.canceladoEm)}: {p.canceladoMotivo}. A quantidade voltou ao saldo da CAEP.
        </NoticeBar>
      )}
      {p.pedidoOrigemId && (
        <NoticeBar tone="info" testId={`emendas-pedido-reaberto-${p.id}`}>
          <b>
            Reaberto da anulação de empenho
            {p.pedidoOrigemNome ? ` do ${p.pedidoOrigemNome}` : ''}.
          </b>{' '}
          Combine com o parlamentar os itens e os beneficiários; depois seguem a minuta, o ofício e a conferência no SIOP, como num pedido novo.
        </NoticeBar>
      )}

      {!cancelado && (
        <section style={bloco} data-testid="pedido360-com-voce">
          <CarteiraDetailLabel>Com você{m.comVoce.length ? ` · ${m.comVoce.length}` : ''}</CarteiraDetailLabel>
          <div style={{ ...lista, borderLeft: '4px solid var(--primary)' }}>
            <div style={{ marginTop: '-1px' }}>
              {m.comVoce.length === 0 ? (
                <div style={{ ...linhaDaLista, gridTemplateColumns: '1fr' }}>
                  <span style={{ fontWeight: 600 }}>Nada com você agora.</span>
                </div>
              ) : (
                comVoce.map(linha)
              )}
              {!todasComVoce && m.comVoce.length > LIMITE_COM_VOCE && (
                <div
                  style={{
                    padding: '0.5rem 0.75rem',
                    borderTop: '1px solid var(--border)'
                  }}
                >
                  <AppButton size="xs" variant="link" onClick={() => setTodasComVoce(true)}>
                    e mais {m.comVoce.length - LIMITE_COM_VOCE}
                  </AppButton>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {m.comOutros.length > 0 && (
        <section style={bloco} data-testid="pedido360-com-outros">
          <CarteiraDetailLabel>Com outros · {m.comOutros.length}</CarteiraDetailLabel>
          <div style={lista}>
            <div style={{ marginTop: '-1px' }}>{m.comOutros.map(linha)}</div>
          </div>
        </section>
      )}

      {m.itens && <OndeEstaCadaItem it={m.itens} />}

      <Caminho m={m} onAcao={onAcao} />

      {p.observacao && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          <span style={carteiraDetalhe}>Observação</span>
          <InfoHint label="Ver a observação do pedido" content={p.observacao} testId={`emendas-pedido-observacao-${p.id}`} />
        </div>
      )}
      {p.origem === 'PLANILHA' && <div style={carteiraDetalhe}>Pedido trazido do controle anterior da CAEP: as etapas sem data não tinham data registrada lá.</div>}
    </div>
  );
};
