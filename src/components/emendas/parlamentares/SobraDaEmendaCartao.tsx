import React from 'react';
import { StatusBadge } from '../../../design-system/components/StatusBadge';
import { ActionButton } from '../../../design-system/components/ActionButton';
import { carteiraDetalhe } from '../../carteira/carteiraStyles';
import { formatCurrency } from '../../../utils/format';
import { ROTULO_SITUACAO_SOBRA, type SobraDaEmenda } from '../../../utils/emendasSobra';
import { VARIANTE_SOBRA } from './sobraVisual';

/** Barra da emenda: empenhado, em andamento e sobra sobre o valor no SIOP (ou o empenhado, se passar dele). */
export const BarraDaEmenda: React.FC<{ valor: number; empenhado: number; emAndamento: number; sobra: number }> = ({ valor, empenhado, emAndamento, sobra }) => {
  const base = Math.max(valor, empenhado + emAndamento) || 1;
  const pct = (v: number) => `${(Math.max(v, 0) / base) * 100}%`;
  return (
    <div className="emendas-sobra-barra" title={`Empenhado ${formatCurrency(empenhado)} · Em andamento ${formatCurrency(emAndamento)} · Sobra ${formatCurrency(Math.max(sobra, 0))}`}>
      <i className="emendas-sobra-barra__empenhado" style={{ width: pct(Math.min(empenhado, base)) }} />
      <i className="emendas-sobra-barra__andamento" style={{ width: pct(emAndamento) }} />
      <i className="emendas-sobra-barra__sobra" style={{ width: pct(sobra) }} />
    </div>
  );
};

/**
 * A sobra de uma emenda do ano (migration 204): valor no SIOP, empenhado, em andamento e sobra, a situação e o botão
 * "Novo pedido com a sobra". Era o detalhe da linha em Pedidos › Por parlamentar; agora fica no Parlamentar 360.
 */
export const SobraDaEmendaCartao: React.FC<{ e: SobraDaEmenda; minimo: number | null; podeGerir: boolean; onNovoComSobra: (e: SobraDaEmenda) => void }> = ({ e, minimo, podeGerir, onNovoComSobra }) => (
  <div className="emendas-sobra-emenda" data-testid={`emendas-sobra-${e.codigo}`}>
    <div className="emendas-sobra-emenda__topo">
      <b>Sobra da emenda</b>
      <StatusBadge label={ROTULO_SITUACAO_SOBRA[e.situacao]} variant={VARIANTE_SOBRA[e.situacao]} size="sm" dot={false} />
      <span style={{ flex: 1 }} />
      {podeGerir && (
        <ActionButton
          action="novo"
          size="sm"
          label="Novo pedido com a sobra"
          disabled={e.situacao !== 'sobra'}
          title={e.situacao !== 'sobra' ? 'Só com sobra que compre pelo menos o item mais barato da CAEP.' : undefined}
          onClick={() => onNovoComSobra(e)}
          data-testid={`emendas-sobra-novo-${e.codigo}`}
        />
      )}
    </div>
    {e.valor != null && <BarraDaEmenda valor={e.valor} empenhado={e.empenhado} emAndamento={e.emAndamento} sobra={e.sobra} />}
    <div className="emendas-sobra-emenda__valores">
      <span>
        Valor no SIOP <b>{e.valor == null ? '—' : formatCurrency(e.valor)}</b>
      </span>
      <span>
        Empenhado <b>{formatCurrency(e.empenhado)}</b> {e.fonteDoEmpenhado === 'PORTAL' ? '(notas da SENASP no Portal da Transparência)' : '(notas ligadas no sistema)'}
      </span>
      <span>
        Em andamento <b>{formatCurrency(e.emAndamento)}</b>
      </span>
      <span>
        Sobra <b>{formatCurrency(e.sobra)}</b>
      </span>
    </div>
    {e.situacao === 'conferir' && e.notasSemValor > 0 && (
      <div style={carteiraDetalhe}>
        {e.notasSemValor === 1 ? '1 nota da SENASP' : `${e.notasSemValor} notas da SENASP`} desta emenda no Portal ainda não {e.notasSemValor === 1 ? 'está' : 'estão'} no sistema: o empenhado fica a menos até a busca diária das notas trazê-las.
      </div>
    )}
    {e.situacao === 'conferir' && e.notasSemValor === 0 && (
      <div style={carteiraDetalhe}>
        {e.linhasSemNota === 1 ? '1 item empenhado ainda sem nota ligada' : `${e.linhasSemNota} itens empenhados ainda sem nota ligada`}: a sobra pelas notas do sistema não é confiável. As notas da emenda ainda não foram lidas no Portal da Transparência.
      </div>
    )}
    {e.situacao === 'acima' && <div style={carteiraDetalhe}>O empenhado passa do valor no SIOP: confira o valor da emenda no pedido ou a nota ligada.</div>}
    {e.situacao === 'semValor' && <div style={carteiraDetalhe}>Sem o valor da emenda: ele é informado na conferência com o SIOP.</div>}
    {e.situacao === 'executada' && e.sobra > 0.004 && minimo != null && <div style={carteiraDetalhe}>A sobra não compra nem o item mais barato da CAEP ({formatCurrency(minimo)}).</div>}
  </div>
);
