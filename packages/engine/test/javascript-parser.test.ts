import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseSource } from '../src/parser/treesitter.ts';

describe('JavaScript parser', () => {
  it('parses .js with the JavaScript Tree-sitter grammar', () => {
    const source = [
      'export class OrderService {',
      '  create(order) {',
      '    return this.repository.save(order);',
      '  }',
      '}',
    ].join('\n');
    const parsed = parseSource(source, 'src/order-service.js');
    assert.ok(parsed.facts.some((fact) => fact.kind === 'CLASS' && fact.symbol?.name === 'OrderService'));
    assert.ok(
      parsed.facts.some(
        (fact) => fact.kind === 'METHOD' && fact.symbol?.name === 'OrderService.create',
      ),
    );
    assert.ok(parsed.facts.some((fact) => fact.kind === 'CALL'));
  });

  it('still parses TypeScript with the TypeScript grammar', () => {
    const source = [
      'export class OrderService {',
      '  create(order) {',
      '    return this.repository.save(order);',
      '  }',
      '}',
    ].join('\n');
    const parsed = parseSource(source, 'src/order-service.ts');
    assert.ok(parsed.facts.some((fact) => fact.kind === 'CLASS' && fact.symbol?.name === 'OrderService'));
    assert.ok(parsed.facts.some((fact) => fact.kind === 'METHOD'));
  });
});
