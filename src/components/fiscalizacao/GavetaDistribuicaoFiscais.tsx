import React from 'react';
import { formatNumber } from '../../utils/format';
import { ROTULO_RELACAO_EQUIPE, mediaDaEquipeFiscal, type CargaDoFiscal } from '../../utils/fiscalizacao';

const plural = (n: number, um: string, varios: string) => `${formatNumber(n)} ${n === 1 ? um : varios}`;

/**
 * Gaveta Distribuição do Painel da fiscalização, nos mesmos cartões da gaveta de Atas e Contratos (GavetaDistribuicao):
 * primeiro o "A definir" (contratos de emenda sem decisão, que levam à Distribuição), depois um cartão por fiscal com os
 * contratos (e o que falta autuar ou registrar) e a barra da carga em relação à maior carteira. Ordem: mais pendências,
 * depois a maior carteira. Fiscal sem contrato vai para uma linha no rodapé. O cartão do fiscal filtra o Painel pela
 * carteira dele.
 */
export const GavetaDistribuicaoFiscais: React.FC<{
  carga: CargaDoFiscal[];
  aDefinir: number;
  onEscolherFiscal: (userId: string) => void;
  onDistribuir: () => void;
}> = ({ carga, aDefinir, onEscolherFiscal, onDistribuir }) => {
  const comCarteira = carga.filter((f) => f.contratos > 0);
  const semCarteira = carga.filter((f) => f.contratos === 0).map((f) => f.nome).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const maior = Math.max(0, ...comCarteira.map((f) => f.contratos));
  const pendencias = (f: CargaDoFiscal) => f.aAutuar + f.semPortaria;
  const { media, relacao } = mediaDaEquipeFiscal(carga);
  // Régua comum: a maior carteira (ou a média) ocupa quase toda a largura, como na Distribuição de Atas e Contratos.
  const escala = Math.max(maior, media ?? 0) * 1.1;
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
          const pct = escala > 0 ? Math.round((100 * f.contratos) / escala) : 0;
          const rel = relacao.get(f.userId);
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
              {f.outroPerfil && <span className="pn-gc-perfil">{f.outroPerfil} · também fiscal</span>}
              <span className="pn-gc-corpo">
                <span className="pn-gc-lado">
                  <span className="pn-gc-rotulo">Contratos</span>
                  <span className="pn-gc-num">{formatNumber(f.contratos)}</span>
                  <span className="pn-gc-tags">
                    {f.aAutuar > 0 && <span className="pn-gc-tag pn-gc-tag--atencao">{formatNumber(f.aAutuar)} a autuar</span>}
                    {f.semPortaria > 0 && <span className="pn-gc-tag pn-gc-tag--atencao">{formatNumber(f.semPortaria)} sem portaria</span>}
                  </span>
                </span>
              </span>
              <span className="pn-gc-carga" title={rel ? 'A barra mostra os contratos do fiscal. O tracejado é a média da equipe.' : undefined}>
                {rel && <span className={`pn-gc-relacao${rel === 'ACIMA' ? ' pn-gc-relacao--acima' : ''}`} data-testid="fisc-inicio-distribuicao-relacao">{ROTULO_RELACAO_EQUIPE[rel]}</span>}
                <span className="pn-gc-barra pn-gc-barra--media" aria-hidden="true">
                  <span style={{ width: `${Math.max(2, pct)}%` }} />
                  {rel && media !== null && <i style={{ left: `${Math.min(100, (100 * media) / escala)}%` }} />}
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
