import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost:3002',
});
for (const [key, value] of Object.entries({
  self: dom.window,
  window: dom.window,
  document: dom.window.document,
  navigator: dom.window.navigator,
  HTMLElement: dom.window.HTMLElement,
  Element: dom.window.Element,
  Node: dom.window.Node,
  DocumentFragment: dom.window.DocumentFragment,
  DOMParser: dom.window.DOMParser,
  innerHeight: dom.window.innerHeight,
  getComputedStyle: dom.window.getComputedStyle,
  requestAnimationFrame: (callback: FrameRequestCallback) =>
    setTimeout(() => callback(Date.now()), 0),
  cancelAnimationFrame: (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
  HTMLInputElement: dom.window.HTMLInputElement,
  FormData: dom.window.FormData,
  MutationObserver: dom.window.MutationObserver,
})) {
  Object.defineProperty(globalThis, key, {
    value,
    configurable: true,
    writable: true,
  });
}
Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
  value: true,
  configurable: true,
  writable: true,
});

// ProseMirror asks for selection geometry; JSDOM does not provide layout.
Object.defineProperty(dom.window.Range.prototype, 'getBoundingClientRect', {
  value: () => new dom.window.DOMRect(),
});
Object.defineProperty(dom.window.Range.prototype, 'getClientRects', {
  value: () => [],
});
