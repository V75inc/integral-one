import { useMemo } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import {
  AssistantRuntimeProvider,
  MessagePrimitive,
  ThreadPrimitive,
  useExternalStoreRuntime,
  type ThreadMessageLike,
} from '@assistant-ui/react';
import { describe, expect, it } from 'vitest';
import { MarkdownText } from '../MarkdownText';

const identity = (message: ThreadMessageLike) => message;
const onNew = async () => {};
const Message = () => <MessagePrimitive.Parts components={{ Text: MarkdownText }} />;

function Harness({ text, running }: { text: string; running: boolean }) {
  const messages = useMemo<ThreadMessageLike[]>(() => [{
    id: 'answer', role: 'assistant', content: [{ type: 'text', text }],
    status: running ? { type: 'running' } : { type: 'complete', reason: 'stop' },
  }], [text, running]);
  const store = useMemo(() => ({
    messages, isRunning: running, onNew, convertMessage: identity,
  }), [messages, running]);
  const runtime = useExternalStoreRuntime(store);
  return <AssistantRuntimeProvider runtime={runtime}>
    <ThreadPrimitive.Messages components={{ Message }} />
  </AssistantRuntimeProvider>;
}

describe('real streamed markdown', () => {
  it('publishes the entire fenced quote when a streamed answer settles', async () => {
    const { container, rerender } = render(<Harness text={'Before\n\n```text\nSy'} running />);
    await waitFor(() => expect(container.querySelector('code')).toHaveTextContent('Sy'));
    const complete = 'Before\n\n```text\nSynthetic approval test\n```\n\nAfter';
    rerender(<Harness text={complete} running />);
    await waitFor(() => expect(screen.getByText('After')).toBeVisible());
    rerender(<Harness text={complete} running={false} />);
    await waitFor(() => expect(container.querySelector('code')).toHaveTextContent('Synthetic approval test'));
  });
});
