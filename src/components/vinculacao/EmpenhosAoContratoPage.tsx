import React from 'react';
import { Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { CarteiraSegmentTabs } from '../carteira/CarteiraSegmentTabs';
import { EmpenhosContratoPage } from './EmpenhosContratoPage';
import { NotasForaDoContratoPage } from './NotasForaDoContratoPage';
import { useContagemVinculacao } from './useContagemVinculacao';

export type VerEmpenhosAoContrato = 'fatura' | 'sem-contrato';

/**
 * Vínculos → Empenhos ao contrato: as duas filas de nota que o Contratos.gov.br não lista no contrato certo, numa aba só
 * (decisão de 04/11/2026). "Citadas em fatura": a fatura de um contrato cita nota fora dele (migration 117). "Sem
 * contrato": nenhum contrato lista a nota (migration 256). A correção é sempre no Contratos.gov.br.
 */
export const EmpenhosAoContratoPage: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const ver: VerEmpenhosAoContrato = params.get('ver') === 'sem-contrato' ? 'sem-contrato' : 'fatura';
  const contagem = useContagemVinculacao();
  // Cada visão tem os próprios filtros: trocar de visão limpa a URL.
  const trocar = (v: VerEmpenhosAoContrato) => setParams(v === 'sem-contrato' ? { ver: 'sem-contrato' } : {}, { replace: true });

  const alternador = (
    <CarteiraSegmentTabs
      testIdPrefix="vinc-empenhos-contrato-ver"
      ariaLabel="Ver"
      active={ver}
      onSelect={(v) => trocar(v as VerEmpenhosAoContrato)}
      segments={[
        { id: 'fatura', label: 'Citadas em fatura', count: contagem?.aoContrato, title: 'A fatura de um contrato cita nota que o Contratos.gov.br não lista nele' },
        { id: 'sem-contrato', label: 'Sem contrato', count: contagem?.notasForaDoContrato, title: 'O Contratos.gov.br não lista a nota em nenhum contrato' }
      ]}
    />
  );

  return ver === 'sem-contrato' ? <NotasForaDoContratoPage alternador={alternador} /> : <EmpenhosContratoPage alternador={alternador} />;
};

/** Endereço antigo da visão "Sem contrato" (PR #483): leva à aba unida, com os mesmos filtros. */
export const NotasForaDoContratoRedirect: React.FC = () => {
  const { search } = useLocation();
  const q = new URLSearchParams(search);
  q.set('ver', 'sem-contrato');
  return <Navigate to={`/vinculacao/empenhos-contrato?${q.toString()}`} replace />;
};
