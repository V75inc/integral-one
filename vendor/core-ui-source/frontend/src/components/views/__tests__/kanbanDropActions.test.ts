import { describe, expect, it } from 'vitest';
import type { Entry } from '../../../types';
import {
  buildDropPayload,
  columnDropBlockReason,
  initialDropFieldValues,
  readKanbanColumn,
  resolveKanbanDrop,
  validateDropInput,
} from '../kanbanDropActions';

function entry(custom_fields: Record<string, unknown>): Entry {
  return {
    id: 'inv-1',
    title: 'INV-0001',
    type: 'invoice',
    track_id: 'track-1',
    author_id: 'user-1',
    created_at: '2026-05-01T10:00:00Z',
    custom_fields,
  } as Entry;
}

const PAYMENT_DROP = {
  kind: 'operation' as const,
  operation: 'payment_record',
  title: 'Receive payment',
  confirm_label: 'Record payment',
  message:
    'Record the payment in the books. The invoice moves to Paid when the balance reaches zero.',
  success_message: 'Payment recorded',
  requires: [
    {
      path: 'custom_fields.customer',
      message: 'Add a customer before recording a payment.',
    },
  ],
  fields: [
    {
      key: 'total_amount',
      label: 'Amount received',
      type: 'number',
      source: 'custom_fields.balance',
    },
    {
      key: 'payment_method',
      label: 'Method',
      type: 'select',
      default: 'transfer',
      options: [
        { value: 'cash', label: 'Cash' },
        { value: 'transfer', label: 'Bank transfer' },
      ],
    },
    {
      key: 'reference_number',
      label: 'Reference',
      type: 'text',
      optional: true,
    },
  ],
  payload: {
    direction: 'receive',
    customer_id: '$custom_fields.customer',
    customer_name: '$custom_fields.customer_name',
    total_amount: '$input.total_amount',
    payment_method: '$input.payment_method',
    reference_number: '$input.reference_number',
    applications: [
      { invoice_id: '$entry.id', applied_amount: '$input.total_amount' },
    ],
  },
};

describe('kanban drop actions', () => {
  it('keeps on_drop and accepts_from from the column config', () => {
    const column = readKanbanColumn({
      key: 'paid',
      label: 'Paid',
      accepts_from: ['open', 'overdue'],
      drop_target: false,
      on_drop: PAYMENT_DROP,
    });
    expect(column.accepts_from).toEqual(['open', 'overdue']);
    expect(column.drop_target).toBe(false);
    expect(column.on_drop?.operation).toBe('payment_record');
  });

  it('explains why a draft cannot land on Paid', () => {
    const column = readKanbanColumn({
      key: 'paid',
      label: 'Paid',
      accepts_from: ['open', 'partially_paid', 'overdue'],
    });
    const reason = columnDropBlockReason(column, 'draft', 'Draft', key =>
      key === 'open' ? 'Open' : key
    );
    expect(reason).toContain('Open');
    expect(reason).toContain('Draft');
  });

  it('refuses display-only columns', () => {
    const column = readKanbanColumn({
      key: 'overdue',
      label: 'Overdue',
      drop_target: false,
    });
    expect(columnDropBlockReason(column, 'open', 'Open', key => key)).toMatch(
      /on its own/
    );
  });

  it('ignores domain-specific drop kinds', () => {
    expect(resolveKanbanDrop({ kind: 'receive_payment' })).toBeNull();
  });

  it('turns a declarative payment drop into a form action', () => {
    const action = resolveKanbanDrop(PAYMENT_DROP);
    expect(action?.operation).toBe('payment_record');
    expect(action?.mode).toBe('form');
    expect(action?.successMessage).toBe('Payment recorded');
    expect(action?.requires).toEqual([
      {
        path: 'custom_fields.customer',
        message: 'Add a customer before recording a payment.',
      },
    ]);
    const invoice = entry({
      customer: { id: 'cust-9' },
      customer_name: 'Acme',
      balance: 250,
      status: 'open',
    });
    const input = initialDropFieldValues(action!.fields, invoice);
    expect(input.total_amount).toBe('250');
    expect(input.payment_method).toBe('transfer');
    const payload = buildDropPayload(action!.payload, invoice, input, action!.fields);
    expect(payload).toMatchObject({
      direction: 'receive',
      customer_id: 'cust-9',
      customer_name: 'Acme',
      total_amount: 250,
      payment_method: 'transfer',
      applications: [{ invoice_id: 'inv-1', applied_amount: 250 }],
    });
    expect(payload.reference_number).toBeUndefined();
    expect(validateDropInput(action!, invoice, input)).toBeNull();
  });

  it('blocks a drop when a required entry path is empty', () => {
    const action = resolveKanbanDrop(PAYMENT_DROP)!;
    const invoice = entry({ balance: 40 });
    expect(
      validateDropInput(action, invoice, {
        total_amount: '40',
        payment_method: 'cash',
        reference_number: '',
      })
    ).toMatch(/customer/);
  });

  it('blocks a payment larger than the open balance', () => {
    const action = resolveKanbanDrop(PAYMENT_DROP)!;
    const invoice = entry({ customer: 'cust-9', balance: 40 });
    expect(
      validateDropInput(action, invoice, {
        total_amount: '80',
        payment_method: 'cash',
        reference_number: '',
      })
    ).toMatch(/open balance/);
  });

  it('issues a document through document_action', () => {
    const action = resolveKanbanDrop({
      kind: 'operation',
      operation: 'document_action',
      title: 'Issue document',
      confirm: 'Issue this document? Its lines and amounts lock.',
      confirm_label: 'Issue',
      success_message: 'Document issued',
      payload: { action: 'issue' },
    });
    expect(action?.mode).toBe('confirm');
    expect(action?.bindDocument).toBe(true);
    expect(action?.title).toBe('Issue document');
    expect(action?.confirm).toMatch(/Issue/);
    expect(action?.successMessage).toBe('Document issued');
    const payload = buildDropPayload(action!.payload, entry({}), {}, action!.fields);
    expect(payload).toEqual({ action: 'issue' });
  });
});
