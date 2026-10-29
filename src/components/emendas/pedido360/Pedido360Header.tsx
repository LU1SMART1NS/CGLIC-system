import React from 'react';
import { Instrument360Hero } from '../../instrument360/Instrument360Hero';
import { HealthTile, HealthTileGrid } from '../../instrument360/HealthStripParts';
import { ActionButton } from '../../../design-system/components/ActionButton';
import { AppButton } from '../../../design-system/components/AppButton';
import { ProgressBar } from '../../../design-system/components/ProgressBar';
import { formatCurrency } from '../../../utils/format';
import { curto, dataBR } from '../../../utils/emendasKits';
import { descricaoItemEmFrase } from '../../../utils/textCase';
import {
  AUTOR_A_DEFINIR,
  avisoGrave,
  contratosDoPedido,
  execucaoDoPedido,
  jaEmpenhado,
  linhasAtivas,
  ORDEM_ETAPA,
  PODE_ANULAR_EMPENHO,
  proximaAcao,
  resumoDasLinhas,
  rodadaDoPedido,
  passoNaContratacao,
  rotuloDaEtapaDoPedido,
  TOTAL_ETAPAS_PEDIDO,
  atasDoPedido,
  type AvisoPedido
} from '../../../utils/emendasPedidos';
import { faltaAnoDaEmenda, nomeDoPedido } from '../../../utils/emendasNomeDoPedido';
import { rotuloBeneficiario, type AutorEmenda, type BeneficiarioEmenda, type ItemCaep, type NotaDaLinha, type PedidoEmenda } from '../../../services/emendasService';
import { ContatoDoResponsavel } from '../ContatoDoResponsavel';
import { linhaDoAutor } from '../emendasPartes';
import type { Pedido360Aba } from './pedido360Abas';

interface Props {
  p: PedidoEmenda;
  autor: AutorEmenda | undefined;
  itens: Map<string, ItemCaep>;
  beneficiarios: Map<string, BeneficiarioEmenda>;
  notas: Map<string, NotaDaLinha>;
  avisos: AvisoPedido[];
  valor: { valor: number; fonte: 'OFICIO' | 'PREVISTO' };
  podeGerir: boolean;
  back: { label: string; back: () => void };
  onProxima: () => void;
  onAlterar: () => void;
  onCancelar: () => void;
  onAnular: () => void;
  /** Ofício retificador (migration 249): só antes do empenho, para quem gere emendas. */
  onRetificador?: () => void;
  /** Envio à CCGA por ata, desfazer o envio e voltar etapa (migration 248): cada um só quando cabe. */
  ccga?: AcoesCcga;
  onAba: (aba: Pedido360Aba) => void;
  /** Abre o Parlamentar 360 (com origem: o Voltar de lá traz de volta a este pedido). */
  onAbrirParlamentar?: () => void;
  /** Abre a Emenda 360 do pedido (o nº da emenda no pé do cartão). */
  onAbrirEmenda?: () => void;
  /** Botão "Captação principal:" abaixo dos indicadores (migration 218), como o "Interesse por GTI:" da Ata 360. */
  verMais?: React.ReactNode;
}

export interface AcoesCcga {
  enviar?: () => void;
  desfazer?: () => void;
  voltar?: () => void;
}

const emendaEmTexto = (numero: string) => (/^\d{8}$/.test(numero) ? `${numero.slice(0, 4)} ${numero.slice(4)}` : numero);

/**
 * Nome curto sem ponto: alguns nomes da CAEP terminam em ponto ("Desktop Básico.") ou têm ponto no meio ("Cadeira de
 * escritório. tipo executiva").
 */
const semPontos = (nome: string) => nome.trim().replace(/\.+$/, '').replace(/\.\s+/g, ' ');
/** Itens nomeados no cartão; os demais ficam em "e mais N itens" (abre a aba Itens). Nome longo cortado com "…". */
const ITENS_NO_CARTAO = 3;
const LIMITE_DO_NOME = 40;

/**
 * Cartão do topo do Pedido 360, no desenho das telas 360 (Instrument360Hero): o pedido como título ("Pedido 1/2026",
 * como "Ata nº" e "Contrato nº") e o parlamentar logo abaixo, porque o número recomeça em cada parlamentar (decisão
 * de 28/10/2026: com o parlamentar no título o cartão parecia o do Parlamentar 360). A etapa como situação e o aviso
 * mais grave em selo, o contato da assessoria e as datas ao lado, quatro indicadores e, no pé, o processo SEI, a
 * emenda (abre a Emenda 360) e o GND. A próxima tarefa é o botão principal.
 */
export const Pedido360Header: React.FC<Props> = ({ p, autor, itens, beneficiarios, notas, avisos, valor, podeGerir, back, onProxima, onAlterar, onCancelar, onAnular, onRetificador, ccga, onAba, onAbrirParlamentar, onAbrirEmenda, verMais }) => {
  const cancelado = p.etapa === 'CANCELADO';
  const ativas = linhasAtivas(p);
  const atas = atasDoPedido(p, itens);
  const contratos = p.etapa === 'CONTRATACAO' ? contratosDoPedido(p, notas) : null;
  const contratado = Boolean(contratos?.contratado);
  const execucao = jaEmpenhado(p.etapa) ? execucaoDoPedido(p, notas) : null;
  const posicao = passoNaContratacao(p, notas)?.posicao ?? ORDEM_ETAPA[p.etapa] + 1;
  const situacao = cancelado ? 'Cancelado' : rotuloDaEtapaDoPedido(p, notas);
  const grave = avisos.find(avisoGrave) ?? null;
  const seguinte = !cancelado && p.autorId ? proximaAcao(p.etapa, rodadaDoPedido(p)) : null;
  const prox = podeGerir ? seguinte : null;
  const resumo = resumoDasLinhas(p, notas);

  const beneficiariosDoPedido = [
    ...new Set(ativas.map((l) => (l.beneficiarioId ? beneficiarios.get(l.beneficiarioId) : undefined)).filter((b): b is BeneficiarioEmenda => Boolean(b)).map((b) => b.sigla?.trim() || rotuloBeneficiario(b)))
  ];
  const para = beneficiariosDoPedido.length
    ? `para ${beneficiariosDoPedido.slice(0, 2).join(' e ')}${beneficiariosDoPedido.length > 2 ? ` e mais ${beneficiariosDoPedido.length - 2}` : ''}`
    : null;
  const nomeDoAutor = autor?.nome ?? (p.autorId ? p.autorId : AUTOR_A_DEFINIR);
  const subtitulo = (
    <span style={{ display: 'inline-flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.25rem 0.5rem' }}>
      {autor && onAbrirParlamentar ? (
        <AppButton size="xs" variant="link" onClick={onAbrirParlamentar} data-testid="pedido-360-abrir-parlamentar">
          {autor.nome}
        </AppButton>
      ) : (
        <span>{nomeDoAutor}</span>
      )}
      {/* Bancada: o nome já diz "Bancada DF"; o tipo e a UF só se repetiriam. */}
      {[autor && autor.tipo !== 'BANCADA' ? linhaDoAutor(autor) : null, para].filter(Boolean).map((t) => (
        <span key={t}>· {t}</span>
      ))}
    </span>
  );
  // O mesmo item aparece uma vez por beneficiário: soma as quantidades pelo nome e mostra os de maior quantidade.
  // "304× nome" e "·" entre os itens: a vírgula fica só dentro dos nomes ("Veículo, tipo Camioneta/SUV").
  const porNome = new Map<string, number>();
  for (const l of ativas) {
    const item = l.tipo === 'KIT' || !l.itemKey ? undefined : itens.get(l.itemKey);
    const nome = l.tipo === 'KIT' ? (l.kitNome ?? 'kit') : semPontos(item?.nomeCurto?.trim() || descricaoItemEmFrase(item?.descricao ?? l.itemKey ?? ''));
    porNome.set(nome, (porNome.get(nome) ?? 0) + l.quantidade);
  }
  const maiores = [...porNome].sort((a, b) => b[1] - a[1]);
  const restantes = maiores.length - ITENS_NO_CARTAO;
  const objeto = ativas.length ? (
    <span data-testid="pedido-360-resumo-itens">
      {ativas.length === 1 ? '1 item' : `${ativas.length} itens`}
      {atas.length > 1 ? ` em ${atas.length} atas` : ''}
      {maiores.slice(0, ITENS_NO_CARTAO).map(([nome, qtd]) => (
        <React.Fragment key={nome}>
          {' · '}
          <span title={nome.length > LIMITE_DO_NOME ? nome : undefined}>
            {qtd}× {curto(nome, LIMITE_DO_NOME)}
          </span>
        </React.Fragment>
      ))}
      {restantes > 0 && (
        <>
          {' · '}
          <AppButton size="xs" variant="link" onClick={() => onAba('itens')} data-testid="pedido-360-mais-itens">
            e mais {restantes === 1 ? '1 item' : `${restantes} itens`}
          </AppButton>
        </>
      )}
    </span>
  ) : (
    'Sem itens.'
  );

  const emenda = p.siopEmenda ? `Emenda ${emendaEmTexto(p.siopEmenda)}${p.siopEmendaAno ? ` / ${p.siopEmendaAno}` : ' · ano a informar'}` : 'Emenda a informar';
  // Troca da emenda na conferência (migration 243): a de antes e o motivo, para não parecer erro de digitação.
  const troca = p.trocasDeEmenda?.at(-1);
  // O título já diz "Pedido": a linha de cima só com a emenda que paga o pedido.
  const eyebrow = troca ? `${emenda} · trocada na conferência (era ${emendaEmTexto(troca.deNumero)} / ${troca.deAno}: ${troca.motivo})` : emenda;

  const datas = [
    // Da planilha não há data de reserva: o título já diz "Reserva da planilha".
    ...(p.origem === 'PLANILHA' ? [] : [{ label: 'Reservado em', value: dataBR(p.reservadoEm) }]),
    ...(p.oficioEm ? [{ label: 'Ofício recebido', value: dataBR(p.oficioEm) }] : []),
    ...(p.empenhadoEm ? [{ label: 'Empenhado em', value: dataBR(p.empenhadoEm) }] : []),
    ...(p.contratacaoEm ? [{ label: 'Enviado à CCGA', value: dataBR(p.contratacaoEm) }] : []),
    ...(cancelado && p.canceladoEm ? [{ label: 'Cancelado em', value: dataBR(p.canceladoEm) }] : [])
  ];

  return (
    <Instrument360Hero
      backLabel={back.label}
      onBack={back.back}
      backTestId="pedido-360-back-btn"
      actions={
        <>
          {podeGerir && PODE_ANULAR_EMPENHO.has(p.etapa) && (
            <AppButton size="sm" variant="link" onClick={onAnular} data-testid={`emendas-pedido-anular-${p.id}`}>
              Registrar anulação de empenho
            </AppButton>
          )}
          {podeGerir && !cancelado && !jaEmpenhado(p.etapa) && (
            <>
              <ActionButton action="cancelarCiclo" size="sm" label="Cancelar pedido" onClick={onCancelar} data-testid={`emendas-pedido-cancelar-${p.id}`} />
              <ActionButton action="editar" size="sm" label={!p.autorId ? 'Indicar o parlamentar' : !p.siopEmenda && !p.emendaId ? 'Informar a emenda' : 'Alterar itens'} onClick={onAlterar} data-testid={`emendas-pedido-alterar-${p.id}`} />
            </>
          )}
          {onRetificador && (
            <AppButton size="sm" variant="link" onClick={onRetificador} data-testid={`emendas-pedido-retificador-${p.id}`}>
              Registrar ofício retificador
            </AppButton>
          )}
          {ccga?.voltar && (
            <AppButton size="sm" variant="link" onClick={ccga.voltar} data-testid={`emendas-pedido-voltar-etapa-${p.id}`}>
              Voltar etapa
            </AppButton>
          )}
          {ccga?.desfazer && (
            <AppButton size="sm" variant="link" onClick={ccga.desfazer} data-testid={`emendas-pedido-desfazer-ccga-${p.id}`}>
              Desfazer envio
            </AppButton>
          )}
          {ccga?.enviar && (
            <AppButton size="sm" onClick={ccga.enviar} data-testid={`emendas-pedido-enviar-ccga-${p.id}`}>
              Enviar à CCGA
            </AppButton>
          )}
          {prox && p.etapa !== 'CONTRATACAO' && (
            <AppButton size="sm" onClick={onProxima} data-testid={`pedido360-proxima-${p.id}`}>
              {prox.rotulo}
            </AppButton>
          )}
        </>
      }
      title={nomeDoPedido(p)}
      eyebrow={eyebrow}
      status={{ faixa: cancelado ? 'EXPIRADO' : 'REGULAR', label: situacao, neutral: true }}
      statusAlert={grave ? grave.curto : undefined}
      dockAlert={grave ? grave.curto : undefined}
      dockSubtitle={`${nomeDoAutor} · ${situacao} · ${ativas.length === 1 ? '1 item' : `${ativas.length} itens`} · ${formatCurrency(valor.valor)}`}
      subtitle={subtitulo}
      objeto={objeto}
      manager={
        podeGerir && (p.contatoNome || p.contatoTelefone || p.contatoEmail) ? (
          <div data-testid={`emendas-pedido-contato-${p.id}`}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Contato na assessoria</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.15rem' }}>
              <span style={{ fontWeight: 700 }}>{p.contatoNome ?? 'assessoria'}</span>
              <ContatoDoResponsavel nome={p.contatoNome ?? 'assessoria'} telefone={p.contatoTelefone} email={p.contatoEmail} />
            </div>
          </div>
        ) : undefined
      }
      dates={datas}
      identifiersTestId="pedido-360-identificadores"
      identifiers={[
        { label: 'Processo SEI', value: p.oficioProcessoSei ?? undefined },
        {
          label: 'Emenda',
          value: p.siopEmenda ? (
            onAbrirEmenda ? (
              <AppButton size="xs" variant="link" onClick={onAbrirEmenda} data-testid="pedido-360-abrir-emenda">
                {emendaEmTexto(p.siopEmenda)}
                {p.siopEmendaAno ? ` / ${p.siopEmendaAno}` : ''}
              </AppButton>
            ) : (
              `${emendaEmTexto(p.siopEmenda)}${p.siopEmendaAno ? ` / ${p.siopEmendaAno}` : ''}`
            )
          ) : undefined
        },
        { label: 'GND', value: p.siopGnd ?? undefined }
      ]}
    >
      <div data-testid="pedido-360-indicadores">
        <HealthTileGrid columns={4}>
          <HealthTile
            label="Etapa"
            value={cancelado ? 'Cancelado' : `${posicao} de ${TOTAL_ETAPAS_PEDIDO}`}
            hint={
              contratos && !contratado
                ? `${contratos.itensContratados} de ${contratos.itens} ${contratos.itens === 1 ? 'item contratado' : 'itens contratados'}`
                : resumo.divergem
                  ? resumo.texto
                  : seguinte
                    ? `próximo: ${seguinte.rotulo.charAt(0).toLowerCase()}${seguinte.rotulo.slice(1)}`
                    : situacao
            }
            onClick={() => onAba('andamento')}
            testId="pedido-360-etapa"
          >
            {!cancelado && <ProgressBar value={posicao} max={TOTAL_ETAPAS_PEDIDO} showPercent={false} height="4px" colorScheme={contratado ? 'success' : 'primary'} />}
          </HealthTile>
          <HealthTile
            label="Valor do pedido"
            value={formatCurrency(valor.valor)}
            hint={valor.fonte === 'OFICIO' ? 'pelo ofício do parlamentar' : 'previsto pelos itens'}
            compact
            onClick={() => onAba('itens')}
            testId="pedido-360-valor"
          />
          <HealthTile
            label="Empenhado"
            value={execucao && execucao.notas > 0 ? formatCurrency(execucao.empenhado) : '—'}
            hint={execucao && execucao.notas > 0 ? `${execucao.notas} ${execucao.notas === 1 ? 'nota' : 'notas'}${execucao.linhasSemNota ? ` · ${execucao.linhasSemNota} sem nota` : ''}` : 'nenhuma nota ainda'}
            tone={execucao && execucao.linhasSemNota > 0 ? 'ATENCAO' : undefined}
            compact
            onClick={() => onAba('execucao')}
            testId="pedido-360-empenhado"
          />
          <HealthTile
            label="Pago"
            value={execucao && execucao.notas > 0 ? formatCurrency(execucao.pago) : '—'}
            hint={
              execucao && execucao.notas > 0
                ? execucao.liquidado - execucao.pago > 0.01
                  ? `${formatCurrency(execucao.liquidado - execucao.pago)} liquidado a pagar`
                  : execucao.pago >= execucao.empenhado - 0.01
                    ? 'tudo pago'
                    : 'nada liquidado ainda'
                : 'nenhuma nota ainda'
            }
            positive={Boolean(execucao && execucao.notas > 0 && execucao.pago >= execucao.empenhado - 0.01)}
            compact
            onClick={() => onAba('execucao')}
            testId="pedido-360-pago"
          />
        </HealthTileGrid>
        {faltaAnoDaEmenda(p) && (
          <div style={{ fontSize: '0.8rem', color: 'var(--color-warning-text)', marginTop: '0.5rem' }} data-testid="pedido-360-sem-ano">
            Sem número: o pedido tem a emenda {emendaEmTexto(p.siopEmenda!)}, mas não o ano. Ele ganha o número quando o ano for informado.
          </div>
        )}
        {verMais}
      </div>
    </Instrument360Hero>
  );
};
