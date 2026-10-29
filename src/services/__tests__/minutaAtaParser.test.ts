import { describe, expect, it } from 'vitest';
import { lerItensDaMinuta, lerParticipantesDaMinuta, secao3 } from '../minutaAtaParser';

// Trechos das minutas do PNCP (tabela de itens e seção 3), extraídos pelo unpdf como no servidor. Os valores
// esperados são os das atas assinadas depois (medição de 28/10/2026: 1.022 pares órgão × item, 100% iguais).
const ARQUIVOS = import.meta.glob('./fixtures/minutas/*', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const TOTAIS = JSON.parse(ARQUIVOS['./fixtures/minutas/totais.json']) as Record<string, Record<string, number>>;
const texto = (compra: string) => ARQUIVOS[`./fixtures/minutas/minuta_${compra.replace('/', '_')}.txt`];
const totais = (compra: string) => Object.fromEntries(Object.entries(TOTAIS[compra]).map(([k, v]) => [Number(k), v]));

const somaDoOrgao = (lidos: Array<{ uasg: string; quantidade: number }> | undefined, uasg: string) =>
  (lidos ?? []).filter((p) => p.uasg === uasg).reduce((s, p) => s + p.quantidade, 0);

describe('lerParticipantesDaMinuta', () => {
  it.each([
    ['2025/1667', 'A'],
    ['2025/1664', 'B'],
    ['2025/1665', 'B'],
    ['2026/366', 'C'],
    ['2025/1313', 'C']
  ])('%s: modelo %s e todas as somas fecham com o total do PNCP', (compra, modelo) => {
    const r = lerParticipantesDaMinuta(texto(compra), totais(compra));
    expect(r.erro).toBeUndefined();
    expect(r.modelo).toBe(modelo);
    expect(r.itensQueFecham).toEqual(Object.keys(TOTAIS[compra]).map(Number).sort((a, b) => a - b));
  });

  it('pregão 90039/2025 (blocos por órgão): gerenciador e participantes do item 3 como na ata 43/2026', () => {
    const r = lerParticipantesDaMinuta(texto('2025/1667'), totais('2025/1667'));
    expect(r.gerenciador[3]).toBe(1540);
    expect(somaDoOrgao(r.participantes[3], '927134')).toBe(1500); // CBMAP
    expect(somaDoOrgao(r.participantes[3], '170394')).toBe(2500); // CBMDF
    expect(somaDoOrgao(r.participantes[3], '927239')).toBe(0); // CBMMA: 0 na minuta
  });

  it('pregão 90034/2025 (matriz órgão × item): uma coluna por item, o "9ª RF" do nome não vira número', () => {
    const r = lerParticipantesDaMinuta(texto('2025/1665'), totais('2025/1665'));
    expect(r.gerenciador).toEqual({ 1: 112, 2: 112, 3: 58, 4: 120 });
    expect(somaDoOrgao(r.participantes[1], '170156')).toBe(6);
    expect(somaDoOrgao(r.participantes[1], '450955')).toBe(5);
  });

  it('pregão 90027/2025 (células mescladas): itens 8 e 9 na mesma célula do gerenciador', () => {
    const r = lerParticipantesDaMinuta(texto('2025/1313'), totais('2025/1313'));
    expect(r.gerenciador[8]).toBe(84);
    expect(r.gerenciador[9]).toBe(116);
  });

  it('pregão 107/2026 (sem participantes): item todo da SENASP fecha; minuta diferente do PNCP não fecha', () => {
    const r = lerParticipantesDaMinuta(texto('2026/797'), totais('2026/797'));
    expect(r.gerenciador).toEqual({ 1: 10800, 2: 3240 });
    // Item 2: 3.240 na minuta e no PNCP. Item 1: 10.800 na minuta, 10.805 homologado no PNCP.
    expect(r.itensQueFecham).toEqual([2]);
  });

  it('sem a seção 3 devolve erro, sem inventar participantes', () => {
    const r = lerParticipantesDaMinuta('Edital sem minuta da ata', { 1: 10 });
    expect(r.erro).toMatch(/Seção 3/);
    expect(r.participantes).toEqual({});
  });

  it('soma que não fecha deixa o item fora de itensQueFecham', () => {
    const t = totais('2025/1667');
    const r = lerParticipantesDaMinuta(texto('2025/1667'), { ...t, 3: t[3] + 1 });
    expect(r.itensQueFecham).not.toContain(3);
  });
});

describe('lerItensDaMinuta', () => {
  it('descrição e CATMAT da tabela da seção 1 (pregão 90035/2025)', () => {
    const r = lerItensDaMinuta(texto('2025/1664'), totais('2025/1664'));
    expect(r[1]).toEqual({ descricao: 'AERONAVE REMOTAMENTE PILOTADA TIPO I', catmat: '482665' });
    expect(r[2].catmat).toBe('482665');
  });

  it('CATSER de 5 dígitos e descrição com parênteses (pregão 90034/2025)', () => {
    const r = lerItensDaMinuta(texto('2025/1665'), totais('2025/1665'));
    expect(r[1].catmat).toBe('17710');
    expect(r[1].descricao).toMatch(/^Curso de Piloto Privado de Helicóptero/);
  });

  it('número no meio da descrição não corta o texto (pregão 90027/2025, item 18)', () => {
    const r = lerItensDaMinuta(texto('2025/1313'), totais('2025/1313'));
    expect(r[18]).toEqual({ descricao: 'Câmera tipo 2 - Câmera fotográfica tipo super zoom', catmat: '464022' });
    expect(Object.values(r).filter((i) => i.catmat).length).toBe(30);
  });

  it('minuta sem CATMAT: descrição sim, código em branco (pregão 90039/2025)', () => {
    const r = lerItensDaMinuta(texto('2025/1667'), totais('2025/1667'));
    expect(r[3]).toEqual({ descricao: 'Roupa de Combate a Incêndio Florestal', catmat: null });
  });

  it('coluna "Grupo" antes do item: o número repetido não entra na descrição (pregão 107/2026)', () => {
    const r = lerItensDaMinuta(texto('2026/797'), totais('2026/797'));
    expect(r[1]).toEqual({ descricao: 'Locação de Aeronave - Helicóptero do tipo B2 ou Superior', catmat: '14680' });
    expect(r[2]).toEqual({ descricao: 'Prestação de Serviços de Piloto Comandante de Aeronave / por demanda', catmat: '25275' });
  });

  it('a quantidade do item não vira código', () => {
    const r = lerItensDaMinuta(texto('2026/366'), totais('2026/366'));
    expect(r[1].catmat).toBeNull();
    expect(r[1].descricao).toMatch(/^Solução integrada de veículo base/);
  });
});

describe('secao3', () => {
  it('separa o gerenciador dos participantes', () => {
    const s = secao3(texto('2025/1664'));
    expect(s?.gerenciador).toMatch(/gerenciador/i);
    expect(s?.participantes.length).toBeGreaterThan(100);
  });
});
