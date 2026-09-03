const orderMutableFields = {
  customerId: { type: 'string', minLength: 1 },
  amount: { type: 'number', minimum: 0 },
  currency: { type: 'string', minLength: 1 },
  status: { type: 'string', minLength: 1 },
} as const;

export const CreateOrderSchema = {
  body: {
    type: 'object',
    additionalProperties: false,
    required: ['customerId', 'amount', 'currency'],
    properties: {
      customerId: orderMutableFields.customerId,
      amount: orderMutableFields.amount,
      currency: orderMutableFields.currency,
    },
  },
} as const;

export const UpdateOrderSchema = {
  body: {
    type: 'object',
    additionalProperties: false,
    minProperties: 1,
    properties: orderMutableFields,
  },
} as const;

export const BulkArchiveSchema = {
  body: {
    type: 'object',
    additionalProperties: false,
    required: ['ids'],
    properties: {
      ids: {
        type: 'array',
        minItems: 1,
        items: { type: 'string', minLength: 1 },
      },
    },
  },
} as const;
