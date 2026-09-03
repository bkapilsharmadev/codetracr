import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildCodeTracrGraph } from '../src/graph/codetracr-model.ts';
import { parseSource } from '../src/parser/treesitter.ts';

describe('sequence call occurrence ordering', () => {
  it('preserves repeated calls with source-derived order across different targets', () => {
    const files = [
      parseSource(
        [
          'function validate(data) { return data; }',
          'function save(data) { return data; }',
          'function publish() {}',
          'async function create(data) {',
          '  validate(data);',
          '  await save(data);',
          '  publish();',
          '  validate(data);',
          '}',
        ].join('\n'),
        'src/create.js',
      ),
    ];

    const graph = buildCodeTracrGraph(files);
    const createId = 'function:src/create.js#create';
    const validateId = 'function:src/create.js#validate';
    const saveId = 'function:src/create.js#save';
    const publishId = 'function:src/create.js#publish';

    const validateEdge = graph.edges.find(
      (edge) => edge.from === createId && edge.to === validateId && edge.type === 'CALLS',
    );
    const saveEdge = graph.edges.find(
      (edge) => edge.from === createId && edge.to === saveId && edge.type === 'CALLS',
    );
    const publishEdge = graph.edges.find(
      (edge) => edge.from === createId && edge.to === publishId && edge.type === 'CALLS',
    );

    assert.ok(validateEdge, 'expected create -> validate CALLS edge');
    assert.ok(saveEdge, 'expected create -> repo.save CALLS edge');
    assert.ok(publishEdge, 'expected create -> publisher.publish CALLS edge');

    const validateOcc = validateEdge!.provenance.occurrences ?? [];
    assert.equal(validateOcc.length, 2);
    assert.deepEqual(
      validateOcc.map((occ) => occ.order).sort((a, b) => a - b),
      [1, 4],
    );
    assert.equal(saveEdge!.provenance.occurrences?.[0]?.order, 2);
    assert.equal(publishEdge!.provenance.occurrences?.[0]?.order, 3);
    assert.ok(validateOcc.every((occ) => occ.sourceRange));
  });

  it('orders nested callee calls independently per caller context', () => {
    const files = [
      parseSource(
        [
          'function checkCustomer(order) {}',
          'function checkInventory(order) {}',
          'function validate(order) {',
          '  checkCustomer(order);',
          '  checkInventory(order);',
          '}',
          'function createOrder(order) {',
          '  validate(order);',
          '  save(order);',
          '}',
          'function save(order) {}',
        ].join('\n'),
        'src/orders.js',
      ),
    ];

    const graph = buildCodeTracrGraph(files);
    const validateId = 'function:src/orders.js#validate';
    const createId = 'function:src/orders.js#createOrder';
    const customerId = 'function:src/orders.js#checkCustomer';
    const inventoryId = 'function:src/orders.js#checkInventory';

    const validateToCustomer = graph.edges.find(
      (edge) => edge.from === validateId && edge.to === customerId,
    );
    const validateToInventory = graph.edges.find(
      (edge) => edge.from === validateId && edge.to === inventoryId,
    );
    assert.equal(validateToCustomer?.provenance.occurrences?.[0]?.order, 1);
    assert.equal(validateToInventory?.provenance.occurrences?.[0]?.order, 2);

    const createToValidate = graph.edges.find(
      (edge) => edge.from === createId && edge.to === validateId,
    );
    assert.equal(createToValidate?.provenance.occurrences?.[0]?.order, 1);
  });
});
