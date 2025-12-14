import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ClipboardEvent
} from 'react';

export interface RichNoteContent {
  html: string;
  plainText: string;
}

export interface RichNoteEditorProps {
  /**
   * 初始 HTML 内容，仅在挂载时生效（组件内部维护后续状态）
   */
  initialHTML?: string;
  /**
   * 文本内容变更回调，返回 HTML 与纯文本
   */
  onChange?: (content: RichNoteContent) => void;
  /**
   * 纯文本长度上限（用于 Landing 页 200 字限制）
   */
  maxPlainTextLength?: number;
  /**
   * 当本次输入/粘贴会导致超过 maxPlainTextLength 时触发
   * 提供被保留的最后一次合法内容
   */
  onMaxLengthExceed?: (content: RichNoteContent) => void;
  /**
   * 占位提示文本
   */
  placeholder?: string;
  /**
   * 是否使用紧凑样式（用于 Landing 页小卡片）
   */
  compact?: boolean;
  className?: string;
}

const SAFE_EMPTY_HTML = '<p><br/></p>';

const normalizeHTML = (html: string | undefined | null): string => {
  if (!html) return SAFE_EMPTY_HTML;
  return html;
};

const getPlainTextLength = (text: string): number => {
  // 这里保留空格与换行，只做简单 trim，后续可按需要细化规则
  return text.trim().length;
};

const RichNoteEditor: React.FC<RichNoteEditorProps> = ({
  initialHTML,
  onChange,
  maxPlainTextLength,
  onMaxLengthExceed,
  placeholder,
  compact,
  className
}) => {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [isEmpty, setIsEmpty] = useState(true);

  const lastValidContentRef = useRef<RichNoteContent>({
    html: normalizeHTML(initialHTML),
    plainText: ''
  });

  // 初始化内容
  useEffect(() => {
    const node = editorRef.current;
    if (!node) return;

    const initial = normalizeHTML(initialHTML);
    node.innerHTML = initial;
    const plain = node.innerText || '';
    lastValidContentRef.current = {
      html: initial,
      plainText: plain
    };
    setIsEmpty(getPlainTextLength(plain) === 0);
  }, [initialHTML]);

  const emitChange = useCallback(
    (content: RichNoteContent) => {
      onChange?.(content);
    },
    [onChange]
  );

  const handleInput = useCallback(() => {
    const node = editorRef.current;
    if (!node) return;

    const html = node.innerHTML || '';
    const plainText = node.innerText || '';
    const length = getPlainTextLength(plainText);

    if (maxPlainTextLength && length > maxPlainTextLength) {
      // 超出时回退到上一次合法内容
      const last = lastValidContentRef.current;
      node.innerHTML = last.html;

      // 将光标移动到内容末尾，避免体验卡顿
      const selection = window.getSelection();
      if (selection && node.lastChild) {
        const range = document.createRange();
        range.selectNodeContents(node);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
      }

      setIsEmpty(getPlainTextLength(last.plainText) === 0);
      onMaxLengthExceed?.(last);
      return;
    }

    const next: RichNoteContent = { html, plainText };
    lastValidContentRef.current = next;
    setIsEmpty(length === 0);
    emitChange(next);
  }, [emitChange, maxPlainTextLength, onMaxLengthExceed]);

  const handlePaste = useCallback(
    (event: ClipboardEvent<HTMLDivElement>) => {
      if (!maxPlainTextLength) return;

      const clipboardText = event.clipboardData?.getData('text/plain') ?? '';
      const currentPlain = editorRef.current?.innerText ?? '';
      const currentLength = getPlainTextLength(currentPlain);
      const pastedLength = getPlainTextLength(clipboardText);
      const nextLength = currentLength + pastedLength;

      if (nextLength > maxPlainTextLength) {
        event.preventDefault();
        const last = lastValidContentRef.current;
        setIsEmpty(getPlainTextLength(last.plainText) === 0);
        onMaxLengthExceed?.(last);
      }
    },
    [maxPlainTextLength, onMaxLengthExceed]
  );

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    // 在空内容时，避免删除到连 <p><br/></p> 都没了，影响编辑
    if ((event.key === 'Backspace' || event.key === 'Delete') && editorRef.current) {
      const plain = editorRef.current.innerText || '';
      if (getPlainTextLength(plain) === 0) {
        editorRef.current.innerHTML = SAFE_EMPTY_HTML;
        setIsEmpty(true);
        event.preventDefault();
      }
    }
  }, []);

  const execCommand = (command: string, value?: string) => {
    try {
      document.execCommand(command, false, value);
      handleInput();
    } catch {
      // 忽略浏览器不支持的情况
    }
  };

  const wrapperClasses = [
    'border',
    'border-slate-200',
    'rounded-2xl',
    'bg-white',
    'shadow-sm',
    'flex',
    'flex-col',
    compact ? 'p-3' : 'p-4',
    className || ''
  ]
    .filter(Boolean)
    .join(' ');

  const toolbarButtonBase =
    'px-2 py-1 text-xs rounded-md border border-transparent text-slate-600 hover:bg-slate-100';

  return (
    <div className={wrapperClasses}>
      {/* 简易工具栏 */}
      <div className="flex flex-wrap items-center gap-1 mb-2">
        <button
          type="button"
          className={toolbarButtonBase}
          onMouseDown={(e) => {
            e.preventDefault();
            execCommand('bold');
          }}
        >
          B
        </button>
        <button
          type="button"
          className={toolbarButtonBase}
          onMouseDown={(e) => {
            e.preventDefault();
            execCommand('italic');
          }}
        >
          I
        </button>
        <button
          type="button"
          className={toolbarButtonBase}
          onMouseDown={(e) => {
            e.preventDefault();
            execCommand('underline');
          }}
        >
          U
        </button>
        <span className="mx-1 h-4 w-px bg-slate-200" />
        <button
          type="button"
          className={toolbarButtonBase}
          onMouseDown={(e) => {
            e.preventDefault();
            execCommand('formatBlock', 'H2');
          }}
        >
          H2
        </button>
        <button
          type="button"
          className={toolbarButtonBase}
          onMouseDown={(e) => {
            e.preventDefault();
            execCommand('insertUnorderedList');
          }}
        >
          • List
        </button>
        <button
          type="button"
          className={toolbarButtonBase}
          onMouseDown={(e) => {
            e.preventDefault();
            execCommand('insertOrderedList');
          }}
        >
          1. List
        </button>
        <button
          type="button"
          className={toolbarButtonBase}
          onMouseDown={(e) => {
            e.preventDefault();
            execCommand('formatBlock', 'PRE');
          }}
        >
          Code
        </button>
      </div>

      {/* 编辑区域 */}
      <div className="relative">
        {!isFocused && isEmpty && placeholder && (
          <div className="pointer-events-none absolute inset-x-3 top-2 text-sm text-slate-400">
            {placeholder}
          </div>
        )}
        <div
          ref={editorRef}
          className="min-h-[80px] max-h-64 overflow-y-auto text-sm leading-relaxed text-slate-800 outline-none px-3 py-2 rounded-xl"
          contentEditable
          suppressContentEditableWarning
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          onInput={handleInput}
          onPaste={handlePaste}
          onKeyDown={handleKeyDown}
        />
      </div>
    </div>
  );
};

export default RichNoteEditor;

