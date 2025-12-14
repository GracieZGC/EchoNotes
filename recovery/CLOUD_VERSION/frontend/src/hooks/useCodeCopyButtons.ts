import { useEffect } from 'react';

const BUTTON_CLASS = 'copy-code-btn';
const COPY_DURATION = 1200;

const copyToClipboard = async (text: string) => {
  if (!text) return Promise.resolve();
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text);
  }

  const temporaryTextarea = document.createElement('textarea');
  temporaryTextarea.value = text;
  temporaryTextarea.setAttribute('readonly', '');
  temporaryTextarea.style.position = 'absolute';
  temporaryTextarea.style.left = '-9999px';
  document.body.appendChild(temporaryTextarea);
  temporaryTextarea.select();
  temporaryTextarea.setSelectionRange(0, text.length);

  const successful = document.execCommand('copy');
  document.body.removeChild(temporaryTextarea);

  if (!successful) {
    throw new Error('复制失败');
  }
};

const getPreText = (pre: HTMLPreElement) => {
  const code = pre.querySelector<HTMLElement>('code');
  if (code && code.innerText.trim()) {
    return code.innerText;
  }
  return pre.innerText;
};

const ensureCopyButton = (pre: HTMLPreElement) => {
  if (pre.dataset.copyButtonAttached === 'true') return;
  if (pre.querySelector<HTMLButtonElement>(`.${BUTTON_CLASS}`)) return;
  if (pre.closest('.code-block')) return;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = BUTTON_CLASS;
  button.innerText = '复制';

  const handleClick = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();

    const text = getPreText(pre);
    copyToClipboard(text)
      .then(() => {
        button.setAttribute('aria-label', '已复制');
        button.dataset.copied = 'true';
        window.setTimeout(() => {
          button.removeAttribute('aria-label');
          button.removeAttribute('data-copied');
        }, COPY_DURATION);
      })
      .catch(() => {
        button.setAttribute('aria-label', '复制失败');
        window.setTimeout(() => {
          button.removeAttribute('aria-label');
        }, COPY_DURATION);
      });
  };

  button.addEventListener('click', handleClick);

  pre.style.position = pre.style.position || 'relative';
  pre.style.overflow = pre.style.overflow || 'visible';
  pre.appendChild(button);
  pre.dataset.copyButtonAttached = 'true';
};

const hydrateCodeBlocks = () => {
  const preElements = document.querySelectorAll<HTMLPreElement>('pre');
  preElements.forEach((pre) => {
    ensureCopyButton(pre);
  });
};

const observeCodeBlocks = () => {
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (!mutation.addedNodes.length) continue;
      hydrateCodeBlocks();
      break;
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  return observer;
};

export default function useCodeCopyButtons() {
  useEffect(() => {
    if (typeof document === 'undefined') return undefined;

    hydrateCodeBlocks();
    const observer = observeCodeBlocks();

    return () => {
      observer.disconnect();
    };
  }, []);
}
