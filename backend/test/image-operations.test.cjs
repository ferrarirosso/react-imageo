const assert = require('node:assert/strict');
const { test } = require('node:test');
const { HttpRequest, InvocationContext } = require('@azure/functions');
const { generateImage } = require('../dist/src/functions/generateImage');
const { refineImageFn } = require('../dist/src/functions/refineImage');
const { validateRefineRequest } = require('../dist/src/middleware/validation');

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAX+XDSwAAAABJRU5ErkJggg==';
const context = new InvocationContext({ logHandler() {} });
const principal = { 'x-ms-client-principal-id': 'unit-test' };
const source = { imageBase64: png, instruction: 'Make the sky blue' };

function request(body, headers = principal) {
  return new HttpRequest({ method: 'POST', url: 'https://local.test/api', headers, body: { string: JSON.stringify(body) } });
}

function mockFoundry(t, handler) {
  // Use the local deployment path with a test credential. Caller auth is still required.
  const settings = {
    WEBSITE_SITE_NAME: '', REQUIRE_AUTH: 'true', AZURE_OPENAI_API_KEY: 'fixture',
    AZURE_MAI_ENDPOINT: 'https://fixture.invalid', AZURE_OPENAI_API_VERSION_IMAGE: '',
    AZURE_OPENAI_DEPLOYMENT_IMAGE: 'preview-deployment', IMAGE_MODEL_LABEL: 'Preview',
    ALLOW_DEV_BEARER_TOKENS: 'false', IMAGE_MAX_N: '2',
  };
  for (const [key, value] of Object.entries(settings)) {
    const original = process.env[key];
    process.env[key] = value;
    t.after(() => {
      if (original === undefined) delete process.env[key];
      else process.env[key] = original;
    });
  }
  return t.mock.method(globalThis, 'fetch', handler);
}

test('generation keeps old wire defaults and supports new dimensions and transparent PNG', async t => {
  const outbound = [];
  mockFoundry(t, async (url, init) => {
    assert.equal(url, 'https://fixture.invalid/mai/v1/images/generations');
    assert.equal(init.headers['Content-Type'], 'application/json');
    outbound.push(JSON.parse(init.body));
    return Response.json({ data: [{ b64_json: png }] });
  });
  for (const [options, width, height, transparent] of [
    [{}, 1024, 1024, false],
    [{ size: '1360x768', transparentBackground: false }, 1360, 768, false],
    [{ size: '768x1360' }, 768, 1360, false],
    [{ size: '2048x1152', transparentBackground: true }, 2048, 1152, true],
    [{ size: '2048x2048' }, 2048, 2048, false],
  ]) {
    const result = await generateImage(request({ prompt: 'A river', ...options }), context);
    assert.equal(result.status, 200);
    assert.equal(result.jsonBody.images[0].b64, png);
    assert.deepEqual(outbound.pop(), { prompt: 'A river', width, height, model: 'preview-deployment', ...(transparent && {background: 'transparent'}) });
  }
  assert.equal((await generateImage(request({ prompt: 'A river', transparentBackground: 'false' }), context)).status, 400);
});

test('edit checks caller auth before sending one multipart PNG to Foundry', async t => {
  const mock = mockFoundry(t, async (url, init) => {
    assert.equal(url, 'https://fixture.invalid/mai/v1/images/edits');
    assert.equal(init.method, 'POST');
    assert.deepEqual(init.headers, { 'api-key': 'fixture' });
    assert.deepEqual([...init.body.keys()].sort(), ['image', 'model', 'prompt']);
    assert.equal(init.body.get('model'), 'preview-deployment');
    assert.equal(init.body.get('prompt'), source.instruction);
    const image = init.body.get('image');
    assert.equal(image.type, 'image/png');
    assert.equal(Buffer.from(await image.arrayBuffer()).toString('base64'), png);
    return Response.json({ data: [{ b64_json: png, revised_prompt: 'Edited' }] });
  });
  assert.equal((await refineImageFn(request(source, {}), context)).status, 401);
  assert.equal(mock.mock.callCount(), 0);
  const result = await refineImageFn(request(source), context);
  assert.equal(result.status, 200);
  assert.deepEqual(result.jsonBody.image, { b64: png, model: 'Preview', revisedPrompt: 'Edited' });
  assert.equal(mock.mock.callCount(), 1);
});

test('a selected edit sends the clean original first and the registered selection guide second', async t => {
  const mock = mockFoundry(t, async (_url, init) => {
    const files = init.body.getAll('image');
    assert.deepEqual(files.map(file => file.name), ['source.png', 'selection-guide.png']);
    assert.equal(Buffer.from(await files[0].arrayBuffer()).toString('base64'), png);
    assert.equal(Buffer.from(await files[1].arrayBuffer()).toString('base64'), png);
    assert.match(init.body.get('prompt'), /second image shows the selection/);
    assert.ok(init.body.get('prompt').endsWith(source.instruction));
    return Response.json({ data: [{ b64_json: png }] });
  });
  assert.equal((await refineImageFn(request({ ...source, guideBase64: png }), context)).status, 200);
  assert.equal(mock.mock.callCount(), 1);
});

test('edit forwards only the PNG datastream for both source and guide', async t => {
  const image = Buffer.from(png, 'base64');
  // Some saved images have extra bytes, even another IEND marker, after the complete PNG.
  const sourceWithTail = Buffer.concat([image, Buffer.from('source trailer'), image.subarray(-12)]);
  const guideWithTail = Buffer.concat([image, Buffer.from('guide trailer')]);
  const mock = mockFoundry(t, async (_url, init) => {
    const files = init.body.getAll('image');
    assert.equal(files.length, 2);
    for (const file of files) assert.deepEqual(Buffer.from(await file.arrayBuffer()), image);
    return Response.json({ data: [{ b64_json: png }] });
  });
  const body = { ...source, imageBase64: sourceWithTail.toString('base64'), guideBase64: guideWithTail.toString('base64') };
  assert.equal((await refineImageFn(request(body), context)).status, 200);
  assert.equal(mock.mock.callCount(), 1);
});

test('edit rejects broken PNG terminators even when more bytes follow', () => {
  const image = Buffer.from(png, 'base64');
  const validEnd = image.subarray(-12);
  const header = image.subarray(0, 33);
  const beforeEnd = image.subarray(0, -12);
  const badCrc = Buffer.from(validEnd);
  badCrc[11] ^= 1;
  const nonemptyEnd = Buffer.from(validEnd);
  nonemptyEnd.writeUInt32BE(1);
  for (const invalid of [
    Buffer.concat([beforeEnd, badCrc, validEnd]),
    Buffer.concat([beforeEnd, nonemptyEnd, validEnd]),
    Buffer.concat([header, validEnd]),
    image.subarray(0, -1),
  ]) {
    assert.throws(() => validateRefineRequest({ ...source, imageBase64: invalid.toString('base64') }), /incomplete/);
  }
});

test('edit rejects malformed, excessive or unsupported inputs before inference', async t => {
  const mock = mockFoundry(t, () => { throw new Error('unexpected inference'); });
  const oversized = Buffer.from(png, 'base64');
  oversized.writeUInt32BE(4_194_305, 16);
  const misalignedGuide = Buffer.from(png, 'base64');
  misalignedGuide.writeUInt32BE(2, 20);
  for (const overrides of [
    { imageBase64: 'not base64!' }, { imageBase64: 'data:image/png;base64,' + png },
    { imageBase64: Buffer.from('not a PNG').toString('base64') },
    { imageBase64: Buffer.from(png, 'base64').subarray(0, -10).toString('base64') },
    { imageBase64: oversized.toString('base64') }, { instruction: ' ' }, { instruction: 'x'.repeat(4001) },
    { size: '2048x2048' }, { transparentBackground: true }, { imageBase64: [png, png] },
    { guideBase64: misalignedGuide.toString('base64') }, { guideBase64: '' }, { guideBase64: null },
  ]) {
    assert.equal((await refineImageFn(request({ ...source, ...overrides }), context)).status, 400);
  }
  assert.throws(() => validateRefineRequest({ ...source, imageBase64: 'A'.repeat(48 * 1024 * 1024 + 4) }), /36 MiB/);
  assert.equal(mock.mock.callCount(), 0);
});

test('edit maps upstream failures without returning the source or provider error body', async t => {
  mockFoundry(t, () => Response.json({ error: { message: 'content_policy_violation private-user-input' } }, { status: 400 }));
  const result = await refineImageFn(request(source), context);
  assert.equal(result.status, 400);
  assert.equal(result.jsonBody.code, 'content_policy_violation');
  assert.ok(!JSON.stringify(result.jsonBody).includes('private-user-input'));
});

test('Azure edit requires an authenticated principal and sends a managed identity access token', async t => {
  const { DefaultAzureCredential } = require('@azure/identity');
  t.mock.method(DefaultAzureCredential.prototype, 'getToken', async scopes => {
    assert.deepEqual([scopes].flat(), ['https://cognitiveservices.azure.com/.default']);
    return { token: 'test-access-token', expiresOnTimestamp: Date.now() + 3600_000 };
  });
  const mock = mockFoundry(t, (_url, init) => {
    assert.deepEqual(init.headers, { Authorization: 'Bearer test-access-token' });
    return Response.json({ data: [{ b64_json: png }] });
  });
  process.env.WEBSITE_SITE_NAME = 'fixture';
  process.env.REQUIRE_AUTH = 'false';
  assert.equal((await refineImageFn(request(source, {}), context)).status, 401);
  assert.equal((await refineImageFn(request(source), context)).status, 200);
  assert.equal(mock.mock.callCount(), 1);
});

const outputFilter = {
  error: {
    code: 'content_safety_violation',
    message: 'Output content violated safety policies. Violation categories: disallowed.',
    details: 'Output content violated safety policies. Violation categories: disallowed.',
  },
};

test('Foundry output filtering explains the blocked image for generation and refinement', async t => {
  mockFoundry(t, () => Response.json(outputFilter, { status: 400 }));
  for (const result of [
    await generateImage(request({ prompt: 'A lion' }), context),
    await refineImageFn(request(source), context),
  ]) {
    assert.equal(result.status, 400);
    assert.equal(result.jsonBody.code, 'output_content_filtered');
    assert.equal(result.jsonBody.message, 'Foundry blocked the generated image. No image was returned.');
    assert.doesNotMatch(result.jsonBody.message, /prompt|safety policies/i);
    assert.deepEqual(result.jsonBody.serviceResponse, {
      httpStatus: 400, providerCode: 'content_safety_violation', stage: 'output',
      category: 'disallowed', message: outputFilter.error.message,
    });
    if (result.jsonBody.partialErrors) {
      assert.equal(result.jsonBody.partialErrors[0].message, result.jsonBody.message);
      assert.deepEqual(result.jsonBody.partialErrors[0].serviceResponse, result.jsonBody.serviceResponse);
    }
  }
});

test('classifies structured rejection details using safe categories', async t => {
  let payload;
  mockFoundry(t, () => Response.json(payload, { status: 400 }));
  for (const [error, code, message] of [
    [{code:'BadRequest', innererror: {code:'ResponsibleAIPolicyViolation'}}, 'content_policy_violation', /safety policies/],
    [{message:'Your request was blocked under the safety policies.'}, 'content_policy_violation', /safety policies/],
    [{code:'invalid_request_error', details:[{type:'unsupported_parameter',param:'background'}]}, 'unsupported_background', /Turn off Transparent background/],
    [{code:'BadRequest', innerError:{target:'width'}}, 'invalid_image_size', /another size/],
  ]) {
    payload = {error};
    const result = await generateImage(request({prompt:'Example'}), context);
    assert.equal(result.status, 400);
    assert.equal(result.jsonBody.partialErrors[0].code, code);
    assert.match(result.jsonBody.partialErrors[0].message, message);
  }
});

test('unknown 400 keeps status and a valid gateway reference while hiding all provider text', async t => {
  const marker = 'do-not-echo-this-sentinel';
  const validId = 'b9bc63ab-e51f-4db8-9d7c-b59f012676ae';
  let headers = { 'x-request-id': validId };
  const diagnostics = [];
  t.mock.method(console, 'error', (...args) => diagnostics.push(args.join(' ')));
  t.mock.method(console, 'log', (...args) => diagnostics.push(args.join(' ')));
  const capture = new InvocationContext({logHandler: (...args) => diagnostics.push(args.join(' '))});
  mockFoundry(t, () => Response.json({ error: {
    code: marker, message: marker, param: marker, echoedPrompt: 'Output content violated safety policies.',
  } }, { status: 400, headers }));
  for (const valid of [true, false]) {
    if (!valid) headers = { 'x-request-id': marker, 'apim-request-id': 'not a UUID' };
    const result = await generateImage(request({ prompt: marker }, {...principal,'x-ms-client-principal-name':marker}), capture);
    assert.equal(result.status, 400);
    assert.equal(result.jsonBody.code, 'upstream_bad_request');
    assert.equal(result.jsonBody.message.includes(validId), valid);
    assert.equal(result.jsonBody.message.includes('Request ID:'), valid);
    assert.deepEqual(result.jsonBody.serviceResponse, valid ? {httpStatus: 400, requestId: validId} : {httpStatus: 400});
    assert.ok(!JSON.stringify(result.jsonBody).includes(marker));
  }
  assert.match(diagnostics.join(' '), /category=upstream_bad_request/);
  assert.ok(diagnostics.join(' ').includes(validId));
  assert.ok(!diagnostics.join(' ').includes(marker));
});

test('only the exact safe provider message discloses an output stage or category', async t => {
  const privateValue = 'https://private-deployment.invalid/?access-token=private-input';
  let payload;
  mockFoundry(t, () => Response.json(payload, {status: 400, headers: {'x-request-id': privateValue}}));
  for (const message of [outputFilter.error.message + ' ' + privateValue, 'Request failed.']) {
    payload = {error: {code: 'content_safety_violation', message, details: outputFilter.error.message,
      echoed: privateValue, requestId: privateValue, category: 'disallowed', stage: 'output'}};
    const result = await refineImageFn(request(source), context);
    assert.deepEqual(result.jsonBody.serviceResponse, {httpStatus: 400, providerCode: 'content_safety_violation'});
    assert.ok(!JSON.stringify(result.jsonBody).includes(privateValue));
  }
  payload = {error: {code: 'private-deployment', message: outputFilter.error.message}};
  assert.deepEqual((await refineImageFn(request(source), context)).jsonBody.serviceResponse, {httpStatus: 400});
});

test('gateway failures keep upstream status and separate request IDs for different images', async t => {
  const ids = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'];
  let i = 0;
  mockFoundry(t, () => Response.json({error: {message: 'PRIVATE'}}, {
    status: 403, headers: {'x-ms-request-id': ids[i++]},
  }));
  const result = await generateImage(request({prompt: 'Example', n: 2}), context);
  assert.equal(result.status, 502);
  assert.equal(result.jsonBody.code, 'auth_error');
  assert.equal(result.jsonBody.serviceResponse, undefined);
  assert.deepEqual(result.jsonBody.partialErrors.map(e => e.serviceResponse),
    ids.map(requestId => ({httpStatus: 403, requestId})));
  assert.ok(!JSON.stringify(result.jsonBody).includes('PRIVATE'));
});

test('all rate-limited images yield 429 while a successful image keeps its batch at 200', async t => {
  let calls = 0;
  mockFoundry(t, () => ++calls === 3
    ? Response.json({data:[{b64_json:png}]})
    : Response.json({ error: {message:'private detail'} }, {status:429}));
  const blocked = await generateImage(request({ prompt:'Example', n:2 }), context);
  assert.equal(blocked.status, 429);
  assert.deepEqual(blocked.jsonBody.serviceResponse, {httpStatus: 429});
  assert.deepEqual(blocked.jsonBody.partialErrors.map(e => [e.index, e.code]),
    [[0,'rate_limit_exceeded'], [1,'rate_limit_exceeded']]);
  const partial = await generateImage(request({ prompt:'Example', n:2 }), context);
  assert.equal(partial.status, 200);
  assert.equal(partial.jsonBody.images[0].b64, png);
  assert.deepEqual(partial.jsonBody.partialErrors[0].serviceResponse, {httpStatus: 429});
  assert.equal(partial.jsonBody.serviceResponse, undefined);
  assert.deepEqual(partial.jsonBody.partialErrors.map(e => [e.index, e.code]), [[1,'rate_limit_exceeded']]);
});
