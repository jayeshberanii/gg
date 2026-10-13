/**
 * A DataGridView with MultiSelect drags out a selection: press the left button on a row and
 * move over others, and the rows from the pressed one to the one under the pointer select.
 * Past the top or bottom edge the grid scrolls, faster the further out the pointer is, and
 * the selection follows. The current row stays where the button went down.
 *
 * `startDragSelect` is called from the row's mousedown. It reports each new row under the
 * pointer through `onOver` until the button comes up.
 */
export function startDragSelect({
  viewport,
  topInset = () => 0,
  rowSelector,
  indexOf,
  startIndex,
  onOver,
  onEnd,
}: {
  /** The element that scrolls the rows vertically. */
  viewport: HTMLElement;
  /** Height at the top of the viewport that is not rows (a sticky header). */
  topInset?: () => number;
  /** Matches a row element. */
  rowSelector: string;
  /** The row's index in the displayed order. */
  indexOf: (row: HTMLElement) => number | null;
  startIndex: number;
  onOver: (index: number) => void;
  /** Called when the button comes up; `moved` says whether another row was reached. */
  onEnd?: (moved: boolean) => void;
}): void {
  let last = startIndex;
  let moved = false;
  let pointer = { x: 0, y: 0 };
  let timer: number | null = null;

  /** The rows' visible area, in client coordinates. */
  function area() {
    const r = viewport.getBoundingClientRect();
    const top = r.top + viewport.clientTop + topInset();
    const left = r.left + viewport.clientLeft;
    return {
      top,
      bottom: r.top + viewport.clientTop + viewport.clientHeight,
      left,
      right: left + viewport.clientWidth,
    };
  }

  function rowAt(x: number, y: number): number | null {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>(rowSelector);
    return el && viewport.contains(el) ? indexOf(el) : null;
  }

  /** The row level with the pointer, clamped into the rows' area. */
  function track() {
    const a = area();
    const y = Math.min(a.bottom - 2, Math.max(a.top + 2, pointer.y));
    const x = Math.min(a.right - 2, Math.max(a.left + 2, pointer.x));
    // Right of the last column there are no cells; look again at the left edge.
    const index = rowAt(x, y) ?? rowAt(a.left + 2, y);
    if (index === null || index === last) return;
    last = index;
    moved = true;
    onOver(index);
  }

  function scrollTick() {
    const a = area();
    const over =
      pointer.y < a.top ? pointer.y - a.top : pointer.y > a.bottom ? pointer.y - a.bottom : 0;
    if (over === 0) return stopScroll();
    viewport.scrollTop += Math.sign(over) * Math.min(60, 4 + Math.abs(over) / 2);
    track();
  }

  function stopScroll() {
    if (timer !== null) window.clearInterval(timer);
    timer = null;
  }

  function onMove(e: MouseEvent) {
    pointer = { x: e.clientX, y: e.clientY };
    const a = area();
    if ((pointer.y < a.top || pointer.y > a.bottom) && timer === null)
      timer = window.setInterval(scrollTick, 40);
    track();
  }

  function onUp() {
    stopScroll();
    window.removeEventListener('mousemove', onMove, true);
    window.removeEventListener('mouseup', onUp, true);
    window.removeEventListener('blur', onUp);
    onEnd?.(moved);
  }

  window.addEventListener('mousemove', onMove, true);
  window.addEventListener('mouseup', onUp, true);
  window.addEventListener('blur', onUp);
}
