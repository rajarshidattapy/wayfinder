interface ExtractedElement {
  tag: string;
  id?: string;
  text?: string;
  ariaLabel?: string;
  testId?: string;
  role?: string;
  href?: string;
  placeholder?: string;
  rect: { x: number; y: number; w: number; h: number };
  selector: string;
}

export function extractInteractiveDOM(doc: Document): string {
  const selector = [
    'button',
    'a[href]',
    'input:not([type="hidden"])',
    'select',
    'textarea',
    '[role="button"]',
    '[role="tab"]',
    '[role="menuitem"]',
    '[role="link"]',
    '[onclick]',
  ].join(',');

  const elements = Array.from(doc.querySelectorAll<HTMLElement>(selector));

  const extracted: ExtractedElement[] = elements
    .filter((el) => isVisible(el))
    .slice(0, 200)
    .map((el, i) => {
      const rect = el.getBoundingClientRect();
      return {
        tag: el.tagName.toLowerCase(),
        id: el.id || undefined,
        text: el.innerText?.trim().slice(0, 80) || undefined,
        ariaLabel: el.getAttribute('aria-label') || undefined,
        testId: el.getAttribute('data-testid') || undefined,
        role: el.getAttribute('role') || undefined,
        href: (el as HTMLAnchorElement).href || undefined,
        placeholder: (el as HTMLInputElement).placeholder || undefined,
        rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
        selector: buildSelector(el, i),
      };
    });

  return JSON.stringify({
    title: doc.title,
    url: window.location.href,
    elements: extracted,
  });
}

function isVisible(el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  if (parseFloat(style.opacity) < 0.1) return false;
  if (rect.bottom < 0 || rect.top > window.innerHeight) return false;
  return true;
}

function buildSelector(el: HTMLElement, fallbackIndex: number): string {
  if (el.id) return `#${CSS.escape(el.id)}`;

  const testId = el.getAttribute('data-testid');
  if (testId) return `[data-testid="${CSS.escape(testId)}"]`;

  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel) return `[aria-label="${CSS.escape(ariaLabel)}"]`;

  const stableClass = Array.from(el.classList).find(
    (c) => !/[A-Z0-9_-]{6,}/.test(c) && c.length > 2
  );
  if (stableClass) {
    const matches = document.querySelectorAll(`.${CSS.escape(stableClass)}`);
    if (matches.length === 1) return `.${CSS.escape(stableClass)}`;
  }

  return `[data-wf-id="${fallbackIndex}"]`;
}
