import React, { useState } from 'react';
import { Modal } from '../../design-system/components/Modal';
import { AppButton } from '../../design-system/components/AppButton';
import { ActionButton } from '../../design-system/components/ActionButton';
import { AppInput, AppSelect, AppTextarea } from '../../design-system/components/FormFields';
import { useToast } from '../../design-system/components/Toast';
import { hojeEmBrasilia, useAutoresEmendas, useAvancarPedido, useCancelarPedido, useInformarSolicitacaoDaAta, usePedidosEmendas, useRegistrarEnvioCgofi } from '../../hooks/useEmendas';
import { formatCurrency } from '../../utils/format';
import { usePrecosParaEmenda } from '../../hooks/useEmendasQuadro';
import {
  ataDoItem,
  atasDoPedido,
  conferirNumeroDaEmenda,
  documentoSeiDaEtapaValido,
  identificacaoDoPedido,
  itensDaLinha,
  lerNumeroDaEmenda,
  linhasAtivas,
  numeroDaEmendaEmTexto,
  numerosSei,
  ORDEM_ETAPA,
  rodadaDoPedido,
  solicitacaoDaLinha,
  solicitacoesAssinadasSemEnvio,
  valorDoPedido,
  type AtaDoPedido
} from '../../utils/emendasPedidos';
import { corteIndicacaoDias, dataBR, diasEntre, passouDoCorte } from '../../utils/emendasKits';
import { QuadroGabinete } from './QuadroGabinete';
import type { AcaoPedido, ItemCaep, LinhaPedido, PedidoEmenda } from '../../services/emendasService';
import { curto } from '../../utils/emendasKits';

/**
 * MAIS_*: acrescentar o número SEI de uma nota nova ao empenho ou ao envio para contratação, sem mudar de etapa.
 * SOLICITACAO_ATA: a solicitação de empenho de uma ata (migration 178), sem mudar de etapa.
 */
export type AcaoDaJanela = Exclude<AcaoPedido, 'ACRESCENTAR_SEI'> | 'MAIS_EMPENHADO' | 'MAIS_CONTRATACAO' | 'SOLICITACAO_ATA' | 'CANCELAR';

/** De onde a janela foi aberta: a ata e o número que já estão na linha do tempo. */
export interface ContextoDaJanela {
  ataKey?: string;
  numero?: string;
  /** O número é uma solicitação da ata que o gestor vai trocar ou completar (a assinatura). */
  troca?: boolean;
}

interface Props {
  pedido: PedidoEmenda;
  acao: AcaoDaJanela;
  contexto?: ContextoDaJanela;
  itens: Map<string, ItemCaep>;
  nomeDoAutor: string;
  onClose: () => void;
}

const PONTOS_SIOP: ReadonlyArray<[string, string]> = [
  ['numero_emenda', 'Nº da emenda'],
  ['autor', 'Autor'],
  ['valor', 'Valor'],
  ['gnd', 'GND'],
  ['beneficiario', 'Beneficiário'],
  ['objeto', 'Objeto']
];

const MOTIVOS_CANCELAMENTO = ['Parlamentar desistiu', 'Divergência não resolvida', 'Passou do prazo sem ofício', 'Ata vencida sem substituto', 'Outro'];

const TITULO: Record<AcaoDaJanela, string> = {
  MINUTA: 'Registrar a minuta',
  OFICIO: 'Registrar o ofício',
  DIVERGENCIA: 'Ofício com divergência',
  CONFERIDO: 'Conferir com o SIOP',
  SOLICITADO: 'Registrar a solicitação de empenho',
  AUTORIZADO: 'Registrar a autorização de empenho',
  CGOFI: 'Registrar o envio à CGOFI',
  EMPENHADO: 'Registrar o empenho',
  CONTRATACAO: 'Registrar o envio para contratação',
  MAIS_EMPENHADO: 'Acrescentar número SEI do empenho',
  MAIS_CONTRATACAO: 'Acrescentar número SEI do despacho para contratação',
  SOLICITACAO_ATA: 'Solicitação de empenho de uma ata',
  CANCELAR: 'Cancelar o pedido'
};

/** Rótulo do campo SEI de cada etapa com documento (migration 174). */
const ROTULO_SEI: Partial<Record<AcaoDaJanela, string>> = {
  OFICIO: 'Documento SEI do ofício *',
  SOLICITADO: 'Documento SEI da solicitação de empenho *',
  CGOFI: 'Documento SEI do envio à CGOFI *',
  EMPENHADO: 'Documento(s) SEI do empenho *',
  CONTRATACAO: 'Documento(s) SEI do despacho para contratação *',
  MAIS_EMPENHADO: 'Documento(s) SEI do empenho *',
  MAIS_CONTRATACAO: 'Documento(s) SEI do despacho para contratação *'
};
/** Etapas com vários números: um por nota (uma emenda tem uma nota por fornecedor). */
const VARIOS: ReadonlySet<AcaoDaJanela> = new Set(['EMPENHADO', 'CONTRATACAO', 'MAIS_EMPENHADO', 'MAIS_CONTRATACAO']);

const ROTULO_DATA: Partial<Record<AcaoDaJanela, string>> = {
  MINUTA: 'Enviada em',
  OFICIO: 'Chegou em',
  DIVERGENCIA: 'Devolvido em',
  CONFERIDO: 'Conferido em',
  SOLICITADO: 'Enviada à DGFNSP em',
  AUTORIZADO: 'Assinado pela DGFNSP em',
  CGOFI: 'Enviado em',
  EMPENHADO: 'Empenhado em',
  CONTRATACAO: 'Enviado em'
};

const grade: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: '0.8rem' };
const aviso = (tom: 'erro' | 'info' | 'atencao'): React.CSSProperties => ({
  fontSize: '0.8rem',
  fontWeight: 600,
  padding: '0.5rem 0.7rem',
  borderRadius: 6,
  background: tom === 'erro' ? 'var(--color-danger-bg, #fdecea)' : tom === 'atencao' ? 'var(--color-warning-bg)' : 'var(--color-info-bg, #e6eefb)',
  color: tom === 'erro' ? 'var(--color-danger, #b11b05)' : tom === 'atencao' ? 'var(--color-warning-text)' : 'var(--color-info-text, #155bcb)'
});

const rotuloDaAta = (a: AtaDoPedido): string =>
  `Ata ${a.numeroAta}${a.fornecedor ? ` · ${a.fornecedor}` : ''}${a.situacao === 'falta' ? ' (falta)' : ` (SEI ${a.solicitacoes.map((x) => x.numero).join(', ')})`}`;

/** Um campo de número SEI para cada ata do pedido, com os itens embaixo para conferir com a solicitação. */
const SolicitacoesPorAta: React.FC<{ atas: AtaDoPedido[]; valores: Record<string, string>; onChange: (ataKey: string, valor: string) => void }> = ({ atas, valores, onChange }) => (
  <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.6rem' }} data-testid="emendas-etapa-sei-por-ata">
    <legend style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
      Documento SEI da solicitação de cada ata (uma por ata; a que ainda não foi feita fica em branco)
    </legend>
    {atas.map((a) => (
      <AppInput
        key={a.ataKey}
        label={`Ata ${a.numeroAta}${a.fornecedor ? ` · ${a.fornecedor}` : ''}`}
        placeholder="Ex.: 41234567"
        hint={a.itens.map((i) => `item ${i.numeroItem} · ${i.nome} · ${i.quantidade} un.`).join('; ')}
        value={valores[a.ataKey] ?? ''}
        onChange={(e) => onChange(a.ataKey, e.target.value)}
        data-testid={`emendas-etapa-sei-ata-${a.numeroAta}`}
      />
    ))}
  </fieldset>
);

/** Uma janela para cada passo do pedido, da minuta ao envio para contratação, e para o cancelamento. */
export const EtapaPedidoModal: React.FC<Props> = ({ pedido, acao, contexto, itens, nomeDoAutor, onClose }) => {
  const avancar = useAvancarPedido();
  const cancelar = useCancelarPedido();
  const informar = useInformarSolicitacaoDaAta();
  const registrarEnvio = useRegistrarEnvioCgofi();
  const atas = atasDoPedido(pedido, itens);
  // Envio à CGOFI (migration 193): as solicitações assinadas que ainda não foram, todas marcadas de início.
  const semEnvio = solicitacoesAssinadasSemEnvio(pedido);
  const [paraEnviar, setParaEnviar] = useState<Set<string>>(() => new Set(semEnvio.map((d) => d.id)));
  const autorizado = ORDEM_ETAPA[pedido.etapa] >= ORDEM_ETAPA.AUTORIZADO;
  const [ataEscolhida, setAtaEscolhida] = useState(contexto?.ataKey ?? atas.find((a) => a.situacao === 'falta')?.ataKey ?? atas[0]?.ataKey ?? '');
  const [numeroDaAta, setNumeroDaAta] = useState(contexto?.numero ?? '');
  // Trocando uma solicitação da ata: a anterior sai da ata (migration 179); sem troca, entra a mais (nova rodada).
  const trocando = Boolean(contexto?.troca && contexto.numero);
  const ataDaJanela = atas.find((a) => a.ataKey === ataEscolhida);
  const [assinadaEm, setAssinadaEm] = useState('');
  // Linhas que a solicitação cobre (migration 180): as da ata escolhida. Começam marcadas as que o documento já
  // cobre (troca), todas (primeira solicitação da ata) ou as que ainda não têm solicitação (nova rodada).
  const linhasDaAta = (ataKey: string): LinhaPedido[] => linhasAtivas(pedido).filter((l) => itensDaLinha(l).some((x) => ataDoItem(x.itemKey) === ataKey));
  const marcadasIniciais = (ataKey: string): Set<string> => {
    const da = linhasDaAta(ataKey);
    const documento = contexto?.numero ? pedido.documentos.find((d) => d.etapa === 'AUTORIZACAO' && d.numero === contexto.numero) : undefined;
    if (trocando && documento) {
      const cobertas = da.filter((l) => solicitacaoDaLinha(pedido, l)?.numero === documento.numero);
      return new Set((cobertas.length ? cobertas : da).map((l) => l.id));
    }
    const semSolicitacao = da.filter((l) => !solicitacaoDaLinha(pedido, l));
    return new Set((semSolicitacao.length ? semSolicitacao : da).map((l) => l.id));
  };
  const [marcadas, setMarcadas] = useState<Set<string>>(() => marcadasIniciais(ataEscolhida));
  const escolherAta = (ataKey: string) => {
    setAtaEscolhida(ataKey);
    setMarcadas(marcadasIniciais(ataKey));
  };
  const nomeDaLinha = (l: LinhaPedido): string => {
    const i = l.itemKey ? itens.get(l.itemKey) : undefined;
    const nome = l.tipo === 'KIT' ? `${l.kitNome ?? 'kit'} (kit)` : i?.nomeCurto?.trim() || curto(i?.descricao ?? l.itemKey ?? '', 48);
    return `${l.quantidade} × ${nome}`;
  };
  // Solicitação com várias atas: um número para cada uma.
  const [porAta, setPorAta] = useState<Record<string, string>>({});
  const toast = useToast();
  const { data: autores = [] } = useAutoresEmendas();
  const [modo, setModo] = useState<AcaoDaJanela>(acao);
  const [data, setData] = useState(hojeEmBrasilia());
  const [documentoSei, setDocumentoSei] = useState('');
  const [processoSei, setProcessoSei] = useState(pedido.oficioProcessoSei ?? '');
  const [emenda, setEmenda] = useState(pedido.siopEmenda ? numeroDaEmendaEmTexto(pedido.siopEmenda) : '');
  // O número se repete entre anos (migration 186). Colar o código de 12 dígitos do SIOP preenche o ano.
  const anoDeHoje = Number(hojeEmBrasilia().slice(0, 4));
  const [anoEmenda, setAnoEmenda] = useState(pedido.siopEmendaAno ?? anoDeHoje);
  const anosDaEmenda = [...new Set([...Array.from({ length: 5 }, (_, i) => anoDeHoje - i), anoEmenda])].sort((a, b) => b - a);
  const digitarEmenda = (texto: string) => {
    const lido = lerNumeroDaEmenda(texto);
    if (lido?.ano) {
      setAnoEmenda(lido.ano);
      setEmenda(numeroDaEmendaEmTexto(lido.numero));
    } else setEmenda(texto);
  };
  const { data: pedidos = [] } = usePedidosEmendas();
  // No formato brasileiro (1.234,56): a leitura abaixo tira os pontos de milhar.
  const [valor, setValor] = useState(pedido.siopValor != null ? pedido.siopValor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '');
  const { precos } = usePrecosParaEmenda();
  const [gnd, setGnd] = useState(pedido.siopGnd ?? 'GND-4');
  const [pontos, setPontos] = useState<Record<string, boolean>>({});
  const [divergencia, setDivergencia] = useState(pedido.divergencia ?? '');
  const [motivo, setMotivo] = useState(MOTIVOS_CANCELAMENTO[0]);
  const [outroMotivo, setOutroMotivo] = useState('');
  const [tentou, setTentou] = useState(false);

  const linhas = linhasAtivas(pedido);
  const emendaLida = lerNumeroDaEmenda(emenda);
  const conferenciaDaEmenda = modo === 'CONFERIDO' && emendaLida ? conferirNumeroDaEmenda(pedido, emendaLida.numero, emendaLida.ano ?? anoEmenda, pedidos) : null;
  const nomeDe = (autorId: string | null) => autores.find((a) => a.id === autorId)?.nome ?? 'outro autor';
  // A emenda dividida em vários pedidos do mesmo processo: o processo uma vez só ("todos do Processo …").
  const idsDosOutros = [...new Set((conferenciaDaEmenda?.mesmaEmenda ?? []).map((x) => identificacaoDoPedido(x)))];
  const identificacoesDosOutros =
    idsDosOutros.length === 1 && (conferenciaDaEmenda?.mesmaEmenda.length ?? 0) > 1 ? `todos do ${idsDosOutros[0]}` : idsDosOutros.join(', ');
  const valorDigitado = valor.trim() ? Number(valor.replace(/\./g, '').replace(',', '.')) : null;
  const previsto = valorDoPedido(pedido, itens, precos);
  const deHoje = valorDoPedido(pedido, itens);
  const rodada = rodadaDoPedido(pedido);
  const numeros = numerosSei(documentoSei);
  const pedeSei = Boolean(ROTULO_SEI[modo]);
  const semBeneficiario = linhas.filter((l) => !l.beneficiarioId).length;
  const todosPontos = PONTOS_SIOP.every(([k]) => pontos[k]);
  const ocupado = avancar.isPending || cancelar.isPending || informar.isPending || registrarEnvio.isPending;
  const variasAtas = modo === 'SOLICITADO' && atas.length > 1;
  const numerosPorAta = atas
    .map((a) => ({ ata: a, numero: (porAta[a.ataKey] ?? '').replace(/\D/g, '') }))
    .filter((x) => x.numero);

  // Ofício de reserva com item em ata a menos do corte do fim: o banco recusa (migration 162).
  const ataForaDoPrazo =
    modo === 'OFICIO' && (pedido.etapa === 'RESERVADO' || pedido.etapa === 'MINUTA')
      ? linhas
          .flatMap((l) => itensDaLinha(l))
          .map((x) => itens.get(x.itemKey))
          .find((i): i is ItemCaep => Boolean(i?.vigenciaFinal) && passouDoCorte(diasEntre(hojeEmBrasilia(), i!.vigenciaFinal!)))
      : undefined;

  const pendencias: string[] = [];
  if (variasAtas) {
    if (numerosPorAta.length === 0) pendencias.push('o documento SEI da solicitação de pelo menos uma ata');
    if (numerosPorAta.some((x) => !documentoSeiDaEtapaValido(x.numero))) pendencias.push('documento SEI (só números, 7 a 10 dígitos)');
    if (new Set(numerosPorAta.map((x) => x.numero)).size < numerosPorAta.length) pendencias.push('um número diferente para cada ata');
  } else if (modo === 'SOLICITACAO_ATA') {
    if (!ataEscolhida) pendencias.push('a ata');
    if (!documentoSeiDaEtapaValido(numeroDaAta)) pendencias.push('documento SEI (um número, só números, 7 a 10 dígitos)');
    if (marcadas.size === 0) pendencias.push('marcar pelo menos uma linha que a solicitação cobre');
  } else if (pedeSei && (numeros.length === 0 || numeros.some((n) => !documentoSeiDaEtapaValido(n)) || (!VARIOS.has(modo) && numeros.length > 1))) {
    pendencias.push(VARIOS.has(modo) ? 'documento SEI (só números, 7 a 10 dígitos; vários: separe por vírgula)' : 'documento SEI (um número, só números, 7 a 10 dígitos)');
  }
  if (modo === 'OFICIO' && !processoSei.trim()) pendencias.push('processo SEI');
  if (modo === 'CGOFI') {
    if (semEnvio.length === 0) pendencias.push('uma solicitação assinada e ainda não enviada (informe a assinatura na linha do tempo)');
    else if (paraEnviar.size === 0) pendencias.push('marcar pelo menos uma solicitação que o despacho leva');
  }
  if (modo === 'CONFERIDO') {
    if (!emenda.trim()) pendencias.push('número da emenda');
    else if (!emendaLida) pendencias.push('nº da emenda com 8 dígitos (ex.: 4095 0004), ou 12 com o ano na frente');
    if (!todosPontos) pendencias.push('marcar os 6 pontos que batem (se algo não bate, use "Ofício com divergência")');
    if (semBeneficiario) pendencias.push(`beneficiário em ${semBeneficiario === 1 ? 'uma linha' : `${semBeneficiario} linhas`} (use "Alterar linhas")`);
  }
  if (modo === 'DIVERGENCIA' && !divergencia.trim()) pendencias.push('o que não bate');
  if (modo === 'CANCELAR' && motivo === 'Outro' && !outroMotivo.trim()) pendencias.push('o motivo');

  const enviar = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setTentou(true);
    if (pendencias.length || ataForaDoPrazo) return;
    try {
      if (modo === 'CGOFI') {
        await registrarEnvio.mutateAsync({ pedidoId: pedido.id, documentoSei: numeros[0], enviadoEm: data, solicitacoes: [...paraEnviar] });
        toast.success(`${nomeDoAutor}: envio à CGOFI registrado (${paraEnviar.size === 1 ? '1 solicitação' : `${paraEnviar.size} solicitações`}).`);
      } else if (modo === 'SOLICITACAO_ATA') {
        await informar.mutateAsync({
          pedidoId: pedido.id,
          ataKey: ataEscolhida,
          documentoSei: numeroDaAta.replace(/\D/g, ''),
          assinadaEm: autorizado && assinadaEm ? assinadaEm : null,
          substitui: trocando ? contexto!.numero! : null,
          linhas: [...marcadas].map((linhaId) => ({ linhaId }))
        });
        toast.success(`Solicitação da ata ${ataEscolhida.split('-')[0]} registrada.`);
      } else if (variasAtas) {
        // A etapa guarda o primeiro número; cada ata recebe o seu logo depois (migration 178).
        await avancar.mutateAsync({ id: pedido.id, versao: pedido.versao, acao: 'SOLICITADO', dados: { data, documento_sei: numerosPorAta[0].numero } });
        const falharam: string[] = [];
        for (const x of numerosPorAta) {
          try {
            await informar.mutateAsync({ pedidoId: pedido.id, ataKey: x.ata.ataKey, documentoSei: x.numero, assinadaEm: null });
          } catch (err) {
            falharam.push(`ata ${x.ata.numeroAta}: ${(err as Error).message}`);
          }
        }
        if (falharam.length) toast.error(`Solicitação registrada, mas faltou ligar: ${falharam.join('; ')}. Informe na linha do tempo do pedido.`);
        else toast.success(`${nomeDoAutor}: solicitação de empenho registrada (${numerosPorAta.length} de ${atas.length} atas).`);
      } else if (modo === 'CANCELAR') {
        await cancelar.mutateAsync({ id: pedido.id, versao: pedido.versao, motivo: motivo === 'Outro' ? outroMotivo.trim() : motivo });
        toast.success(`Pedido de ${nomeDoAutor} cancelado. A quantidade voltou ao saldo da CAEP.`);
      } else {
        const mais = modo === 'MAIS_EMPENHADO' || modo === 'MAIS_CONTRATACAO';
        const acao: AcaoPedido = mais ? 'ACRESCENTAR_SEI' : (modo as AcaoPedido);
        const dados: Record<string, unknown> =
          mais
            ? { etapa: modo === 'MAIS_EMPENHADO' ? 'EMPENHADO' : 'CONTRATACAO', documentos_sei: numeros }
            : modo === 'MINUTA'
              ? { data }
              : modo === 'OFICIO'
                ? { data, documento_sei: numeros[0], processo_sei: processoSei.trim() }
                : modo === 'DIVERGENCIA'
                  ? { data, texto: divergencia.trim() }
                  : modo === 'CONFERIDO'
                    ? { data, emenda: emendaLida?.numero, ano: emendaLida?.ano ?? anoEmenda, valor: valorDigitado, gnd, conferencia: pontos }
                    : VARIOS.has(modo)
                      ? { data, documentos_sei: numeros }
                      : { data, documento_sei: numeros[0] };
        await avancar.mutateAsync({ id: pedido.id, versao: pedido.versao, acao, dados });
        toast.success(
          modo === 'DIVERGENCIA'
            ? `Ofício devolvido. O pedido voltou para a minuta (${rodada + 1}ª). A reserva continua.`
            : mais
              ? 'Número SEI acrescentado.'
              : `${nomeDoAutor}: ${TITULO[modo].replace('Registrar ', '').replace('Conferir com o SIOP', 'conferido no SIOP')}.`
        );
      }
      onClose();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      dismissible={!ocupado}
      size={modo === 'CONFERIDO' ? 'lg' : 'md'}
      testId="emendas-etapa-modal"
      title={TITULO[modo] + (rodada > 1 && (modo === 'MINUTA' || modo === 'OFICIO') ? ` (${rodada}ª rodada)` : '')}
      footer={
        <>
          <ActionButton action="cancelar" label={modo === 'CANCELAR' ? 'Voltar' : 'Cancelar'} type="button" onClick={onClose} disabled={ocupado} />
          {modo === 'CONFERIDO' && (
            <AppButton type="button" variant="ghostDanger" onClick={() => setModo('DIVERGENCIA')} disabled={ocupado}>
              Ofício com divergência
            </AppButton>
          )}
          <AppButton type="submit" form="emendas-etapa-form" variant={modo === 'CANCELAR' || modo === 'DIVERGENCIA' ? 'danger' : 'primary'} disabled={ocupado} isLoading={ocupado} data-testid="emendas-etapa-salvar">
            {modo === 'CANCELAR' ? 'Cancelar o pedido' : modo === 'CONFERIDO' ? 'Tudo confere' : modo === 'DIVERGENCIA' ? 'Devolver para a minuta' : modo.startsWith('MAIS_') ? 'Acrescentar' : modo === 'SOLICITACAO_ATA' ? 'Salvar' : 'Registrar'}
          </AppButton>
        </>
      }
    >
      <form id="emendas-etapa-form" onSubmit={enviar} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
        <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
          {nomeDoAutor} · {identificacaoDoPedido(pedido)}
          {pedido.oficioProcessoSei ? ` · SEI ${pedido.oficioProcessoSei}` : ''}
        </div>

        {ataForaDoPrazo && (
          <div style={aviso('erro')} role="alert" data-testid="emendas-etapa-fora-do-prazo">
            A ata {ataForaDoPrazo.numeroAta} termina em {dataBR(ataForaDoPrazo.vigenciaFinal)} e passou do prazo de indicação ({corteIndicacaoDias()} dias antes do fim), para dar tempo
            de empenhar e assinar o contrato. Troque o item em "Alterar linhas" ou cancele o pedido.
          </div>
        )}

        {variasAtas && <SolicitacoesPorAta atas={atas} valores={porAta} onChange={(k, v) => setPorAta((x) => ({ ...x, [k]: v }))} />}

        {modo === 'SOLICITACAO_ATA' && (
          <>
            <div style={aviso('info')} data-testid="emendas-etapa-ata-explica">
              {trocando
                ? `Solicitação SEI ${contexto!.numero} da ata. Um número diferente troca essa solicitação: a anterior fica no pedido, sem ata. Para só informar a assinatura, mantenha o número.`
                : ataDaJanela && ataDaJanela.solicitacoes.length > 0
                  ? `Solicitação a mais desta ata (nova rodada): as que ela já tem (${ataDaJanela.solicitacoes.map((x) => x.numero).join(', ')}) continuam.`
                  : 'Uma solicitação de autorização de empenho para cada ata do pedido, em cada rodada.'}
            </div>
            <div style={grade}>
              <AppInput
                label="Documento SEI da solicitação *"
                placeholder="Ex.: 41234567"
                hint="Só números, 7 a 10 dígitos."
                value={numeroDaAta}
                onChange={(e) => setNumeroDaAta(e.target.value)}
                data-testid="emendas-etapa-sei-ata"
              />
              <AppSelect label="Ata que ela cobre *" value={ataEscolhida} onChange={(e) => escolherAta(e.target.value)} disabled={trocando} data-testid="emendas-etapa-ata">
                {atas.map((a) => (
                  <option key={a.ataKey} value={a.ataKey}>
                    {rotuloDaAta(a)}
                  </option>
                ))}
              </AppSelect>
              {autorizado && (
                <AppInput
                  label="Assinada pela Diretora do FNSP em"
                  type="date"
                  hint="Em branco se ainda não assinou."
                  value={assinadaEm}
                  max={hojeEmBrasilia()}
                  onChange={(e) => setAssinadaEm(e.target.value)}
                  data-testid="emendas-etapa-assinada-em"
                />
              )}
            </div>
            {ataDaJanela && (
              <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.35rem' }} data-testid="emendas-etapa-linhas-cobertas">
                <legend style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.3rem' }}>
                  Linhas que esta solicitação cobre * <span style={{ fontWeight: 500 }}>(a autorização de empenho lista os itens e as quantidades)</span>
                </legend>
                {linhasDaAta(ataDaJanela.ataKey).map((l) => {
                  const outra = solicitacaoDaLinha(pedido, l);
                  const deOutra = outra && outra.numero !== contexto?.numero ? outra.numero : null;
                  return (
                    <label key={l.id} style={{ display: 'flex', gap: '0.45rem', alignItems: 'center', fontSize: '0.85rem', fontWeight: 600, padding: '0.35rem 0.6rem', border: '1px solid var(--color-border, #e2e8f0)', borderRadius: 6, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={marcadas.has(l.id)}
                        onChange={(e) =>
                          setMarcadas((m) => {
                            const prox = new Set(m);
                            if (e.target.checked) prox.add(l.id);
                            else prox.delete(l.id);
                            return prox;
                          })
                        }
                        data-testid={`emendas-etapa-linha-${l.id}`}
                      />
                      <span style={{ flex: 1 }}>{nomeDaLinha(l)}</span>
                      {deOutra && <span style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--text-muted)' }}>hoje na solicitação {deOutra}</span>}
                    </label>
                  );
                })}
              </fieldset>
            )}
          </>
        )}

        {(pedeSei || ROTULO_DATA[modo]) && modo !== 'CONFERIDO' && modo !== 'DIVERGENCIA' && (
          <div style={grade}>
            {pedeSei && !variasAtas && (
              <AppInput
                label={ROTULO_SEI[modo]}
                placeholder={VARIOS.has(modo) ? 'Ex.: 41234567, 41234568' : 'Ex.: 41234567'}
                hint={VARIOS.has(modo) ? 'Um por nota. Vários números: separe por vírgula.' : 'Só números, 7 a 10 dígitos.'}
                value={documentoSei}
                onChange={(e) => setDocumentoSei(e.target.value)}
                data-testid="emendas-etapa-sei"
              />
            )}
            {modo === 'OFICIO' && (
              <AppInput
                label="Processo SEI *"
                placeholder="08020.000000/2026-00"
                hint={rodada > 1 ? 'Mesmo processo do ofício devolvido; troque se mudou.' : undefined}
                value={processoSei}
                onChange={(e) => setProcessoSei(e.target.value)}
                data-testid="emendas-etapa-processo"
              />
            )}
            {ROTULO_DATA[modo] && <AppInput label={ROTULO_DATA[modo]!} type="date" value={data} onChange={(e) => setData(e.target.value)} />}
          </div>
        )}

        {modo === 'CGOFI' && (
          <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.35rem' }} data-testid="emendas-etapa-envio-solicitacoes">
            <legend style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.3rem' }}>
              Solicitações que o despacho leva * <span style={{ fontWeight: 500 }}>(o despacho à CGOFI cita as autorizações)</span>
            </legend>
            {semEnvio.length === 0 && <div style={aviso('atencao')}>Nenhuma solicitação assinada sem envio. Informe a assinatura da solicitação antes do envio.</div>}
            {semEnvio.map((d) => {
              const ata = atas.find((a) => a.ataKey === d.ataKey);
              // As linhas da solicitação: as ligadas a ela e, sem ligação gravada, as da sua ata (solicitacaoDaLinha).
              const doDocumento = linhasAtivas(pedido).filter((l) => solicitacaoDaLinha(pedido, l)?.id === d.id);
              return (
                <label key={d.id} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', fontSize: '0.85rem', padding: '0.45rem 0.6rem', border: '1px solid var(--color-border, #e2e8f0)', borderRadius: 6, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={paraEnviar.has(d.id)}
                    onChange={(e) =>
                      setParaEnviar((m) => {
                        const prox = new Set(m);
                        if (e.target.checked) prox.add(d.id);
                        else prox.delete(d.id);
                        return prox;
                      })
                    }
                    style={{ marginTop: 3 }}
                    data-testid={`emendas-etapa-envio-${d.numero}`}
                  />
                  <span style={{ flex: 1 }}>
                    <b>Ata {ata?.numeroAta ?? d.ataKey?.split('-')[0]}{ata?.fornecedor ? ` · ${ata.fornecedor}` : ''}</b>
                    {doDocumento.length > 0 && <> · {doDocumento.map(nomeDaLinha).join(', ')}</>}
                    <br />
                    <span style={{ color: 'var(--text-muted)' }}>Solicitação {d.numero}{d.assinadaEm ? `, assinada em ${dataBR(d.assinadaEm)}` : ''}</span>
                  </span>
                </label>
              );
            })}
            {semEnvio.length > 0 && <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Só aparecem as solicitações assinadas que ainda não foram enviadas; as já enviadas ficam nas rodadas do pedido.</div>}
          </fieldset>
        )}

        {modo === 'MINUTA' && (
          <QuadroGabinete autor={autores.find((a) => a.id === pedido.autorId)} linhas={linhasAtivas(pedido)} data={pedido.reservadoEm} devolvidoEm={pedido.devolvidoEm} testId="emendas-etapa-quadro" />
        )}

        {modo === 'AUTORIZADO' && (
          <div style={aviso('info')}>
            A autorização é o mesmo documento da solicitação, assinado pela DGFNSP.
            {atas.length > 1
              ? ' As solicitações das atas que ainda não têm data ficam assinadas nesta data; a de outro dia, ajuste depois na linha do tempo.'
              : pedido.solicitadoDocumentoSei
                ? ` (SEI ${pedido.solicitadoDocumentoSei})`
                : ''}
          </div>
        )}
        {modo === 'EMPENHADO' && <div style={aviso('info')}>As notas de empenho não são digitadas: o sistema acha cada nota pelo contrato e pela emenda.</div>}
        {modo === 'CONTRATACAO' && <div style={aviso('info')}>Ao registrar, o processo segue com a CCGA para a contratação e a CAEP passa a só acompanhar.</div>}

        {modo === 'CONFERIDO' && (
          <>
            <div style={grade}>
              <AppSelect label="Ano da emenda *" value={String(anoEmenda)} onChange={(e) => setAnoEmenda(Number(e.target.value))} data-testid="emendas-etapa-emenda-ano">
                {anosDaEmenda.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </AppSelect>
              <AppInput
                label="Nº da emenda *"
                placeholder="Ex.: 4095 0004"
                hint="8 dígitos. Pode colar o código do SIOP com o ano."
                inputMode="numeric"
                value={emenda}
                onChange={(e) => digitarEmenda(e.target.value)}
                data-testid="emendas-etapa-emenda"
              />
              <AppInput label="Valor no SIOP (R$)" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} />
              <AppSelect label="GND" value={gnd} onChange={(e) => setGnd(e.target.value)}>
                <option value="GND-4">GND-4 Investimento</option>
                <option value="GND-3">GND-3 Custeio</option>
              </AppSelect>
              <AppInput label="Conferido em" type="date" value={data} onChange={(e) => setData(e.target.value)} />
            </div>
            <div style={aviso('info')} data-testid="emendas-etapa-previsto">
              Valor previsto dos itens, com o reajuste das atas (o mesmo do quadro do parlamentar): {formatCurrency(previsto)}
              {Math.abs(previsto - deHoje) > 0.004 ? `; pelo preço de hoje, ${formatCurrency(deHoje)}` : ''}.
            </div>
            {conferenciaDaEmenda && conferenciaDaEmenda.outroAutor.length > 0 && (
              <div style={aviso('atencao')} role="status" data-testid="emendas-etapa-emenda-outro-autor">
                Os 4 primeiros dígitos ({emendaLida!.numero.slice(0, 4)}) são o código do autor, e nos pedidos{' '}
                {conferenciaDaEmenda.outroAutor.map((x) => `${nomeDe(x.autorId)} (emenda ${numeroDaEmendaEmTexto(x.siopEmenda!)})`).join(', ')} eles são de outro
                parlamentar. Confira se o número não está trocado.
              </div>
            )}
            {conferenciaDaEmenda && conferenciaDaEmenda.mesmaEmenda.length > 0 && (
              <div style={aviso('info')} data-testid="emendas-etapa-emenda-outro-pedido">
                Esta emenda também está em {conferenciaDaEmenda.mesmaEmenda.length === 1 ? 'outro pedido' : `${conferenciaDaEmenda.mesmaEmenda.length} outros pedidos`} de{' '}
                {nomeDoAutor} ({identificacoesDosOutros}): o valor do SIOP é da emenda inteira.
              </div>
            )}
            {valorDigitado != null && Number.isFinite(valorDigitado) && valorDigitado + 0.004 < previsto && (
              <div style={aviso('atencao')} role="status" data-testid="emendas-etapa-abaixo">
                O valor no SIOP fica {formatCurrency(previsto - valorDigitado)} abaixo do previsto: pode faltar dinheiro para empenhar todos os itens.
              </div>
            )}
            <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <legend style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.4rem' }}>O que bate entre o ofício e o SIOP</legend>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: '0.45rem' }}>
                {PONTOS_SIOP.map(([k, r]) => (
                  <label key={k} style={{ display: 'flex', gap: '0.45rem', alignItems: 'center', fontSize: '0.85rem', fontWeight: 600, padding: '0.45rem 0.6rem', border: '1px solid var(--color-border, #e2e8f0)', borderRadius: 6, cursor: 'pointer' }}>
                    <input type="checkbox" checked={Boolean(pontos[k])} onChange={(e) => setPontos((p) => ({ ...p, [k]: e.target.checked }))} data-testid={`emendas-etapa-ponto-${k}`} />
                    {r}
                  </label>
                ))}
              </div>
            </fieldset>
          </>
        )}

        {modo === 'DIVERGENCIA' && (
          <>
            <AppTextarea label="O que não bate *" rows={3} value={divergencia} onChange={(e) => setDivergencia(e.target.value)} placeholder="Ex.: valor do ofício (R$ 120.000) diferente do SIOP (R$ 98.000)" data-testid="emendas-etapa-divergencia" />
            <AppInput label="Devolvido em" type="date" value={data} onChange={(e) => setData(e.target.value)} />
            <div style={aviso('info')}>
              O pedido volta para "Minuta": a CAEP faz a {rodada + 1}ª minuta e manda ao parlamentar. A minuta e o ofício devolvidos ficam no histórico do pedido.
              A reserva continua.
            </div>
          </>
        )}

        {modo === 'CANCELAR' && (
          <>
            <div style={aviso('info')}>A quantidade de todas as linhas volta ao saldo da CAEP. O pedido continua na lista, em Cancelados.</div>
            <AppSelect label="Motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)}>
              {MOTIVOS_CANCELAMENTO.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </AppSelect>
            {motivo === 'Outro' && <AppInput label="Qual?" value={outroMotivo} onChange={(e) => setOutroMotivo(e.target.value)} />}
          </>
        )}

        {tentou && pendencias.length > 0 && (
          <div style={aviso('erro')} role="alert" data-testid="emendas-etapa-pendencias">
            Falta: {pendencias.join('; ')}.
          </div>
        )}
      </form>
    </Modal>
  );
};
