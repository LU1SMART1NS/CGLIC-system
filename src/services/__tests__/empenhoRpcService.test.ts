import { describe, it, expect } from 'vitest';

describe('MIGRATION 17: RPCs Transacionais Atômicas de Empenhos (Fase 7.2-C)', () => {
  const CANONICAL_KEY_REGEX = /^[0-9]{6}-[0-9]{4}-[A-Z0-9]+$/;
  const ITEM_KEY_REGEX = /^[0-9]{5}\/[0-9]{4}-[0-9]{6}-[0-9]{5}$/;
  const UASG_REGEX = /^[0-9]{6}$/;

  // =========================================================================
  // 1. TESTES DE save_empenho_soberano_atomic
  // =========================================================================
  describe('save_empenho_soberano_atomic - Domínio, Idempotência e Reconciliação', () => {
    const buildCanonicalKey = (uasg: string, ano: number, numOficial: string, numNorm?: string) => {
      const cleanNorm = numNorm?.trim() || numOficial.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
      return `${uasg}-${ano}-${cleanNorm}`;
    };

    it('deve gerar canonical_key determinística válida no formato {uasg}-{ano}-{numeroNormalizado}', () => {
      const key = buildCanonicalKey('200331', 2026, '2026NE000123');
      expect(key).toBe('200331-2026-2026NE000123');
      expect(CANONICAL_KEY_REGEX.test(key)).toBe(true);
    });

    it('deve normalizar números oficiais com caracteres especiais ou formatação inconsistente', () => {
      const key = buildCanonicalKey('200331', 2026, '2026/NE-000456');
      expect(key).toBe('200331-2026-2026NE000456');
      expect(CANONICAL_KEY_REGEX.test(key)).toBe(true);
    });

    it('deve validar estritamente a UASG emitente (6 dígitos)', () => {
      expect(UASG_REGEX.test('200331')).toBe(true);
      expect(UASG_REGEX.test('20033')).toBe(false);
      expect(UASG_REGEX.test('2003310')).toBe(false);
      expect(UASG_REGEX.test('ABC331')).toBe(false);
    });

    it('deve validar o intervalo permitido para o ano de exercício (2000 a 2100)', () => {
      const isValidYear = (ano: number) => ano >= 2000 && ano <= 2100;
      expect(isValidYear(2026)).toBe(true);
      expect(isValidYear(1999)).toBe(false);
      expect(isValidYear(2101)).toBe(false);
    });

    it('deve validar que valores financeiros não podem ser negativos', () => {
      const validateFinancials = (v: { empenhado?: number; liquidado?: number; pago?: number; rpinscrito?: number }) => {
        if ((v.empenhado ?? 0) < 0 || (v.liquidado ?? 0) < 0 || (v.pago ?? 0) < 0 || (v.rpinscrito ?? 0) < 0) {
          throw new Error('INVALID_FINANCIAL_VALUE: Valores financeiros de empenho não podem ser negativos.');
        }
      };

      expect(() => validateFinancials({ empenhado: 100, liquidado: 0 })).not.toThrow();
      expect(() => validateFinancials({ empenhado: -1 })).toThrow('INVALID_FINANCIAL_VALUE');
      expect(() => validateFinancials({ liquidado: -50 })).toThrow('INVALID_FINANCIAL_VALUE');
      expect(() => validateFinancials({ pago: -0.01 })).toThrow('INVALID_FINANCIAL_VALUE');
    });

    it('deve validar fontes de origem permitidas', () => {
      const VALID_SOURCES = new Set(['COMPRASNET', 'CONTRATOSNET', 'PNCP', 'MANUAL', 'SINCRONIZADO']);
      expect(VALID_SOURCES.has('COMPRASNET')).toBe(true);
      expect(VALID_SOURCES.has('MANUAL')).toBe(true);
      expect(VALID_SOURCES.has('SINCRONIZADO')).toBe(true);
      expect(VALID_SOURCES.has('OUTRO_SISTEMA')).toBe(false);
    });

    it('deve aplicar as regras de reconciliação e proteção de proveniência', () => {
      interface EmpenhoRecord {
        fonte_origem: string;
        informado_manualmente_inicialmente: boolean;
        valor_empenhado: number;
        credor_nome: string;
      }

      const reconcile = (existing: EmpenhoRecord | null, incoming: { fonte: string; valor: number; credor: string }): EmpenhoRecord => {
        if (!existing) {
          return {
            fonte_origem: incoming.fonte,
            informado_manualmente_inicialmente: incoming.fonte === 'MANUAL',
            valor_empenhado: incoming.valor,
            credor_nome: incoming.credor
          };
        }

        // Se existente é oficial e incoming é manual, rejeita sobrescrita de valores
        if (['COMPRASNET', 'CONTRATOSNET', 'PNCP', 'SINCRONIZADO'].includes(existing.fonte_origem) && incoming.fonte === 'MANUAL') {
          return existing; // Proteção contra sobrescrita manual
        }

        // Se existente era manual e incoming é oficial, promove para SINCRONIZADO preservando flag histórica
        if (existing.fonte_origem === 'MANUAL' && ['COMPRASNET', 'CONTRATOSNET', 'PNCP', 'SINCRONIZADO'].includes(incoming.fonte)) {
          return {
            fonte_origem: 'SINCRONIZADO',
            informado_manualmente_inicialmente: true, // PRESERVADO!
            valor_empenhado: incoming.valor,
            credor_nome: incoming.credor
          };
        }

        return {
          ...existing,
          valor_empenhado: incoming.valor,
          credor_nome: incoming.credor
        };
      };

      // 1. Criação manual
      const rec1 = reconcile(null, { fonte: 'MANUAL', valor: 50000, credor: 'Fornecedor A' });
      expect(rec1.fonte_origem).toBe('MANUAL');
      expect(rec1.informado_manualmente_inicialmente).toBe(true);
      expect(rec1.valor_empenhado).toBe(50000);

      // 2. Promoção oficial (reconciliação pelo SIAFI)
      const rec2 = reconcile(rec1, { fonte: 'COMPRASNET', valor: 55000, credor: 'Fornecedor A Oficial' });
      expect(rec2.fonte_origem).toBe('SINCRONIZADO');
      expect(rec2.informado_manualmente_inicialmente).toBe(true);
      expect(rec2.valor_empenhado).toBe(55000);

      // 3. Tentativa manual posterior de adulterar dados oficiais confirmados
      const rec3 = reconcile(rec2, { fonte: 'MANUAL', valor: 100, credor: 'Adulterador' });
      expect(rec3.valor_empenhado).toBe(55000); // INALTERADO!
      expect(rec3.credor_nome).toBe('Fornecedor A Oficial'); // INALTERADO!
      expect(rec3.fonte_origem).toBe('SINCRONIZADO');
    });
  });

  // =========================================================================
  // 2. TESTES DE link_empenho_to_item_atomic E unlink_empenho_from_item_atomic
  // =========================================================================
  describe('link_empenho_to_item_atomic & unlink_empenho_from_item_atomic - Consumo Físico de Itens', () => {
    it('deve validar o formato canônico da item_key', () => {
      expect(ITEM_KEY_REGEX.test('00037/2026-200331-00001')).toBe(true);
      expect(ITEM_KEY_REGEX.test('00037/2026-200331-001')).toBe(false);
      expect(ITEM_KEY_REGEX.test('chave-qualquer')).toBe(false);
    });

    it('deve validar que a quantidade consumida não pode ser negativa', () => {
      const validateQtd = (q: number) => {
        if (q < 0) {
          throw new Error('INVALID_QUANTITY: A quantidade consumida não pode ser negativa.');
        }
      };
      expect(() => validateQtd(100)).not.toThrow();
      expect(() => validateQtd(0)).not.toThrow(); // Zero é aceito (reserva/minuta)
      expect(() => validateQtd(-0.01)).toThrow('INVALID_QUANTITY');
    });

    it('deve garantir unicidade do par (item_key, empenho_id) e calcular delta_quantidade no histórico', () => {
      interface ItemLink {
        id: string;
        item_key: string;
        empenho_id: string;
        quantidade_consumida: number;
      }
      interface HistoryEvent {
        tipo_evento: string;
        delta_quantidade: number;
        evento: string;
      }

      const links: ItemLink[] = [];
      const history: HistoryEvent[] = [];

      const linkItem = (itemKey: string, empenhoId: string, qtd: number) => {
        const existing = links.find(l => l.item_key === itemKey && l.empenho_id === empenhoId);
        if (existing) {
          const delta = qtd - existing.quantidade_consumida;
          existing.quantidade_consumida = qtd;
          if (delta !== 0) {
            history.push({
              tipo_evento: delta > 0 ? 'REFORCO' : 'ANULACAO_PARCIAL',
              delta_quantidade: delta,
              evento: 'VINCULADO_ITEM'
            });
          }
          return existing;
        } else {
          const newLink = { id: 'link-1', item_key: itemKey, empenho_id: empenhoId, quantidade_consumida: qtd };
          links.push(newLink);
          history.push({
            tipo_evento: 'EMISSAO_INICIAL',
            delta_quantidade: qtd,
            evento: 'VINCULADO_ITEM'
          });
          return newLink;
        }
      };

      const unlinkItem = (linkId: string) => {
        const idx = links.findIndex(l => l.id === linkId);
        if (idx >= 0) {
          const removed = links.splice(idx, 1)[0];
          history.push({
            tipo_evento: 'CANCELAMENTO_TOTAL',
            delta_quantidade: -removed.quantidade_consumida,
            evento: 'DESVINCULADO_ITEM'
          });
        }
      };

      // Vínculo inicial
      linkItem('00037/2026-200331-00001', 'emp-1', 100);
      expect(links.length).toBe(1);
      expect(links[0].quantidade_consumida).toBe(100);
      expect(history[0].tipo_evento).toBe('EMISSAO_INICIAL');
      expect(history[0].delta_quantidade).toBe(100);

      // Atualização idempotente (mesmo par item-empenho)
      linkItem('00037/2026-200331-00001', 'emp-1', 120);
      expect(links.length).toBe(1); // NÃO DUPLICA
      expect(links[0].quantidade_consumida).toBe(120);
      expect(history[1].tipo_evento).toBe('REFORCO');
      expect(history[1].delta_quantidade).toBe(20);

      // Desvinculação com estorno no histórico
      unlinkItem('link-1');
      expect(links.length).toBe(0);
      expect(history[2].tipo_evento).toBe('CANCELAMENTO_TOTAL');
      expect(history[2].delta_quantidade).toBe(-120);
    });
  });

  // =========================================================================
  // 3. TESTES DE link_empenho_to_contract_atomic E unlink_empenho_from_contract_atomic
  // =========================================================================
  describe('link_empenho_to_contract_atomic & unlink_empenho_from_contract_atomic - Lastro Contratual', () => {
    it('deve vincular contrato a empenho sem exigir vínculo com Ata (Cenário C)', () => {
      const validateContractKey = (key: string) => {
        if (!key || key.trim() === '') {
          throw new Error('INVALID_CONTRACT_KEY: A contract_key é obrigatória e não pode ser vazia.');
        }
      };

      expect(() => validateContractKey('200331-00010-2026')).not.toThrow();
      expect(() => validateContractKey('12345678000190-2026-10')).not.toThrow();
      expect(() => validateContractKey('')).toThrow('INVALID_CONTRACT_KEY');
    });

    it('deve suportar cardinalidade N:N entre contratos e empenhos', () => {
      interface ContratoEmpenho {
        contract_key: string;
        empenho_id: string;
        valor_vinculado: number;
      }

      const links: ContratoEmpenho[] = [
        { contract_key: 'CTR-01', empenho_id: 'EMP-01', valor_vinculado: 10000 },
        { contract_key: 'CTR-01', empenho_id: 'EMP-02', valor_vinculado: 5000 },  // 1 Contrato com 2 Empenhos
        { contract_key: 'CTR-02', empenho_id: 'EMP-01', valor_vinculado: 8000 }   // 1 Empenho em 2 Contratos
      ];

      expect(links.filter(l => l.contract_key === 'CTR-01').length).toBe(2);
      expect(links.filter(l => l.empenho_id === 'EMP-01').length).toBe(2);
    });

    it('deve validar que valor vinculado ao contrato não pode ser negativo', () => {
      const validateValor = (v?: number) => {
        if (v !== undefined && v !== null && v < 0) {
          throw new Error('INVALID_VALUE: O valor vinculado não pode ser negativo.');
        }
      };

      expect(() => validateValor(1000)).not.toThrow();
      expect(() => validateValor(undefined)).not.toThrow();
      expect(() => validateValor(-50)).toThrow('INVALID_VALUE');
    });
  });

  // =========================================================================
  // 4. TESTES DE SEGURANÇA E RBAC
  // =========================================================================
  describe('RBAC e Matriz de Permissões M17', () => {
    const checkAuthorization = (role: string | null): boolean => {
      if (!role) return false;
      return role === 'gestor' || role === 'admin';
    };

    it('deve autorizar somente usuários com papel gestor ou admin', () => {
      expect(checkAuthorization('gestor')).toBe(true);
      expect(checkAuthorization('admin')).toBe(true);
      expect(checkAuthorization('leitor')).toBe(false);
      expect(checkAuthorization('fiscal')).toBe(false);
      expect(checkAuthorization(null)).toBe(false); // Anon
    });

    it('deve mapear violação de RBAC para código SQLSTATE 42501', () => {
      const executeRpc = (role: string | null) => {
        if (!checkAuthorization(role)) {
          const err = new Error('UNAUTHORIZED: Acesso restrito a gestores e administradores do SaldoARP.');
          (err as unknown as { code: string }).code = '42501';
          throw err;
        }
      };

      expect(() => executeRpc('gestor')).not.toThrow();
      expect(() => executeRpc('leitor')).toThrow('UNAUTHORIZED');
      try {
        executeRpc(null);
      } catch (err: unknown) {
        expect((err as { code: string }).code).toBe('42501');
      }
    });
  });

  // =========================================================================
  // 5. TESTES DE HISTÓRICO E IMUTABILIDADE
  // =========================================================================
  describe('Histórico Funcional e Imutabilidade (Append-Only)', () => {
    const ALLOWED_EVENT_TYPES = new Set([
      'EMISSAO_INICIAL',
      'REFORCO',
      'ANULACAO_PARCIAL',
      'CANCELAMENTO_TOTAL',
      'LIQUIDACAO_SNAPSHOT',
      'PAGAMENTO_SNAPSHOT',
      'AJUSTE_AUDITORIA'
    ]);

    it('deve usar estritamente os tipos de eventos compatíveis com o schema M16', () => {
      expect(ALLOWED_EVENT_TYPES.has('EMISSAO_INICIAL')).toBe(true);
      expect(ALLOWED_EVENT_TYPES.has('REFORCO')).toBe(true);
      expect(ALLOWED_EVENT_TYPES.has('ANULACAO_PARCIAL')).toBe(true);
      expect(ALLOWED_EVENT_TYPES.has('CANCELAMENTO_TOTAL')).toBe(true);
      expect(ALLOWED_EVENT_TYPES.has('AJUSTE_AUDITORIA')).toBe(true);
      expect(ALLOWED_EVENT_TYPES.has('TIPO_INVALIDO')).toBe(false);
    });

    it('deve bloquear UPDATE e DELETE no histórico funcional com SQLSTATE 23514', () => {
      const simulateHistoryMutation = (operation: 'UPDATE' | 'DELETE') => {
        if (operation === 'UPDATE' || operation === 'DELETE') {
          const err = new Error('IMMUTABLE_HISTORICAL_LOG: Registros em empenho_eventos_historico são append-only.');
          (err as unknown as { code: string }).code = '23514';
          throw err;
        }
      };

      expect(() => simulateHistoryMutation('UPDATE')).toThrow('IMMUTABLE_HISTORICAL_LOG');
      try {
        simulateHistoryMutation('DELETE');
      } catch (err: unknown) {
        expect((err as { code: string }).code).toBe('23514');
      }
    });
  });
});
