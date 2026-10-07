import React from 'react';
import { ActionButton, AppInput, AppSelect, AppTextarea, Modal, NoticeBar, StatusBadge } from '../../design-system';
import { useBuscaEmpenhoPorNumero } from '../../hooks/useVinculoEmpenhosContrato';
import { numeroDeEmpenhoValido, numeroOficialDoEmpenho, type EmpenhoEncontrado, type NovaNotaEmpenho } from '../../services/contratoEmpenhoVinculoService';
import { credorDiferenteDoFornecedor } from '../../utils/fornecedorMatch';
import { UASGS_CGLIC } from '../../config/unidadesGestoras';

const MOTIVO_MIN = 5;
const MOTIVO_MAX = 500;

const formatCurrency = (val?: number | null) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);
const formatDate = (val?: string | null) => {
  if (!val) return '—';
  const [a, m, d] = val.split('T')[0].split('-');
  return d ? `${d}/${m}/${a}` : val;
};

/** "27.200,00", "27200,5" ou "27200.50" → número; vazio ou inválido → null. */
export function lerValorEmReais(texto: string): number | null {
  const t = texto.trim().replace(/^R\$\s*/i, '');
  if (!t) return null;
  const normal = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t;
  if (!/^\d+(\.\d{1,2})?$/.test(normal)) return null;
  return Number(normal);
}

const motivoValido = (m: string) => m.trim().length >= MOTIVO_MIN && m.trim().length <= MOTIVO_MAX;

// ------------------------------------------------------------------------------------------------
// Vincular à mão: NE que o Contratos.gov.br não lista neste contrato
// ------------------------------------------------------------------------------------------------

export interface ContratoDoVinculo {
  numero: string;
  uasg?: string;
  fornecedorNome?: string;
  fornecedorCnpjCpf?: string;
}

export interface PedidoDeVinculo {
  motivo: string;
  empenhoId?: string;
  novaNota?: NovaNotaEmpenho;
}

interface VincularEmpenhoModalProps {
  isOpen: boolean;
  contrato: ContratoDoVinculo;
  /** Empenhos já vinculados a este contrato (não podem ser escolhidos de novo). */
  idsVinculados: Set<string>;
  isLoading: boolean;
  erro?: string;
  onVincular: (pedido: PedidoDeVinculo) => void;
  onFechar: () => void;
}

const INFORMAR = '__informar__';

export const VincularEmpenhoModal: React.FC<VincularEmpenhoModalProps> = ({
  isOpen,
  contrato,
  idsVinculados,
  isLoading,
  erro,
  onVincular,
  onFechar
}) => {
  const [numero, setNumero] = React.useState('');
  const [procurado, setProcurado] = React.useState('');
  const [escolha, setEscolha] = React.useState('');
  const [uasg, setUasg] = React.useState(contrato.uasg || UASGS_CGLIC[0]);
  const [dataEmissao, setDataEmissao] = React.useState('');
  const [valor, setValor] = React.useState('');
  const [credorNome, setCredorNome] = React.useState(contrato.fornecedorNome || '');
  const [credorCnpj, setCredorCnpj] = React.useState(contrato.fornecedorCnpjCpf || '');
  const [motivo, setMotivo] = React.useState('');

  React.useEffect(() => {
    if (!isOpen) return;
    setNumero('');
    setProcurado('');
    setEscolha('');
    setUasg(contrato.uasg || UASGS_CGLIC[0]);
    setDataEmissao('');
    setValor('');
    setCredorNome(contrato.fornecedorNome || '');
    setCredorCnpj(contrato.fornecedorCnpjCpf || '');
    setMotivo('');
  }, [isOpen, contrato.uasg, contrato.fornecedorNome, contrato.fornecedorCnpjCpf]);

  const busca = useBuscaEmpenhoPorNumero(procurado, isOpen && numeroDeEmpenhoValido(procurado));
  const encontrados = busca.data ?? [];
  const numeroOk = numeroDeEmpenhoValido(numero);
  const procurar = () => {
    if (!numeroOk) return;
    setProcurado(numero.trim());
    setEscolha('');
  };

  const escolhido: EmpenhoEncontrado | undefined = encontrados.find((e) => e.empenhoId === escolha);
  const informando = escolha === INFORMAR;
  const valorLido = lerValorEmReais(valor);
  // Mesmo número e mesma UG de uma nota já gravada é a mesma nota: tem de ser escolhida na lista.
  const jaGravadaNaUg = informando ? encontrados.find((e) => e.uasgEmitente === uasg) : undefined;
  const novaNotaOk = informando && !jaGravadaNaUg && Boolean(dataEmissao) && valorLido !== null && /^\d{6}$/.test(uasg);
  const podeVincular = motivoValido(motivo) && (Boolean(escolhido) || novaNotaOk) && !isLoading;
  const credorDiverge = (e: { credorNome?: string; credorCnpjCpf?: string }) =>
    credorDiferenteDoFornecedor({ cnpj: e.credorCnpjCpf, nome: e.credorNome }, { cnpj: contrato.fornecedorCnpjCpf, nome: contrato.fornecedorNome });

  const confirmar = () => {
    if (!podeVincular) return;
    if (escolhido) {
      onVincular({ motivo: motivo.trim(), empenhoId: escolhido.empenhoId });
      return;
    }
    onVincular({
      motivo: motivo.trim(),
      novaNota: {
        numero: procurado,
        uasgEmitente: uasg,
        dataEmissao,
        valorEmpenhado: valorLido ?? 0,
        credorNome,
        credorCnpjCpf: credorCnpj
      }
    });
  };

  const opcoesUasg = Array.from(new Set([contrato.uasg, ...UASGS_CGLIC].filter(Boolean))) as string[];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onFechar}
      dismissible={!isLoading}
      title="Vincular empenho ao contrato"
      subtitle={`Contrato ${contrato.numero}${contrato.fornecedorNome ? ` · ${contrato.fornecedorNome}` : ''}`}
      size="lg"
      testId="vincular-empenho-modal"
      footer={
        <>
          <ActionButton action="cancelar" onClick={onFechar} disabled={isLoading} />
          <ActionButton
            action="vincular"
            label="Vincular empenho"
            onClick={confirmar}
            disabled={!podeVincular}
            isLoading={isLoading}
            data-testid="vincular-empenho-confirmar"
          />
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <p style={{ margin: 0, lineHeight: 1.5, color: 'var(--text-secondary)' }}>
          Use só para a nota que o Contratos.gov.br não lista neste contrato. O vínculo fica marcado como feito pela equipe, com seu nome e o
          motivo, e a sincronização não o remove. Se a fonte passar a listar a nota, o vínculo passa a ser da fonte.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            procurar();
          }}
          style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', flexWrap: 'wrap' }}
        >
          <div style={{ flex: '1 1 220px' }}>
            <AppInput
              label="Número da nota de empenho"
              placeholder="2025NE000123"
              value={numero}
              onChange={(e) => setNumero(e.target.value)}
              error={numero && !numeroOk ? 'Use o formato ano + NE + número, ex.: 2025NE000123.' : undefined}
              data-testid="vincular-empenho-numero"
            />
          </div>
          <ActionButton action="conferir" label="Procurar" type="submit" disabled={!numeroOk} data-testid="vincular-empenho-procurar" />
        </form>

        {procurado && busca.isLoading && <span style={{ color: 'var(--text-muted)' }}>Procurando {numeroOficialDoEmpenho(procurado)}…</span>}
        {procurado && busca.isError && (
          <NoticeBar tone="danger" testId="vincular-empenho-busca-erro">
            Não foi possível procurar a nota agora: {busca.error?.message}
          </NoticeBar>
        )}

        {procurado && !busca.isLoading && !busca.isError && (
          <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <legend style={{ fontWeight: 600, marginBottom: '0.4rem' }}>
              {encontrados.length > 0
                ? `Notas ${numeroOficialDoEmpenho(procurado)} gravadas no sistema`
                : `A nota ${numeroOficialDoEmpenho(procurado)} não está gravada no sistema`}
            </legend>
            {encontrados.map((e) => {
              const jaVinculado = idsVinculados.has(e.empenhoId);
              const diverge = credorDiverge(e);
              return (
                <label
                  key={e.empenhoId}
                  data-testid="vincular-empenho-opcao"
                  style={{
                    display: 'flex',
                    gap: '0.6rem',
                    alignItems: 'flex-start',
                    padding: '0.6rem 0.75rem',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    opacity: jaVinculado ? 0.6 : 1,
                    cursor: jaVinculado ? 'not-allowed' : 'pointer'
                  }}
                >
                  <input
                    type="radio"
                    name="empenho-escolhido"
                    value={e.empenhoId}
                    checked={escolha === e.empenhoId}
                    disabled={jaVinculado}
                    onChange={() => setEscolha(e.empenhoId)}
                    style={{ marginTop: '0.2rem' }}
                  />
                  <span style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                    <span>
                      <strong>{e.numeroOficial}</strong> · UG emitente {e.uasgEmitente} · emitida em {formatDate(e.dataEmissao)} ·{' '}
                      {formatCurrency(e.valorEmpenhado)}
                    </span>
                    <span style={{ color: 'var(--text-secondary)' }}>{e.credorNome || 'Credor não informado'}</span>
                    <span style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                      {jaVinculado && <StatusBadge label="Já vinculada a este contrato" variant="info" size="sm" dot={false} />}
                      {diverge && <StatusBadge label="Credor diferente do fornecedor" variant="warning" size="sm" dot={false} />}
                    </span>
                  </span>
                </label>
              );
            })}
            <label
              data-testid="vincular-empenho-opcao-informar"
              style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', padding: '0.6rem 0.75rem', border: '1px dashed var(--border)', borderRadius: '8px', cursor: 'pointer' }}
            >
              <input type="radio" name="empenho-escolhido" value={INFORMAR} checked={informando} onChange={() => setEscolha(INFORMAR)} />
              <span>
                {encontrados.length > 0 ? 'Nenhuma destas: informar os dados da nota' : 'Informar os dados da nota'}
              </span>
            </label>
          </fieldset>
        )}

        {informando && (
          <div
            data-testid="vincular-empenho-nova-nota"
            style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: '0.75rem' }}
          >
            <AppSelect
              label="UG emitente"
              value={uasg}
              onChange={(e) => setUasg(e.target.value)}
              error={jaGravadaNaUg ? `A nota ${jaGravadaNaUg.numeroOficial} da UG ${uasg} já está gravada; escolha-a na lista acima.` : undefined}
            >
              {opcoesUasg.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </AppSelect>
            <AppInput label="Data de emissão" type="date" value={dataEmissao} onChange={(e) => setDataEmissao(e.target.value)} />
            <AppInput
              label="Valor empenhado (R$)"
              inputMode="decimal"
              placeholder="27.200,00"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              error={valor && valorLido === null ? 'Valor inválido. Ex.: 27.200,00' : undefined}
            />
            <AppInput label="Credor" value={credorNome} onChange={(e) => setCredorNome(e.target.value)} />
            <AppInput label="CNPJ ou CPF do credor" value={credorCnpj} onChange={(e) => setCredorCnpj(e.target.value)} />
            <span style={{ gridColumn: '1 / -1', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              A nota fica gravada como informada à mão. Quando o Contratos.gov.br trouxer a mesma nota, os dados oficiais substituem estes.
            </span>
          </div>
        )}

        {(escolhido || informando) && (
          <AppTextarea
            label="Por que este empenho é deste contrato?"
            hint={`Fica registrado com seu nome. De ${MOTIVO_MIN} a ${MOTIVO_MAX} caracteres.`}
            value={motivo}
            maxLength={MOTIVO_MAX}
            rows={3}
            onChange={(e) => setMotivo(e.target.value)}
            data-testid="vincular-empenho-motivo"
          />
        )}
        {escolhido && credorDiverge(escolhido) && (
          <NoticeBar tone="warning" testId="vincular-empenho-credor-diverge">
            O credor desta nota, {escolhido.credorNome || 'não informado'}, não é o fornecedor do contrato. Confira antes de vincular.
          </NoticeBar>
        )}
        {erro && (
          <NoticeBar tone="danger" testId="vincular-empenho-erro">
            {erro}
          </NoticeBar>
        )}
      </div>
    </Modal>
  );
};
