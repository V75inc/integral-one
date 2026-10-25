import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  message: {role: 'assistant', status: {type: 'running'}, metadata: {} as Record<string, unknown>, parts: [] as {type: string}[]},
}));
vi.mock('@assistant-ui/react', async importOriginal => ({
  ...await importOriginal<typeof import('@assistant-ui/react')>(),
  useMessageTiming: () => ({totalStreamTime: 1700}),
  useAuiState: (selector: (value: typeof state) => unknown) => selector(state),
}));
vi.mock('../../AIChatSurface', () => ({useChatActivity: () => ({activityText: 'Reading records'})}));
import { WorkTrail } from '../Thread';

describe('activity disclosure', () => {
  it('shows model, turn duration and abbreviated tokens before expanding exact usage', () => {
    state.message.status.type = 'complete';
    state.message.parts = [{type: 'tool-call'}, {type: 'tool-call'}];
    state.message.metadata = {custom: {steps: [{modelId: 'ollama_chat/deepseek-v4.1-flash:cloud', provider: 'ollama', durationMs: 1700, usage: {inputTokens: 1200, outputTokens: 50}}]}};
    render(<WorkTrail><span>Tool receipt</span></WorkTrail>);
    const trigger = screen.getByRole('button');
    expect(trigger).toHaveTextContent('Finished · 2 tool calls · deepseek-v4.1-flash:cloud');
    expect(trigger).toHaveTextContent('1.7s · 1.3K tokens');
    expect(trigger).not.toHaveTextContent(/cost/);
    expect(screen.queryByText('1,250 tokens')).not.toBeInTheDocument();
    fireEvent.click(trigger);
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getByText(/Input 1,200 tokens \(1\/1 calls reported\)/)).toBeVisible();
    expect(screen.getByText(/Output 50 tokens \(1\/1 calls reported\)/)).toBeVisible();
    expect(screen.getByText(/Cost unavailable for 1\/1 calls/)).toBeVisible();
    expect(screen.getByText('Total: 1.7s')).toBeVisible();
    state.message.parts = [];
    state.message.metadata = {};
  });

  it('keeps the model disclosure for a reply without tools', () => {
    state.message.status.type = 'complete';
    state.message.parts = [];
    state.message.metadata = {custom: {steps: [{modelId: 'provider/model', usage: {inputTokens: 3, outputTokens: 2}}]}};
    render(<WorkTrail>{null}</WorkTrail>);
    expect(screen.getByRole('button')).toHaveTextContent('Finished · model');
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText(/Input 3 tokens \(1\/1 calls reported\)/)).toBeVisible();
    expect(screen.getByText(/Output 2 tokens \(1\/1 calls reported\)/)).toBeVisible();
    state.message.metadata = {};
  });
  it('centers the working mark with its label and supports reduced motion', () => {
    state.message.status.type = 'running';
    const {container} = render(<WorkTrail><span>Tool receipt</span></WorkTrail>);
    expect(container.querySelector('[data-slot="aui_work-trail"]')).toHaveClass('mt-4');
    const mark = container.querySelector('.animate-agent-working');
    expect(mark).toHaveClass('inline-flex', 'items-center', 'justify-center', 'motion-reduce:animate-none');
    expect(mark?.parentElement).toHaveClass('relative', '-top-px', 'h-4', 'w-4', 'items-center', 'justify-center', 'leading-none');
    expect(screen.getByRole('status')).toHaveClass('inline-flex', 'min-h-4', 'items-center', 'leading-4');
    expect(screen.getByText('Reading records')).toHaveClass('animate-status-reveal', 'motion-reduce:animate-none');
  });

  it('starts collapsed and preserves a manual expansion through completion', () => {
    const {rerender} = render(<WorkTrail><span>Tool receipt</span></WorkTrail>);
    const trigger = screen.getByRole('button');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(trigger);
    expect(screen.getByText('Tool receipt')).toBeVisible();
    state.message.status.type = 'complete';
    rerender(<WorkTrail><span>Tool receipt</span></WorkTrail>);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Tool receipt')).toBeVisible();
    expect(screen.getByText('Activity, tool results, and model usage are shown here.')).toBeVisible();
  });
});
