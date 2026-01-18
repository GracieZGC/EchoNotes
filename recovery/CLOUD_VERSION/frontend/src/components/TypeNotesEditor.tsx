import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Placeholder from '@tiptap/extension-placeholder';
import Image from '@tiptap/extension-image';
import { type Level } from '@tiptap/extension-heading';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { createLowlight } from 'lowlight';

// 导入语言高亮定义
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import python from 'highlight.js/lib/languages/python';
import css from 'highlight.js/lib/languages/css';
import json from 'highlight.js/lib/languages/json';
import xml from 'highlight.js/lib/languages/xml';

// 注册语言
const lowlight = createLowlight();
lowlight.register({ javascript, typescript, python, css, json, xml });

export interface TypeNotesEditorProps {
  initialHTML?: string;
  onChange?: (content: { html: string; text: string }) => void;
  className?: string;
}

const TypeNotesEditor: React.FC<TypeNotesEditorProps> = ({
  initialHTML,
  onChange,
  className
}) => {
  const hiddenFileInputRef = useRef<HTMLInputElement | null>(null);

  // 1. 初始化扩展
  const extensions = useMemo(() => {
    return [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        bulletList: { keepMarks: true },
        orderedList: { keepMarks: true },
        codeBlock: false // 禁用默认代码块，防止冲突
      }),
      CodeBlockLowlight.configure({
        lowlight,
        // 这里只负责给 <pre> 加类名，不要在这里做复杂的 DOM 操作
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
    extensions,
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
          // 代码块样式：注意这里增加了 overflow-x-auto 防止代码过长撑破容器
          '[&_pre]:font-mono [&_pre]:leading-relaxed [&_pre]:tracking-wide [&_pre]:bg-slate-800 [&_pre]:text-slate-100 [&_pre]:p-4 [&_pre]:rounded-lg [&_pre]:overflow-x-auto [&_pre]:my-4',
          '[&_code]:bg-transparent [&_code]:p-0 [&_code]:text-inherit'
        ].join(' '),
        spellCheck: 'true'
      }
    }
  });

  // 按钮样式辅助函数
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

  // --- 关键修复 2: 移除了所有手动 DOM 操作 ---
  // 只保留状态同步逻辑，这是 React 的正确用法
  useEffect(() => {
    if (!editor) return;

    const updateLevel = () => {
      if (editor.isActive('heading', { level: 1 })) {
        setActiveLevel(1);
      } else if (editor.isActive('heading', { level: 2 })) {
        setActiveLevel(2);
      } else if (editor.isActive('heading', { level: 3 })) {
        setActiveLevel(3);
      } else {
        setActiveLevel(0);
      }
    };

    // 初始检查
    updateLevel();

    // 绑定事件：只在 transaction 发生时检查状态，不操作 DOM
    editor.on('transaction', updateLevel);

    return () => {
      editor.off('transaction', updateLevel);
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
        {/* 标题下拉框 */}
        <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 text-xs text-slate-600">
          <span className="text-[10px] text-slate-400">格式</span>
          <select
            value={activeLevel}
            onChange={(event) => {
              handleBlockSelect(Number(event.target.value) as BlockLevel);
            }}
            className="bg-transparent text-[12px] font-semibold outline-none py-1 cursor-pointer"
          >
            {blockOptions.map((option) => (
              <option key={option.label} value={option.level}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {/* 基础按钮 */}
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

        <button
          type="button"
          className={getButtonClass(editor.isActive('bulletList'))}
          onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleBulletList().run(); }}
        >
          无序列表
        </button>
        
        <button
          type="button"
          className={getButtonClass(editor.isActive('orderedList'))}
          onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleOrderedList().run(); }}
        >
          有序列表
        </button>

        {/* --- 关键修复 3: 修正命令名称 --- */}
        {/* 使用 toggleCodeBlock 而不是 toggleCodeBlockLowlight */}
        <button
          type="button"
          className={getButtonClass(editor.isActive('codeBlock'))} 
          onMouseDown={(e) => { 
            e.preventDefault(); 
            editor.chain().focus().toggleCodeBlock().run(); 
          }}
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