import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useEditor, EditorContent, ReactNodeViewRenderer } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Placeholder from '@tiptap/extension-placeholder';
import Image from '@tiptap/extension-image';
import { type Level } from '@tiptap/extension-heading';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { createLowlight } from 'lowlight';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import python from 'highlight.js/lib/languages/python';
import css from 'highlight.js/lib/languages/css';
import json from 'highlight.js/lib/languages/json';
import xml from 'highlight.js/lib/languages/xml';
import CodeBlockComponent from './CodeBlockComponent';

export interface TypeNotesEditorProps {
  initialHTML?: string;
  onChange?: (content: { html: string; text: string }) => void;
  className?: string;
}

const lowlight = createLowlight();

lowlight.register({
  javascript,
  typescript,
  python,
  css,
  json,
  xml
});

const TypeNotesEditor: React.FC<TypeNotesEditorProps> = ({
  initialHTML,
  onChange,
  className
}) => {
  const hiddenFileInputRef = useRef<HTMLInputElement | null>(null);

  const extensions = useMemo(() => {
    return [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        bulletList: { keepMarks: true },
        orderedList: { keepMarks: true },
        codeBlock: false
      }),
      CodeBlockLowlight
        .extend({
          addNodeView() {
            return ReactNodeViewRenderer(CodeBlockComponent);
          }
        })
        .configure({
          lowlight,
          HTMLAttributes: {
            class: 'hljs'
          }
        }),
      Underline,
      Image,
      Placeholder.configure({
        placeholder: '在这写下你的要点或灵感，支持标题、列表、代码块...'
      })
    ];
  }, []);

  const editor = useEditor({
    extensions, // 使用缓存的 extensions
    content: initialHTML || '<p></p>',
    onUpdate: ({ editor }) => {
      onChange?.({ html: editor.getHTML(), text: editor.getText() });
    },
    editorProps: {
      attributes: {
        class: [
          'min-h-[320px] w-full max-w-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-relaxed text-slate-900 focus:outline-none',
          '[&_h1]:text-3xl [&_h1]:font-semibold [&_h1]:mt-6 [&_h1]:mb-3',
          '[&_h2]:text-2xl [&_h2]:font-bold [&_h2]:mt-5 [&_h2]:mb-3',
          '[&_h3]:text-xl [&_h3]:font-semibold [&_h3]:mt-4 [&_h3]:mb-3',
          '[&_p]:my-1',
          '[&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-2',
          '[&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-2',
          '[&_pre]:font-mono [&_pre]:leading-relaxed [&_pre]:tracking-wide'
        ].join(' '),
        spellCheck: 'true'
      }
    }
  });

  // 辅助函数：生成按钮样式
  const getButtonClass = (active: boolean) =>
    [
      'flex',
      'items-center',
      'justify-center',
      'h-8',
      'px-2',
      'rounded-md',
      'text-xs',
      'font-semibold',
      'transition',
      active ? 'bg-[#0a6154] text-white' : 'text-slate-600 hover:bg-slate-100'
    ]
      .filter(Boolean)
      .join(' ');

  const handleInsertImage = useCallback(() => {
    hiddenFileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file || !editor) return;
      const url = URL.createObjectURL(file);
      editor.chain().focus().setImage({ src: url, alt: file.name }).run();
      event.target.value = '';
    },
    [editor]
  );

  type BlockLevel = 0 | Level;
  const blockOptions = useMemo(
    () =>
      [
        { label: '正文', level: 0 as BlockLevel },
        { label: 'H1', level: 1 as BlockLevel },
        { label: 'H2', level: 2 as BlockLevel },
        { label: 'H3', level: 3 as BlockLevel }
      ] as const,
    []
  );

  const [activeLevel, setActiveLevel] = useState<BlockLevel>(0);

  useEffect(() => {
    if (!editor) return;

    const updateLevel = () => {
      setActiveLevel(() => {
        if (editor.isActive('heading', { level: 1 })) return 1;
        if (editor.isActive('heading', { level: 2 })) return 2;
        if (editor.isActive('heading', { level: 3 })) return 3;
        return 0;
      });
    };

  const applyLineNumbers = () => {
    const preBlocks = Array.from(editor.view.dom.querySelectorAll('pre')) as HTMLPreElement[];
    preBlocks.forEach((pre) => {
      const lines = pre.textContent?.split('\n').length || 1;
      const numbers = Array.from({ length: lines }, (_, idx) => idx + 1).join('\n');
      pre.dataset.lineNumbers = numbers;
      pre.setAttribute('data-line-numbers', numbers);
      ensureCopyButton(pre);
    });
  };

  const ensureCopyButton = (pre: HTMLPreElement) => {
    // 代码块在 TipTap NodeView（CodeBlockComponent）里已经有复制按钮了，这里跳过避免重复
    if (pre.closest('.code-block')) return;
    let btn = pre.querySelector<HTMLButtonElement>('.copy-code-btn');
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'copy-code-btn';
      btn.innerHTML = '复制';
      btn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const text = pre.innerText;
        navigator.clipboard?.writeText(text || '').then(() => {
          btn!.setAttribute('aria-label', '已复制');
          btn!.dataset.copied = 'true';
          window.setTimeout(() => {
            btn?.removeAttribute('aria-label');
            btn?.removeAttribute('data-copied');
          }, 1200);
        });
      });
      pre.appendChild(btn);
    }
  };

    updateLevel();
    applyLineNumbers();

    const selectionHandler = () => {
      updateLevel();
      applyLineNumbers();
    };

    editor.on('selectionUpdate', selectionHandler);
    editor.on('transaction', selectionHandler);
    editor.on('update', selectionHandler);

    return () => {
      editor.off('selectionUpdate', selectionHandler);
      editor.off('transaction', selectionHandler);
    };
  }, [editor]);

  const handleBlockSelect = useCallback(
    (level: BlockLevel) => {
      if (level === 0) {
        editor.chain().focus().setParagraph().run();
      } else {
        editor.chain().focus().toggleHeading({ level }).run();
      }
    },
    [editor]
  );

  if (!editor) {
    return null;
  }

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm mb-4">
        <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 text-xs text-slate-600">
          <span className="text-[10px] text-slate-400">格式</span>
          <select
            value={activeLevel}
            onChange={(event) => {
              handleBlockSelect(Number(event.target.value) as BlockLevel);
            }}
            className="bg-transparent text-[12px] font-semibold outline-none"
          >
            {blockOptions.map((option) => (
              <option key={option.label} value={option.level}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {/* 基础格式 */}
        {/* 基础格式 */}
        <button
          type="button"
          className={getButtonClass(editor.isActive('bold'))}
          onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleBold().run(); }}
        >
          加粗
        </button>
        <button
          type="button"
          className={getButtonClass(editor.isActive('italic'))}
          onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleItalic().run(); }}
        >
          斜体
        </button>
        <button
          type="button"
          className={getButtonClass(editor.isActive('underline'))}
          onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleUnderline().run(); }}
        >
          下划线
        </button>

        <div className="w-px h-4 bg-slate-300 mx-1"></div>

        {/* 列表 - 确保 toggleBulletList */}
        <button
          type="button"
          className={getButtonClass(editor.isActive('bulletList'))}
          onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleBulletList().run(); }}
        >
          无序列表
        </button>
        
        {/* 列表 - 确保 toggleOrderedList */}
        <button
          type="button"
          className={getButtonClass(editor.isActive('orderedList'))}
          onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleOrderedList().run(); }}
        >
          有序列表
        </button>

        {/* 代码块 */}
        <button
          type="button"
          className={getButtonClass(editor.isActive('codeBlock'))}
          onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleCodeBlock().run(); }}
        >
          代码块
        </button>

        <div className="w-px h-4 bg-slate-300 mx-1"></div>

        <button
          type="button"
          className={getButtonClass(false)}
          onMouseDown={(e) => { e.preventDefault(); handleInsertImage(); }}
        >
          插入图片
        </button>
      </div>

      <EditorContent editor={editor} />
      
      <input
        ref={hiddenFileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  );
};

export default TypeNotesEditor;
