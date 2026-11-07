'use client';
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';

/** Email links may be explicit URLs or the supported runtime shop URL placeholder. */
export function emailLinkAllowed(href: string) {
  if (href === '{{shopMapsLink}}') return true;
  try {
    const url = new URL(href);
    return (
      ['https:', 'http:', 'mailto:', 'tel:'].includes(url.protocol) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}
export function HtmlEmailEditor({
  label,
  value,
  onChange,
  variables,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (html: string) => void;
  variables: readonly string[];
  disabled?: boolean;
}) {
  const id = useId(),
    lastValue = useRef(value);
  const [source, setSource] = useState(false),
    [linkOpen, setLinkOpen] = useState(false),
    [href, setHref] = useState(''),
    [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({
          trailingNode: false,
          link: {
            openOnClick: false,
            autolink: false,
            linkOnPaste: false,
            isAllowedUri: emailLinkAllowed,
          },
        }),
      ],
      immediatelyRender: false,
      content: value,
      editable: !disabled,
      editorProps: {
        attributes: {
          role: 'textbox',
          'aria-label': label,
          'aria-multiline': 'true',
          'aria-describedby': `${id}-hint`,
          class: 'email-rich-content',
        },
        handleClick: (_view, _pos, event) => {
          if ((event.target as HTMLElement).closest('a')) {
            event.preventDefault();
            return true;
          }
          return false;
        },
      },
      onUpdate: ({ editor }) => {
        if (disabled) return;
        const html = editor.getHTML();
        lastValue.current = html;
        onChange(html);
      },
    },
    [revision],
  );
  // Subscribe to the current instance so toolbar state also resets with the document.
  useSyncExternalStore(
    useCallback(
      (notify: () => void) => {
        if (!editor) return () => {};
        editor.on('transaction', notify);
        return () => {
          editor.off('transaction', notify);
        };
      },
      [editor],
    ),
    useCallback(() => editor?.state ?? null, [editor]),
    () => null,
  );
  const state = editor
    ? {
        bold: editor.isActive('bold'),
        italic: editor.isActive('italic'),
        underline: editor.isActive('underline'),
        bullet: editor.isActive('bulletList'),
        ordered: editor.isActive('orderedList'),
        link: editor.isActive('link'),
        style: editor.isActive('heading', { level: 2 })
          ? 'h2'
          : editor.isActive('heading', { level: 3 })
            ? 'h3'
            : 'paragraph',
        undo: editor.can().undo(),
        redo: editor.can().redo(),
      }
    : null;
  useEffect(() => {
    if (editor) editor.setEditable(!disabled, false);
  }, [editor, disabled]);
  useEffect(() => {
    if (editor && value !== lastValue.current) {
      lastValue.current = value;
      // External resets/source changes start a fresh document and undo history.
      // User edits update lastValue first, so typing does not recreate the editor.
      setRevision((current) => current + 1);
      setLinkOpen(false);
      setError('');
    }
  }, [editor, value]);
  function applyLink() {
    const next = href.trim();
    if (!editor || disabled) return;
    if (!emailLinkAllowed(next)) {
      setError('Use an http, https, mailto or tel URL, or {{shopMapsLink}}.');
      return;
    }
    editor
      .chain()
      .focus()
      .extendMarkRange('link')
      .setLink({ href: next })
      .run();
    setLinkOpen(false);
    setError('');
  }
  return (
    <div className="field html-email-editor">
      <span className="field-label">{label}</span>
      <div className="email-editor-shell">
        <fieldset
          disabled={disabled || !editor}
          className="email-editor-toolbar"
          aria-label={`${label} formatting`}
        >
          <button
            type="button"
            aria-label="Visual editor"
            aria-pressed={!source}
            onClick={() => setSource(false)}
          >
            Visual
          </button>
          <button
            type="button"
            aria-pressed={source}
            onClick={() => {
              setSource(true);
              setLinkOpen(false);
            }}
          >
            HTML source
          </button>
          {!source && (
            <>
              <select
                aria-label="Text style"
                value={state?.style ?? 'paragraph'}
                onChange={(e) => {
                  if (e.target.value === 'paragraph')
                    editor?.chain().focus().setParagraph().run();
                  else
                    editor
                      ?.chain()
                      .focus()
                      .setHeading({ level: e.target.value === 'h2' ? 2 : 3 })
                      .run();
                }}
              >
                <option value="paragraph">Paragraph</option>
                <option value="h2">Heading 2</option>
                <option value="h3">Heading 3</option>
              </select>
              <button
                type="button"
                aria-label="Bold"
                title="Bold"
                aria-pressed={state?.bold ?? false}
                onClick={() => editor?.chain().focus().toggleBold().run()}
              >
                <strong>B</strong>
              </button>
              <button
                type="button"
                aria-label="Italic"
                title="Italic"
                aria-pressed={state?.italic ?? false}
                onClick={() => editor?.chain().focus().toggleItalic().run()}
              >
                <em>I</em>
              </button>
              <button
                type="button"
                aria-label="Underline"
                title="Underline"
                aria-pressed={state?.underline ?? false}
                onClick={() => editor?.chain().focus().toggleUnderline().run()}
              >
                <u>U</u>
              </button>
              <button
                type="button"
                aria-label="Bullet list"
                aria-pressed={state?.bullet ?? false}
                onClick={() => editor?.chain().focus().toggleBulletList().run()}
              >
                • List
              </button>
              <button
                type="button"
                aria-label="Numbered list"
                aria-pressed={state?.ordered ?? false}
                onClick={() =>
                  editor?.chain().focus().toggleOrderedList().run()
                }
              >
                1. List
              </button>
              <button
                type="button"
                aria-label="Edit link"
                aria-pressed={state?.link ?? false}
                onClick={() => {
                  setHref(editor?.getAttributes('link').href ?? 'https://');
                  setError('');
                  setLinkOpen((v) => !v);
                }}
              >
                Link
              </button>
              <button
                type="button"
                aria-label="Undo"
                disabled={!state?.undo}
                onClick={() => editor?.chain().focus().undo().run()}
              >
                Undo
              </button>
              <button
                type="button"
                aria-label="Redo"
                disabled={!state?.redo}
                onClick={() => editor?.chain().focus().redo().run()}
              >
                Redo
              </button>
              <select
                aria-label="Insert placeholder"
                value=""
                onChange={(e) => {
                  if (e.target.value)
                    editor
                      ?.chain()
                      .focus()
                      .insertContent({
                        type: 'text',
                        text: `{{${e.target.value}}}`,
                      })
                      .run();
                }}
              >
                <option value="">Insert placeholder…</option>
                {variables.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </>
          )}
        </fieldset>
        {linkOpen && !source && (
          <fieldset
            className="email-editor-link"
            disabled={disabled}
            aria-label="Link settings"
          >
            <label htmlFor={`${id}-link`}>Link URL</label>
            <input
              id={`${id}-link`}
              type="text"
              value={href}
              onChange={(e) => setHref(e.target.value)}
              maxLength={2048}
            />
            <button type="button" onClick={applyLink}>
              Apply link
            </button>
            <button
              type="button"
              onClick={() => {
                editor
                  ?.chain()
                  .focus()
                  .extendMarkRange('link')
                  .unsetLink()
                  .run();
                setLinkOpen(false);
              }}
            >
              Remove link
            </button>
            <button type="button" onClick={() => setLinkOpen(false)}>
              Cancel
            </button>
            {error && <p role="alert">{error}</p>}
          </fieldset>
        )}
        <div hidden={source}>
          <EditorContent editor={editor} />
        </div>
        {source && (
          <label className="email-source-label">
            HTML source code
            <textarea
              className="settings-json"
              rows={12}
              spellCheck={false}
              disabled={disabled}
              value={value}
              onChange={(e) => onChange(e.target.value)}
            />
          </label>
        )}
      </div>
      <span className="field-hint" id={`${id}-hint`}>
        Member placeholders stay editable. Visual editing supports standard
        email formatting; use HTML source for custom markup.
      </span>
    </div>
  );
}
