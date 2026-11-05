import { useEffect, type RefObject } from "react";

// The on-screen keyboard is an overlay, so it used to cover the very field being typed in. While it is open this makes room
// for it: the scrolling area of the page gets extra bottom padding (animated) equal to the keyboard's height, and the active
// field is scrolled up into the free space. When the keyboard closes, padding and scroll position are put back.

function scrollParentOf(el: HTMLElement): HTMLElement {
  let node: HTMLElement | null = el.parentElement;
  while (node && node !== document.body) {
    const overflowY = getComputedStyle(node).overflowY;
    if ((overflowY === "auto" || overflowY === "scroll") && node.scrollHeight >= node.clientHeight) return node;
    node = node.parentElement;
  }
  return (document.scrollingElement as HTMLElement) ?? document.documentElement;
}

function activeField(): HTMLElement | null {
  const active = document.activeElement as HTMLElement | null;
  if (active && active !== document.body && /^(INPUT|TEXTAREA)$/.test(active.tagName)) return active;
  return document.querySelector<HTMLElement>("[data-kb-target]");
}

/** `keyboardRef` = the element holding the keyboard; `fieldKey` changes when another field gets the keyboard. */
export function useKeyboardAvoid(open: boolean, keyboardRef: RefObject<HTMLElement | null>, fieldKey?: unknown) {
  useEffect(() => {
    if (!open) return;
    const keyboard = keyboardRef.current;
    const field = activeField();
    if (!keyboard || !field) return;
    const scroller = scrollParentOf(field);
    const scrollable = scroller !== document.scrollingElement && scroller !== document.documentElement;
    // Screens whose layout never scrolls (a fixed, wide result screen): slide the page content up instead (not the keyboard, which lives in the same page element).
    const page = scrollable ? null : field.closest<HTMLElement>(".kinetic-page > *");
    const saved = { top: scroller.scrollTop, padding: scroller.style.paddingBottom, transition: scroller.style.transition, pageTransition: page?.style.transition ?? "", pageTransform: page?.style.transform ?? "" };
    const basePadding = parseFloat(getComputedStyle(scroller).paddingBottom) || 0;
    let shift = 0;

    const apply = () => {
      const inset = Math.ceil(keyboard.getBoundingClientRect().height) + 20;
      if (scrollable) {
        scroller.style.transition = "padding-bottom 0.25s ease";
        scroller.style.paddingBottom = `${basePadding + inset}px`;
      }
      window.setTimeout(() => {
        const target = activeField() ?? field;
        const over = target.getBoundingClientRect().bottom + 28 - (window.innerHeight - inset);
        if (scrollable) {
          if (over > 0) scroller.scrollBy({ top: over, behavior: "smooth" });
        } else if (page) {
          shift = Math.max(0, shift + over);
          page.style.transition = "transform 0.25s ease";
          page.style.transform = shift > 0 ? `translateY(${-shift}px)` : saved.pageTransform;
        }
      }, 280);
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(keyboard);

    return () => {
      observer.disconnect();
      if (scrollable) {
        scroller.style.paddingBottom = saved.padding;
        window.setTimeout(() => { scroller.style.transition = saved.transition; }, 300);
        scroller.scrollTo({ top: saved.top, behavior: "smooth" });
      } else if (page) {
        page.style.transform = saved.pageTransform;
        window.setTimeout(() => { page.style.transition = saved.pageTransition; }, 300);
      }
    };
  }, [open, keyboardRef, fieldKey]);
}
