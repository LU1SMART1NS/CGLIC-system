import React from 'react';
import { StatusBadge } from '../../../design-system/components/StatusBadge';
import { ActionButton } from '../../../design-system/components/ActionButton';
import { carteiraDetalhe } from '../../carteira/carteiraStyles';
import { formatCurrency, formatDateBR } from '../../../utils/format';
import { ROTULO_SITUACAO_SOBRA, type SobraDaEmenda } from '../../../utils/emendasSobra';
import { hojeEmBrasilia } from '../../../hooks/useEmendas';
import { VARIANTE_SOBRA } from './sobraVisual';

/** Barra da emenda: empenhado, em andamento e sobra sobre o valor no SIOP (ou o empenhado, se passar dele). */
/** Ano encerrado (`encerrado`): o resto sai em cinza, como "Não empenhado". */
export const BarraDaEmenda: React.FC<{ valor: number; empenhado: number; emAndamento: number; sobra: number; encerrado?: boolean }> = ({ valor, empenhado, emAndamento, sobra, encerrado }) => {
  const base = Math.max(valor, empenhado + emAndamento) || 1;
  const pct = (v: number) => `${(Math.max(v, 0) / base) * 100}%`;
  const resto = encerrado ? 'Não empenhado' : 'Sobra';
  return (
    <div className="emendas-sobra-barra" title={`Empenhado ${formatCurrency(empenhado)}${encerrado ? '' : ` · Em andamento ${formatCurrency(emAndamento)}`} · ${resto} ${formatCurrency(Math.max(sobra, 0))}`}>
      <i className="emendas-sobra-barra__empenhado" style={{ width: pct(Math.min(empenhado, base)) }} />
      <i className="emendas-sobra-barra__andamento" style={{ width: pct(emAndamento) }} />
      <i className={encerrado ? 'emendas-sobra-barra__perdido' : 'emendas-sobra-barra__sobra'} style={{ width: pct(sobra) }} />
    </div>
  );
};

/**
 * A sobra de uma emenda do ano (migration 204): valor no SIOP, empenhado, em andamento e sobra, a situação e o botão
 * "Novo pedido com a sobra". Era o detalhe da linha em Pedidos › Por parlamentar; agora fica no Parlamentar 360.
 */
export const SobraDaEmendaCartao: React.FC<{ e: SobraDaEmenda; minimo: number | null; podeGerir: boolean; onNovoComSobra: (e: SobraDaEmenda) => void }> = ({ e, minimo, podeGerir, onNovoComSobra }) => {
  // Ano encerrado (28/10/2026): o resto perdeu o crédito; sem "em andamento" e sem pedido novo.
  const encerrado = e.ano < Number(hojeEmBrasilia().slice(0, 4));
  return (
  <div className="emendas-sobra-emenda" data-testid={`emendas-sobra-${e.codigo}`}>
    <div className="emendas-sobra-emenda__topo">
      <b>{encerrado ? `Execução da emenda (${e.ano}, ano encerrado)` : 'Sobra da emenda'}</b>
      <StatusBadge label={ROTULO_SITUACAO_SOBRA[e.situacao]} variant={VARIANTE_SOBRA[e.situacao]} size="sm" dot={false} />
      <span style={{ flex: 1 }} />
      {podeGerir && !encerrado && (
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
    {e.valor != null && <BarraDaEmenda valor={e.valor} empenhado={e.empenhado} emAndamento={e.emAndamento} sobra={e.sobra} encerrado={encerrado} />}
    <div className="emendas-sobra-emenda__valores">
      <span>
        Valor no SIOP <b>{e.valor == null ? '—' : formatCurrency(e.valor)}</b>
        {e.valorLidoEm && <> (lido em {formatDateBR(e.valorLidoEm)})</>}
      </span>
      <span>
        Ofícios <b>{formatCurrency(e.oficiado)}</b>
        {e.oficiosAInformar > 0 && <> ({e.oficiosAInformar === 1 ? '1 a informar' : `${e.oficiosAInformar} a informar`})</>}
      </span>
      <span>
        Empenhado <b>{formatCurrency(e.empenhado)}</b> {e.fonteDoEmpenhado === 'PORTAL' ? '(notas da SENASP no Portal da Transparência)' : '(notas ligadas no sistema)'}
      </span>
      {!encerrado && (
        <span>
          {e.oficiosAInformar === 0 ? 'Falta empenhar' : 'Em andamento'} <b>{formatCurrency(e.emAndamento)}</b>
        </span>
      )}
      <span>
        {encerrado ? 'Não empenhado' : 'Sobra'} <b>{formatCurrency(e.sobra)}</b>
      </span>
    </div>
    {e.situacao === 'naoEmpenhado' && <div style={carteiraDetalhe}>O que não foi empenhado até 31/12/{e.ano} perdeu o crédito: não dá para fazer pedido novo com este valor.</div>}
    {e.situacao === 'conferir' && e.notasSemValor > 0 && (
      <div style={carteiraDetalhe}>
        {e.notasSemValor === 1 ? '1 nota da SENASP' : `${e.notasSemValor} notas da SENASP`} desta emenda no Portal ainda não {e.notasSemValor === 1 ? 'está' : 'estão'} no sistema: o empenhado fica a menos até a busca diária das notas trazê-las.
      </div>
    )}
    {e.situacao === 'conferir' && e.notasSemValor === 0 && (
      <div style={carteiraDetalhe}>
        {e.linhasSemNota === 1 ? '1 item empenhado ainda sem nota ligada' : `${e.linhasSemNota} itens empenhados ainda sem nota ligada`}: {encerrado ? 'o não empenhado' : 'a sobra'} pelas notas do sistema não é confiável. As notas da emenda ainda não foram lidas no Portal da Transparência.
      </div>
    )}
    {e.situacao === 'informar' && (
      <div style={carteiraDetalhe}>
        {e.oficiosAInformar === 1 ? '1 pedido conferido sem o valor do ofício' : `${e.oficiosAInformar} pedidos conferidos sem o valor do ofício`}: informe no pedido para a sobra sair pela diferença entre a emenda e os ofícios.
      </div>
    )}
    {e.situacao === 'acima' && (
      <div style={carteiraDetalhe}>
        {e.valor != null && e.oficiado - e.valor > 0.004
          ? 'Os ofícios somam mais que o valor da emenda no SIOP: confira se o SIOP diminuiu ou se um ofício substitui o outro.'
          : 'O empenhado passa do valor no SIOP: confira o valor da emenda ou a nota ligada.'}
      </div>
    )}
    {e.situacao === 'semValor' && <div style={carteiraDetalhe}>Sem o valor da emenda: ele é informado na conferência com o SIOP.</div>}
    {e.situacao === 'executada' && !encerrado && e.sobra > 0.004 && minimo != null && <div style={carteiraDetalhe}>A sobra não compra nem o item mais barato da CAEP ({formatCurrency(minimo)}).</div>}
  </div>
  );
};
