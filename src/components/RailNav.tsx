// Collapsible side navigation rail (DESIGN_IDENTITY.md §9.12).
// Collapsed 72px icon rail by default; hover or keyboard focus opens it to
// 256px as an overlay; one highlight slides to the active item. When the items
// don't fit the window, the rail scrolls and fades out at the bottom.

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import '../styles/abyan-tokens.css';
import '../styles/rail-nav.css';

export interface RailNavItem {
  /** Route for link items; for `onSelect` items, a unique key. */
  path: string;
  label: string;
  icon: LucideIcon;
  isActive: boolean;
  /** Pinned to the bottom group (Settings). */
  bottom?: boolean;
  /** For portals that switch sections in place (L&D, PM): renders a button instead of a link. */
  onSelect?: () => void;
  /** Hover tooltip, e.g. the item's sublabel. */
  title?: string;
  /** A count drawn on the icon chip, e.g. items waiting for review. Hidden at 0. */
  badge?: { count: number; label: string };
}

const CLOSE_DELAY_MS = 250;              // grace period so brushing past the edge doesn't snap it shut
const HIGHLIGHT_Y_KEY = 'abyan:rail-highlight-y';

const readStoredY = (): number | null => {
  try {
    const raw = sessionStorage.getItem(HIGHLIGHT_Y_KEY);
    return raw === null ? null : Number(raw);
  } catch {
    return null;
  }
};

export function RailNav({ items, label = 'Main navigation' }: { items: RailNavItem[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<number | undefined>(undefined);
  const railRef = useRef<HTMLElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef(new Map<string, HTMLElement>());
  const [moreBelow, setMoreBelow] = useState(false);
  // Every RSP page mounts its own copy of the rail, so the highlight starts at
  // the position it had on the previous page and slides from there.
  const [highlightY, setHighlightY] = useState<number | null>(readStoredY);
  const [animate, setAnimate] = useState(false);

  const active = items.find((item) => item.isActive) ?? null;

  const openRail = () => {
    window.clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const closeRail = () => {
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
  };
  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  // Measure the active item's offset inside the scroll area. The highlight
  // lives there (not in a group), so it scrolls with its item and can also
  // reach Settings at the bottom.
  const measure = () => {
    const scroller = scrollRef.current;
    const el = active ? itemRefs.current.get(active.path) : undefined;
    if (!scroller || !el) return null;
    return Math.round(el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop);
  };

  const updateMoreBelow = () => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    setMoreBelow(scroller.scrollTop + scroller.clientHeight < scroller.scrollHeight - 1);
  };

  useLayoutEffect(() => {
    const el = active ? itemRefs.current.get(active.path) : undefined;
    el?.scrollIntoView({ block: 'nearest' });   // on a short window the active item may sit below the fold
    updateMoreBelow();
    const y = measure();
    if (y === null) return;
    const from = readStoredY();
    if (from === null || from === y) {
      setAnimate(false);
      setHighlightY(y);
    } else {
      // Paint at the previous position first, then slide. Two frames: the
      // first runs before that position is painted, the second after it.
      setAnimate(false);
      setHighlightY(from);
      let second = 0;
      // Store the new position only once the slide starts, so a mount that is
      // thrown away (dev StrictMode, a loading → content swap) doesn't make the
      // next mount think there is nothing to slide from.
      const first = window.requestAnimationFrame(() => {
        second = window.requestAnimationFrame(() => {
          setAnimate(true);
          setHighlightY(y);
          try { sessionStorage.setItem(HIGHLIGHT_Y_KEY, String(y)); } catch { /* ignore */ }
        });
      });
      return () => { window.cancelAnimationFrame(first); window.cancelAnimationFrame(second); };
    }
    try { sessionStorage.setItem(HIGHLIGHT_Y_KEY, String(y)); } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.path]);

  // The bottom group moves with the viewport height; re-measure without animating.
  useEffect(() => {
    const onResize = () => {
      updateMoreBelow();
      const y = measure();
      if (y === null) return;
      setAnimate(false);
      setHighlightY(y);
      try { sessionStorage.setItem(HIGHLIGHT_Y_KEY, String(y)); } catch { /* ignore */ }
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.path]);

  const renderItem = (item: RailNavItem) => {
    const Icon = item.icon;
    const badge = item.badge && item.badge.count > 0 ? item.badge : null;
    const shared = {
      ref: (el: HTMLElement | null) => { if (el) itemRefs.current.set(item.path, el); else itemRefs.current.delete(item.path); },
      className: `rail-item${item.isActive ? ' active' : ''}`,
      // The chip's count is aria-hidden, so it is spoken as part of the name.
      'aria-label': badge ? `${item.label}, ${badge.count} ${badge.label}` : item.label,
      'aria-current': item.isActive ? ('page' as const) : undefined,
      title: item.title,
    };
    const content = (
      <>
        <span className="rail-chip">
          <Icon size={20} strokeWidth={1.75} aria-hidden />
          {badge && <span className="rail-badge" aria-hidden="true">{badge.count}</span>}
        </span>
        <span className="rail-label">{item.label}</span>
      </>
    );
    return (
      <li key={item.path}>
        {item.onSelect ? (
          <button type="button" onClick={item.onSelect} {...shared}>{content}</button>
        ) : (
          <Link to={item.path} {...shared}>{content}</Link>
        )}
      </li>
    );
  };

  return (
    <div className="abyan-ds rail-slot">
      <aside
        ref={railRef}
        className={`rail${open ? ' open' : ''}`}
        aria-label={label}
        onMouseEnter={openRail}
        onMouseLeave={closeRail}
        onFocus={openRail}
        onBlur={(event) => {
          if (!railRef.current?.contains(event.relatedTarget as Node | null)) closeRail();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            (document.activeElement as HTMLElement | null)?.blur();
            closeRail();
          }
        }}
      >
        <div className="rail-scroll" ref={scrollRef} onScroll={updateMoreBelow}>
          <div
            className={`rail-hl${animate ? '' : ' no-anim'}`}
            aria-hidden="true"
            style={{
              transform: `translateY(${highlightY ?? 0}px)`,
              visibility: active && highlightY !== null ? 'visible' : 'hidden',
            }}
          />
          <ul className="rail-nav">{items.filter((item) => !item.bottom).map(renderItem)}</ul>
          <ul className="rail-nav bottom">{items.filter((item) => item.bottom).map(renderItem)}</ul>
        </div>
        <div className={`rail-fade${moreBelow ? ' show' : ''}`} aria-hidden="true" />
      </aside>
    </div>
  );
}
