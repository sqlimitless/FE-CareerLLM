import fs from 'node:fs';
import ts from 'typescript';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const load = createRequire(import.meta.url);
// Compile the application TypeScript in memory with the existing dev dependency.
load.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);
const { prepareChatSession, readInvitationCode } = load('../src/lib/chat-session.ts');
const { sendChatStream, chatErrorMessage } = load('../src/lib/chat-stream.ts');
const { ApiError } = load('../src/lib/api.ts');
const { apiGet } = load('../src/lib/api.ts');
const { createClientMessage } = load('../src/lib/client-message.ts');
const clientMessageId = '019a37ec-0000-7000-8000-000000000001';
const invite = { inviteId: 'invite', companyName: '예시회사', position: '백엔드 개발자', firstUsedAt: null, expiresAt: '2027-01-02', canStartConversation: true };
const visitor = { ...invite, visitorId: 'visitor', firstUsedAt: '2026-10-07', welcomeMessage: '환영합니다' };
const csrf = { headerName: 'X-CSRF-TOKEN', token: 'after-entry' };
const reply = { answer: '확정된 답변입니다.', grounded: true, sources: [{ chunkId: 'chunk', documentId: 'document', title: '프로젝트 경험' }], usage: null };
const frame = (event, data, newline = '\n') => `event: ${event}${newline}data: ${JSON.stringify(data)}${newline}${newline}`;
const signal = () => new AbortController().signal;
function stream(text, step = 3) {
  const bytes = new TextEncoder().encode(text);
  return new Response(new ReadableStream({ start(controller) {
    for (let i = 0; i < bytes.length; i += step) controller.enqueue(bytes.slice(i, i + step));
    controller.close();
  } }), { headers: { 'Content-Type': 'text/event-stream;charset=UTF-8' } });
}
const send = (onEvent = () => {}, abortSignal = signal()) => sendChatStream({ message: '경험을 알려 주세요', clientMessageId, csrf, signal: abortSignal, onEvent });

test('chat API and SSE contracts', async (t) => {
  const originalFetch = global.fetch;
  const originalBase = process.env.NEXT_PUBLIC_API_BASE_URL;
  process.env.NEXT_PUBLIC_API_BASE_URL = 'https://backend.example/';
  try {
    await t.test('LAN development uses the page hostname and retains the backend port', async () => {
      const previousMode = process.env.NODE_ENV;
      const previousWindow = Object.getOwnPropertyDescriptor(global, 'window');
      const previousBase = process.env.NEXT_PUBLIC_API_BASE_URL;
      try {
        process.env.NODE_ENV = 'development';
        process.env.NEXT_PUBLIC_API_BASE_URL = 'http://localhost:8080';
        Object.defineProperty(global, 'window', { configurable: true, value: { location: { hostname: '192.168.50.6' } } });
        const urls = [];
        global.fetch = async url => { urls.push(url.href); return Response.json(csrf); };
        await apiGet('/api/csrf', signal());
        global.window.location.hostname = 'localhost';
        await apiGet('/api/csrf', signal());
        global.window.location.hostname = '192.168.50.6';
        process.env.NODE_ENV = 'production';
        await apiGet('/api/csrf', signal());
        process.env.NODE_ENV = 'development';
        process.env.NEXT_PUBLIC_API_BASE_URL = 'https://backend.example';
        await apiGet('/api/csrf', signal());
        assert.deepEqual(urls, ['http://192.168.50.6:8080/api/csrf', 'http://localhost:8080/api/csrf', 'http://localhost:8080/api/csrf', 'https://backend.example/api/csrf']);
      } finally {
        if (previousMode === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = previousMode;
        process.env.NEXT_PUBLIC_API_BASE_URL = previousBase;
        if (previousWindow) Object.defineProperty(global, 'window', previousWindow);
        else delete global.window;
      }
    });
    await t.test('HTTP LAN browsers without randomUUID still create valid distinct UUIDs', () => {
      const previousCrypto = Object.getOwnPropertyDescriptor(global, 'crypto');
      const originalCrypto = global.crypto;
      try {
        Object.defineProperty(global, 'crypto', { configurable: true, value: { getRandomValues: originalCrypto.getRandomValues.bind(originalCrypto) } });
        const first = createClientMessage('질문');
        const second = createClientMessage('질문');
        assert.match(first.clientMessageId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
        assert.notEqual(first.clientMessageId, second.clientMessageId);
        assert.equal(createClientMessage('질문', first), first);
      } finally {
        Object.defineProperty(global, 'crypto', previousCrypto);
      }
    });
    await t.test('new and legacy token links preview, accept, rotate CSRF, and chat', async () => {
      for (const code of ['A1B2C3', 'old-invitation-code-with-more-than-six-characters', 'a+b/한글']) {
        const link = new URL('https://portfolio.example/');
        link.searchParams.set('token', code);
        const invitationCode = readInvitationCode(link.searchParams);
        assert.equal(invitationCode, code);
        const paths = [];
        let csrfCalls = 0;
        global.fetch = async (url, options) => {
          paths.push(url.pathname);
          assert.equal(options.headers.get('API-Version'), '0.1.0');
          assert.equal(options.credentials, 'include');
          assert.equal(options.cache, 'no-store');
          if (url.pathname === '/invite') {
            assert.equal(options.method, 'GET');
            assert.deepEqual([...url.searchParams], [['token', code]]);
            return Response.json(invite);
          }
          if (url.pathname === '/api/csrf') {
            return Response.json(++csrfCalls === 1 ? { ...csrf, token: 'before-entry' } : csrf);
          }
          if (url.pathname === '/api/invitations/accept') {
            assert.equal(options.method, 'POST');
            assert.deepEqual(JSON.parse(options.body), { token: code });
            assert.equal(options.headers.get(csrf.headerName), 'before-entry');
            return Response.json(visitor);
          }
          assert.equal(url.pathname, '/api/chat/messages/stream');
          assert.equal(options.headers.get(csrf.headerName), csrf.token);
          assert.deepEqual(JSON.parse(options.body), { message: '경험을 알려 주세요', clientMessageId });
          return stream(frame('completed', reply));
        };
        const session = await prepareChatSession(invitationCode, signal());
        assert.deepEqual(await sendChatStream({ message: '경험을 알려 주세요', clientMessageId, csrf: session.csrf, signal: signal(), onEvent() {} }), reply);
        assert.deepEqual(paths, ['/invite', '/api/csrf', '/api/invitations/accept', '/api/csrf', '/api/chat/messages/stream']);
      }
    });
    await t.test('missing, blank, or duplicate codes are rejected without imposing a new format', () => {
      for (const query of ['', 'token=', 'token=++', 'token=A1B2C3&token=D4E5F6', 'code=A1B2C3']) {
        assert.equal(readInvitationCode(new URLSearchParams(query)), null);
      }
    });
    await t.test('preview rejects invalid or unavailable invitations before accept', async () => {
      for (const [status, code] of [[400, 'INVALID_INVITATION_TOKEN'], [403, 'INVITATION_UNAVAILABLE']]) {
        let calls = 0;
        global.fetch = async () => { calls++; return Response.json({ code }, { status }); };
        await assert.rejects(prepareChatSession('A1B2C3', signal()), e => e.reason === 'invalid');
        assert.equal(calls, 1);
      }
    });
    await t.test('revocation between preview and accept stops before rotated CSRF', async () => {
      const responses = [Response.json(invite), Response.json(csrf), Response.json({ code: 'INVITATION_UNAVAILABLE' }, { status: 403 })];
      global.fetch = async () => responses.shift();
      await assert.rejects(prepareChatSession('A1B2C3', signal()), e => e.code === 'INVITATION_UNAVAILABLE');
      assert.equal(responses.length, 0);
    });
    await t.test('revoked visitor chat rejects with terminal code, session absence stays distinct', async () => {
      for (const [status, code] of [[403, 'INVITATION_UNAVAILABLE'], [401, 'UNAUTHENTICATED']]) {
        let calls = 0;
        global.fetch = async () => { calls++; return Response.json({ code }, { status }); };
        await assert.rejects(send(), e => e.code === code && e.status === status);
        assert.equal(calls, 1);
      }
      assert.match(chatErrorMessage(new ApiError('INVITATION_UNAVAILABLE', 403)), /이용이 종료/);
      assert.match(chatErrorMessage(new ApiError('UNAUTHENTICATED', 401)), /다시 입장/);
    });
    await t.test('entry CSRF → accept → rotated CSRF, using direct backend requests', async () => {
      const requests = [];
      global.fetch = async (url, options) => {
        requests.push({ url, options });
        assert.equal(url.origin, 'https://backend.example');
        assert.equal(options.headers.get('API-Version'), '0.1.0');
        assert.equal(options.credentials, 'include');
        assert.equal(options.cache, 'no-store');
        if (requests.length === 1) return Response.json(invite);
        if (requests.length === 2) return Response.json({ headerName: 'X-CSRF-TOKEN', token: 'before-entry' });
        if (requests.length === 3) {
          assert.equal(options.method, 'POST');
          assert.equal(options.headers.get('X-CSRF-TOKEN'), 'before-entry');
          assert.deepEqual(JSON.parse(options.body), { token: 'a+b/한글' });
          return Response.json(visitor);
        }
        return Response.json(csrf);
      };
      assert.deepEqual(await prepareChatSession('a+b/한글', signal()), { invite, visitor, csrf });
      assert.deepEqual(requests.map(r => r.url.pathname), ['/invite', '/api/csrf', '/api/invitations/accept', '/api/csrf']);
      assert.equal(requests[0].url.searchParams.get('token'), 'a+b/한글');
    });
    await t.test('unavailable invitation never creates a session', async () => {
      let calls = 0;
      global.fetch = async () => { calls++; return Response.json({ ...invite, canStartConversation: false }); };
      await assert.rejects(prepareChatSession('token', signal()), e => e.reason === 'invalid');
      assert.equal(calls, 1);
    });
    await t.test('post-entry CSRF failure blocks chat preparation', async () => {
      const bodies = [invite, { headerName: 'X-CSRF-TOKEN', token: 'pre' }, visitor, { headerName: '', token: '' }];
      global.fetch = async () => Response.json(bodies.shift());
      await assert.rejects(prepareChatSession('token', signal()), e => e.reason === 'error');
    });
    await t.test('split UTF-8, emoji, CRLF, heartbeat, and authoritative final answer', async () => {
      const events = [];
      global.fetch = async (url, options) => {
        assert.equal(url.href, 'https://backend.example/api/chat/messages/stream');
        assert.equal(options.method, 'POST');
        assert.equal(options.headers.get('API-Version'), '0.1.0');
        assert.equal(options.headers.get('X-CSRF-TOKEN'), csrf.token);
        assert.equal(options.headers.get('Accept'), 'text/event-stream');
        assert.deepEqual(JSON.parse(options.body), { message: '경험을 알려 주세요', clientMessageId });
        return stream(frame('searching', { stage: 'searching' }, '\r\n') + frame('heartbeat', {}) + frame('delta', { text: '한글 😀 임시 답변' }) + frame('validating', { stage: 'validating' }) + frame('completed', reply), 1);
      };
      assert.deepEqual(await send(event => events.push(event)), reply);
      assert.deepEqual(events, [{ event: 'searching' }, { event: 'delta', text: '한글 😀 임시 답변' }, { event: 'validating' }]);
    });
    await t.test('multiline SSE data and no-delta grounded refusal complete normally', async () => {
      const refusal = { answer: '이력 자료에서 확인할 수 없습니다.', grounded: false, sources: [], usage: null };
      const json = JSON.stringify(refusal, null, 2).split('\n').map(line => `data: ${line}`).join('\n');
      global.fetch = async () => stream(`: comment\n\nevent: completed\n${json}\n\n`);
      assert.deepEqual(await send(), refusal);
    });
    await t.test('failed after delta rejects with backend code, without retry', async () => {
      let calls = 0;
      global.fetch = async () => { calls++; return stream(frame('delta', { text: '임시 답변' }) + frame('failed', { code: 'INVITATION_UNAVAILABLE' })); };
      await assert.rejects(send(), e => e.code === 'INVITATION_UNAVAILABLE');
      assert.equal(calls, 1);
    });
    await t.test('EOF without completed is a failure', async () => {
      global.fetch = async () => stream(frame('delta', { text: '부분 답변' }));
      await assert.rejects(send(), e => e.code === 'CHAT_STREAM_INTERRUPTED');
    });
    await t.test('HTTP errors and malformed completed are rejected', async () => {
      global.fetch = async () => Response.json({ code: 'ACCESS_DENIED' }, { status: 403 });
      await assert.rejects(send(), e => e.code === 'ACCESS_DENIED' && e.status === 403);
      global.fetch = async () => stream(frame('completed', { answer: 'missing fields' }));
      await assert.rejects(send(), e => e.code === 'INVALID_STREAM_RESPONSE');
    });
    await t.test('cancellation stops processing and cancels the reader', async () => {
      const controller = new AbortController();
      let cancelled = false;
      global.fetch = async () => new Response(new ReadableStream({ start(streamController) {
        streamController.enqueue(new TextEncoder().encode(frame('delta', { text: '취소 전' })));
      }, cancel() { cancelled = true; } }), { headers: { 'Content-Type': 'text/event-stream' } });
      await assert.rejects(send(() => controller.abort(), controller.signal), e => e.name === 'AbortError');
      assert.equal(cancelled, true);
    });
    await t.test('new question IDs differ, retries reuse ID, edited questions get a fresh ID', async () => {
      const first = createClientMessage('  프로젝트 경험은?  ');
      const retry = createClientMessage('프로젝트 경험은?', first);
      assert.equal(retry.clientMessageId, first.clientMessageId);
      assert.equal(retry.question, first.question);
      assert.notEqual(createClientMessage('기술 선택은?', first).clientMessageId, first.clientMessageId);
      assert.notEqual(createClientMessage('프로젝트 경험은?').clientMessageId, first.clientMessageId);
      assert.match(first.clientMessageId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });
    await t.test('disconnected question is resent with the same ID and receives cached completion', async () => {
      const bodies = [];
      global.fetch = async (_url, options) => {
        bodies.push(JSON.parse(options.body));
        return bodies.length === 1 ? stream(frame('delta', { text: 'lost completion' })) : stream(frame('completed', reply));
      };
      const original = createClientMessage('경험을 알려 주세요');
      const attempt = (message) => sendChatStream({ message: message.question, clientMessageId: message.clientMessageId, csrf, signal: signal(), onEvent() {} });
      await assert.rejects(attempt(original), e => e.code === 'CHAT_STREAM_INTERRUPTED');
      assert.equal(bodies.length, 1);
      assert.deepEqual(await attempt(createClientMessage(original.question, original)), reply);
      assert.deepEqual(bodies[0], bodies[1]);
      assert.equal(bodies.length, 2);
    });
    await t.test('409 conflicts and in-progress responses preserve backend error codes', async () => {
      for (const code of ['CHAT_MESSAGE_ID_CONFLICT', 'CHAT_REQUEST_IN_PROGRESS']) {
        global.fetch = async () => Response.json({ code }, { status: 409 });
        await assert.rejects(send(), error => error.code === code && error.status === 409);
      }
    });
    await t.test('missing configuration never falls back to frontend', async () => {
      delete process.env.NEXT_PUBLIC_API_BASE_URL;
      let calls = 0;
      global.fetch = async () => { calls++; return Response.json({}); };
      assert.throws(() => apiGet('/api/csrf', signal()), e => e.code === 'API_NOT_CONFIGURED');
      assert.equal(calls, 0);
    });
  } finally {
    global.fetch = originalFetch;
    if (originalBase === undefined) delete process.env.NEXT_PUBLIC_API_BASE_URL;
    else process.env.NEXT_PUBLIC_API_BASE_URL = originalBase;
  }
});
