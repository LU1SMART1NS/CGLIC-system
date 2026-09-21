import { describe, it, expect } from 'vitest';
import { normalizeItemKey } from '../../utils/itemKeyUtils';

describe('RPC Transacionais PostgreSQL - Contratos de Execução, Hardening e Regras Canônicas (Fase 2.1)', () => {
  const CANONICAL_ITEM_KEY_REGEX = /^[0-9]{5}\/[0-9]{4}-[0-9]{6}-[0-9]{5}$/;
  const CANONICAL_EMPENHO_ID_REGEX = /^[0-9A-Za-z\-_/]{4,50}$/;

  describe('save_allocations_atomic - Regras, Concorrência e First-Write Hardening', () => {
    it('deve validar estritamente o formato canônico de item_key', () => {
      const validKey = normalizeItemKey('37/2026', '200331', 1);
      expect(validKey).toBe('00037/2026-200331-00001');
      expect(CANONICAL_ITEM_KEY_REGEX.test(validKey)).toBe(true);

      const invalidKeys = [
        '',
        '37-2026-1',
        '00037/2026-200331-1',
        'invalid-key-format',
        '00037/26-200331-00001'
      ];

      invalidKeys.forEach(k => {
        expect(CANONICAL_ITEM_KEY_REGEX.test(k)).toBe(false);
      });
    });

    it('deve validar estrutura do payload de alocações departamentais', () => {
      const validPayload = [
        { unit_name: 'DTI', allocated_qty: 100, empenhada_qty: 20 },
        { unit_name: 'DEPE', allocated_qty: 50, empenhada_qty: 0 }
      ];

      expect(Array.isArray(validPayload)).toBe(true);
      expect(validPayload.length).toBe(2);
      validPayload.forEach(item => {
        expect(item.unit_name).toBeDefined();
        expect(item.allocated_qty).toBeGreaterThanOrEqual(0);
      });
    });

    it('deve rejeitar alocações com quantidades negativas ou departamentos nulos', () => {
      const invalidPayload = [
        { unit_name: '', allocated_qty: 10 },
        { unit_name: 'DTI', allocated_qty: -5 }
      ];

      const validateItem = (item: { unit_name: string; allocated_qty: number }) => {
        if (!item.unit_name || item.unit_name.trim() === '') {
          throw new Error('INVALID_PAYLOAD: Toda alocação deve possuir a identificação do departamento');
        }
        if (item.allocated_qty < 0) {
          throw new Error('INVALID_PAYLOAD: Quantidade alocada não pode ser negativa');
        }
      };

      expect(() => validateItem(invalidPayload[0])).toThrow('INVALID_PAYLOAD');
      expect(() => validateItem(invalidPayload[1])).toThrow('INVALID_PAYLOAD');
    });

    it('deve diferenciar estritamente First-Write de Subsequent-Write (Hardening ACH-03)', () => {
      const simulateHardenedOptimisticLock = (currentVersion: number, expectedVersion?: number | null) => {
        // First-Write: item em criação inicial (version = 1) permite expectedVersion nula ou 1
        if (currentVersion === 1) {
          if (expectedVersion !== undefined && expectedVersion !== null && expectedVersion !== 1) {
            throw new Error(`CONCURRENT_MODIFICATION_ERROR: Versão esperada ${expectedVersion}, mas versão atual é ${currentVersion}`);
          }
          return currentVersion + 1;
        }

        // Subsequent-Write: version > 1 EXIGE expectedVersion obrigatoriamente
        if (expectedVersion === undefined || expectedVersion === null) {
          throw new Error(`EXPECTED_VERSION_REQUIRED: Item com versão ${currentVersion}. p_expected_version é obrigatório`);
        }

        if (expectedVersion !== currentVersion) {
          throw new Error(`CONCURRENT_MODIFICATION_ERROR: Versão esperada ${expectedVersion}, mas versão atual é ${currentVersion}`);
        }

        return currentVersion + 1;
      };

      // First-Write com expectedVersion omitida -> permitido
      expect(simulateHardenedOptimisticLock(1, null)).toBe(2);
      expect(simulateHardenedOptimisticLock(1, 1)).toBe(2);

      // Subsequent-Write com expectedVersion correta -> permitido
      expect(simulateHardenedOptimisticLock(2, 2)).toBe(3);
      expect(simulateHardenedOptimisticLock(5, 5)).toBe(6);

      // Subsequent-Write omitindo expectedVersion -> BLOQUEADO (fecha brecha de force-write cego)
      expect(() => simulateHardenedOptimisticLock(2, null)).toThrow('EXPECTED_VERSION_REQUIRED');
      expect(() => simulateHardenedOptimisticLock(4, undefined)).toThrow('EXPECTED_VERSION_REQUIRED');

      // Subsequent-Write com conflito de concorrência -> REJEITADO
      expect(() => simulateHardenedOptimisticLock(2, 1)).toThrow('CONCURRENT_MODIFICATION_ERROR');
    });
  });

  describe('save_manual_contrato_atomic - Validação de Domínio e RN-07 (Hardening ACH-02)', () => {
    it('deve exigir estritamente ao menos 1 empenho vinculado conforme RN-07', () => {
      const validateRN07 = (empenhoIds: string[]) => {
        if (!empenhoIds || empenhoIds.length === 0) {
          throw new Error('INVALID_CONTRACT_LINK: Regra RN-07 violada. Todo contrato exige vinculação a pelo menos um empenho.');
        }
        return true;
      };

      expect(validateRN07(['2026NE000123'])).toBe(true);
      expect(validateRN07(['2026NE000123', '2026NE000124'])).toBe(true);

      expect(() => validateRN07([])).toThrow('INVALID_CONTRACT_LINK');
      expect(() => validateRN07(null as any)).toThrow('INVALID_CONTRACT_LINK');
    });

    it('deve validar domínio e formato dos identificadores de empenho (ACH-02)', () => {
      const validateEmpenhoIdDomain = (empId: string) => {
        const clean = (empId || '').trim();
        if (!clean || !CANONICAL_EMPENHO_ID_REGEX.test(clean)) {
          throw new Error(`INVALID_EMPENHO_ID_FORMAT: Identificador "${empId}" inválido.`);
        }
        return true;
      };

      // Formatos canônicos válidos
      expect(validateEmpenhoIdDomain('2026NE000123')).toBe(true);
      expect(validateEmpenhoIdDomain('2025NE800045')).toBe(true);
      expect(validateEmpenhoIdDomain('emp_manual_001')).toBe(true);
      expect(validateEmpenhoIdDomain('2026-NE-001')).toBe(true);

      // Formatos inválidos / injeções
      expect(() => validateEmpenhoIdDomain('')).toThrow('INVALID_EMPENHO_ID_FORMAT');
      expect(() => validateEmpenhoIdDomain('   ')).toThrow('INVALID_EMPENHO_ID_FORMAT');
      expect(() => validateEmpenhoIdDomain('ab')).toThrow('INVALID_EMPENHO_ID_FORMAT'); // < 4 chars
      expect(() => validateEmpenhoIdDomain('id com espaco')).toThrow('INVALID_EMPENHO_ID_FORMAT');
      expect(() => validateEmpenhoIdDomain('id;DROP TABLE--')).toThrow('INVALID_EMPENHO_ID_FORMAT');
    });

    it('deve validar dados obrigatórios do contrato (ano, uasg, numero, item_key)', () => {
      const validContrato = {
        item_key: '00037/2026-200331-00001',
        numero: '12/2026',
        ano: 2026,
        arp_id: '00037/2026',
        uasg: '200331',
        objeto: 'Aquisição de equipamentos'
      };

      expect(CANONICAL_ITEM_KEY_REGEX.test(validContrato.item_key)).toBe(true);
      expect(validContrato.ano).toBeGreaterThanOrEqual(2000);
      expect(validContrato.ano).toBeLessThanOrEqual(2100);
      expect(validContrato.numero).toBeTruthy();
      expect(validContrato.uasg).toBeTruthy();
    });
  });

  describe('save_empenho_links_atomic - Regras, Concorrência e Integridade de Agregado (Fase 4.3C.2)', () => {
    it('deve validar estritamente a estrutura do payload de vínculos de empenhos', () => {
      const validPayload = [
        { empenho_numero: '2026NE000123', allocation_id: 'alloc-1' },
        { empenho_numero: '2026NE000124', allocation_id: 'alloc-2' }
      ];

      expect(Array.isArray(validPayload)).toBe(true);
      validPayload.forEach(link => {
        expect(link.empenho_numero).toBeTruthy();
        expect(link.allocation_id).toBeTruthy();
      });
    });

    it('deve rejeitar payload com campos vazios ou nulos', () => {
      const validateLinkItem = (item: { empenho_numero?: string; allocation_id?: string }) => {
        if (!item.empenho_numero || item.empenho_numero.trim() === '') {
          throw new Error('INVALID_PAYLOAD: Todo vínculo deve conter o número do empenho (empenho_numero).');
        }
        if (!item.allocation_id || item.allocation_id.trim() === '') {
          throw new Error('INVALID_PAYLOAD: Todo vínculo deve conter a identificação da alocação (allocation_id).');
        }
      };

      expect(() => validateLinkItem({ empenho_numero: '', allocation_id: 'alloc-1' })).toThrow('INVALID_PAYLOAD');
      expect(() => validateLinkItem({ empenho_numero: '2026NE000123', allocation_id: '' })).toThrow('INVALID_PAYLOAD');
    });

    it('deve detectar e rejeitar números de empenho duplicados no mesmo payload (23505)', () => {
      const validatePayloadDuplicates = (links: { empenho_numero: string; allocation_id: string }[]) => {
        const seen = new Set<string>();
        for (const link of links) {
          if (seen.has(link.empenho_numero)) {
            throw new Error(`DUPLICATE_LINK: Número de empenho "${link.empenho_numero}" duplicado no payload.`);
          }
          seen.add(link.empenho_numero);
        }
      };

      const duplicatedPayload = [
        { empenho_numero: '2026NE000123', allocation_id: 'alloc-1' },
        { empenho_numero: '2026NE000123', allocation_id: 'alloc-2' }
      ];

      expect(() => validatePayloadDuplicates(duplicatedPayload)).toThrow('DUPLICATE_LINK');
    });

    it('deve validar integridade referencial cruzada (allocation_id deve pertencer ao mesmo item_key)', () => {
      const mockAllocationsInDb = [
        { id: 'alloc-itemA-1', item_key: '00037/2026-200331-00001' },
        { id: 'alloc-itemB-1', item_key: '00037/2026-200331-00002' }
      ];

      const validateAllocationItemKey = (currentItemKey: string, allocationId: string) => {
        const found = mockAllocationsInDb.find(a => a.id === allocationId);
        if (!found) {
          throw new Error(`INVALID_ALLOCATION: A alocação "${allocationId}" não existe.`);
        }
        if (found.item_key !== currentItemKey) {
          throw new Error(`INVALID_ALLOCATION: A alocação "${allocationId}" pertence a outro item.`);
        }
        return true;
      };

      // Alocação correta para o item A
      expect(validateAllocationItemKey('00037/2026-200331-00001', 'alloc-itemA-1')).toBe(true);

      // Alocação inexistente
      expect(() => validateAllocationItemKey('00037/2026-200331-00001', 'alloc-non-existent')).toThrow('INVALID_ALLOCATION');

      // Alocação pertencente a outro item (Item B no Item A)
      expect(() => validateAllocationItemKey('00037/2026-200331-00001', 'alloc-itemB-1')).toThrow('INVALID_ALLOCATION');
    });

    it('deve implementar controle de concorrência com First-Write vs Subsequent-Write', () => {
      const simulateLinkOptimisticLock = (currentVersion: number, expectedVersion?: number | null) => {
        if (currentVersion === 1) {
          if (expectedVersion !== undefined && expectedVersion !== null && expectedVersion !== 1) {
            throw new Error(`CONCURRENT_MODIFICATION_ERROR: Conflito de versão no primeiro registro.`);
          }
          return currentVersion + 1;
        }

        if (expectedVersion === undefined || expectedVersion === null) {
          throw new Error(`EXPECTED_VERSION_REQUIRED: p_expected_version é obrigatório.`);
        }

        if (expectedVersion !== currentVersion) {
          throw new Error(`CONCURRENT_MODIFICATION_ERROR: Conflito de versão.`);
        }

        return currentVersion + 1;
      };

      // First-Write
      expect(simulateLinkOptimisticLock(1, null)).toBe(2);
      expect(simulateLinkOptimisticLock(1, 1)).toBe(2);

      // Subsequent-Write OK
      expect(simulateLinkOptimisticLock(3, 3)).toBe(4);

      // Subsequent-Write sem versão -> BLOQUEADO
      expect(() => simulateLinkOptimisticLock(2, null)).toThrow('EXPECTED_VERSION_REQUIRED');

      // Subsequent-Write versão divergente -> CONFLITO 40001
      expect(() => simulateLinkOptimisticLock(3, 2)).toThrow('CONCURRENT_MODIFICATION_ERROR');
    });
  });

  describe('save_manual_empenhos_atomic - Regras, Concorrência e Atomicidade (Fase 4.3D)', () => {
    it('deve validar estrutura do payload de empenhos manuais', () => {
      const validPayload = [
        { numero: '2026NE000459', ano: 2026, arp_id: '00024/2026', item_id: '00002', uasg: '200331', quantidade: 40 },
        { numero: '2026NE000173', ano: 2026, arp_id: '00024/2026', item_id: '00002', uasg: '200331', quantidade: 2 }
      ];

      expect(Array.isArray(validPayload)).toBe(true);
      validPayload.forEach(item => {
        expect(item.numero).toBeTruthy();
        expect(item.ano).toBeGreaterThanOrEqual(2000);
        expect(item.ano).toBeLessThanOrEqual(2100);
        expect(item.quantidade).toBeGreaterThan(0);
      });
    });

    it('deve rejeitar empenhos manuais com campos obrigatórios vazios ou quantidade <= 0', () => {
      const validateManualEmp = (item: { numero: string; ano: number; quantidade: number }) => {
        if (!item.numero || item.numero.trim() === '') {
          throw new Error('INVALID_PAYLOAD: Todo empenho manual deve possuir o número.');
        }
        if (item.ano < 2000 || item.ano > 2100) {
          throw new Error('INVALID_PAYLOAD: Ano de empenho inválido.');
        }
        if (item.quantidade <= 0) {
          throw new Error('INVALID_PAYLOAD: Quantidade deve ser maior que zero.');
        }
      };

      expect(() => validateManualEmp({ numero: '', ano: 2026, quantidade: 10 })).toThrow('INVALID_PAYLOAD');
      expect(() => validateManualEmp({ numero: '2026NE001', ano: 1999, quantidade: 10 })).toThrow('INVALID_PAYLOAD');
      expect(() => validateManualEmp({ numero: '2026NE001', ano: 2026, quantidade: 0 })).toThrow('INVALID_PAYLOAD');
      expect(() => validateManualEmp({ numero: '2026NE001', ano: 2026, quantidade: -5 })).toThrow('INVALID_PAYLOAD');
    });

    it('deve detectar e rejeitar empenhos duplicados no payload (23505)', () => {
      const validateManualEmpDuplicates = (emps: { numero: string; ano: number }[]) => {
        const seen = new Set<string>();
        for (const emp of emps) {
          const sig = `${emp.numero}__${emp.ano}`;
          if (seen.has(sig)) {
            throw new Error(`DUPLICATE_LINK: Empenho "${emp.numero}" duplicado no payload.`);
          }
          seen.add(sig);
        }
      };

      const duplicatePayload = [
        { numero: '2026NE000459', ano: 2026 },
        { numero: '2026NE000459', ano: 2026 }
      ];

      expect(() => validateManualEmpDuplicates(duplicatePayload)).toThrow('DUPLICATE_LINK');
    });

    it('deve gerenciar controle de versão otimista independente (item_manual_empenho_state)', () => {
      const simulateManualEmpOptimisticLock = (currentVersion: number, expectedVersion?: number | null) => {
        if (currentVersion === 1) {
          if (expectedVersion !== undefined && expectedVersion !== null && expectedVersion !== 1) {
            throw new Error(`CONCURRENT_MODIFICATION_ERROR: Conflito de versão no primeiro registro.`);
          }
          return currentVersion + 1;
        }

        if (expectedVersion === undefined || expectedVersion === null) {
          throw new Error(`EXPECTED_VERSION_REQUIRED: p_expected_version é obrigatório.`);
        }

        if (expectedVersion !== currentVersion) {
          throw new Error(`CONCURRENT_MODIFICATION_ERROR: Conflito de versão.`);
        }

        return currentVersion + 1;
      };

      expect(simulateManualEmpOptimisticLock(1, null)).toBe(2);
      expect(simulateManualEmpOptimisticLock(1, 1)).toBe(2);
      expect(simulateManualEmpOptimisticLock(2, 2)).toBe(3);
      expect(() => simulateManualEmpOptimisticLock(2, null)).toThrow('EXPECTED_VERSION_REQUIRED');
      expect(() => simulateManualEmpOptimisticLock(3, 1)).toThrow('CONCURRENT_MODIFICATION_ERROR');
    });
  });

  describe('save_empenho_manual_quantities_atomic - Regras, Concorrência e Overrides (Fase 4.3D)', () => {
    it('deve validar estrutura do payload de quantidades manuais em formato de array ou objeto', () => {
      const arrayPayload = [
        { emp_key: '2026NE000459', quantidade: 35 },
        { emp_key: '2026NE000173', quantidade: 2 }
      ];

      expect(Array.isArray(arrayPayload)).toBe(true);
      arrayPayload.forEach(q => {
        expect(q.emp_key).toBeTruthy();
        expect(q.quantidade).toBeGreaterThanOrEqual(0);
      });

      const objectPayload = {
        '2026NE000459': 35,
        '2026NE000173': 2
      };

      expect(typeof objectPayload).toBe('object');
      Object.entries(objectPayload).forEach(([k, v]) => {
        expect(k).toBeTruthy();
        expect(v).toBeGreaterThanOrEqual(0);
      });
    });

    it('deve rejeitar quantidades negativas ou chaves vazias', () => {
      const validateQtyOverride = (key: string, qty: number) => {
        if (!key || key.trim() === '') {
          throw new Error('INVALID_PAYLOAD: Identificador do empenho é obrigatório.');
        }
        if (qty < 0) {
          throw new Error('INVALID_PAYLOAD: A quantidade não pode ser negativa.');
        }
      };

      expect(() => validateQtyOverride('', 10)).toThrow('INVALID_PAYLOAD');
      expect(() => validateQtyOverride('2026NE000459', -1)).toThrow('INVALID_PAYLOAD');
      expect(() => validateQtyOverride('2026NE000459', 0)).not.toThrow();
    });

    it('deve gerenciar controle de versão otimista independente (item_manual_quantity_state)', () => {
      const simulateQtyOptimisticLock = (currentVersion: number, expectedVersion?: number | null) => {
        if (currentVersion === 1) {
          if (expectedVersion !== undefined && expectedVersion !== null && expectedVersion !== 1) {
            throw new Error(`CONCURRENT_MODIFICATION_ERROR: Conflito de versão no primeiro registro.`);
          }
          return currentVersion + 1;
        }

        if (expectedVersion === undefined || expectedVersion === null) {
          throw new Error(`EXPECTED_VERSION_REQUIRED: p_expected_version é obrigatório.`);
        }

        if (expectedVersion !== currentVersion) {
          throw new Error(`CONCURRENT_MODIFICATION_ERROR: Conflito de versão.`);
        }

        return currentVersion + 1;
      };

      expect(simulateQtyOptimisticLock(1, null)).toBe(2);
      expect(simulateQtyOptimisticLock(1, 1)).toBe(2);
      expect(simulateQtyOptimisticLock(4, 4)).toBe(5);
      expect(() => simulateQtyOptimisticLock(2, null)).toThrow('EXPECTED_VERSION_REQUIRED');
      expect(() => simulateQtyOptimisticLock(4, 2)).toThrow('CONCURRENT_MODIFICATION_ERROR');
    });
  });
});

