import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';

const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://portfolio.example' });
global.window = dom.window;
global.document = dom.window.document;
global.IS_REACT_ACT_ENVIRONMENT = true;
dom.window.HTMLElement.prototype.scrollIntoView = () => {};
const { createRoot } = await import('react-dom/client');
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
const ChatConversation = load('../src/components/chat-conversation.tsx').default;
const { InvitationChat } = load('../src/app/chat.tsx');
const csrf = { headerName: 'X-CSRF-TOKEN', token: 'csrf' };
const visitor = { visitorId: 'visitor', inviteId: 'invite', companyName: 'company', position: '', firstUsedAt: '2026-10-22', expiresAt: '2027-01-01', welcomeMessage: '' };
const session = { visitor, invite: null, csrf };
const reply = { answer: '완료된 답변', grounded: true, sources: [], usage: null };
const completed = () => new Response(`event: completed\ndata: ${JSON.stringify(reply)}\n\n`, { headers: { 'Content-Type': 'text/event-stream' } });
const failed = () => Response.json({ code: 'CHAT_MODEL_UNAVAILABLE' }, { status: 503 });

async function enterDraft(container, value) {
  await act(async () => {
    const input = container.querySelector('textarea');
    Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, 'value').set.call(input, value);
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
}

test('retrying an earlier failed question preserves a different draft on success and failure', async () => {
  const originalFetch = global.fetch;
  const originalBase = process.env.NEXT_PUBLIC_API_BASE_URL;
  process.env.NEXT_PUBLIC_API_BASE_URL = 'https://backend.example';
  try {
    for (const retryResponse of [completed, failed]) {
      const container = document.createElement('div');
      document.body.append(container);
      const root = createRoot(container);
      const requests = [];
      global.fetch = async (_url, options) => {
        requests.push(JSON.parse(options.body));
        return requests.length === 1 ? failed() : retryResponse();
      };
      try {
        await act(async () => { root.render(React.createElement(ChatConversation, { session, onNewConversation() {}, onAccessEnded() {} })); });
        await enterDraft(container, '실패한 질문');
        await act(async () => { container.querySelector('form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })); });
        assert.equal(container.querySelector('textarea').value, '실패한 질문');
        await enterDraft(container, '새로 작성 중인 다른 질문');
        await act(async () => { [...container.querySelectorAll('button')].find(button => button.textContent === '다시 시도').click(); });
        assert.equal(container.querySelector('textarea').value, '새로 작성 중인 다른 질문');
        assert.equal(requests.length, 2);
        assert.deepEqual(requests[0], requests[1], 'retry keeps its original question and id');
        assert.equal(container.querySelectorAll('article').length, 1, 'retry updates the existing turn');
      } finally {
        await act(async () => root.unmount());
        container.remove();
      }
    }
  } finally {
    global.fetch = originalFetch;
    if (originalBase === undefined) delete process.env.NEXT_PUBLIC_API_BASE_URL;
    else process.env.NEXT_PUBLIC_API_BASE_URL = originalBase;
  }
});

test('changing guest access to the legacy code guest immediately discards the prior session', async () => {
  const originalFetch = global.fetch;
  const originalBase = process.env.NEXT_PUBLIC_API_BASE_URL;
  process.env.NEXT_PUBLIC_API_BASE_URL = 'https://backend.example';
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    global.fetch = async url => url.pathname === '/api/csrf' ? Response.json(csrf) : Response.json(visitor);
    await act(async () => { root.render(React.createElement(InvitationChat, { code: null })); });
    assert.ok(container.querySelector('textarea'));
    await enterDraft(container, '이전 세션 초안');
    global.fetch = (_url, options) => new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
    });
    await act(async () => { root.render(React.createElement(InvitationChat, { code: 'guest' })); });
    assert.equal(container.querySelector('textarea'), null, 'old session cannot send while validating a new code');
    assert.match(container.textContent, /초대 코드를 확인하고 있어요/);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    global.fetch = originalFetch;
    if (originalBase === undefined) delete process.env.NEXT_PUBLIC_API_BASE_URL;
    else process.env.NEXT_PUBLIC_API_BASE_URL = originalBase;
  }
});

test('access screens distinguish disabled guests, unavailable invitations and retryable connection errors', async () => {
  const originalFetch = global.fetch;
  const originalBase = process.env.NEXT_PUBLIC_API_BASE_URL;
  process.env.NEXT_PUBLIC_API_BASE_URL = 'https://backend.example';
  try {
    for (const scenario of [
      { code: null, title: '초대 링크로 접속해 주세요', retry: false, response: () => Response.json({ code: 'GUEST_ACCESS_DISABLED' }, { status: 403 }) },
      { code: 'EXPIRED', title: '사용할 수 없는 초대 코드예요', retry: false, response: () => Response.json({ code: 'INVITATION_UNAVAILABLE' }, { status: 403 }) },
      { code: null, title: '대화를 준비하지 못했어요', retry: true, response: () => { throw new TypeError('offline'); } },
    ]) {
      const container = document.createElement('div');
      document.body.append(container);
      const root = createRoot(container);
      global.fetch = async url => url.pathname === '/api/csrf' ? Response.json(csrf) : scenario.response();
      try {
        await act(async () => { root.render(React.createElement(InvitationChat, { code: scenario.code })); });
        assert.equal(container.querySelector('h1').textContent, scenario.title);
        assert.equal(container.querySelector('textarea'), null);
        assert.equal(Boolean(container.querySelector('button')), scenario.retry);
        if (scenario.retry) {
          global.fetch = async url => url.pathname === '/api/csrf' ? Response.json(csrf) : Response.json(visitor);
          await act(async () => container.querySelector('button').click());
          assert.ok(container.querySelector('textarea'), 'retry completes a fresh guest entry');
        }
      } finally {
        await act(async () => root.unmount());
        container.remove();
      }
    }
  } finally {
    global.fetch = originalFetch;
    if (originalBase === undefined) delete process.env.NEXT_PUBLIC_API_BASE_URL;
    else process.env.NEXT_PUBLIC_API_BASE_URL = originalBase;
  }
});
