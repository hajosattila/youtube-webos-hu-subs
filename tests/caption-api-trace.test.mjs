import assert from 'node:assert/strict';
import { test } from 'node:test';
import { observeCaptionCalls } from '../src/caption-api-trace.ts';
import { summarizeCaptionValue } from '../src/caption-diagnostics.ts';

test('observing a native CC call preserves this, arguments and return value', () => {
  const calls = [];
  const marker = {};
  const player = {
    toggleSubtitlesOn(...args) {
      assert.equal(this, player);
      assert.deepEqual(args, [true, marker]);
      return marker;
    }
  };
  const original = player.toggleSubtitlesOn;
  const observer = observeCaptionCalls(player, (method, args) =>
    calls.push([method, args])
  );
  assert.equal(player.toggleSubtitlesOn(true, marker), marker);
  assert.deepEqual(calls, [['toggleSubtitlesOn', [true, marker]]]);
  observer.stop();
  assert.equal(player.toggleSubtitlesOn, original);
});

test('an observer error never prevents the native CC action', () => {
  let enabled = false;
  const player = {
    toggleSubtitlesOn(value) {
      enabled = value;
    }
  };
  observeCaptionCalls(player, () => {
    throw new Error('observer failure');
  });
  assert.doesNotThrow(() => player.toggleSubtitlesOn(true));
  assert.equal(enabled, true);
});

test('native exceptions remain unchanged instead of being swallowed', () => {
  const error = new Error('native failure');
  const player = {
    toggleSubtitlesOn() {
      throw error;
    }
  };
  observeCaptionCalls(player, () => {});
  assert.throws(
    () => player.toggleSubtitlesOn(),
    (caught) => caught === error
  );
});

test('unrelated setOption operations are not collected', () => {
  const records = [];
  let count = 0;
  const player = {
    setOption() {
      count++;
    }
  };
  observeCaptionCalls(player, (method, args) => records.push([method, args]));
  player.setOption('quality', 'level', 'high');
  player.setOption('captions', 'track', { languageCode: 'hu' });
  assert.equal(count, 2);
  assert.equal(records.length, 1);
  assert.equal(records[0][1][0], 'captions');
});

test('filtering does not coerce unexpected native arguments', () => {
  let called = false;
  const value = {
    toString() {
      throw new Error('must not be called');
    }
  };
  const player = {
    setOption(arg) {
      assert.equal(arg, value);
      called = true;
    }
  };
  observeCaptionCalls(player, () => {});
  assert.doesNotThrow(() => player.setOption(value));
  assert.equal(called, true);
});

test('read-only exported functions can be skipped without changing them', () => {
  const original = () => true;
  const player = {};
  Object.defineProperty(player, 'toggleSubtitlesOn', {
    value: original,
    writable: false
  });
  const observer = observeCaptionCalls(player, () => {});
  assert.equal(player.toggleSubtitlesOn, original);
  assert.deepEqual(observer.hooked, []);
});

test('safe values preserve real caption identifiers and translation options', () => {
  const text = summarizeCaptionValue({
    languageCode: 'en',
    vss_id: 'a.en',
    translationLanguage: { languageCode: 'hu' }
  });
  assert.match(text, /vss_id=a\.en/);
  assert.match(text, /translationLanguage=.*languageCode=hu/);
  assert.equal(summarizeCaptionValue('.hu'), '.hu');
});

test('tracing caption options never prints signed URLs or credential values', () => {
  const text = summarizeCaptionValue({
    languageCode: 'en',
    baseUrl: 'https://example.com/?token=private-token',
    auth: 'private-auth',
    translationLanguage: { languageCode: 'hu', token: 'private-inner' }
  });
  assert.doesNotMatch(text, /https:|private-/);
});
