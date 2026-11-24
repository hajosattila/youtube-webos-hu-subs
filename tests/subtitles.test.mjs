import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { afterEach, beforeEach, mock, test } from 'node:test';
import {
  addHungarianSubtitles,
  createCaptionParser
} from '../src/subtitle-tracks.ts';

// Node's native TypeScript loader requires the extensions webpack resolves.
const sourceModules = registerHooks({
  resolve(specifier, context, nextResolve) {
    const isSourceModule = context.parentURL?.startsWith(
      new URL('../src/', import.meta.url).href
    );
    return nextResolve(
      isSourceModule &&
        ['./subtitle-tracks', './caption-translation'].includes(specifier)
        ? specifier + '.ts'
        : specifier,
      context
    );
  }
});
const { createCaptionRecovery, installCaptionRecovery } =
  await import('../src/subtitle-recovery.ts');
sourceModules.deregister();

const SOURCE_URL =
  'https://www.youtube.com/api/timedtext?v=test-video&lang=en&kind=asr&fmt=json3&expire=123&signature=test%2Bsignature%2F%3D&pot=test%2Btoken';

function sourceTrack(overrides = {}) {
  return {
    baseUrl: SOURCE_URL,
    name: { simpleText: 'English (auto-generated)' },
    languageCode: 'en',
    vssId: 'a.en',
    kind: 'asr',
    isTranslatable: true,
    ...overrides
  };
}

function response(overrides = {}) {
  return {
    videoDetails: { videoId: 'test-video' },
    captions: {
      playerCaptionsTracklistRenderer: {
        captionTracks: [sourceTrack()],
        audioTracks: [
          { captionTrackIndices: [0], defaultCaptionTrackIndex: 0 }
        ],
        ...overrides
      }
    }
  };
}

function tracklist(value) {
  return value.captions.playerCaptionsTracklistRenderer;
}

function freezeDeep(value) {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
}

beforeEach(() => {
  mock.method(console, 'info', () => {});
  mock.method(console, 'warn', () => {});
});
afterEach(() => mock.restoreAll());

test('sets the Hungarian timedtext target while preserving source authorization', () => {
  const input = response();
  const result = tracklist(addHungarianSubtitles(input));
  const translated = result.captionTracks[1];
  const source = new URL(SOURCE_URL);
  const target = new URL(translated.baseUrl);
  assert.equal(target.searchParams.get('tlang'), 'hu');
  assert.equal(
    target.origin + target.pathname,
    source.origin + source.pathname
  );
  for (const [key, value] of source.searchParams)
    assert.equal(target.searchParams.get(key), value, key);
  assert.equal(translated.languageCode, 'hu');
  assert.equal(translated.vssId, '.hu');
  assert.match(translated.name.simpleText, /Magyar/);
  assert.equal(translated.kind, undefined);
  assert.equal(result.captionTracks[0], tracklist(input).captionTracks[0]);
  assert.deepEqual(result.audioTracks[0].captionTrackIndices, [0, 1]);
  assert.equal(result.audioTracks[0].defaultCaptionTrackIndex, 0);
});

test('keeps the signed query encoding in the direct-track fallback', () => {
  const baseUrl = SOURCE_URL + '&name=English%20CC~&exp=a%2fb';
  const input = response({ captionTracks: [sourceTrack({ baseUrl })] });
  const translated = tracklist(addHungarianSubtitles(input)).captionTracks[1];
  assert.equal(translated.baseUrl, baseUrl + '&tlang=hu');
});

test('replaces an existing translation target instead of appending duplicates', () => {
  const input = response({
    captionTracks: [sourceTrack({ baseUrl: SOURCE_URL + '&tlang=de&tlang=fr' })]
  });
  const url = new URL(
    tracklist(addHungarianSubtitles(input)).captionTracks[1].baseUrl
  );
  assert.deepEqual(url.searchParams.getAll('tlang'), ['hu']);
  assert.equal(url.searchParams.get('lang'), 'en');
});

test('mirrors a runs label without copying Arabic/ASR metadata', () => {
  const input = response({
    captionTracks: [
      sourceTrack({
        languageCode: 'ar',
        name: { runs: [{ text: 'Arabic' }] },
        rtl: true
      })
    ]
  });
  const translated = tracklist(addHungarianSubtitles(input)).captionTracks[1];
  assert.match(translated.name.runs[0].text, /Magyar/);
  assert.equal(translated.rtl, undefined);
  assert.equal(translated.kind, undefined);
});

test('prefers the default audio and only extends audio menus using that source', () => {
  const input = response({
    captionTracks: [
      sourceTrack(),
      sourceTrack({
        languageCode: 'es',
        baseUrl: SOURCE_URL.replace('lang=en', 'lang=es')
      })
    ],
    audioTracks: [
      { captionTrackIndices: [0], defaultCaptionTrackIndex: 0 },
      { captionTrackIndices: [1], defaultCaptionTrackIndex: 1 },
      { captionTrackIndices: [0, 1] }
    ],
    defaultAudioTrackIndex: 1
  });
  const result = tracklist(addHungarianSubtitles(input));
  assert.equal(
    new URL(result.captionTracks[2].baseUrl).searchParams.get('lang'),
    'es'
  );
  assert.deepEqual(
    result.audioTracks.map((audio) => audio.captionTrackIndices),
    [[0], [1, 2], [0, 1, 2]]
  );
  assert.deepEqual(
    result.audioTracks.map((audio) => audio.defaultCaptionTrackIndex),
    [0, 1, undefined]
  );
});

test('prefers original ASR captions within the same audio menu', () => {
  const input = response({
    captionTracks: [
      sourceTrack(),
      sourceTrack({
        kind: undefined,
        baseUrl: SOURCE_URL.replace('&kind=asr', '') + '&name=manual'
      })
    ],
    audioTracks: [{ captionTrackIndices: [0, 1] }]
  });
  const translated = tracklist(addHungarianSubtitles(input)).captionTracks[2];
  assert.equal(new URL(translated.baseUrl).searchParams.get('kind'), 'asr');
});

test('prefers the original source when the default audio track is dubbed', () => {
  const input = response({
    captionTracks: [
      sourceTrack({
        languageCode: 'de-DE',
        baseUrl:
          SOURCE_URL.replace('lang=en', 'lang=de-DE') +
          '&variant=timing-optimized'
      }),
      sourceTrack()
    ],
    audioTracks: [{ captionTrackIndices: [0] }, { captionTrackIndices: [1] }]
  });
  const parsed = tracklist(addHungarianSubtitles(input));
  const url = new URL(parsed.captionTracks[2].baseUrl);
  assert.equal(url.searchParams.get('lang'), 'en');
  assert.equal(url.searchParams.get('variant'), null);
  assert.deepEqual(
    parsed.audioTracks.map((audio) => audio.captionTrackIndices),
    [[0], [1, 2]]
  );
});

test('adds the direct Hungarian track alongside the native translation menu', () => {
  const languages = [
    { languageCode: 'de', languageName: { simpleText: 'Deutsch' } },
    { languageCode: 'fr', languageName: { simpleText: 'Français' } }
  ];
  const input = freezeDeep(response({ translationLanguages: languages }));
  const original = tracklist(input);
  const result = tracklist(addHungarianSubtitles(input));
  assert.deepEqual(result.translationLanguages, [
    ...languages,
    { languageCode: 'hu', languageName: { simpleText: 'Magyar' } }
  ]);
  assert.equal(result.captionTracks[0], original.captionTracks[0]);
  assert.equal(result.captionTracks[1].languageCode, 'hu');
  assert.deepEqual(result.audioTracks[0].captionTrackIndices, [0, 1]);
  assert.equal(
    result.audioTracks[0].defaultCaptionTrackIndex,
    original.audioTracks[0].defaultCaptionTrackIndex
  );
});

test('keeps the advertised Hungarian translation and one direct track', () => {
  for (const languageCode of ['hu', 'hu-HU']) {
    const input = response({
      translationLanguages: [
        { languageCode, languageName: { simpleText: 'Magyar' } }
      ]
    });
    const parsed = addHungarianSubtitles(input);
    const result = tracklist(parsed);
    assert.equal(
      result.translationLanguages,
      tracklist(input).translationLanguages
    );
    assert.equal(
      result.captionTracks.filter((track) => track.languageCode === 'hu')
        .length,
      1
    );
    assert.equal(addHungarianSubtitles(parsed), parsed);
  }
});

test('matches the native translation menu label format', () => {
  const input = response({
    translationLanguages: [
      { languageCode: 'fr', languageName: { runs: [{ text: 'Français' }] } }
    ]
  });
  const result = tracklist(addHungarianSubtitles(input));
  assert.deepEqual(result.translationLanguages[1], {
    languageCode: 'hu',
    languageName: { runs: [{ text: 'Magyar' }] }
  });
});

test('keeps the manual Hungarian track when the translation menu is empty', () => {
  const result = tracklist(
    addHungarianSubtitles(response({ translationLanguages: [] }))
  );
  assert.equal(result.captionTracks[1].languageCode, 'hu');
  assert.deepEqual(result.translationLanguages, []);
});

test('handles TV responses without translationLanguages or audioTracks', () => {
  const input = response();
  delete tracklist(input).audioTracks;
  const result = tracklist(addHungarianSubtitles(input));
  assert.equal(result.captionTracks.length, 2);
  assert.equal(Object.hasOwn(result, 'translationLanguages'), false);
  assert.equal(Object.hasOwn(result, 'audioTracks'), false);
});

for (const languageCode of ['hu', 'hu-HU', 'HU']) {
  test(`preserves an existing ${languageCode} caption track`, () => {
    const input = response({ captionTracks: [sourceTrack({ languageCode })] });
    assert.equal(addHungarianSubtitles(input), input);
  });
}

test('is idempotent and does not modify frozen source responses', () => {
  const input = freezeDeep(response());
  const result = addHungarianSubtitles(input);
  assert.equal(tracklist(input).captionTracks.length, 1);
  assert.deepEqual(tracklist(input).audioTracks[0].captionTrackIndices, [0]);
  assert.equal(addHungarianSubtitles(result), result);
  assert.equal(tracklist(result).captionTracks.length, 2);
});

test('handles an already parsed nested playerResponse', () => {
  const input = { playerResponse: response(), unrelated: { keep: true } };
  const result = addHungarianSubtitles(input);
  assert.equal(tracklist(result.playerResponse).captionTracks.length, 2);
  assert.equal(result.unrelated, input.unrelated);
  assert.equal(tracklist(input.playerResponse).captionTracks.length, 1);
});

for (const [label, input] of [
  ['null', null],
  ['boolean', true],
  ['number', 1],
  ['string', 'captions'],
  ['array', []],
  ['unrelated response', { contents: [] }],
  ['missing captions', { captions: null }],
  ['missing renderer', { captions: {} }],
  ['missing tracks', response({ captionTracks: null })],
  ['empty tracks', response({ captionTracks: [] })],
  [
    'malformed tracks',
    response({ captionTracks: [null, 1, {}, { baseUrl: SOURCE_URL }] })
  ],
  [
    'explicitly untranslatable',
    response({ captionTracks: [sourceTrack({ isTranslatable: false })] })
  ],
  [
    'excluded from audio menus',
    response({ audioTracks: [{ captionTrackIndices: [] }] })
  ]
]) {
  test(`passes through ${label}`, () => {
    assert.equal(addHungarianSubtitles(input), input);
  });
}

for (const baseUrl of [
  '',
  'not a URL',
  'https://example.com/api/timedtext',
  'https://youtube.com.example.com/api/timedtext',
  'http://www.youtube.com/api/timedtext',
  'https://www.youtube.com/watch?v=test',
  'https://user:password@www.youtube.com/api/timedtext'
]) {
  test(`does not synthesize a caption request from ${baseUrl || 'an empty URL'}`, () => {
    const input = response({ captionTracks: [sourceTrack({ baseUrl })] });
    assert.equal(addHungarianSubtitles(input), input);
  });
}

test('can use a relative timedtext URL', () => {
  const input = response({
    captionTracks: [sourceTrack({ baseUrl: '/api/timedtext?lang=en' })]
  });
  const url = new URL(
    tracklist(addHungarianSubtitles(input)).captionTracks[1].baseUrl
  );
  assert.equal(url.hostname, 'www.youtube.com');
  assert.equal(url.searchParams.get('tlang'), 'hu');
});

test('skips an invalid source and uses another eligible track', () => {
  const input = response({
    captionTracks: [sourceTrack({ baseUrl: 'invalid' }), sourceTrack()],
    audioTracks: [{ captionTrackIndices: [0, 1] }]
  });
  assert.equal(tracklist(addHungarianSubtitles(input)).captionTracks.length, 3);
});

test('the parser preserves the prior hook, receiver, reviver and ad removal', () => {
  const receiver = {};
  let calls = 0;
  const previousParser = function (...args) {
    assert.equal(this, receiver);
    calls++;
    const parsed = JSON.parse(...args);
    delete parsed.adPlacements;
    return parsed;
  };
  const parser = createCaptionParser(previousParser, () => true);
  const input = { ...response(), adPlacements: ['test-ad'], number: 1 };
  const parsed = parser.call(receiver, JSON.stringify(input), (key, value) =>
    key === 'number' ? 2 : value
  );
  assert.equal(calls, 1);
  assert.equal(parsed.number, 2);
  assert.equal(Object.hasOwn(parsed, 'adPlacements'), false);
  assert.equal(tracklist(parsed).captionTracks.length, 2);
});

test('disabled parser returns the exact prior result and respects later toggles', () => {
  const input = response();
  let enabled = false;
  const parser = createCaptionParser(
    () => input,
    () => enabled
  );
  assert.equal(parser('ignored'), input);
  enabled = true;
  assert.equal(tracklist(parser('ignored')).captionTracks.length, 2);
  enabled = false;
  assert.equal(parser('ignored'), input);
});

test('does not swallow original parse errors or reviver errors', () => {
  const parser = createCaptionParser(JSON.parse, () => true);
  assert.throws(() => parser('{invalid'), SyntaxError);
  const expected = new Error('reviver failure');
  assert.throws(
    () =>
      parser('{}', () => {
        throw expected;
      }),
    (err) => err === expected
  );
});

test('returns the original response on a processing failure without leaking URLs', () => {
  const input = response();
  const parser = createCaptionParser(
    () => input,
    () => {
      throw new Error(SOURCE_URL);
    }
  );
  assert.equal(parser('ignored'), input);
  const calls = console.warn.mock.calls;
  assert.equal(calls.length, 1);
  assert.equal(calls[0].arguments.length, 1);
  assert.doesNotMatch(calls[0].arguments[0], /signature|token|https:/);
  assert.equal(tracklist(input).captionTracks.length, 1);
});

const NATIVE_HU = SOURCE_URL.replace('&kind=asr', '&name=manual') + '&tlang=hu';
const ENGLISH_CAPTIONS = {
  events: [
    { id: 1, wpWinPosId: 1 },
    {
      tStartMs: 1500,
      dDurationMs: 2000,
      segs: [{ utf8: 'Good' }, { utf8: ' morning!', tOffsetMs: 200 }]
    },
    {
      tStartMs: 5000,
      dDurationMs: 1000,
      segs: [{ utf8: 'Good morning!' }]
    }
  ]
};

test('uses an alternate original ASR source after an empty native translation', async () => {
  const recovery = createCaptionRecovery();
  addHungarianSubtitles(response(), recovery.register);
  const plan = recovery.plan(NATIVE_HU + '&sq=4');
  const alternate = new URL(plan.alternate);
  const original = new URL(SOURCE_URL);
  assert.equal(
    alternate.searchParams.get('signature'),
    original.searchParams.get('signature')
  );
  assert.equal(
    alternate.searchParams.get('pot'),
    original.searchParams.get('pot')
  );
  assert.equal(alternate.searchParams.get('tlang'), 'hu');
  const hu = JSON.stringify({ events: [{ segs: [{ utf8: 'Jó reggelt!' }] }] });
  const result = await recovery.recover(
    '{"events":[]}',
    plan,
    async (url) => {
      assert.equal(new URL(url).searchParams.get('kind'), 'asr');
      assert.equal(new URL(url).searchParams.get('sq'), '4');
      return new Response(hu);
    },
    () => assert.fail('Google Translate must not run when YouTube recovers')
  );
  assert.equal(result.body, hu);
});

test('the direct Hungarian track falls back to translated cue text with the original timing', async () => {
  const recovery = createCaptionRecovery();
  const input = response({
    translationLanguages: [
      { languageCode: 'hu', languageName: { simpleText: 'Magyar' } }
    ]
  });
  const renderer = tracklist(addHungarianSubtitles(input, recovery.register));
  const plan = recovery.plan(renderer.captionTracks[1].baseUrl);
  assert.equal(plan.alternate, null);
  const result = await recovery.recover(
    '{"events":[{"id":1}]}',
    plan,
    async (url) => {
      assert.equal(url, SOURCE_URL);
      return Response.json(ENGLISH_CAPTIONS);
    },
    async (resource, init) => {
      const url = new URL(resource);
      assert.equal(url.origin, 'https://translate.googleapis.com');
      assert.equal(url.searchParams.get('tl'), 'hu');
      assert.deepEqual(url.searchParams.getAll('q'), ['Good morning!']);
      assert.equal(url.searchParams.has('pot'), false);
      assert.equal(init.credentials, 'omit');
      assert.equal(init.referrerPolicy, 'no-referrer');
      return Response.json([['Jó reggelt!', 'en']]);
    }
  );
  const data = await result.response.json();
  assert.deepEqual(data.events, [
    { id: 1, wpWinPosId: 1 },
    { tStartMs: 1500, dDurationMs: 2000, segs: [{ utf8: 'Jó reggelt!' }] },
    { tStartMs: 5000, dDurationMs: 1000, segs: [{ utf8: 'Jó reggelt!' }] }
  ]);
});

test('preserves a successful Hungarian timedtext response', async () => {
  const recovery = createCaptionRecovery();
  const fetchUnexpected = () =>
    assert.fail('Successful captions need no retry');
  const result = await recovery.recover(
    '{"events":[{"segs":[{"utf8":"Jó reggelt!"}]}]}',
    recovery.plan(NATIVE_HU),
    fetchUnexpected,
    fetchUnexpected
  );
  assert.equal(result, null);
});

test('Google Translate failure leaves the original caption response intact', async () => {
  const recovery = createCaptionRecovery();
  const body = 'WEBVTT\n\n00:00:01.500 --> 00:00:03.500\nGood morning!\n';
  const native = new Response('WEBVTT\n', { status: 200 });
  const transport = {
    XMLHttpRequest: class {
      open() {}
      abort() {}
    },
    async fetch(url) {
      if (url === NATIVE_HU) return native;
      if (new URL(url).hostname === 'translate.googleapis.com')
        return new Response(null, { status: 429 });
      return new Response(body);
    }
  };
  installCaptionRecovery(recovery, transport);
  assert.equal(await transport.fetch(NATIVE_HU), native);
  assert.equal(await native.text(), 'WEBVTT\n');
});

test('leaves French, German, native Hungarian and unrelated requests alone', () => {
  const recovery = createCaptionRecovery();
  for (const resource of [
    SOURCE_URL + '&tlang=fr',
    SOURCE_URL + '&tlang=de',
    SOURCE_URL.replace('lang=en', 'lang=hu'),
    NATIVE_HU.replace('www.youtube.com', 'example.org')
  ])
    assert.equal(recovery.plan(resource), null);
});
