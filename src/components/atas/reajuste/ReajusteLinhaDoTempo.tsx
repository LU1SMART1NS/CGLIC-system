import React from 'react';
import type { CicloReajuste, ParametrosReajuste } from '../../../services/reajusteAtasService';
import { formatDateBR } from '../../../services/temporalEngineService';
import { dataBaseNaTela, origemDaBase, percentual } from './reajusteRotulos';

interface Marco {
  data: string;
  tipo: 'termo' | 'vigencia' | 'hoje' | CicloReajuste['situacao'];
  titulo: string;
  texto: string;
}

const somarAnos = (iso: string, anos: number) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y + anos, m - 1, d)).toISOString().slice(0, 10);
};

/**
 * Linha do tempo do reajuste: do Termo de Conformidade ao limite de 2 anos da ata (1 + 1 de prorrogação), com o início
 * da vigência, a prorrogação, cada reajuste e o dia de hoje. A faixa cheia é a vigência; a tracejada, a prorrogação
 * possível. Rola na horizontal no celular.
 */
export const ReajusteLinhaDoTempo: React.FC<{
  parametros: ParametrosReajuste | null;
  ciclos: CicloReajuste[];
  inicioVigencia: string;
  fimVigencia: string;
  hoje?: Date;
}> = ({ parametros, ciclos, inicioVigencia, fimVigencia, hoje = new Date() }) => {
  const base = origemDaBase(parametros);
  const dataBase = parametros?.termoData ?? parametros?.termoMesApostilamento ?? parametros?.dataOrcamentoEdital ?? null;
  if (!dataBase || !inicioVigencia || !fimVigencia) return null;
  const limite = somarAnos(inicioVigencia, 2);
  const hojeIso = hoje.toISOString().slice(0, 10);
  const marcos: Marco[] = [
    { data: dataBase, tipo: 'termo', titulo: base === 'EDITAL' ? 'Orçamento (edital)' : 'Termo de Conformidade', texto: dataBaseNaTela(parametros) },
    { data: inicioVigencia, tipo: 'vigencia', titulo: 'Início da ata', texto: formatDateBR(inicioVigencia) }
  ];
  if (fimVigencia < limite) {
    marcos.push({ data: fimVigencia, tipo: 'vigencia', titulo: 'Fim da vigência', texto: formatDateBR(fimVigencia) });
    marcos.push({ data: limite, tipo: 'vigencia', titulo: 'Limite se prorrogar', texto: formatDateBR(limite) });
  } else {
    const prorrogacao = somarAnos(inicioVigencia, 1);
    marcos.push({ data: prorrogacao, tipo: 'vigencia', titulo: 'Prorrogação', texto: formatDateBR(prorrogacao) });
    marcos.push({ data: fimVigencia, tipo: 'vigencia', titulo: 'Fim da vigência', texto: formatDateBR(fimVigencia) });
  }
  for (const c of ciclos) {
    marcos.push({ data: c.efeitoInicio, tipo: c.situacao, titulo: `${c.ciclo}º reajuste`, texto: `${formatDateBR(c.efeitoInicio)} · ${c.percentual != null ? percentual(c.percentual) : 'sem %'}` });
  }
  marcos.push({ data: hojeIso, tipo: 'hoje', titulo: 'Hoje', texto: formatDateBR(hojeIso) });
  marcos.sort((a, b) => a.data.localeCompare(b.data));

  const t0 = Date.parse(dataBase);
  const t1 = Date.parse(limite);
  const x = (iso: string) => Math.min(100, Math.max(0, ((Date.parse(iso) - t0) / Math.max(t1 - t0, 1)) * 100));

  return (
    <div className="reaj-tempo-caixa" data-testid="reajuste-linha-do-tempo">
      <div className="reaj-tempo" role="img" aria-label={`Linha do tempo do reajuste: ${marcos.map((m) => `${m.titulo} ${m.texto}`).join('; ')}`}>
        <div className="reaj-tempo__trilho" />
        <div className="reaj-tempo__vig" style={{ left: `${x(inicioVigencia)}%`, width: `${x(fimVigencia) - x(inicioVigencia)}%` }} />
        {fimVigencia < limite && <div className="reaj-tempo__vig reaj-tempo__vig--prorr" style={{ left: `${x(fimVigencia)}%`, width: `${x(limite) - x(fimVigencia)}%` }} />}
        {marcos.map((m, i) => (
          <div key={`${m.titulo}-${m.data}`} className={`reaj-tempo__marco reaj-tempo__marco--${m.tipo.toLowerCase()} ${i % 2 ? 'reaj-tempo__marco--baixo' : 'reaj-tempo__marco--cima'}`} style={{ left: `${x(m.data)}%` }}>
            <span className="reaj-tempo__pino" />
            <span className="reaj-tempo__rotulo"><strong>{m.titulo}</strong>{m.texto}</span>
          </div>
        ))}
      </div>
      <div className="reaj-tempo__legenda">
        <span><i className="reaj-tempo__cor reaj-tempo__cor--termo" />Data-base</span>
        <span><i className="reaj-tempo__cor reaj-tempo__cor--aplicado" />Aplicado</span>
        <span><i className="reaj-tempo__cor reaj-tempo__cor--devido" />Devido</span>
        <span><i className="reaj-tempo__cor reaj-tempo__cor--publicado_sem_percentual" />Publicado sem percentual</span>
        <span><i className="reaj-tempo__cor reaj-tempo__cor--previsto" />Previsto</span>
        <span><i className="reaj-tempo__cor reaj-tempo__cor--se_prorrogar" />Se prorrogar</span>
        <span>Faixa cheia: vigência; tracejada: prorrogação possível</span>
      </div>
    </div>
  );
};
