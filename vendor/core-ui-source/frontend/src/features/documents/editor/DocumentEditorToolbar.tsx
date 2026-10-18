import { memo, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Editor } from '@tiptap/react';
import { userSignaturesApi } from '../../../api/userSignatures';
import {
  CompactToolbarTab,
  DocumentToolbarSections,
} from './documentToolbarSections';

interface Props {
  editor: Editor;
}

const COMPACT_TABS: { id: CompactToolbarTab; label: string }[] = [
  { id: 'text', label: 'Text' },
  { id: 'format', label: 'Format' },
  { id: 'layout', label: 'Layout' },
  { id: 'insert', label: 'Insert' },
];

export const DocumentEditorToolbar = memo(function DocumentEditorToolbar({
  editor,
}: Props) {
  const [, setTick] = useState(0);
  const [compactTab, setCompactTab] = useState<CompactToolbarTab>('text');
  const sigQ = useQuery({
    queryKey: ['me-signatures'],
    queryFn: () => userSignaturesApi.list(),
  });

  useEffect(() => {
    const onUpdate = () => setTick(n => n + 1);
    editor.on('transaction', onUpdate);
    return () => {
      editor.off('transaction', onUpdate);
    };
  }, [editor]);

  const insertMySignature = () => {
    void (async () => {
      const base = {
        role: 'author_signature',
        label: 'Author signature',
        mode: 'pre_embedded',
      };
      let saved = sigQ.data?.[0];
      if (!saved) {
        try {
          const list = await userSignaturesApi.list();
          saved = list[0];
        } catch {
          saved = undefined;
        }
      }
      if (saved) {
        try {
          const embeddedPngB64 = await userSignaturesApi.downloadPngBase64(saved.id);
          editor
            .chain()
            .focus()
            .insertSignaturePlaceholder({
              ...base,
              embeddedAttachmentId: saved.id,
              embeddedPngB64,
            })
            .run();
          return;
        } catch {
          /* fall through */
        }
      }
      editor.chain().focus().insertSignaturePlaceholder(base).run();
    })();
  };

  const {
    textGroup,
    formatGroup,
    alignGroup,
    spacingGroup,
    listsGroup,
    insertGroup,
  } = DocumentToolbarSections({ editor, insertMySignature });

  return (
    <div className="doc-toolbar" role="toolbar" aria-label="Document formatting">
      <div className="doc-toolbar-compact">
        <div className="doc-toolbar-tabs" role="tablist" aria-label="Formatting sections">
          {COMPACT_TABS.map(tab => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={compactTab === tab.id}
              className={
                'doc-toolbar-tab' +
                (compactTab === tab.id ? ' doc-toolbar-tab--active' : '')
              }
              onClick={() => setCompactTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="doc-toolbar-row doc-toolbar-row--compact">
          {compactTab === 'text' ? textGroup : null}
          {compactTab === 'format' ? formatGroup : null}
          {compactTab === 'layout' ? (
            <>
              {alignGroup}
              {spacingGroup}
              {listsGroup}
            </>
          ) : null}
          {compactTab === 'insert' ? insertGroup : null}
        </div>
      </div>

      <div className="doc-toolbar-wide">
        <div className="doc-toolbar-row">
          {textGroup}
          {formatGroup}
          {alignGroup}
          {spacingGroup}
          {listsGroup}
        </div>
        <div className="doc-toolbar-row doc-toolbar-row--insert">{insertGroup}</div>
      </div>
    </div>
  );
});
