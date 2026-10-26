import React, { useMemo, useState } from 'react';
import { Modal } from '../../design-system/components/Modal';
import { AppButton } from '../../design-system/components/AppButton';
import { ActionButton } from '../../design-system/components/ActionButton';
import { AppInput, AppSelect } from '../../design-system/components/FormFields';
import { NoticeBar } from '../../design-system/components/NoticeBar';
import { useToast } from '../../design-system/components/Toast';
import { hojeEmBrasilia, useAutoresEmendas, useLigarEmendaAoPedido, useNotasSemPedido, usePedidosEmendas } from '../../hooks/useEmendas';
import { documentoSeiDaEtapaValido, lerNumeroDaEmenda, numeroDaEmendaEmTexto } from '../../utils/emendasPedidos';
import { pedidoDaNota, valorIgual, type EmendaSemPedido } from '../../utils/emendasConferenciaNota';
import { formatCurrency } from '../../utils/format';
import type { ModoLigarEmenda, NotaSemPedido, PedidoEmenda } from '../../services/emendasService';

interface Props {
  /** Aberta pela gaveta "Notas sem pedido": a emenda vem pronta e o gestor escolhe o pedido. */
  emenda?: EmendaSemPedido;
  /** Aberta pelo pedido: o pedido vem pronto e o gestor digita a emenda. */
  pedido?: PedidoEmenda;
  onClose: () => void;
}

const emendaEmTexto = (ano: number | null, numero: string): string => `${ano ? `${ano} · ` : ''}${numeroDaEmendaEmTexto(numero)}`;
const caixa: React.CSSProperties = { display: 'flex', gap: '0.5rem', alignItems: 'flex-start', fontSize: '0.85rem', padding: '0.45rem 0.6rem', border: '1px solid var(--color-border, #e2e8f0)', borderRadius: 6, cursor: 'pointer' };
const celula: React.CSSProperties = { padding: '0.35rem 0.5rem', borderTop: '1px solid var(--color-border, #e2e8f0)', verticalAlign: 'top' };
const numero: React.CSSProperties = { ...celula, textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' };

/** Como a nota confere com os itens do fornecedor ainda sem nota no pedido. */
function confere(n: NotaSemPedido, pedidoId: string): { texto: string; tom: 'ok' | 'aviso' | 'nada'; valor: number | null } {
  const c = pedidoDaNota(n, pedidoId);
  if (!c || c.valorSemNota <= 0) return { texto: 'sem item igual', tom: 'nada', valor: null };
  if (valorIgual(c.valorSemNota, n.valorEmpenhado)) return { texto: 'valor igual', tom: 'ok', valor: c.valorSemNota };
  const pct = Math.round(((n.valorEmpenhado - c.valorSemNota) / c.valorSemNota) * 100);
  return { texto: `${pct > 0 ? '+' : ''}${pct}% · confira`, tom: 'aviso', valor: c.valorSemNota };
}

/**
 * Ligar uma emenda ao pedido (migration 211, protótipo aprovado em 26/10/2026). O pedido pode ser empenhado com mais de
 * uma emenda (a do ano e a sobra de uma antiga do mesmo parlamentar). O gestor escolhe se a emenda é outra do pedido ou
 * se o nº conferido estava errado; o sistema só sugere o pedido pelos itens do fornecedor de cada nota.
 */
export const LigarEmendaModal: React.FC<Props> = ({ emenda, pedido: pedidoFixo, onClose }) => {
  const ligar = useLigarEmendaAoPedido();
  const toast = useToast();
  const { data: pedidos = [] } = usePedidosEmendas();
  const { data: autores = [] } = useAutoresEmendas();
  const { data: notasSemPedido = [] } = useNotasSemPedido();
  const anoDeHoje = Number(hojeEmBrasilia().slice(0, 4));

  const [pedidoId, setPedidoId] = useState(pedidoFixo?.id ?? emenda?.sugestao?.pedidoId ?? '');
  const [numeroDigitado, setNumeroDigitado] = useState('');
  const [anoDigitado, setAnoDigitado] = useState(anoDeHoje - 1);
  const [modo, setModo] = useState<ModoLigarEmenda | null>(pedidoFixo ? 'OUTRA' : null);
  const [documento, setDocumento] = useState('');
  const [observacao, setObservacao] = useState('');
  const [tentou, setTentou] = useState(false);

  const nomeDe = (autorId: string | null) => (autorId ? autores.find((a) => a.id === autorId)?.nome ?? 'parlamentar' : 'parlamentar a definir');
  const lido = pedidoFixo ? lerNumeroDaEmenda(numeroDigitado) : null;
  const alvo = emenda ? { numero: emenda.emenda, ano: emenda.ano } : lido ? { numero: lido.numero, ano: lido.ano ?? anoDigitado } : null;
  // Na janela aberta pelo pedido, as notas sem pedido da emenda digitada (entram nos itens ao ligar).
  const notas = emenda?.notas ?? (alvo ? notasSemPedido.filter((n) => n.emenda === alvo.numero && (n.emendaAno == null || n.emendaAno === alvo.ano)) : []);
  const pedido = pedidoFixo ?? pedidos.find((p) => p.id === pedidoId);

  // Pedidos sugeridos primeiro (pelas notas), depois os outros com emenda conferida.
  const opcoes = useMemo(() => {
    if (pedidoFixo) return { sugeridos: [], outros: [] };
    const contagem = new Map<string, number>();
    for (const n of emenda?.notas ?? []) for (const c of n.pedidosProvaveis) if (valorIgual(c.valorSemNota, n.valorEmpenhado)) contagem.set(c.pedidoId, (contagem.get(c.pedidoId) ?? 0) + 1);
    const validos = pedidos.filter((p) => p.etapa !== 'CANCELADO' && p.siopEmenda);
    return {
      sugeridos: validos.filter((p) => contagem.has(p.id)).sort((a, b) => (contagem.get(b.id) ?? 0) - (contagem.get(a.id) ?? 0) || b.numero - a.numero).map((p) => ({ p, iguais: contagem.get(p.id) ?? 0 })),
      outros: validos.filter((p) => !contagem.has(p.id))
    };
  }, [pedidos, emenda, pedidoFixo]);

  const outroCodigo = Boolean(alvo && pedido?.siopEmenda && pedido.siopEmenda.slice(0, 4) !== alvo.numero.slice(0, 4));
  const jaNoPedido = Boolean(
    alvo &&
      pedido &&
      ((pedido.siopEmenda === alvo.numero && (pedido.siopEmendaAno == null || pedido.siopEmendaAno === alvo.ano)) ||
        pedido.outrasEmendas.some((o) => o.numero === alvo.numero && o.ano === alvo.ano))
  );
  const iguais = pedido ? notas.filter((n) => confere(n, pedido.id).tom === 'ok').length : 0;

  const pendencias: string[] = [];
  if (!pedido) pendencias.push('o pedido');
  if (!alvo) pendencias.push('o nº da emenda (8 dígitos)');
  if (!modo) pendencias.push('se é outra emenda do pedido ou se o nº do pedido está errado');
  if (documento.trim() && !documentoSeiDaEtapaValido(documento)) pendencias.push('o documento SEI com 7 a 10 dígitos (ou deixe em branco)');
  if (jaNoPedido) pendencias.push('uma emenda que ainda não esteja no pedido (esta já está)');

  const enviar = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setTentou(true);
    if (pendencias.length || !pedido || !alvo || !modo) return;
    try {
      const r = await ligar.mutateAsync({
        pedidoId: pedido.id,
        versao: pedido.versao,
        numero: alvo.numero,
        ano: alvo.ano ?? anoDigitado,
        modo,
        documentoSei: documento.trim() ? documento.replace(/\D/g, '') : null,
        observacao: observacao.trim() || null
      });
      toast.success(
        `Emenda ${emendaEmTexto(alvo.ano, alvo.numero)} ${modo === 'TROCA' ? 'passou a ser a conferida do' : 'ligada ao'} pedido ${pedido.numero}.` +
          (r.linhasComNotaDaEmenda ? ` ${r.linhasComNotaDaEmenda === 1 ? '1 item recebeu nota' : `${r.linhasComNotaDaEmenda} itens receberam nota`} desta emenda.` : '')
      );
      onClose();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      dismissible={!ligar.isPending}
      size="lg"
      testId="emendas-ligar-emenda-modal"
      title={pedidoFixo ? `Adicionar emenda ao pedido ${pedidoFixo.numero}` : `Ligar a emenda ${emendaEmTexto(emenda?.ano ?? null, emenda?.emenda ?? '')} a um pedido`}
      footer={
        <>
          <ActionButton action="cancelar" type="button" onClick={onClose} disabled={ligar.isPending} />
          <AppButton type="submit" form="emendas-ligar-emenda-form" variant="primary" disabled={ligar.isPending} isLoading={ligar.isPending} data-testid="emendas-ligar-emenda-salvar">
            {modo === 'TROCA' ? 'Trocar o nº do pedido' : 'Ligar emenda ao pedido'}
          </AppButton>
        </>
      }
    >
      <form id="emendas-ligar-emenda-form" onSubmit={enviar} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
        {emenda?.planoInterno && <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Plano interno das notas: {emenda.planoInterno}</div>}

        {pedidoFixo ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: '0.6rem' }}>
            <AppSelect label="Ano da emenda" value={String(anoDigitado)} onChange={(e) => setAnoDigitado(Number(e.target.value))} data-testid="emendas-ligar-emenda-ano">
              {Array.from({ length: 6 }, (_, i) => anoDeHoje - i).map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </AppSelect>
            <AppInput
              label="Nº da emenda"
              placeholder="Ex.: 7107 0011"
              hint="8 dígitos. Pode colar o código do SIOP com o ano."
              inputMode="numeric"
              value={numeroDigitado}
              onChange={(e) => {
                const l = lerNumeroDaEmenda(e.target.value);
                if (l?.ano) {
                  setAnoDigitado(l.ano);
                  setNumeroDigitado(numeroDaEmendaEmTexto(l.numero));
                } else setNumeroDigitado(e.target.value);
              }}
              error={tentou && !alvo ? 'Informe os 8 dígitos da emenda.' : undefined}
              data-testid="emendas-ligar-emenda-numero"
            />
          </div>
        ) : (
          <AppSelect label="Pedido" value={pedidoId} onChange={(e) => setPedidoId(e.target.value)} error={tentou && !pedido ? 'Escolha o pedido.' : undefined} data-testid="emendas-ligar-emenda-pedido">
            <option value="">Escolha o pedido</option>
            {opcoes.sugeridos.length > 0 && (
              <optgroup label="Com itens de mesmo fornecedor e valor">
                {opcoes.sugeridos.map(({ p, iguais: n }) => (
                  <option key={p.id} value={p.id}>
                    Pedido {p.numero} · {nomeDe(p.autorId)} · emenda {emendaEmTexto(p.siopEmendaAno, p.siopEmenda ?? '')} · {n} de {emenda?.notas.length} {n === 1 ? 'nota igual' : 'notas iguais'}
                  </option>
                ))}
              </optgroup>
            )}
            <optgroup label="Outros pedidos com emenda conferida">
              {opcoes.outros.map((p) => (
                <option key={p.id} value={p.id}>
                  Pedido {p.numero} · {nomeDe(p.autorId)} · emenda {emendaEmTexto(p.siopEmendaAno, p.siopEmenda ?? '')}
                </option>
              ))}
            </optgroup>
          </AppSelect>
        )}

        {pedido && alvo && (
          <NoticeBar tone={outroCodigo ? 'warning' : 'info'} testId="emendas-ligar-emenda-autor">
            {outroCodigo
              ? `A emenda tem o código de autor ${alvo.numero.slice(0, 4)} e a do pedido ${pedido.numero} (${nomeDe(pedido.autorId)}) tem ${pedido.siopEmenda!.slice(0, 4)}: são de parlamentares diferentes nos pedidos. Confira no SEI antes de ligar.`
              : `Mesmo código de autor (${alvo.numero.slice(0, 4)}) da emenda conferida do pedido ${pedido.numero}, ${emendaEmTexto(pedido.siopEmendaAno, pedido.siopEmenda ?? '')}.`}
          </NoticeBar>
        )}

        {pedido && notas.length > 0 && (
          <div style={{ overflowX: 'auto', border: '1px solid var(--color-border, #e2e8f0)', borderRadius: 6 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem', minWidth: 560 }} data-testid="emendas-ligar-emenda-notas">
              <thead>
                <tr style={{ textAlign: 'left', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '0.35rem 0.5rem' }}>Nota</th>
                  <th style={{ padding: '0.35rem 0.5rem' }}>Credor</th>
                  <th style={{ padding: '0.35rem 0.5rem', textAlign: 'right' }}>Valor da nota</th>
                  <th style={{ padding: '0.35rem 0.5rem', textAlign: 'right' }}>Itens sem nota no pedido</th>
                  <th style={{ padding: '0.35rem 0.5rem' }}>Confere</th>
                </tr>
              </thead>
              <tbody>
                {notas.map((n) => {
                  const c = confere(n, pedido.id);
                  return (
                    <tr key={n.empenhoId}>
                      <td style={{ ...celula, fontWeight: 600, whiteSpace: 'nowrap' }}>{n.nota}</td>
                      <td style={celula}>{n.credorNome ?? '—'}</td>
                      <td style={numero}>{formatCurrency(n.valorEmpenhado)}</td>
                      <td style={numero}>{c.valor == null ? '—' : formatCurrency(c.valor)}</td>
                      <td style={{ ...celula, whiteSpace: 'nowrap', color: c.tom === 'ok' ? 'var(--color-success-text)' : c.tom === 'aviso' ? 'var(--color-warning-text)' : 'var(--text-muted)', fontWeight: 600 }}>{c.texto}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {pedido && alvo && (
          <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <legend style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.4rem' }}>O que é esta emenda no pedido</legend>
            {(
              [
                ['OUTRA', 'Outra emenda do pedido', `O pedido ${pedido.numero} fica com ${emendaEmTexto(pedido.siopEmendaAno, pedido.siopEmenda ?? '')} e ${emendaEmTexto(alvo.ano, alvo.numero)}. As notas das duas entram nos itens.`],
                ['TROCA', 'O nº do pedido está errado', `${emendaEmTexto(alvo.ano, alvo.numero)} passa a ser a emenda conferida no lugar de ${emendaEmTexto(pedido.siopEmendaAno, pedido.siopEmenda ?? '')}. Use quando o número foi digitado errado na conferência.`]
              ] as const
            ).map(([valor, titulo, texto]) => (
              <label key={valor} style={caixa}>
                <input type="radio" name="emendas-ligar-emenda-modo" checked={modo === valor} onChange={() => setModo(valor)} style={{ marginTop: 3 }} data-testid={`emendas-ligar-emenda-modo-${valor}`} />
                <span>
                  <b>{titulo}</b>
                  <span style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-muted)' }}>{texto}</span>
                </span>
              </label>
            ))}
          </fieldset>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: '0.6rem' }}>
          <AppInput
            label="Documento SEI que cita a emenda (opcional)"
            inputMode="numeric"
            placeholder="Só números"
            value={documento}
            onChange={(e) => setDocumento(e.target.value)}
            error={tentou && documento.trim() && !documentoSeiDaEtapaValido(documento) ? 'O documento tem de 7 a 10 dígitos.' : undefined}
            data-testid="emendas-ligar-emenda-sei"
          />
          <AppInput
            label="Observação (opcional)"
            maxLength={500}
            placeholder="Ex.: sobra da emenda de 2024 completou o pedido"
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            data-testid="emendas-ligar-emenda-obs"
          />
        </div>

        {pedido && alvo && modo && (
          <NoticeBar tone="info" testId="emendas-ligar-emenda-efeito">
            {notas.length
              ? `${notas.length === 1 ? 'A nota sai' : `As ${notas.length} notas saem`} de "Notas sem pedido". ${iguais ? `${iguais === 1 ? '1 nota tem' : `${iguais} notas têm`} o valor igual ao dos itens e deve entrar nos itens na hora; ` : ''}a busca diária continua achando as notas novas desta emenda.`
              : 'A busca diária passa a achar as notas desta emenda e a ligá-las aos itens do pedido.'}
          </NoticeBar>
        )}
        {tentou && pendencias.length > 0 && (
          <NoticeBar tone="danger" testId="emendas-ligar-emenda-pendencias">
            Falta: {pendencias.join(', ')}.
          </NoticeBar>
        )}
      </form>
    </Modal>
  );
};
