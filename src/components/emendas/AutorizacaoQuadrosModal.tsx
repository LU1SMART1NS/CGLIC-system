import React, { useMemo, useState } from 'react';
import { Copy } from 'lucide-react';
import { Modal } from '../../design-system/components/Modal';
import { AppButton } from '../../design-system/components/AppButton';
import { ActionButton } from '../../design-system/components/ActionButton';
import { AppInput } from '../../design-system/components/FormFields';
import { NoticeBar } from '../../design-system/components/NoticeBar';
import { StatusBadge } from '../../design-system/components/StatusBadge';
import { Tabs } from '../../design-system/components/Tabs';
import { useToast } from '../../design-system/components/Toast';
import { hojeEmBrasilia, useAvancarPedido, useDadosDaAtaParaAutorizacao, useInformarSolicitacaoDaAta } from '../../hooks/useEmendas';
import { documentoSeiDaEtapaValido, ROTULO_ETAPA } from '../../utils/emendasPedidos';
import {
  fornecedorDaAta,
  htmlQuadroPretensoes,
  htmlQuadroUnidade,
  instrumentoDaAta,
  linhasDaAtaParaAutorizar,
  montarQuadros,
  parlamentarDoQuadro,
  pedidoEntraNaAutorizacao
} from '../../utils/emendasAutorizacao';
import { formatCurrency, formatNumber } from '../../utils/format';
import type { AutorEmenda, BeneficiarioEmenda, ItemCaep, PedidoEmenda } from '../../services/emendasService';
import { copiar } from '../../utils/copiarQuadro';
import { LinhaDoPedido } from './emendasPartes';

interface Props {
  /** Pedido de onde a janela foi aberta. */
  pedido: PedidoEmenda;
  ataKey: string;
  /** Todos os pedidos: os de outros parlamentares com itens da mesma ata podem entrar juntos. */
  pedidos: PedidoEmenda[];
  itens: Map<string, ItemCaep>;
  autores: Map<string, AutorEmenda>;
  beneficiarios: Map<string, BeneficiarioEmenda>;
  podeGerir: boolean;
  onClose: () => void;
}

const MODALIDADE: Record<string, string> = { Pregão: 'Pregão Eletrônico' };

/**
 * Quadros da autorização de empenho de uma ata (protótipo aprovado em 26/10/2026, modelo SEI 37098929): as pretensões
 * do parlamentar e a unidade requisitante, prontos para colar no SEI. Pode juntar pedidos de outros parlamentares da
 * mesma ata. Instrumento e fornecedor vêm do sistema (ata + SEI da ata assinada; Compras.gov.br) e podem ser editados
 * só para o documento. Depois de assinada, a solicitação pode ser registrada de uma vez em todos os pedidos juntados.
 */
export const AutorizacaoQuadrosModal: React.FC<Props> = ({ pedido, ataKey, pedidos, itens, autores, beneficiarios, podeGerir, onClose }) => {
  const toast = useToast();
  const avancar = useAvancarPedido();
  const informar = useInformarSolicitacaoDaAta();
  const { data: dadosAta, isLoading: carregandoAta } = useDadosDaAtaParaAutorizacao(ataKey);
  const numeroAta = ataKey.split('-')[0];

  const [juntar, setJuntar] = useState(false);
  const outros = useMemo(() => pedidos.filter((p) => p.id !== pedido.id && pedidoEntraNaAutorizacao(p, ataKey)).sort((a, b) => a.numero - b.numero), [pedidos, pedido.id, ataKey]);
  const [marcados, setMarcados] = useState<ReadonlySet<string>>(new Set());
  // Linhas de cada pedido: as da ata ainda sem solicitação assinada; no pedido de origem, se todas já têm, todas as da ata (para refazer os quadros).
  const linhasPorPedido = useMemo(() => {
    const m = new Map<string, ReturnType<typeof linhasDaAtaParaAutorizar>>();
    for (const p of [pedido, ...outros]) {
      const abertas = linhasDaAtaParaAutorizar(p, ataKey);
      m.set(p.id, abertas.length || p.id !== pedido.id ? abertas : p.linhas.filter((l) => !l.cancelada && l.itemKey?.startsWith(`${ataKey}-`)));
    }
    return m;
  }, [pedido, outros, ataKey]);
  const [linhasMarcadas, setLinhasMarcadas] = useState<ReadonlySet<string>>(() => new Set((linhasPorPedido.get(pedido.id) ?? []).map((l) => l.id)));

  // Do sistema enquanto a pessoa não edita; a edição vale só para esta janela.
  const [instrumentoEditado, setInstrumento] = useState<string | null>(null);
  const [fornecedorEditado, setFornecedor] = useState<string | null>(null);
  const instrumento = instrumentoEditado ?? (dadosAta ? instrumentoDaAta(numeroAta, dadosAta.ataAssinadaSei) : '');
  const fornecedor = fornecedorEditado ?? (dadosAta ? fornecedorDaAta(dadosAta.fornecedorNome, dadosAta.fornecedorDocumento) : '');
  const [aba, setAba] = useState<'pretensoes' | 'unidade'>('pretensoes');

  const doQuadro = [pedido, ...(juntar ? outros.filter((p) => marcados.has(p.id)) : [])];
  const quadros = montarQuadros({
    ataKey,
    pedidos: doQuadro.map((p) => ({ pedido: p, linhas: (linhasPorPedido.get(p.id) ?? []).filter((l) => p.id !== pedido.id || linhasMarcadas.has(l.id)) })),
    itens,
    autores,
    beneficiarios
  });
  const unidade = `Secretaria Nacional de Segurança Pública - Senasp (${dadosAta?.papelSenasp === 'PARTICIPANTE' ? 'Participante' : 'Gerenciador'})`;
  const modalidade = dadosAta?.modalidade ? MODALIDADE[dadosAta.modalidade] ?? dadosAta.modalidade : '—';
  const certame = dadosAta?.numeroCompra ? `${dadosAta.modalidade ?? 'Pregão'} nº ${dadosAta.numeroCompra}/${dadosAta.anoCompra ?? ''}` : '—';
  const html =
    aba === 'pretensoes'
      ? htmlQuadroPretensoes(quadros, instrumento)
      : htmlQuadroUnidade(quadros, { unidade, modalidade, certame, uasg: dadosAta?.codigoUasg ?? ataKey.split('-')[1], instrumento, fornecedor });

  const copiarQuadro = async () => {
    const caixa = document.createElement('div');
    caixa.innerHTML = html;
    try {
      await copiar(html, caixa.innerText);
      toast.success(aba === 'pretensoes' ? 'Quadro das pretensões copiado.' : 'Quadro da unidade requisitante copiado.');
    } catch (err) {
      toast.error((err as Error).message || 'Não foi possível copiar.');
    }
  };

  // Registrar a solicitação assinada em todos os pedidos dos quadros, cada um com as suas linhas.
  const [numero, setNumero] = useState('');
  const [assinadaEm, setAssinadaEm] = useState('');
  const [registrando, setRegistrando] = useState(false);
  const registrar = async () => {
    if (!documentoSeiDaEtapaValido(numero)) return toast.error('Documento SEI: só números, 7 a 10 dígitos.');
    setRegistrando(true);
    const sei = numero.replace(/\D/g, '');
    const falharam: string[] = [];
    let feitos = 0;
    for (const p of doQuadro) {
      const linhas = (linhasPorPedido.get(p.id) ?? []).filter((l) => p.id !== pedido.id || linhasMarcadas.has(l.id));
      if (!linhas.length) continue;
      try {
        // Pedido ainda em "Conferido no SIOP": a solicitação também avança a etapa (como na janela da etapa).
        if (p.etapa === 'CONFERIDO') await avancar.mutateAsync({ id: p.id, versao: p.versao, acao: 'SOLICITADO', dados: { data: hojeEmBrasilia(), documento_sei: sei } });
        await informar.mutateAsync({ pedidoId: p.id, ataKey, documentoSei: sei, assinadaEm: assinadaEm || null, linhas: linhas.map((l) => ({ linhaId: l.id, quantidade: l.quantidade })) });
        feitos++;
      } catch (err) {
        falharam.push(`pedido ${p.numero}: ${(err as Error).message}`);
      }
    }
    setRegistrando(false);
    if (falharam.length) toast.error(`Registrada em ${feitos} de ${doQuadro.length} pedidos. Faltou: ${falharam.join('; ')}`);
    else {
      toast.success(`Solicitação ${sei} registrada em ${feitos === 1 ? '1 pedido' : `${feitos} pedidos`}.`);
      onClose();
    }
  };

  const marcar = (set: React.Dispatch<React.SetStateAction<ReadonlySet<string>>>, id: string, ligado: boolean) =>
    set((m) => {
      const prox = new Set(m);
      if (ligado) prox.add(id);
      else prox.delete(id);
      return prox;
    });

  return (
    <Modal
      isOpen
      onClose={onClose}
      dismissible={!registrando}
      size="xxl"
      testId="emendas-autorizacao-modal"
      title={`Quadros da autorização · Ata ${numeroAta}`}
      footer={<ActionButton action="fechar" type="button" onClick={onClose} disabled={registrando} />}
    >
      <div className="emendas-autorizacao">
        <div className="emendas-autorizacao__dados">
          <div className="reserva-barra" role="group" aria-label="Pedidos da autorização">
            <AppButton type="button" size="sm" variant={juntar ? 'outline' : 'primary'} aria-pressed={!juntar} onClick={() => setJuntar(false)} data-testid="emendas-autorizacao-so-este">
              Só este pedido
            </AppButton>
            <AppButton
              type="button"
              size="sm"
              variant={juntar ? 'primary' : 'outline'}
              aria-pressed={juntar}
              onClick={() => setJuntar(true)}
              disabled={outros.length === 0}
              title={outros.length === 0 ? 'Nenhum outro pedido desta ata entre a conferência e a autorização.' : undefined}
              data-testid="emendas-autorizacao-juntar"
            >
              Juntar pedidos da ata{outros.length ? ` (${outros.length})` : ''}
            </AppButton>
          </div>
          <div className="emendas-autorizacao__pedido emendas-autorizacao__pedido--este">
            <b>
              Pedido {pedido.numero} <StatusBadge label="este" variant="info" size="sm" dot={false} />
            </b>
            <span>{parlamentarDoQuadro(pedido.autorId ? autores.get(pedido.autorId) : undefined)}</span>
            {(linhasPorPedido.get(pedido.id) ?? []).map((l) => (
              <label key={l.id} className="emendas-autorizacao__linha">
                <input type="checkbox" checked={linhasMarcadas.has(l.id)} onChange={(e) => marcar(setLinhasMarcadas, l.id, e.target.checked)} data-testid={`emendas-autorizacao-linha-${l.id}`} />
                <span>
                  <LinhaDoPedido linha={l} itens={itens} />
                </span>
              </label>
            ))}
          </div>
          {juntar &&
            outros.map((p) => (
              <label key={p.id} className="emendas-autorizacao__pedido">
                <span className="emendas-autorizacao__linha">
                  <input type="checkbox" checked={marcados.has(p.id)} onChange={(e) => marcar(setMarcados, p.id, e.target.checked)} data-testid={`emendas-autorizacao-pedido-${p.numero}`} />
                  <b>Pedido {p.numero}</b>
                  <span className="reserva-espaco" />
                  <small className="reserva-mudo">{ROTULO_ETAPA[p.etapa]}</small>
                </span>
                <span>{parlamentarDoQuadro(p.autorId ? autores.get(p.autorId) : undefined)}</span>
                <small className="reserva-mudo">
                  {(linhasPorPedido.get(p.id) ?? []).map((l) => `${formatNumber(l.quantidade)} un. · item ${Number((l.itemKey ?? '').split('-')[2] ?? 0) || 'kit'}`).join(' · ')}
                </small>
              </label>
            ))}
          {juntar && <small className="reserva-mudo">Pedidos com itens desta ata entre a conferência no SIOP e a autorização, ainda sem solicitação assinada para ela.</small>}
          <AppInput label="Instrumento (coluna ARP)" value={instrumento} onChange={(e) => setInstrumento(e.target.value)} hint="Do sistema: a ata e o SEI da ata assinada. Troque pelo Termo Aditivo quando a autorização citar o aditivo." data-testid="emendas-autorizacao-instrumento" />
          <AppInput label="Fornecedor" value={fornecedor} onChange={(e) => setFornecedor(e.target.value)} hint="Do Compras.gov.br. Edite se a autorização cita a empresa e o representante." data-testid="emendas-autorizacao-fornecedor" />
          <small className="reserva-mudo">Preço: o da ata hoje, como na autorização. Nada do que for editado aqui é gravado.</small>
        </div>
        <div className="emendas-autorizacao__quadros">
          <Tabs
            ariaLabel="Quadros da autorização"
            testId="emendas-autorizacao-abas"
            activeTabId={aba}
            onTabChange={(id) => setAba(id as 'pretensoes' | 'unidade')}
            tabs={[
              { id: 'pretensoes', label: 'Pretensões do parlamentar' },
              { id: 'unidade', label: 'Unidade requisitante' }
            ]}
          />
          {quadros.itens.length === 0 ? (
            <NoticeBar tone="warning" testId="emendas-autorizacao-vazio">
              Marque pelo menos um item.
            </NoticeBar>
          ) : (
            <div className="emendas-autorizacao__folha" data-testid="emendas-autorizacao-folha" dangerouslySetInnerHTML={{ __html: carregandoAta && aba === 'unidade' ? '<p>Carregando os dados da ata…</p>' : html }} />
          )}
          <div className="reserva-barra">
            <AppButton type="button" icon={<Copy size={16} aria-hidden="true" />} onClick={() => void copiarQuadro()} disabled={!quadros.itens.length} data-testid="emendas-autorizacao-copiar">
              Copiar tabela
            </AppButton>
            <span className="reserva-mudo">
              {doQuadro.length === 1 ? '1 pedido' : `${doQuadro.length} pedidos`} · {formatNumber(quadros.itens.reduce((s, i) => s + i.quantidade, 0))} un. · {formatCurrency(quadros.total)}
            </span>
          </div>
          {podeGerir && quadros.itens.length > 0 && (
            <div className="emendas-autorizacao__registro" data-testid="emendas-autorizacao-registro">
              <b>Depois de assinada: registrar a solicitação {doQuadro.length > 1 ? `nos ${doQuadro.length} pedidos` : 'no pedido'}</b>
              <div className="reserva-barra">
                <AppInput label="Documento SEI da autorização" inputMode="numeric" placeholder="Só números" value={numero} onChange={(e) => setNumero(e.target.value)} data-testid="emendas-autorizacao-sei" />
                <AppInput label="Assinada em (opcional)" type="date" max={hojeEmBrasilia()} value={assinadaEm} onChange={(e) => setAssinadaEm(e.target.value)} data-testid="emendas-autorizacao-assinada" />
                <AppButton type="button" onClick={() => void registrar()} disabled={registrando || !numero.trim()} isLoading={registrando} data-testid="emendas-autorizacao-registrar">
                  Registrar
                </AppButton>
              </div>
              <small className="reserva-mudo">Cada pedido recebe o documento com as suas linhas. O pedido em “Conferido no SIOP” passa para “Empenho solicitado”.</small>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};
