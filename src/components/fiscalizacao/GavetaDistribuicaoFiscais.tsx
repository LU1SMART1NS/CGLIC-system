import React from 'react';
import { formatNumber } from '../../utils/format';
import type { CargaDoFiscal } from '../../utils/fiscalizacao';

const plural = (n: number, um: string, varios: string) => `${formatNumber(n)} ${n === 1 ? um : varios}`;

/**
 * Gaveta Distribuição do Painel da fiscalização, nos mesmos cartões da gaveta de Atas e Contratos (GavetaDistribuicao):
 * primeiro o "A definir" (contratos de emenda sem decisão, que levam à Distribuição), depois um cartão por fiscal com os
 * contratos de que é titular (e o que falta autuar ou registrar), os em que é substituto e a barra da carga em relação à
 * maior carteira. Ordem: mais pendências, depois a maior carteira. Fiscal sem contrato vai para uma linha no rodapé. O
 * cartão do fiscal filtra o Painel pela carteira dele.
 */
export const GavetaDistribuicaoFiscais: React.FC<{
  carga: CargaDoFiscal[];
  aDefinir: number;
  onEscolherFiscal: (userId: string) => void;
  onDistribuir: () => void;
}> = ({ carga, aDefinir, onEscolherFiscal, onDistribuir }) => {
  const comCarteira = carga.filter((f) => f.contratos + f.comoSubstituto > 0);
  const semCarteira = carga.filter((f) => f.contratos + f.comoSubstituto === 0).map((f) => f.nome).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const maior = Math.max(0, ...comCarteira.map((f) => f.contratos));
  const pendencias = (f: CargaDoFiscal) => f.aAutuar + f.semPortaria;
  const fiscais = [...comCarteira].sort((a, b) => pendencias(b) - pendencias(a) || b.contratos - a.contratos || a.nome.localeCompare(b.nome, 'pt-BR'));

  if (carga.length === 0 && aDefinir === 0) {
    return <p className="pn-gc-sem-carteira">Nenhum servidor com o perfil Gestor de Fiscalização.</p>;
  }
  return (
    <div className="pn-gdist">
      <div className="pn-gcards" data-testid="fisc-inicio-distribuicao-cartoes">
        {aDefinir > 0 && (
          <button type="button" className="pn-gcard pn-gcard--sem" onClick={onDistribuir} aria-label="Contratos a definir: abrir a Distribuição" data-testid="fisc-inicio-distribuicao-a-definir">
            <span className="pn-gc-head">
              <strong>A definir</strong>
              <span className="pn-gc-ir" aria-hidden="true">Distribuir ›</span>
            </span>
            <span className="pn-gc-corpo">
              <span className="pn-gc-lado">
                <span className="pn-gc-rotulo">Contratos</span>
                <span className="pn-gc-num">{formatNumber(aDefinir)}</span>
                <span className="pn-gc-tags">
                  <span className="pn-gc-tag pn-gc-tag--atencao">sem fiscal</span>
                </span>
              </span>
            </span>
          </button>
        )}
        {fiscais.map((f) => {
          const pct = maior > 0 ? Math.round((100 * f.contratos) / maior) : 0;
          return (
            <button
              key={f.userId}
              type="button"
              className="pn-gcard"
              onClick={() => onEscolherFiscal(f.userId)}
              aria-label={`${f.nome}: ver o painel com a carteira deste fiscal`}
              data-testid="fisc-inicio-distribuicao-fiscal"
            >
              <span className="pn-gc-head">
                <strong>{f.nome}</strong>
                <span className="pn-gc-ir" aria-hidden="true">›</span>
              </span>
              <span className="pn-gc-corpo">
                <span className="pn-gc-lado">
                  <span className="pn-gc-rotulo">Contratos</span>
                  <span className="pn-gc-num">{formatNumber(f.contratos)}</span>
                  <span className="pn-gc-tags">
                    {f.aAutuar > 0 && <span className="pn-gc-tag pn-gc-tag--atencao">{formatNumber(f.aAutuar)} a autuar</span>}
                    {f.semPortaria > 0 && <span className="pn-gc-tag pn-gc-tag--atencao">{formatNumber(f.semPortaria)} sem portaria</span>}
                  </span>
                </span>
                <span className="pn-gc-lado">
                  <span className="pn-gc-rotulo">Substituto</span>
                  <span className="pn-gc-num">{formatNumber(f.comoSubstituto)}</span>
                </span>
              </span>
              <span className="pn-gc-carga">
                <span className="pn-gc-barra" aria-hidden="true">
                  <span style={{ width: `${Math.max(2, pct)}%` }} />
                </span>
                <span className="pn-gc-carga-texto">
                  {plural(f.contratos, 'contrato', 'contratos')}
                  {f.contratos === maior && maior > 0 && fiscais.length > 1 ? ' · maior carteira' : ''}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      {semCarteira.length > 0 && (
        <p className="pn-gc-sem-carteira" data-testid="fisc-inicio-distribuicao-sem-carteira">
          Sem carteira: {semCarteira.join(', ')}
        </p>
      )}
    </div>
  );
};
