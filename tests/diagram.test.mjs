import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://portfolio.example' });
for (const name of ['window', 'document', 'DOMParser', 'XMLSerializer', 'HTMLElement', 'SVGElement', 'Element', 'CSSStyleSheet', 'getComputedStyle']) {
  global[name] = name === 'getComputedStyle' ? dom.window.getComputedStyle.bind(dom.window) : dom.window[name];
}
global.IS_REACT_ACT_ENVIRONMENT = true;
// jsdom has no layout engine. Supply text measurements; Mermaid still parses and
// renders real diagrams, with real sanitizer and component lifecycle behavior.
dom.window.SVGElement.prototype.getBBox = function () {
  return { x: 0, y: 0, width: Math.max(40, (this.textContent?.length ?? 0) * 7), height: 24 };
};
dom.window.SVGElement.prototype.getComputedTextLength = function () { return (this.textContent?.length ?? 0) * 7; };

const load = createRequire(import.meta.url);
const src = path.resolve('src');
for (const extension of ['.ts', '.tsx']) {
  load.extensions[extension] = (module, filename) => {
    const source = fs.readFileSync(filename, 'utf8').replace(/(["'])@\//g, `$1${src}/`);
    module._compile(ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText, filename);
  };
}
const { readChatDiagram } = load('../src/lib/chat-diagram.ts');
const { renderChatDiagram } = load('../src/lib/render-chat-diagram.ts');
const ChatDiagram = load('../src/components/chat-diagram.tsx').default;
const example = { format: 'mermaid', title: '요청 흐름', code: 'flowchart LR\n A[브라우저] --> B[서버]', illustrative: true };

test('diagram validation accepts supported types and blocks model configuration, HTML, links and oversized input', () => {
  assert.deepEqual(readChatDiagram(example), example);
  assert.ok(readChatDiagram({ ...example, code: 'graph TD; A-->B' }));
  assert.ok(readChatDiagram({ ...example, code: 'sequenceDiagram\n participant A\n A->>B: 요청' }));
  for (const code of ['pie\n "A": 1', '---\nconfig:\n securityLevel: loose\n---\nflowchart LR\nA-->B',
    'flowchart LR\n%%{init: {"securityLevel":"loose"}}%%\n A-->B',
    'flowchart LR\n A[<img src=x onerror=alert(1)>]', 'flowchart LR\n click A "https://evil.example"',
    'flowchart LR\n A@{ img: "/tracking" }', 'flowchart LR\n classDef x fill:url(/tracking)',
    'flowchart LR\n' + 'A'.repeat(6000)]) {
    assert.equal(readChatDiagram({ ...example, code }), null, code.slice(0, 80));
  }
  for (const value of [null, undefined, {}, { ...example, illustrative: 'true' }, { ...example, title: ' ' }]) {
    assert.equal(readChatDiagram(value), null);
  }
});

test('real Mermaid renders flowcharts and sequences in isolated documents; parser failure does not poison later renders', async () => {
  const flow = await renderChatDiagram(example);
  assert.ok(flow, 'flowchart should render');
  assert.match(flow.document, /Content-Security-Policy/);
  assert.match(flow.document, /default-src 'none'/);
  assert.match(flow.document, /aria-label="요청 흐름"/);
  assert.doesNotMatch(flow.document, /<script|<foreignObject|<a\s|\bon\w+=|(?:xlink:)?href=/i);
  assert.ok(flow.width >= 280 && flow.width <= 1200);
  assert.ok(flow.height >= 120 && flow.height <= 900);
  const [bad, sequence, retry] = await Promise.all([
    renderChatDiagram({ ...example, code: 'flowchart LR\n A[' }),
    renderChatDiagram({ ...example, code: 'sequenceDiagram\n participant A as 브라우저\n participant B as 서버\n A->>B: 요청\n B-->>A: 응답' }),
    renderChatDiagram(example),
  ]);
  assert.equal(bad, null);
  assert.ok(sequence, 'sequence should render');
  assert.ok(retry, 'subsequent render should succeed');
  assert.equal(document.body.children.length, 0, 'temporary hosts must be removed');
});

test('diagram component labels examples and grounded diagrams, stays contained on mobile, and omits failures', async () => {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    for (const illustrative of [true, false]) {
      await act(async () => {
        root.render(React.createElement(ChatDiagram, { diagram: { ...example, illustrative } }));
      });
      // Rendering runs in a serialized async queue; wait for that queue then flush React.
      await act(async () => { await renderChatDiagram(example); });
      assert.match(container.textContent, illustrative ? /개념 설명용 예시/ : /자료 기반 다이어그램/);
      const frame = container.querySelector('iframe');
      assert.ok(frame);
      assert.equal(frame.getAttribute('sandbox'), '');
      assert.equal(frame.getAttribute('referrerpolicy'), 'no-referrer');
      assert.match(frame.title, /요청 흐름/);
      const region = container.querySelector('[role="region"]');
      assert.equal(region.tabIndex, 0);
      assert.match(region.className, /overflow-x-auto/);
      assert.ok(container.querySelector('figure').getAttribute('aria-describedby'));
    }
    await act(async () => {
      root.render(React.createElement(ChatDiagram, { diagram: { ...example, code: 'flowchart LR\n A[' } }));
      await renderChatDiagram(example);
    });
    assert.equal(container.querySelector('figure'), null);
    await act(async () => { root.unmount(); });
  } finally {
    container.remove();
  }
});

test('sanitizer strips active SVG content and renderer exceptions preserve subsequent rendering', async () => {
  const mermaid = load('mermaid').default;
  const originalRender = mermaid.render;
  let bound = false;
  try {
    mermaid.render = async () => ({
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200"><script>alert(1)</script><foreignObject><img src="/tracking"/></foreignObject><a href="javascript:alert(1)"><text onload="alert(1)">label</text></a><image href="/tracking"/><use href="/tracking"/><rect width="20" height="20" onclick="alert(1)"/></svg>',
      bindFunctions: () => { bound = true; },
    });
    const output = await renderChatDiagram(example);
    assert.ok(output);
    assert.doesNotMatch(output.document, /<script|<foreignObject|<a\s|<image|<use|\bon\w+=|(?:xlink:)?href=/i);
    assert.equal(bound, false);
    mermaid.render = async () => { throw new Error('render failure'); };
    assert.equal(await renderChatDiagram(example), null);
  } finally {
    mermaid.render = originalRender;
  }
  assert.ok(await renderChatDiagram(example));
  assert.equal(document.body.children.length, 0);
});
