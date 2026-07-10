import type { NoteType } from './types';

const ENHANCED_ATTR = 'data-gpmt-enhanced';
const NOTE_OPEN_RE = /^:::\s*message(?:\s+(info|warn|alert|note|tips))?\s*$/i;

// container → restore function
const noteBlocks = new Map<HTMLDivElement, () => void>();

// ---- context guards ----

function isHiddenContext(): boolean {
  const { pathname, hash } = location;
  if (/^\/admin(\/|$)/.test(pathname)) return true;
  if (/[#/]edit$/.test(hash + pathname)) return true;
  const cl = document.body.classList;
  if (cl.contains('editing') || cl.contains('grw-editor-mode') || cl.contains('modal-open')) return true;
  return false;
}

function isInEditorDOM(el: Element): boolean {
  return el.closest('.CodeMirror, .cm-editor, [contenteditable="true"]') !== null;
}

// ---- icon SVG builders ----

function createInfoIcon(): SVGSVGElement {
  // circle with serif "i": top/bottom serifs (3px wide) + 2px bar + dot r=1.5 for legibility
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 20 20');
  svg.setAttribute('width', '20');
  svg.setAttribute('height', '20');
  svg.setAttribute('fill', 'currentColor');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('fill-rule', 'evenodd');
  path.setAttribute('clip-rule', 'evenodd');
  path.setAttribute('d', 'M10 18a8 8 0 100-16 8 8 0 000 16zm-1.5-10h3v1h-.5v5h.5v1h-3v-1h.5v-5h-.5zm1.5-5a1.5 1.5 0 100 3a1.5 1.5 0 000-3z');
  svg.appendChild(path);
  return svg;
}

function createWarnIcon(): SVGSVGElement {
  // circle with "!": bar (y=5–12) + dot (y=15, r=1.2)
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 20 20');
  svg.setAttribute('width', '20');
  svg.setAttribute('height', '20');
  svg.setAttribute('fill', 'currentColor');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('fill-rule', 'evenodd');
  path.setAttribute('clip-rule', 'evenodd');
  path.setAttribute('d', 'M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v7a1 1 0 102 0V5zm-1 9a1.2 1.2 0 100 2.4 1.2 1.2 0 000-2.4');
  svg.appendChild(path);
  return svg;
}

function createAlertIcon(): SVGSVGElement {
  // circle with "×"
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 20 20');
  svg.setAttribute('width', '20');
  svg.setAttribute('height', '20');
  svg.setAttribute('fill', 'currentColor');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('fill-rule', 'evenodd');
  path.setAttribute('clip-rule', 'evenodd');
  path.setAttribute('d', 'M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z');
  svg.appendChild(path);
  return svg;
}

function createNoteIcon(): SVGSVGElement {
  // circle with bookmark (rectangle + V-notch at bottom)
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 20 20');
  svg.setAttribute('width', '20');
  svg.setAttribute('height', '20');
  svg.setAttribute('fill', 'currentColor');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('fill-rule', 'evenodd');
  path.setAttribute('clip-rule', 'evenodd');
  path.setAttribute('d', 'M10 18a8 8 0 100-16 8 8 0 000 16zm-2-13h4v8l-2 2-2-2z');
  svg.appendChild(path);
  return svg;
}

function createTipsIcon(): SVGSVGElement {
  // circle with lightbulb: round glass bulb + rectangular base as evenodd cutout
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 20 20');
  svg.setAttribute('width', '20');
  svg.setAttribute('height', '20');
  svg.setAttribute('fill', 'currentColor');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('fill-rule', 'evenodd');
  path.setAttribute('clip-rule', 'evenodd');
  path.setAttribute('d', 'M10 18a8 8 0 100-16 8 8 0 000 16zM10 5C7 5 5 7.2 5 10C5 11.8 6.2 13.2 7.5 14L7.5 16L12.5 16L12.5 14C13.8 13.2 15 11.8 15 10C15 7.2 13 5 10 5ZM7.5 14h5v.7h-5z');
  svg.appendChild(path);
  return svg;
}

const ICON_CREATORS: Record<NoteType, () => SVGSVGElement> = {
  info: createInfoIcon,
  warn: createWarnIcon,
  alert: createAlertIcon,
  note: createNoteIcon,
  tips: createTipsIcon,
};

const LABELS: Record<NoteType, string> = {
  info: 'Info',
  warn: 'Warning',
  alert: 'Alert',
  note: 'Note',
  tips: 'Tips',
};

// ---- DOM builder ----

function createNoteContainer(type: NoteType): { container: HTMLDivElement; body: HTMLDivElement } {
  const container = document.createElement('div');
  container.className = `gpmt-note gpmt-note-${type}`;
  container.setAttribute(ENHANCED_ATTR, '1');
  container.setAttribute('role', 'note');

  const header = document.createElement('div');
  header.className = 'gpmt-note-header';
  header.appendChild(ICON_CREATORS[type]());
  const label = document.createElement('span');
  label.className = 'gpmt-note-label';
  label.textContent = LABELS[type];
  header.appendChild(label);

  const body = document.createElement('div');
  body.className = 'gpmt-note-body';

  container.appendChild(header);
  container.appendChild(body);

  return { container, body };
}

// ---- spec parsing ----

function parseNoteType(firstLine: string): NoteType | null {
  const match = firstLine.match(NOTE_OPEN_RE);
  if (!match) return null;
  return (match[1]?.toLowerCase() as NoteType) ?? 'info';
}

// ---- Case 1: single <p> with <br> separators ----
// e.g. <p>:::note info<br>content<br>:::</p>

function processCase1(p: Element, type: NoteType): boolean {
  const children = Array.from(p.childNodes);

  // First BR separates the opening marker from content
  const firstBrIdx = children.findIndex(n => n.nodeName === 'BR');
  if (firstBrIdx === -1) return false;

  // Last text node matching ":::" is the closing marker
  let lastClosingIdx = -1;
  for (let i = children.length - 1; i > firstBrIdx; i--) {
    const n = children[i];
    if (n.nodeType === Node.TEXT_NODE && n.textContent?.trim() === ':::') {
      lastClosingIdx = i;
      break;
    }
  }
  if (lastClosingIdx === -1) return false;

  // BR immediately before the closing marker
  let lastBrIdx = lastClosingIdx - 1;
  while (lastBrIdx > firstBrIdx && children[lastBrIdx].nodeName !== 'BR') {
    lastBrIdx--;
  }
  // If no BR before closing marker, content ends just before it
  const contentEndIdx = children[lastBrIdx].nodeName === 'BR' ? lastBrIdx : lastClosingIdx;

  const contentNodes = children.slice(firstBrIdx + 1, contentEndIdx);
  if (contentNodes.length === 0) return false;

  const { container, body } = createNoteContainer(type);

  for (const node of contentNodes) {
    body.appendChild(node.cloneNode(true));
  }

  p.replaceWith(container);

  noteBlocks.set(container, () => {
    container.replaceWith(p);
    noteBlocks.delete(container);
  });

  return true;
}

// ---- Case 2: separate sibling elements ----
// e.g. <p>:::note info</p> ... <p>:::</p>

function processCase2(openP: Element, type: NoteType): boolean {
  const parent = openP.parentElement;
  if (!parent) return false;

  const siblings = Array.from(parent.children);
  const startIdx = siblings.indexOf(openP as HTMLElement);
  if (startIdx === -1) return false;

  let closeIdx = -1;
  for (let i = startIdx + 1; i < siblings.length; i++) {
    if (siblings[i].textContent?.trim() === ':::') {
      closeIdx = i;
      break;
    }
  }
  if (closeIdx === -1) return false;

  const contentElements = siblings.slice(startIdx + 1, closeIdx);
  const closeP = siblings[closeIdx];

  const { container, body } = createNoteContainer(type);

  for (const el of contentElements) {
    body.appendChild(el);
  }

  parent.insertBefore(container, openP);
  openP.remove();
  closeP.remove();

  noteBlocks.set(container, () => {
    const contentToRestore = Array.from(body.children);
    container.replaceWith(openP, ...contentToRestore, closeP);
    noteBlocks.delete(container);
  });

  return true;
}

// ---- scanner ----

function isEligibleParagraph(p: Element): boolean {
  if (p.closest(`[${ENHANCED_ATTR}]`)) return false;
  if (isInEditorDOM(p)) return false;
  return true;
}

function scanAndTransform(): void {
  if (isHiddenContext()) return;

  const paragraphs = Array.from(document.querySelectorAll('p'));

  for (const p of paragraphs) {
    if (!isEligibleParagraph(p)) continue;

    const text = p.textContent ?? '';
    const lines = text.split('\n').map(l => l.trim()).filter(l => l);
    if (lines.length === 0) continue;

    const type = parseNoteType(lines[0]);
    if (!type) continue;

    const lastLine = lines[lines.length - 1];

    if (lines.length > 1 && lastLine === ':::') {
      // Case 1: opening marker and closing marker both in this <p>
      processCase1(p, type);
    } else if (lines.length === 1) {
      // Case 2: opening marker only; find closing marker among siblings
      processCase2(p, type);
    }
  }
}

// ---- cleanup ----

function cleanupAll(): void {
  for (const restore of noteBlocks.values()) {
    restore();
  }
}

// ---- SPA / MutationObserver plumbing ----

export function createMessageNotation() {
  let observer: MutationObserver | null = null;
  let scanTimer: ReturnType<typeof setTimeout> | null = null;

  const origPushState = history.pushState.bind(history);
  const origReplaceState = history.replaceState.bind(history);

  function scheduleScan(): void {
    if (scanTimer !== null) clearTimeout(scanTimer);
    scanTimer = setTimeout(() => {
      scanTimer = null;
      scanAndTransform();
    }, 0);
  }

  function onNavigate(): void {
    requestAnimationFrame(() => requestAnimationFrame(scheduleScan));
  }

  function onBodyClassChange(): void {
    if (isHiddenContext()) {
      cleanupAll();
    } else {
      scheduleScan();
    }
  }

  const SKIP_CLASS_PREFIXES = ['gpmt-note', 'gpmt-note-header', 'gpmt-note-body', 'gpmt-note-label'];

  function isPluginNode(el: Element): boolean {
    return SKIP_CLASS_PREFIXES.some(cls => el.classList.contains(cls));
  }

  return {
    mount(): void {
      // History monkey-patch
      history.pushState = function (...args) {
        origPushState(...args);
        window.dispatchEvent(new Event('gpmt-navigate'));
      };
      history.replaceState = function (...args) {
        origReplaceState(...args);
        window.dispatchEvent(new Event('gpmt-navigate'));
      };

      window.addEventListener('popstate', onNavigate);
      window.addEventListener('hashchange', onNavigate);
      window.addEventListener('gpmt-navigate', onNavigate);

      observer = new MutationObserver(mutations => {
        let needsScan = false;
        let bodyClassChanged = false;

        for (const mut of mutations) {
          if (mut.type === 'attributes' && mut.target === document.body) {
            bodyClassChanged = true;
            continue;
          }
          for (const node of mut.addedNodes) {
            if (!(node instanceof Element)) continue;
            if (isPluginNode(node)) continue;
            if (node.tagName === 'P' || node.querySelector?.('p')) {
              needsScan = true;
            }
          }
        }

        if (bodyClassChanged) onBodyClassChange();
        if (needsScan) scheduleScan();
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class'],
      });

      scanAndTransform();
    },

    unmount(): void {
      window.removeEventListener('popstate', onNavigate);
      window.removeEventListener('hashchange', onNavigate);
      window.removeEventListener('gpmt-navigate', onNavigate);

      history.pushState = origPushState;
      history.replaceState = origReplaceState;

      observer?.disconnect();
      observer = null;

      if (scanTimer !== null) {
        clearTimeout(scanTimer);
        scanTimer = null;
      }

      cleanupAll();
    },
  };
}
