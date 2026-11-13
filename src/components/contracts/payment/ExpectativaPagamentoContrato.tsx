import React, { useMemo, useState } from 'react';
import { ActionButton, DataTable, SectionHeader, StatusBadge, useToast, type Column } from '../../../design-system';
import { useFaturasDoContrato } from '../../../hooks/useFaturasDoContrato';
import { useEntregasParaPagamento, useExpectativasPagamento } from '../../../hooks/useExpectativasPagamento';
import type { EntregaParaPagamento } from '../../../services/entregasParaPagamentoService';
import { PAGAMENTO_RULES } from '../../../config/alertRules';
import {
  historicoDePagamentos,
  sugerirExpectativa,
  ultimosMesesFechados,
  type TipoExpectativa
} from '../../../services/expectativaPagamentoService';
import { Field } from './PaymentCycleModals';
import { errorMessage } from './cicloPagamentoShared';
import { formatCurrencyInputBR, isoToBR, parseCurrencyInputBR } from './paymentFormUtils';
import { formatCurrency } from '../../../utils/format';

const AUTOMATICO = '__AUTO__';
const ROTULO: Record<TipoExpectativa, string> = { MENSAL: 'Mensal', ENTREGA: 'Por entrega', EVENTUAL: 'Eventual' };
const subtle: React.CSSProperties = { fontSize: '0.78rem', color: '#64748b' };

/**
 * Expectativa de pagamento do contrato (migration 89): mensal, por entrega ou eventual, com o valor mensal informado.
 * As entregas vêm da Fiscalização (migration 305): itens a entregar com a data prevista e itens entregues ainda sem
 * pagamento. O cadastro manual de entregas previstas saiu. Base da previsão mensal da Portaria 50 e dos avisos de nota.
 */
export const ExpectativaPagamentoContrato: React.FC<{ contractKey: string; canEdit: boolean; registradoPorNome?: string }> = ({
  contractKey,
  canEdit,
  registradoPorNome
}) => {
  const toast = useToast();
  const { marcas, definir } = useExpectativasPagamento();
  const { entregas: doContrato } = useEntregasParaPagamento(contractKey);
  const { data: faturasContrato } = useFaturasDoContrato(contractKey);

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

  const [tipo, setTipo] = useState<string>(marca?.tipo ?? AUTOMATICO);
  const [valorMensal, setValorMensal] = useState(marca?.valorMensal ? formatCurrencyInputBR(String(Math.round(marca.valorMensal * 100))) : '');
  const [observacao, setObservacao] = useState(marca?.observacao ?? '');
  const [salvando, setSalvando] = useState(false);

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
      ? `Sugestão do sistema: mensal (pago nos 3 últimos meses, média ${formatCurrency(historico?.media ?? 0)}).`
      : sugestao === 'TALVEZ_MENSAL'
        ? `Sugestão do sistema: talvez mensal (pago em 2 dos 3 últimos meses, média ${formatCurrency(historico?.media ?? 0)}).`
        : 'Sem padrão de pagamento nos 3 últimos meses.';

  const hoje = new Date().toISOString().slice(0, 10);
  const colunas: Column<EntregaParaPagamento>[] = [
    {
      key: 'situacao',
      header: 'Situação',
      priority: 'primary',
      render: (e) => {
        if (e.situacao === 'A_ENTREGAR') return <StatusBadge label={e.data < hoje ? 'Prazo vencido' : 'A entregar'} variant={e.data < hoje ? 'warning' : 'info'} size="sm" dot={false} />;
        const dias = Math.round((Date.parse(`${hoje}T12:00:00Z`) - Date.parse(`${e.data}T12:00:00Z`)) / 864e5);
        return <StatusBadge label={dias > PAGAMENTO_RULES.notaAposEntregaDias ? 'Entregue · cobrar a nota' : 'Entregue · aguardando a nota'} variant={dias > PAGAMENTO_RULES.notaAposEntregaDias ? 'warning' : 'success'} size="sm" dot={false} />;
      }
    },
    { key: 'data', header: 'Data', render: (e) => <strong>{isoToBR(e.data)}</strong> },
    { key: 'itens', header: 'Itens', align: 'right', render: (e) => e.itens },
    { key: 'valor', header: 'Valor', align: 'right', render: (e) => (e.valor > 0 ? formatCurrency(e.valor) : '—') + (e.semPreco ? ` · ${e.semPreco} sem preço` : '') }
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
        marca?.valorMensal ? <div style={subtle}>Valor mensal informado: {formatCurrency(marca.valorMensal)}</div> : null
      )}
      {marca?.atualizadoPorNome && <div style={subtle}>Marcado por {marca.atualizadoPorNome}.</div>}

      {(tipo === 'ENTREGA' || marca?.tipo === 'ENTREGA' || doContrato.length > 0) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <strong style={{ fontSize: '0.85rem' }}>Entregas pela Fiscalização</strong>
          <div style={subtle}>
            Datas do fiscal do contrato. A previsão mensal conta o pagamento no mês seguinte à entrega prevista; entregue há mais de{' '}
            {PAGAMENTO_RULES.notaAposEntregaDias} dias sem nota, o gestor recebe aviso (regras em Ajustes › Regras e alertas).
          </div>
          <DataTable
            columns={colunas}
            data={doContrato}
            keyExtractor={(e) => `${e.situacao}-${e.data}`}
            emptyMessage="Sem itens na Fiscalização: as datas de entrega vêm dos contratos acompanhados pela SFC/CGLIC."
            testId="expectativa-entregas"
          />
        </div>
      )}
    </div>
  );
};
