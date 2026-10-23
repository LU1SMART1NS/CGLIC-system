/** Regras do cadastro de beneficiários das emendas (migration 155), fora das telas para poder testar. */
import { soDigitos, type DadosDaReceita } from '../services/emendasService';

const EMAIL_VALIDO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const UFS = new Set('AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' '));

export interface FormularioBeneficiario {
  nomeCurto: string;
  /** Coluna ÓRGÃO do Anexo da reserva (lista fixa de ORGAOS_BENEFICIARIO). */
  orgao: string;
  entregaCep: string;
  entregaLogradouro: string;
  entregaNumero: string;
  entregaComplemento: string;
  entregaBairro: string;
  entregaMunicipio: string;
  entregaUf: string;
  responsavelNome: string;
  responsavelCargo: string;
  responsavelTelefone: string;
  responsavelEmail: string;
}

/** O que falta para salvar; vazio = pode salvar. */
export function pendenciasDoBeneficiario(receita: DadosDaReceita | null, f: FormularioBeneficiario): string[] {
  const p: string[] = [];
  if (!receita) p.push('busque o CNPJ na Receita');
  if (!f.nomeCurto.trim()) p.push('nome curto');
  if (!f.orgao) p.push('órgão');
  if (soDigitos(f.entregaCep).length !== 8) p.push('CEP de entrega');
  if (!f.entregaLogradouro.trim()) p.push('logradouro');
  if (!f.entregaNumero.trim()) p.push('número (use S/N se não houver)');
  if (!f.entregaMunicipio.trim()) p.push('município');
  if (!UFS.has(f.entregaUf.trim().toUpperCase())) p.push('UF');
  if (!f.responsavelNome.trim()) p.push('nome do responsável');
  const tel = soDigitos(f.responsavelTelefone);
  if (tel && (tel.length < 10 || tel.length > 11)) p.push('telefone com DDD (10 ou 11 números)');
  if (f.responsavelEmail.trim() && !EMAIL_VALIDO.test(f.responsavelEmail.trim())) p.push('e-mail válido');
  return p;
}

/**
 * Link do WhatsApp do responsável: só celular brasileiro (DDD + 9 + 8 números) tem WhatsApp; fixo não ganha link.
 * Abre a conversa no WhatsApp Web ou no aplicativo (wa.me).
 */
export function linkDoWhatsapp(telefone: string | null | undefined): string | null {
  const d = soDigitos(telefone);
  return /^[1-9]{2}9\d{8}$/.test(d) ? `https://wa.me/55${d}` : null;
}
