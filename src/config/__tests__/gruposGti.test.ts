import { describe, expect, it } from 'vitest';
import {
  chaveItemGti,
  contarPorGti,
  montarFatiasGti,
  montarFatiasItensGti,
  passaFiltroGti,
  resumirCelulaGti,
  resumirFatias,
  sugerirGrupoGti,
  textoDaFatia,
  type LinhaFatiaGti
} from '../gruposGti';

describe('sugestão do GTI (nomes reais do cadastro, 15/10/2026)', () => {
  it.each([
    ['EES-CORPO DE BOMB MILITAR EST. ESPÍRITO SANTO', 'CBMES/ES', 'E', 'LIGABOM'],
    ['SECRETARIA DE ESTADO DE DEFESA CIVIL/RJ', null, null, 'LIGABOM'],
    ['ERS-BRIGADA MILITAR EST. DO RIO GRANDE DO SUL', 'BRIGADA MILITAR/RS', 'E', 'CNCG'],
    ['ESP-COMANDO DE AVIACAO DA PM "JOAO NEGRAO"', null, null, 'CNCG'],
    ['ERO-FUNDO ESP MOD E REAPARELHAM DA POL MILIT', null, null, 'CNCG'],
    ['DELEGACIA GERAL DE POLÍC.CIVÍL DO EST.DO PI', 'ESTADO DO PIAUI', 'E', 'CNPC'],
    ['INSTITUTO-GERAL DE PERI?CIAS - IGP RS', 'IGP - RS', 'E', 'CONDPCI'],
    ['EPA - POLÍCIA CIENTÍFICA DO PARÁ', 'POLICIA CIENTÍF.-PA', 'E', 'CONDPCI'],
    ['EPB-SECRETÁRIA DE E. SEG.DEF.SOC. DA PARAÍBA', 'SEDS PARAIBA', 'E', 'CONSESP'],
    ['ESP-GABINETE DO SECRETARIO E ASSES.SEC.S.PUBL', null, null, 'CONSESP'],
    ['EBA-FUNDO ESTADUAL DE SEGURANÇA PUBLICA', null, null, 'CONSESP']
  ])('%s → %s', (nome, sigla, esfera, esperado) => {
    expect(sugerirGrupoGti(nome, sigla, esfera)).toBe(esperado);
  });

  it('Bombeiros do DF são da esfera federal e continuam LIGABOM', () => {
    expect(sugerirGrupoGti('CORPO DE BOMBEIROS MILITAR DO DF', 'CBMDF', 'F')).toBe('LIGABOM');
  });

  it.each([
    ['DIRETORIA TECNICO-CIENTIFICA/DPF', null, null],
    ['SUPERINTENDENCIA REG. POL. RODV. FEDERAL-MG', null, null],
    ['MJ-DPRF-DEPART.DE POL.RODOVIARIA FEDERAL/DF', null, null],
    ['PMSP - SECRETARIA MUNICIPAL SEGURANÇA URBANA', null, null],
    ['CES-SECRETARIA DE SEGURANÇA URBANA DE VITÓRIA', null, 'M'],
    ['GABINETE DE SEGURANÇA INSTITUCIONAL', 'GSI', 'F'],
    ['UNIVERSIDADE FEDERAL DE PERNAMBUCO', null, null],
    ['EGO-DIRETORIA-GERAL DE ADM. PENITENCIÁRIA', null, null],
    ['TRIBUNAL DE JUSTIÇA DE PERNAMBUCO', null, null],
    ['ESP-DEPARTAMENTO DE ADMINISTRACAO ADM.PENIT5', null, null],
    ['SENADO FEDERAL', null, null]
  ])('fora dos cinco GTIs: %s', (nome, sigla, esfera) => {
    expect(sugerirGrupoGti(nome, sigla, esfera)).toBe('OUTROS');
  });

  it('sem pista nenhuma: sem sugestão', () => {
    expect(sugerirGrupoGti('ECE-CASA CIVIL DO GOVERNO DO ESTADO DO CEARÁ', null, 'E')).toBeNull();
    expect(sugerirGrupoGti(null, null, null)).toBeNull();
  });
});

const linhas: LinhaFatiaGti[] = [
  { numero_ata: '00079/2024', uasg_gerenciadora: '200331', grupo: 'LIGABOM', quantidade: '2175', orgaos: 19 },
  { numero_ata: '00079/2024', uasg_gerenciadora: '200331', grupo: 'CONSESP', quantidade: 450, orgaos: 4 },
  { numero_ata: '00001/2025', uasg_gerenciadora: '200331', grupo: 'CNCG', quantidade: 30, orgaos: 3 },
  { numero_ata: '00001/2025', uasg_gerenciadora: '200331', grupo: 'CNPC', quantidade: 30, orgaos: 2 },
  { numero_ata: '00001/2025', uasg_gerenciadora: '200331', grupo: 'A_CONFIRMAR', quantidade: 40, orgaos: 5 },
  { numero_ata: '00002/2025', uasg_gerenciadora: '200331', grupo: 'A_CONFIRMAR', quantidade: 10, orgaos: 2 },
  { numero_ata: '00003/2025', uasg_gerenciadora: '200331', grupo: 'LIGABOM', quantidade: 0, orgaos: 1 }
];

describe('fatia da ata pelo valor (migration 141)', () => {
  it('com a coluna valor, a fatia é pelo valor e não pelas unidades', () => {
    // 2 drones (R$ 200 mil, CONSESP) contra 500 cartuchos (R$ 5 mil, Bombeiros).
    const m = montarFatiasGti([
      { numero_ata: '00010/2026', uasg_gerenciadora: '200331', grupo: 'CONSESP', quantidade: 2, orgaos: 1, valor: '200000' },
      { numero_ata: '00010/2026', uasg_gerenciadora: '200331', grupo: 'LIGABOM', quantidade: 500, orgaos: 1, valor: '5000' }
    ]);
    const f = m.get('00010/2026-200331')!;
    expect(f.principal?.grupo).toBe('CONSESP');
    expect(f.principal?.pct).toBe(98);
    expect(f.total).toBe(205000);
  });

  it('sem a coluna valor (antes da migration), vale a quantidade', () => {
    const m = montarFatiasGti([
      { numero_ata: '00010/2026', uasg_gerenciadora: '200331', grupo: 'CONSESP', quantidade: 2, orgaos: 1 },
      { numero_ata: '00010/2026', uasg_gerenciadora: '200331', grupo: 'LIGABOM', quantidade: 500, orgaos: 1 }
    ]);
    expect(m.get('00010/2026-200331')!.principal?.grupo).toBe('LIGABOM');
  });
});

describe('fatias das atas', () => {
  const m = montarFatiasGti(linhas);

  it('soma por grupo e calcula a fatia (ata 00079/2024: 83% Bombeiros, como na medição)', () => {
    const f = m.get('00079/2024-200331')!;
    expect(f.total).toBe(2625);
    expect(f.principal).toMatchObject({ grupo: 'LIGABOM', pct: 83, orgaos: 19 });
    expect(f.fatias.map((x) => x.grupo)).toEqual(['LIGABOM', 'CONSESP']);
  });

  it('empate fica com o primeiro na ordem; "a confirmar" entra no total mas não é principal', () => {
    const f = m.get('00001/2025-200331')!;
    expect(f.principal?.grupo).toBe('CNCG');
    expect(f.principal?.pct).toBe(30);
    expect(f.orgaosAConfirmar).toBe(5);
  });

  it('só órgãos a confirmar: sem interesse principal', () => {
    expect(m.get('00002/2025-200331')!.principal).toBeNull();
  });

  it('quantidade zero: sem percentual e sem principal', () => {
    const f = m.get('00003/2025-200331')!;
    expect(f.total).toBe(0);
    expect(f.principal).toBeNull();
    expect(f.fatias[0].pct).toBe(0);
  });

  it('filtro por modo', () => {
    const f = m.get('00079/2024-200331');
    expect(passaFiltroGti(f, 'LIGABOM', 'PRINCIPAL')).toBe(true);
    expect(passaFiltroGti(f, 'CONSESP', 'PRINCIPAL')).toBe(false);
    expect(passaFiltroGti(f, 'CONSESP', '20')).toBe(false);
    expect(passaFiltroGti(f, 'CONSESP', 'PRESENCA')).toBe(true);
    expect(passaFiltroGti(f, 'LIGABOM', '50')).toBe(true);
    expect(passaFiltroGti(undefined, 'LIGABOM', 'PRESENCA')).toBe(false);
    expect(passaFiltroGti(undefined, 'TODOS', 'PRINCIPAL')).toBe(true);
  });

  it('contagem do menu', () => {
    expect(contarPorGti([...m.values()], 'PRINCIPAL')).toEqual({ LIGABOM: 1, CNCG: 1 });
    expect(contarPorGti([...m.values()], 'PRESENCA')).toEqual({ LIGABOM: 2, CNCG: 1, CNPC: 1, CONSESP: 1 });
  });

  it('resumirFatias ignora grupos sem órgão', () => {
    expect(resumirFatias([{ grupo: 'CNPC', quantidade: 0, orgaos: 0 }]).fatias).toEqual([]);
  });
});

describe('fatias dos itens', () => {
  it('chave do item com 5 dígitos, igual à da cópia dos órgãos', () => {
    expect(chaveItemGti('00079/2024', '200331', '1')).toBe('00079/2024-200331-00001');
    expect(chaveItemGti('00079/2024', '200331', 12)).toBe('00079/2024-200331-00012');
  });

  it('monta por item', () => {
    const m = montarFatiasItensGti([
      { item_key: '00022/2025-200331-00007', grupo: 'LIGABOM', quantidade: 180, orgaos: 1 },
      { item_key: '00022/2025-200331-00007', grupo: 'CONSESP', quantidade: 10, orgaos: 1 }
    ]);
    expect(m.get('00022/2025-200331-00007')?.principal).toMatchObject({ grupo: 'LIGABOM', pct: 95 });
  });
});

describe('texto da célula GTI (casos reais de 15/10/2026)', () => {
  const celula = (grupos: Array<[string, number]>) => {
    const r = resumirCelulaGti(resumirFatias(grupos.map(([grupo, quantidade]) => ({ grupo: grupo as never, quantidade, orgaos: 1 }))));
    return [r.destaque && textoDaFatia(r.destaque), r.secundaria && textoDaFatia(r.secundaria)];
  };

  it('um grupo domina: só ele', () => {
    expect(celula([['LIGABOM', 92], ['CONSESP', 8]])).toEqual(['LIGABOM 92%', null]);
  });
  it('dois grupos próximos: o segundo aparece', () => {
    expect(celula([['CNCG', 14], ['CNPC', 46], ['CONDPCI', 2], ['CONSESP', 38]])).toEqual(['CNPC 46%', 'CONSESP 38%']);
  });
  it('maior parte a confirmar: diz quanto falta', () => {
    expect(celula([['LIGABOM', 12], ['CNPC', 6], ['CONSESP', 10], ['A_CONFIRMAR', 72]])).toEqual(['LIGABOM 12%', '72% a confirmar']);
  });
  it('Outros dominam: o GTI continua em destaque e Outros aparece ao lado', () => {
    expect(celula([['CNCG', 1], ['CNPC', 6], ['CONSESP', 38], ['OUTROS', 55]])).toEqual(['CONSESP 38%', 'Outros 55%']);
  });
  it('só órgãos fora dos GTIs: Outros 100%', () => {
    expect(celula([['OUTROS', 10]])).toEqual(['Outros 100%', null]);
  });
  it('sem GTI, com Outros e a confirmar: o maior primeiro', () => {
    expect(celula([['OUTROS', 6], ['A_CONFIRMAR', 4]])).toEqual(['Outros 60%', '40% a confirmar']);
  });
  it('sem fatias: nada', () => {
    expect(resumirCelulaGti(undefined)).toEqual({ destaque: null, secundaria: null });
  });
});
