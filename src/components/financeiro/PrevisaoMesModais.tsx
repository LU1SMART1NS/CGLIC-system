import React, { useState } from 'react';
import { ActionButton, Modal, NoticeBar } from '../../design-system';
import type { LinhaPrevisao } from '../../services/previsaoMensalService';
import { DateField, Field, FooterButtons } from '../contracts/payment/PaymentCycleModals';
import { errorMessage, useEmpenhosDoContrato } from '../contracts/payment/cicloPagamentoShared';
import { formatCurrencyInputBR, isoToBR, parseCurrencyInputBR, parseDateInputBR, todayISO } from '../contracts/payment/paymentFormUtils';

const moeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const paraCampo = (v: number) => (v > 0 ? formatCurrencyInputBR(String(Math.round(v * 100))) : '');

/** Corrige valor, subitem ou a marca de emenda de uma linha da previsão (ou desfaz o ajuste). */
export const AjustarLinhaModal: React.FC<{
  linha: LinhaPrevisao | null;
  numeroContrato?: string;
  onClose: () => void;
  onSubmit: (input: { valor: number | null; subitem: string | null; emenda: boolean | null }) => Promise<void>;
  onDesfazer: () => Promise<void>;
}> = ({ linha, numeroContrato, onClose, onSubmit, onDesfazer }) => {
  const [valor, setValor] = useState('');
  const [subitem, setSubitem] = useState('');
  const [emenda, setEmenda] = useState<'AUTO' | 'SIM' | 'NAO'>('AUTO');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  React.useEffect(() => {
    if (!linha) return;
    setValor(paraCampo(linha.valor));
    setSubitem(linha.subitem ?? '');
    setEmenda(linha.emenda === linha.emendaAutomatica ? 'AUTO' : linha.emenda ? 'SIM' : 'NAO');
    setErro(null);
  }, [linha]);

  if (!linha) return null;
  const executar = async (fn: () => Promise<void>) => {
    setSalvando(true);
    setErro(null);
    try {
      await fn();
      onClose();
    } catch (err) {
      setErro(errorMessage(err, 'Não foi possível salvar o ajuste.'));
    } finally {
      setSalvando(false);
    }
  };
  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    const v = parseCurrencyInputBR(valor);
    if (!v) return setErro('Informe o valor.');
    void executar(() =>
      onSubmit({
        valor: Math.abs(v - linha.valorOriginal) < 0.005 ? null : v,
        subitem: subitem.trim() || null,
        emenda: emenda === 'AUTO' ? null : emenda === 'SIM'
      })
    );
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Ajustar linha${numeroContrato ? ` · contrato ${numeroContrato}` : ''}`}
      size="md"
      dismissible={!salvando}
      testId="previsao-ajustar-modal"
      footer={<FooterButtons formId="previsao-ajustar-form" onCancel={onClose} saving={salvando} submitLabel="Salvar ajuste" />}
    >
      <form id="previsao-ajustar-form" onSubmit={enviar} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ fontSize: '0.82rem', color: '#475569' }}>
          {linha.detalhe}. Valor calculado: <strong>{moeda(linha.valorOriginal)}</strong>.
        </div>
        <Field id="ajuste-valor" label="Valor previsto *">
          <input id="ajuste-valor" className="form-input" type="text" inputMode="numeric" value={valor} onChange={(e) => setValor(formatCurrencyInputBR(e.target.value))} required />
        </Field>
        <Field id="ajuste-subitem" label="Subitem do empenho" hint="2 dígitos (ex.: 39) ou o elemento completo com 8 dígitos.">
          <input id="ajuste-subitem" className="form-input" type="text" inputMode="numeric" maxLength={8} value={subitem} onChange={(e) => setSubitem(e.target.value.replace(/\D/g, ''))} />
        </Field>
        <Field id="ajuste-emenda" label="Emenda parlamentar" hint={`O sistema concluiu: ${linha.emendaAutomatica ? 'é emenda' : 'não é emenda'} (pelo plano interno do empenho).`}>
          <select id="ajuste-emenda" className="form-input" value={emenda} onChange={(e) => setEmenda(e.target.value as 'AUTO' | 'SIM' | 'NAO')}>
            <option value="AUTO">Como o sistema concluiu</option>
            <option value="SIM">É emenda</option>
            <option value="NAO">Não é emenda</option>
          </select>
        </Field>
        {linha.ajustada && (
          <div>
            <ActionButton action="desfazer" type="button" size="sm" onClick={() => void executar(onDesfazer)} label="Desfazer o ajuste" />
          </div>
        )}
        {erro && <NoticeBar tone="danger" testId="previsao-ajustar-erro">{erro}</NoticeBar>}
      </form>
    </Modal>
  );
};

/** Inclui uma linha que o sistema não prevê (entrega de bens, emenda, outro pagamento). */
export const IncluirLinhaModal: React.FC<{
  isOpen: boolean;
  contratos: Array<{ contractKey: string; numero: string; fornecedorNome?: string }>;
  onClose: () => void;
  onSubmit: (input: { contractKey: string; empenhoKey: string | null; subitem: string | null; valor: number; descricao: string; emenda: boolean | null }) => Promise<void>;
}> = ({ isOpen, contratos, onClose, onSubmit }) => {
  const [contrato, setContrato] = useState('');
  const [empenho, setEmpenho] = useState('');
  const [subitem, setSubitem] = useState('');
  const [valor, setValor] = useState('');
  const [descricao, setDescricao] = useState('');
  const [emenda, setEmenda] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const { data: empenhos = [] } = useEmpenhosDoContrato(isOpen && contrato ? contrato : undefined);

  React.useEffect(() => {
    if (isOpen) {
      setContrato('');
      setEmpenho('');
      setSubitem('');
      setValor('');
      setDescricao('');
      setEmenda(false);
      setErro(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;
  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = parseCurrencyInputBR(valor);
    if (!contrato || !v) return setErro('Escolha o contrato e informe o valor.');
    setSalvando(true);
    setErro(null);
    try {
      await onSubmit({ contractKey: contrato, empenhoKey: empenho || null, subitem: subitem || null, valor: v, descricao: descricao.trim(), emenda: emenda || null });
      onClose();
    } catch (err) {
      setErro(errorMessage(err, 'Não foi possível incluir a linha.'));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Incluir linha na previsão"
      size="md"
      dismissible={!salvando}
      testId="previsao-incluir-modal"
      footer={<FooterButtons formId="previsao-incluir-form" onCancel={onClose} saving={salvando} submitLabel="Incluir" />}
    >
      <form id="previsao-incluir-form" onSubmit={enviar} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <Field id="incluir-contrato" label="Contrato *">
          <select id="incluir-contrato" className="form-input" value={contrato} onChange={(e) => { setContrato(e.target.value); setEmpenho(''); }} required>
            <option value="">Escolha o contrato</option>
            {contratos.map((c) => (
              <option key={c.contractKey} value={c.contractKey}>
                {c.numero}{c.fornecedorNome ? ` · ${c.fornecedorNome}` : ''}
              </option>
            ))}
          </select>
        </Field>
        <Field id="incluir-empenho" label="Nota de empenho">
          <select id="incluir-empenho" className="form-input" value={empenho} onChange={(e) => setEmpenho(e.target.value)} disabled={!contrato}>
            <option value="">Não informada</option>
            {empenhos.map((e) => (
              <option key={e.canonicalKey} value={e.canonicalKey}>
                {e.numero} · saldo {moeda(e.saldo)}
              </option>
            ))}
          </select>
        </Field>
        <div className="form-grid">
          <Field id="incluir-subitem" label="Subitem">
            <input id="incluir-subitem" className="form-input" type="text" inputMode="numeric" maxLength={8} value={subitem} onChange={(e) => setSubitem(e.target.value.replace(/\D/g, ''))} />
          </Field>
          <Field id="incluir-valor" label="Valor previsto *">
            <input id="incluir-valor" className="form-input" type="text" inputMode="numeric" placeholder="0,00" value={valor} onChange={(e) => setValor(formatCurrencyInputBR(e.target.value))} required />
          </Field>
        </div>
        <Field id="incluir-descricao" label="O que será pago">
          <input id="incluir-descricao" className="form-input" type="text" placeholder="Ex.: entrega de 20 viaturas" value={descricao} onChange={(e) => setDescricao(e.target.value)} />
        </Field>
        <label htmlFor="incluir-emenda" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.85rem' }}>
          <input id="incluir-emenda" type="checkbox" checked={emenda} onChange={(e) => setEmenda(e.target.checked)} />
          Recurso de emenda parlamentar
        </label>
        {erro && <NoticeBar tone="danger" testId="previsao-incluir-erro">{erro}</NoticeBar>}
      </form>
    </Modal>
  );
};

/** Registra o envio do mês: SEI e data, com a foto das linhas enviadas. */
export const RegistrarEnvioModal: React.FC<{
  isOpen: boolean;
  mesRotulo: string;
  quantidade: number;
  total: number;
  jaEnviada: boolean;
  onClose: () => void;
  onSubmit: (input: { sei: string; enviadoEm: string }) => Promise<void>;
}> = ({ isOpen, mesRotulo, quantidade, total, jaEnviada, onClose, onSubmit }) => {
  const [sei, setSei] = useState('');
  const [data, setData] = useState(isoToBR(todayISO()));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  React.useEffect(() => {
    if (isOpen) {
      setSei('');
      setData(isoToBR(todayISO()));
      setErro(null);
    }
  }, [isOpen]);
  if (!isOpen) return null;
  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    const dataISO = parseDateInputBR(data);
    if (!dataISO) return setErro('Informe a data completa.');
    setSalvando(true);
    setErro(null);
    try {
      await onSubmit({ sei: sei.trim(), enviadoEm: dataISO });
      onClose();
    } catch (err) {
      setErro(errorMessage(err, 'Não foi possível registrar o envio.'));
    } finally {
      setSalvando(false);
    }
  };
  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Registrar envio · previsão de ${mesRotulo}`}
      size="md"
      dismissible={!salvando}
      testId="previsao-envio-modal"
      footer={<FooterButtons formId="previsao-envio-form" onCancel={onClose} saving={salvando} submitLabel="Registrar envio" />}
    >
      <form id="previsao-envio-form" onSubmit={enviar} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <NoticeBar tone="info" testId="previsao-envio-resumo">
          {quantidade} {quantidade === 1 ? 'linha' : 'linhas'}, total {moeda(total)}. As linhas ficam guardadas como foram enviadas, para comparar com o
          que for pago no mês.{jaEnviada ? ' Já havia um envio registrado: este o substitui.' : ''}
        </NoticeBar>
        <Field id="envio-prev-sei" label="SEI do documento enviado *">
          <input id="envio-prev-sei" className="form-input" type="text" value={sei} onChange={(e) => setSei(e.target.value)} required />
        </Field>
        <DateField id="envio-prev-data" label="Enviado em *" value={data} onChange={setData} />
        {erro && <NoticeBar tone="danger" testId="previsao-envio-erro">{erro}</NoticeBar>}
      </form>
    </Modal>
  );
};
