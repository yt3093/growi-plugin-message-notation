import type { NoteType } from './types';

const ENHANCED_ATTR = 'data-gpmt-enhanced';
const NOTE_OPEN_RE = /^:::\s*message(?:\s+(info|warn|alert|note|tips))?\s*$/i;
const SVG_NS = 'http://www.w3.org/2000/svg';

// container → restore function
const noteBlocks = new Map<HTMLDivElement, () => void>();

// monotonically increasing id so multiple note/tips icons on one page don't
// collide on their <mask> element ids
let iconMaskSeq = 0;

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
  svg.setAttribute('width', '24');
  svg.setAttribute('height', '24');
  svg.setAttribute('fill', 'currentColor');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('fill-rule', 'evenodd');
  path.setAttribute('clip-rule', 'evenodd');
  // symbol positioned with absolute coordinates (not relative to the circle's
  // end point) so it stays centered regardless of the circle's radius
  path.setAttribute('d', 'M10 19a9 9 0 100-18 9 9 0 000 18zM8.5 8h3v1h-.5v5h.5v1h-3v-1h.5v-5h-.5zM10 4a1.5 1.5 0 100 3 1.5 1.5 0 000-3z');
  svg.appendChild(path);
  return svg;
}

function createWarnIcon(): SVGSVGElement {
  // circle with "!": bar (y=5–12) + dot (y=15, r=1.2)
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 20 20');
  svg.setAttribute('width', '24');
  svg.setAttribute('height', '24');
  svg.setAttribute('fill', 'currentColor');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('fill-rule', 'evenodd');
  path.setAttribute('clip-rule', 'evenodd');
  // symbol positioned with absolute coordinates (not relative to the circle's
  // end point) so it stays centered regardless of the circle's radius
  path.setAttribute('d', 'M10 19a9 9 0 100-18 9 9 0 000 18zM11 5a1 1 0 10-2 0v7a1 1 0 102 0V5zM10 15.2a1.2 1.2 0 100 2.4 1.2 1.2 0 000-2.4z');
  svg.appendChild(path);
  return svg;
}

function createAlertIcon(): SVGSVGElement {
  // circle with "×"
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 20 20');
  svg.setAttribute('width', '24');
  svg.setAttribute('height', '24');
  svg.setAttribute('fill', 'currentColor');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('fill-rule', 'evenodd');
  path.setAttribute('clip-rule', 'evenodd');
  path.setAttribute('d', 'M10 19a9 9 0 100-18 9 9 0 000 18zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z');
  svg.appendChild(path);
  return svg;
}

function createMaskedDiscIcon(maskIdPrefix: string, maskContent: SVGElement[]): SVGSVGElement {
  // solid disc with a symbol genuinely cut out via <mask> (true transparency,
  // not a color approximation), so whatever sits behind the icon (the header
  // background) shows through correctly in both light and dark mode — same
  // visual language as the evenodd-punched info/warn/alert icons, just built
  // from stroke-friendly primitives instead of a single evenodd path.
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 20 20');
  svg.setAttribute('width', '24');
  svg.setAttribute('height', '24');
  svg.setAttribute('aria-hidden', 'true');

  const maskId = `gpmt-${maskIdPrefix}-mask-${iconMaskSeq++}`;

  const defs = document.createElementNS(SVG_NS, 'defs');
  const mask = document.createElementNS(SVG_NS, 'mask');
  mask.setAttribute('id', maskId);
  mask.setAttribute('maskUnits', 'userSpaceOnUse');
  mask.setAttribute('x', '0');
  mask.setAttribute('y', '0');
  mask.setAttribute('width', '20');
  mask.setAttribute('height', '20');

  const reveal = document.createElementNS(SVG_NS, 'rect');
  reveal.setAttribute('x', '0');
  reveal.setAttribute('y', '0');
  reveal.setAttribute('width', '20');
  reveal.setAttribute('height', '20');
  reveal.setAttribute('fill', 'white');
  mask.appendChild(reveal);

  for (const el of maskContent) {
    mask.appendChild(el);
  }

  defs.appendChild(mask);
  svg.appendChild(defs);

  const disc = document.createElementNS(SVG_NS, 'path');
  disc.setAttribute('d', 'M10 19a9 9 0 100-18 9 9 0 000 18z');
  disc.setAttribute('fill', 'currentColor');
  disc.setAttribute('mask', `url(#${maskId})`);
  svg.appendChild(disc);

  return svg;
}

// Diagonal paperclip silhouette, reproduced as closely as possible from the
// reference artwork (original viewBox 0 0 512 512), scaled + centered into
// our 20x20 icon space via `transform` rather than hand-converted coordinates.
const NOTE_CLIP_PATH_D =
  'M454.821,253.582L273.256,435.14c-11.697,11.697-25.124,20.411-39.484,26.235c-21.529,8.729-45.165,10.928-67.755,6.55' +
  'c-22.597-4.378-44.054-15.25-61.597-32.784c-11.69-11.69-20.396-25.118-26.227-39.484c-8.729-21.529-10.929-45.165-6.55-67.748' +
  'c4.386-22.597,15.25-44.055,32.778-61.596l203.13-203.13c7.141-7.134,15.299-12.43,24.035-15.969' +
  'c13.1-5.318,27.516-6.656,41.263-3.994c13.769,2.677,26.798,9.27,37.498,19.963c7.133,7.134,12.423,15.292,15.968,24.035' +
  'c5.318,13.092,6.657,27.502,3.987,41.264c-2.67,13.762-9.262,26.783-19.955,37.498L213.261,363.064' +
  'c-2.534,2.528-5.375,4.364-8.436,5.61c-4.571,1.851-9.661,2.335-14.495,1.396c-4.848-0.954-9.355-3.225-13.15-7.006' +
  'c-2.534-2.534-4.364-5.368-5.603-8.429c-1.865-4.571-2.342-9.668-1.402-14.495c0.947-4.841,3.225-9.355,7.005-13.149' +
  'l175.521-175.528l-29.616-29.617l-175.528,175.52c-6.536,6.536-11.505,14.182-14.801,22.313' +
  'c-4.941,12.195-6.166,25.473-3.702,38.202c2.449,12.73,8.686,24.989,18.503,34.799c6.543,6.55,14.182,11.519,22.305,14.809' +
  'c12.202,4.948,25.473,6.165,38.21,3.702c12.722-2.449,24.989-8.678,34.806-18.511L439.97,195.602' +
  'c11.142-11.149,19.571-24.113,25.167-37.917c8.394-20.717,10.48-43.314,6.294-64.971c-4.179-21.643-14.73-42.432-31.46-59.155' +
  'c-11.149-11.142-24.114-19.571-37.918-25.166c-20.717-8.401-43.314-10.48-64.971-6.301c-21.643,4.186-42.431,14.737-59.155,31.468' +
  'L74.803,236.695c-15.713,15.691-27.552,33.931-35.426,53.352c-11.817,29.154-14.765,60.97-8.863,91.462' +
  'c5.888,30.478,20.717,59.696,44.29,83.254c15.698,15.713,33.931,27.552,53.36,35.426c29.146,11.811,60.97,14.758,91.455,8.863' +
  'c30.478-5.895,59.696-20.717,83.254-44.29l181.566-181.564L454.821,253.582z';

function createNoteIcon(): SVGSVGElement {
  // diagonal paperclip, punched out of the disc via the mask
  const clip = document.createElementNS(SVG_NS, 'path');
  clip.setAttribute('d', NOTE_CLIP_PATH_D);
  clip.setAttribute('fill', 'black');
  clip.setAttribute('transform', 'translate(4.5,4.5) scale(0.021484)');

  return createMaskedDiscIcon('note', [clip]);
}

function createTipsIcon(): SVGSVGElement {
  // lightbulb with a round glass (reads more clearly as a bulb at icon size
  // than a tapered dome), a checkmark inside, two screw-base bars, and a
  // rounded bottom cap — punched out of the disc via the mask.
  const bulb = document.createElementNS(SVG_NS, 'circle');
  bulb.setAttribute('cx', '10');
  bulb.setAttribute('cy', '8.32');
  bulb.setAttribute('r', '3.72');
  bulb.setAttribute('fill', 'none');
  bulb.setAttribute('stroke', 'black');
  bulb.setAttribute('stroke-width', '1.3');

  const check = document.createElementNS(SVG_NS, 'path');
  check.setAttribute('d', 'M8.08 7.84 L9.4 9.22 L11.8 6.4');
  check.setAttribute('fill', 'none');
  check.setAttribute('stroke', 'black');
  check.setAttribute('stroke-width', '1.15');
  check.setAttribute('stroke-linecap', 'round');
  check.setAttribute('stroke-linejoin', 'round');

  const bars = [
    [7.84, 12.4, 12.16, 12.4],
    [7.84, 13.84, 12.16, 13.84],
  ].map(([x1, y1, x2, y2]) => {
    const bar = document.createElementNS(SVG_NS, 'line');
    bar.setAttribute('x1', String(x1));
    bar.setAttribute('y1', String(y1));
    bar.setAttribute('x2', String(x2));
    bar.setAttribute('y2', String(y2));
    bar.setAttribute('stroke', 'black');
    bar.setAttribute('stroke-width', '1.15');
    bar.setAttribute('stroke-linecap', 'round');
    return bar;
  });

  const cap = document.createElementNS(SVG_NS, 'rect');
  cap.setAttribute('x', '8.56');
  cap.setAttribute('y', '14.44');
  cap.setAttribute('width', '2.88');
  cap.setAttribute('height', '1.92');
  cap.setAttribute('rx', '0.84');
  cap.setAttribute('fill', 'none');
  cap.setAttribute('stroke', 'black');
  cap.setAttribute('stroke-width', '0.95');

  return createMaskedDiscIcon('tips', [bulb, check, ...bars, cap]);
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
  // the type label is no longer shown visually (icon only), keep it for a11y
  container.setAttribute('aria-label', LABELS[type]);

  const icon = ICON_CREATORS[type]();
  icon.classList.add('gpmt-note-icon');

  const body = document.createElement('div');
  body.className = 'gpmt-note-body';

  container.appendChild(icon);
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

// Cheap rejection check: the opening marker is always the very first text
// node of the paragraph, so we can rule out the vast majority of paragraphs
// by inspecting just that one node instead of computing p.textContent (which
// walks and concatenates every descendant text node — expensive for large
// paragraphs and run on every <p> on the page during a scan).
function looksLikeMessageOpen(p: Element): boolean {
  const first = p.firstChild;
  if (!first || first.nodeType !== Node.TEXT_NODE) return false;
  return (first.textContent ?? '').trimStart().startsWith(':::');
}

function scanAndTransform(root: ParentNode = document): void {
  if (isHiddenContext()) return;

  const paragraphs =
    root instanceof Element && root.tagName === 'P'
      ? [root, ...Array.from(root.querySelectorAll('p'))]
      : Array.from(root.querySelectorAll('p'));

  for (const p of paragraphs) {
    if (!isEligibleParagraph(p)) continue;
    if (!looksLikeMessageOpen(p)) continue;

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

  // When mutation-triggered scans only touch a known subtree, we scope the
  // rescan to just those roots instead of re-querying the whole document.
  // Any scan requested without specific roots (navigation, body class
  // change) needs the full document and supersedes pending scoped roots.
  let fullScanPending = false;
  const pendingScanRoots = new Set<ParentNode>();

  function scheduleScan(roots?: ParentNode[]): void {
    if (roots && roots.length > 0) {
      if (!fullScanPending) {
        for (const r of roots) pendingScanRoots.add(r);
      }
    } else {
      fullScanPending = true;
      pendingScanRoots.clear();
    }

    if (scanTimer !== null) clearTimeout(scanTimer);
    scanTimer = setTimeout(() => {
      scanTimer = null;
      if (fullScanPending) {
        scanAndTransform();
      } else {
        for (const root of pendingScanRoots) scanAndTransform(root);
      }
      fullScanPending = false;
      pendingScanRoots.clear();
    }, 0);
  }

  function onNavigate(): void {
    requestAnimationFrame(() => requestAnimationFrame(() => scheduleScan()));
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
        const scanRoots: Element[] = [];
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
              scanRoots.push(node);
            }
          }
        }

        if (bodyClassChanged) onBodyClassChange();
        if (scanRoots.length > 0) scheduleScan(scanRoots);
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
