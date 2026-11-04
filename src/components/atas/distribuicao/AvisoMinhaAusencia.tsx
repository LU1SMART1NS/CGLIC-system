import React from 'react';
import { NoticeBar } from '../../../design-system';
import { ROTULO_MOTIVO_AUSENCIA, type TransferenciaTemporaria } from '../../../services/transferenciaTemporariaService';
import { ausenciaDe, dataBR, recebidasPor, resumoPorDestino, textoQuantidade } from './transferenciaTemporaria';

/**
 * Aviso no Início do gestor: o que recebeu de colega ausente (até quando) e, para quem está fora, com quem a
 * carteira ficou. As atas e contratos recebidos já entram na carteira de quem assumiu, como os próprios.
 */
export const AvisoMinhaAusencia: React.FC<{ transferencias: TransferenciaTemporaria[]; userId: string | null | undefined }> = ({ transferencias, userId }) => {
  const minha = ausenciaDe(transferencias, userId);
  const recebidas = recebidasPor(transferencias, userId);
  if (!minha && recebidas.length === 0) return null;
  return (
    <>
      {minha && (
        <NoticeBar tone="info" testId="aviso-minha-ausencia">
          Sua carteira está com {resumoPorDestino(minha.itens).map((r) => r.nome).join(', ')} até {dataBR(minha.retornoPrevisto)} (
          {ROTULO_MOTIVO_AUSENCIA[minha.motivo].toLowerCase()}). Volta quando a coordenação desfizer a transferência.
        </NoticeBar>
      )}
      {recebidas.map((r) => (
        <NoticeBar key={r.transferencia.id} tone="info" testId={`aviso-recebidas-${r.transferencia.ausenteNome}`}>
          Você está com <strong>{textoQuantidade(r.atas, r.contratos)}</strong> de {r.transferencia.ausenteNome} até {dataBR(r.transferencia.retornoPrevisto)} (
          {ROTULO_MOTIVO_AUSENCIA[r.transferencia.motivo].toLowerCase()}), com os contratos ligados às atas. Eles voltam para {r.transferencia.ausenteNome} quando a
          coordenação desfizer a transferência.
        </NoticeBar>
      ))}
    </>
  );
};
