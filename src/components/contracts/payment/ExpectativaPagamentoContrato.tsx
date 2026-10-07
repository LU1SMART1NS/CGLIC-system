import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ActionButton, DataTable, Modal, NoticeBar, SectionHeader, StatusBadge, useToast, type Column } from '../../../design-system';
import { fetchFaturasDoContrato } from '../../../services/faturasService';
import { FATURAS_DO_CONTRATO_QUERY_KEY } from '../ContractFaturasSection';
import { useExpectativasPagamento } from '../../../hooks/useExpectativasPagamento';
import {
  historicoDePagamentos,
  sugerirExpectativa,
  ultimosMesesFechados,
  type EntregaPrevista,
  type TipoExpectativa
} from '../../../services/expectativaPagamentoService';
import { DateField, Field, FooterButtons } from './PaymentCycleModals';
import { errorMessage, useEmpenhosDoContrato } from './cicloPagamentoShared';
import { formatCurrencyInputBR, isoToBR, parseCurrencyInputBR, parseDateInputBR } from './paymentFormUtils';

const moeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const AUTOMATICO = '__AUTO__';
const ROTULO: Record<TipoExpectativa, string> = { MENSAL: 'Mensal', ENTREGA: 'Por entrega', EVENTUAL: 'Eventual' };
const subtle: React.CSSProperties = { fontSize: '0.78rem', color: '#64748b' };

/**
 * Expectativa de pagamento do contrato (migration 89): mensal, por entrega ou eventual, com o valor mensal informado e
 * as entregas previstas. Base da previsão mensal da Portaria 50 e dos avisos de nota que não chegou.
 */
export const ExpectativaPagamentoContrato: React.FC<{ contractKey: string; canEdit: boolean; registradoPorNome?: string }> = ({
  contractKey,
  canEdit,
  registradoPorNome
}) => {
  const toast = useToast();
  const { marcas, entregas, definir, salvarEntrega, cancelarEntrega } = useExpectativasPagamento();
  const { data: faturasContrato } = useQuery({
    queryKey: FATURAS_DO_CONTRATO_QUERY_KEY(contractKey),
    queryFn: () => fetchFaturasDoContrato(contractKey),
    enabled: Boolean(contractKey),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false
  });

  const marca = marcas.get(contractKey);
  const meses = useMemo(() => ultimosMesesFechados(), []);
  const historico = useMemo(
    () =>
      historicoDePagamentos(
        (faturasContrato?.faturas ?? []).map((f) => ({
          contractKey,
          paga: f.paga,
          cancelada: f.cancelada,
          obEmissao: f.obEmissao,
          valorLiquido: f.valor - (f.glosa ?? 0)
        })),
        meses
      ).get(contractKey),
    [faturasContrato, meses, contractKey]
  );
  const sugestao = sugerirExpectativa(historico, meses.length);
  const doContrato = entregas.filter((e) => e.contractKey === contractKey && e.situacao === 'PREVISTA');

  const [tipo, setTipo] = useState<string>(marca?.tipo ?? AUTOMATICO);
  const [valorMensal, setValorMensal] = useState(marca?.valorMensal ? formatCurrencyInputBR(String(Math.round(marca.valorMensal * 100))) : '');
  const [observacao, setObservacao] = useState(marca?.observacao ?? '');
  const [salvando, setSalvando] = useState(false);
  const [entregaAberta, setEntregaAberta] = useState<EntregaPrevista | 'NOVA' | null>(null);
  const [cancelando, setCancelando] = useState<EntregaPrevista | null>(null);

  // Quando a marca chega do banco (ou muda em outra aba), o formulário acompanha.
  React.useEffect(() => {
    setTipo(marca?.tipo ?? AUTOMATICO);
    setValorMensal(marca?.valorMensal ? formatCurrencyInputBR(String(Math.round(marca.valorMensal * 100))) : '');
    setObservacao(marca?.observacao ?? '');
  }, [marca?.tipo, marca?.valorMensal, marca?.observacao]);

  const mudou =
    tipo !== (marca?.tipo ?? AUTOMATICO) ||
    (tipo === 'MENSAL' && (parseCurrencyInputBR(valorMensal) ?? null) !== (marca?.valorMensal ?? null)) ||
    (tipo !== AUTOMATICO && observacao.trim() !== (marca?.observacao ?? ''));

  const salvar = async () => {
    setSalvando(true);
    try {
      await definir({
        contractKey,
        tipo: tipo === AUTOMATICO ? null : (tipo as TipoExpectativa),
        valorMensal: tipo === 'MENSAL' ? (parseCurrencyInputBR(valorMensal) ?? null) : null,
        observacao: observacao.trim() || null,
        registradoPorNome
      });
      toast.success('Expectativa de pagamento salva.');
    } catch (err) {
      toast.error(errorMessage(err, 'Não foi possível salvar.'));
    } finally {
      setSalvando(false);
    }
  };

  const textoSugestao =
    sugestao === 'MENSAL'
      ? `Sugestão do sistema: mensal (pago nos 3 últimos meses, média ${moeda(historico?.media ?? 0)}).`
      : sugestao === 'TALVEZ_MENSAL'
        ? `Sugestão do sistema: talvez mensal (pago em 2 dos 3 últimos meses, média ${moeda(historico?.media ?? 0)}).`
        : 'Sem padrão de pagamento nos 3 últimos meses.';

  const colunas: Column<EntregaPrevista>[] = [
    { key: 'data', header: 'Data prevista', priority: 'primary', render: (e) => <strong>{isoToBR(e.dataPrevista)}</strong> },
    { key: 'descricao', header: 'O que será entregue', render: (e) => e.descricao },
    { key: 'valor', header: 'Valor', align: 'right', render: (e) => moeda(e.valor) },
    { key: 'empenho', header: 'Empenho', render: (e) => (e.empenhoCanonicalKey ? e.empenhoCanonicalKey.split('-').pop() : '—') }
  ];

  return (
    <div data-testid="expectativa-pagamento" style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        <SectionHeader title="Expectativa de pagamento" />
        <StatusBadge label={marca ? ROTULO[marca.tipo] : 'Automático'} variant={marca ? 'info' : 'neutral'} size="sm" dot={false} />
      </div>
      <div style={subtle}>{textoSugestao} Serve para a previsão mensal (Portaria 50) e para avisar quando a nota não chega.</div>

      {canEdit ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: '0.6rem', alignItems: 'end' }}>
          <Field id="expectativa-tipo" label="Como este contrato é pago">
            <select id="expectativa-tipo" className="form-input" value={tipo} onChange={(e) => setTipo(e.target.value)} data-testid="expectativa-tipo">
              <option value={AUTOMATICO}>Automático (o sistema decide pelo histórico)</option>
              <option value="MENSAL">Mensal (serviço contínuo)</option>
              <option value="ENTREGA">Por entrega (bens, ordens de fornecimento)</option>
              <option value="EVENTUAL">Eventual (sob demanda)</option>
            </select>
          </Field>
          {tipo === 'MENSAL' && (
            <Field id="expectativa-valor" label="Valor mensal (opcional)" hint="Sem valor, a previsão usa a média dos 3 últimos pagamentos.">
              <input id="expectativa-valor" className="form-input" type="text" inputMode="numeric" placeholder="0,00" value={valorMensal} onChange={(e) => setValorMensal(formatCurrencyInputBR(e.target.value))} />
            </Field>
          )}
          {tipo !== AUTOMATICO && (
            <Field id="expectativa-obs" label="Observação">
              <input id="expectativa-obs" className="form-input" type="text" placeholder="Ex.: nota chega até o dia 5" value={observacao} onChange={(e) => setObservacao(e.target.value)} />
            </Field>
          )}
          <div>
            <ActionButton action="salvar" size="sm" onClick={() => void salvar()} disabled={!mudou || salvando} isLoading={salvando} data-testid="expectativa-salvar" />
          </div>
        </div>
      ) : (
        marca?.valorMensal ? <div style={subtle}>Valor mensal informado: {moeda(marca.valorMensal)}</div> : null
      )}
      {marca?.atualizadoPorNome && <div style={subtle}>Marcado por {marca.atualizadoPorNome}.</div>}

      {(tipo === 'ENTREGA' || marca?.tipo === 'ENTREGA' || doContrato.length > 0) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
            <strong style={{ fontSize: '0.85rem' }}>Entregas previstas</strong>
            {canEdit && <ActionButton action="adicionar" size="sm" onClick={() => setEntregaAberta('NOVA')} label="Incluir entrega" data-testid="expectativa-incluir-entrega" />}
          </div>
          <DataTable
            columns={colunas}
            data={doContrato}
            keyExtractor={(e) => e.id}
            emptyMessage="Nenhuma entrega prevista."
            testId="expectativa-entregas"
            rowActions={
              canEdit
                ? (e) => (
                    <span style={{ display: 'inline-flex', gap: '0.3rem' }}>
                      <ActionButton action="editar" size="sm" iconOnly label="Corrigir entrega" onClick={() => setEntregaAberta(e)} />
                      <ActionButton action="remover" size="sm" iconOnly label="Cancelar entrega" onClick={() => setCancelando(e)} />
                    </span>
                  )
                : undefined
            }
          />
        </div>
      )}

      <EntregaModal
        contractKey={contractKey}
        entrega={entregaAberta}
        onClose={() => setEntregaAberta(null)}
        onSubmit={async (input) => {
          await salvarEntrega({ ...input, contractKey, registradoPorNome });
          toast.success('Entrega prevista salva.');
        }}
      />
      <CancelarEntregaModal
        entrega={cancelando}
        onClose={() => setCancelando(null)}
        onSubmit={async (motivo) => {
          await cancelarEntrega(cancelando!.id, motivo);
          toast.success('Entrega cancelada.');
        }}
      />
    </div>
  );
};

const EntregaModal: React.FC<{
  contractKey: string;
  entrega: EntregaPrevista | 'NOVA' | null;
  onClose: () => void;
  onSubmit: (input: { id?: string; dataPrevista: string; valor: number; descricao: string; empenhoCanonicalKey?: string | null }) => Promise<void>;
}> = ({ contractKey, entrega, onClose, onSubmit }) => {
  const { data: empenhos = [] } = useEmpenhosDoContrato(entrega ? contractKey : undefined);
  const existente = entrega && entrega !== 'NOVA' ? entrega : null;
  const [data, setData] = useState('');
  const [valor, setValor] = useState('');
  const [descricao, setDescricao] = useState('');
  const [empenho, setEmpenho] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  React.useEffect(() => {
    setData(existente ? isoToBR(existente.dataPrevista) : '');
    setValor(existente ? formatCurrencyInputBR(String(Math.round(existente.valor * 100))) : '');
    setDescricao(existente?.descricao ?? '');
    setEmpenho(existente?.empenhoCanonicalKey ?? '');
    setErro(null);
  }, [entrega]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!entrega) return null;

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    const dataISO = parseDateInputBR(data);
    const v = parseCurrencyInputBR(valor);
    if (!dataISO || !v) return setErro('Informe a data completa e o valor.');
    setSalvando(true);
    setErro(null);
    try {
      await onSubmit({ id: existente?.id, dataPrevista: dataISO, valor: v, descricao: descricao.trim(), empenhoCanonicalKey: empenho || null });
      onClose();
    } catch (err) {
      setErro(errorMessage(err, 'Não foi possível salvar a entrega.'));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={existente ? 'Corrigir entrega prevista' : 'Incluir entrega prevista'}
      size="md"
      dismissible={!salvando}
      testId="expectativa-entrega-modal"
      footer={<FooterButtons formId="expectativa-entrega-form" onCancel={onClose} saving={salvando} submitLabel="Salvar" />}
    >
      <form id="expectativa-entrega-form" onSubmit={enviar} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <DateField id="entrega-data" label="Data prevista da entrega *" value={data} onChange={setData} />
        <Field id="entrega-descricao" label="O que será entregue *">
          <input id="entrega-descricao" className="form-input" type="text" placeholder="Ex.: 20 viaturas (ordem de fornecimento 3)" value={descricao} onChange={(e) => setDescricao(e.target.value)} required />
        </Field>
        <Field id="entrega-valor" label="Valor previsto *">
          <input id="entrega-valor" className="form-input" type="text" inputMode="numeric" placeholder="0,00" value={valor} onChange={(e) => setValor(formatCurrencyInputBR(e.target.value))} required />
        </Field>
        <Field id="entrega-empenho" label="Empenho">
          <select id="entrega-empenho" className="form-input" value={empenho} onChange={(e) => setEmpenho(e.target.value)}>
            <option value="">Não informado</option>
            {empenhos.map((e) => (
              <option key={e.canonicalKey} value={e.canonicalKey}>
                {e.numero} · saldo {moeda(e.saldo)}
              </option>
            ))}
          </select>
        </Field>
        {erro && <NoticeBar tone="danger" testId="expectativa-entrega-erro">{erro}</NoticeBar>}
      </form>
    </Modal>
  );
};

const CancelarEntregaModal: React.FC<{ entrega: EntregaPrevista | null; onClose: () => void; onSubmit: (motivo: string) => Promise<void> }> = ({
  entrega,
  onClose,
  onSubmit
}) => {
  const [motivo, setMotivo] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  React.useEffect(() => {
    setMotivo('');
    setErro(null);
  }, [entrega?.id]);
  if (!entrega) return null;
  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setSalvando(true);
    try {
      await onSubmit(motivo.trim());
      onClose();
    } catch (err) {
      setErro(errorMessage(err, 'Não foi possível cancelar.'));
    } finally {
      setSalvando(false);
    }
  };
  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Cancelar entrega prevista"
      size="md"
      dismissible={!salvando}
      testId="expectativa-cancelar-modal"
      footer={<FooterButtons formId="expectativa-cancelar-form" onCancel={onClose} saving={salvando} submitLabel="Cancelar entrega" />}
    >
      <form id="expectativa-cancelar-form" onSubmit={enviar} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ fontSize: '0.85rem' }}>
          {entrega.descricao} · {isoToBR(entrega.dataPrevista)} · {moeda(entrega.valor)}
        </div>
        <Field id="cancelar-motivo" label="Motivo *">
          <input id="cancelar-motivo" className="form-input" type="text" placeholder="Ex.: entrega adiada para 2027" value={motivo} onChange={(e) => setMotivo(e.target.value)} required />
        </Field>
        {erro && <NoticeBar tone="danger" testId="expectativa-cancelar-erro">{erro}</NoticeBar>}
      </form>
    </Modal>
  );
};
