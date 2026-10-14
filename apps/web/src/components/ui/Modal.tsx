'use client';

import { type ReactNode, useEffect, useId, useRef, useState } from 'react';

type Props = {
  title: string;
  children: ReactNode;
  /** Esc and the title bar's close button. Omit for a window without a close button. */
  onClose?: () => void;
  footer?: ReactNode;
  /** Client width in px, as in the form's designer (ClientSize). */
  width?: number;
  /** Background of the client area: the desktop's dialog forms are mostly AliceBlue. */
  className?: string;
  /** Selector of the element to focus on open; defaults to the first focusable element. */
  initialFocus?: string;
  /** WindowState = Maximized: the dialog fills the screen. */
  maximized?: boolean;
  /** MaximizeBox: the title bar's maximize / restore button. */
  onToggleMaximize?: () => void;
  /** The dialog's own keys, handled before Esc closes it. */
  onKeyDown?: (e: React.KeyboardEvent) => void;
};

/**
 * A modal form, like ShowDialog(): a Windows 10 window frame and title bar. Keyboard focus
 * stays inside; Esc closes it when it can be closed. Later-mounted dialogs stack on top.
 */
export function Modal({
  title,
  children,
  onClose,
  footer,
  width = 420,
  className = 'bg-control',
  initialFocus,
  maximized = false,
  onToggleMaximize,
  onKeyDown: onOwnKeyDown,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const target =
      (initialFocus && root.querySelector<HTMLElement>(initialFocus)) ||
      root.querySelector<HTMLElement>(
        'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]):not([data-caption])',
      );
    target?.focus();
  }, [initialFocus]);

  // Like closing a dialog form: focus goes back to whatever had it in the owner form. The
  // owner is captured during the first render, before the dialog takes focus.
  const [owner] = useState(() =>
    typeof document === 'undefined' ? null : (document.activeElement as HTMLElement | null),
  );
  useEffect(
    () => () => {
      if (owner?.isConnected) owner.focus();
    },
    [owner],
  );

  function onKeyDown(e: React.KeyboardEvent) {
    onOwnKeyDown?.(e);
    if (e.defaultPrevented) return;
    if (e.key === 'Escape' && onClose) {
      e.stopPropagation();
      onClose();
    }
    if (e.key === 'Tab') trapFocus(e, ref.current);
  }

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center ${maximized ? '' : 'p-2'}`}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={onKeyDown}
        style={maximized ? { width: '100%', height: '100%' } : { width: `min(${width}px, 100%)` }}
        className="win-frame max-h-full"
      >
        <div className="win-titlebar">
          <h2 id={titleId} className="flex-1 truncate font-normal">
            {title}
          </h2>
          {onToggleMaximize && (
            <button
              type="button"
              data-caption
              aria-label={maximized ? 'Restore Down' : 'Maximize'}
              onClick={onToggleMaximize}
              className="win-caption-button"
            >
              {maximized ? '❐' : '☐'}
            </button>
          )}
          {onClose && (
            <button
              type="button"
              data-caption
              data-close
              aria-label="Close"
              onClick={onClose}
              className="win-caption-button"
            >
              ✕
            </button>
          )}
        </div>
        <div className={`min-h-0 flex-1 overflow-auto ${className}`}>{children}</div>
        {footer && <div className="win-msgbox-footer">{footer}</div>}
      </div>
    </div>
  );
}

function trapFocus(e: React.KeyboardEvent, root: HTMLElement | null) {
  if (!root) return;
  const items = [
    ...root.querySelectorAll<HTMLElement>(
      'button, input, select, textarea, [tabindex]:not([tabindex="-1"])',
    ),
  ].filter((el) => !el.hasAttribute('disabled'));
  if (items.length === 0) return;
  const first = items[0]!;
  const last = items[items.length - 1]!;
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

/** A standard WinForms Button. */
export function Button(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" {...props} className={`win-button ${props.className ?? ''}`} />;
}

/** An image-only ToolStripButton; `label` is its Text, shown as the tooltip. */
export function ToolButton({
  icon,
  label,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { icon: string; label: string }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      {...props}
      className="win-toolstrip-button"
    >
      <img src={`/legacy/icons/${icon}.png`} alt="" />
    </button>
  );
}

export function ToolSeparator() {
  return <span role="separator" className="win-toolstrip-separator" />;
}
