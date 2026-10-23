/** Regras do cadastro de beneficiários das emendas (migration 155), fora das telas para poder testar. */
import { formatarCep, soDigitos, type BeneficiarioEmenda, type DadosDaReceita } from '../services/emendasService';

const EMAIL_VALIDO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const UFS = new Set('AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' '));

export interface FormularioBeneficiario {
  nomeCurto: string;
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
  responsavelWhatsapp: boolean;
  responsavelEmail: string;
}

/** O que falta para salvar; vazio = pode salvar. */
export function pendenciasDoBeneficiario(receita: DadosDaReceita | null, f: FormularioBeneficiario): string[] {
  const p: string[] = [];
  if (!receita) p.push('busque o CNPJ na Receita');
  if (!f.nomeCurto.trim()) p.push('nome curto');
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


export function enderecoDeEntrega(b: BeneficiarioEmenda): string {
  return [
    [b.entregaLogradouro, b.entregaNumero].filter(Boolean).join(', '),
    b.entregaComplemento,
    b.entregaBairro,
    `${b.entregaMunicipio}/${b.entregaUf}`,
    `CEP ${formatarCep(b.entregaCep)}`
  ]
    .filter(Boolean)
    .join(' · ');
}
