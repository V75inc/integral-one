import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ApprovalRequestContent, approvalRequestSentence } from '../ApprovalRequestContent';

vi.mock('../../../../components/entries/relations/RelationValue', () => ({
  RelationValue: ({ value }: {value: string}) => <span>{value}</span>,
}));
afterEach(cleanup);

describe('plain-language approval request', () => {
  it('articulates the proposed effect without claiming it already happened', () => {
    expect(approvalRequestSentence('Create entry “Sam Blair” in Customers')).toBe('This will create entry “Sam Blair” in Customers.');
    expect(approvalRequestSentence('File content as “Sam Blair” in Customers')).toBe('This will save “Sam Blair” in Customers.');
    expect(approvalRequestSentence('Update the selected records.')).toBe('This will update the selected records.');
    expect(approvalRequestSentence('Review customer information')).toBe('Review customer information');
    expect(approvalRequestSentence('')).toMatch(/Review the details/);
  });

  it('shows prose first and keeps the complete detailed change available', () => {
    render(<ApprovalRequestContent staged={{kind:'create_entry', summary:'Create entry “Sam Blair”',
      diff_human:'Create entry “Sam Blair”\n\n- **Body:** Exact proposed content',
      diff_machine: {op:'create_entry', body:'Exact proposed content'},
    }} />);
    expect(screen.getByText('This will create entry “Sam Blair”.')).toBeVisible();
    expect(screen.getByText('Review change details').closest('details')).not.toHaveAttribute('open');
    fireEvent.click(screen.getByText('Review change details'));
    expect(screen.getByText('Exact proposed content')).toBeVisible();
  });

  it('keeps bound command inputs visible and never substitutes narrated JSON', () => {
    render(<ApprovalRequestContent staged={{kind:'call_workspace_tool', summary:'Save selected material',
      diff_human:'```json\n{"amount":999999}\n```',
      diff_machine: {op:'call_workspace_tool', input:{amount:24}, review:{description:'Record the approved amount.'}},
    }} />);
    expect(screen.getByText('This will save selected material.')).toBeVisible();
    expect(screen.getByText('24')).toBeVisible();
    expect(screen.queryByText(/999999/)).not.toBeInTheDocument();
    expect(screen.getByText('Record the approved amount.')).toBeVisible();
  });

  it('explains the actual scheduled task and stop condition without a truncated headline', () => {
    render(<ApprovalRequestContent staged={{kind:'routine_task_create', summary:'New routine: Read the current total in workspace n.W',
      diff_human:'Instruction: Read the current total.\nCadence: * * * * *',
      diff_machine:{op:'routine_task_create',instruction:'Read the current accessible entry total and report it here.',
        cron:'* * * * *',timezone:'UTC',delivery_mode:'agent',max_runs:5,write_scope:[]},
    }} />);
    expect(screen.getByText('This will schedule an automatic update in this chat.')).toBeVisible();
    expect(screen.getByText('Read the current accessible entry total and report it here.')).toBeVisible();
    expect(screen.getByText(/every minute \(UTC\).*stop after 5 successful runs/)).toBeVisible();
    expect(screen.queryByText(/New routine:/)).not.toBeInTheDocument();
  });

  it('keeps unattended write authority visible before a routine is approved', () => {
    render(<ApprovalRequestContent staged={{kind:'routine_task_create',summary:'New routine: Update records',diff_human:'Track scope',
      diff_machine:{op:'routine_task_create',instruction:'Update approved records.',cron:'0 9 * * *',delivery_mode:'agent',write_scope:[{resource_type:'track',resource_id:'n.Track.1'}]},
    }} />);
    expect(screen.getByText(/Future runs may change the approved resources without another prompt/)).toBeVisible();
    expect(screen.getByText(/continue until you pause or stop/)).toBeVisible();
  });
});
