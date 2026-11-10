import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import { transformSync } from '@babel/core';
import {
  AutomaticCaptions,
  mediaAudioSnapshot
} from '../src/automatic-captions.ts';
import { captionDiagnostics } from '../src/caption-diagnostics.ts';

const source = readFileSync(
  new URL('../src/auto-subtitles.ts', import.meta.url),
  'utf8'
);
const { code } = transformSync(source, {
  filename: 'auto-subtitles.ts',
  configFile: false,
  babelrc: false,
  presets: [
    ['@babel/preset-env', { targets: { node: '22' }, modules: 'commonjs' }],
    '@babel/preset-typescript'
  ]
});

async function boot({
  ready = true,
  mode = 2,
  video = 'video',
  language = 'und',
  tracks = []
} = {}) {
  let now = 0;
  let nextId = 1;
  const timers = new Map();
  const notices = [];
  const schedule = (fn, delay, interval = 0) => {
    const id = nextId++;
    timers.set(id, { fn, at: now + delay, interval });
    return id;
  };
  const player = {
    getVideoData: () => ({ video_id: video }),
    getAudioTrack: () => ({ id: language }),
    getOption: (_module, option) => (option === 'tracklist' ? tracks : null),
    getPlayerResponse: () => ({ videoDetails: { videoId: video } }),
    setOption() {},
    loadModule() {},
    unloadModule() {},
    isSubtitlesOn: () => false
  };
  const manager = { player, playerMode: mode, addEventListener() {} };
  const modules = {
    './automatic-captions': { AutomaticCaptions, mediaAudioSnapshot },
    './caption-diagnostics': { captionDiagnostics },
    './player_api': {
      PlayerMode: { NORMAL: 2 },
      getPlayerManager: () =>
        ready ? Promise.resolve(manager) : new Promise(() => {})
    },
    './ui': { showNotification: (text) => notices.push(text) }
  };
  vm.runInNewContext(code, {
    require: (name) => {
      assert.ok(name in modules, name);
      return modules[name];
    },
    exports: {},
    console: { warn() {}, info() {} },
    document: { querySelector: () => null, addEventListener() {} },
    window: {
      setTimeout: (fn, delay) => schedule(fn, delay),
      setInterval: (fn, delay) => schedule(fn, delay, delay),
      clearTimeout: (id) => timers.delete(id)
    }
  });
  await Promise.resolve();
  await Promise.resolve();
  return {
    notices,
    advance(duration) {
      const end = now + duration;
      for (let steps = 0; steps < 1000; steps++) {
        const next = [...timers.entries()]
          .filter(([, timer]) => timer.at <= end)
          .sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        const [id, timer] = next;
        now = timer.at;
        if (timer.interval) timer.at += timer.interval;
        else timers.delete(id);
        timer.fn();
      }
      now = end;
    }
  };
}

test('runtime displays a build marker before player initialization', async () => {
  const app = await boot({ ready: false });
  app.advance(1000);
  assert.equal(app.notices.length, 1);
  assert.match(app.notices[0], /HU AUTO D3.*0\.5\.4/);
});

test('runtime diagnoses a player manager that never becomes ready', async () => {
  const app = await boot({ ready: false });
  app.advance(21000);
  assert.ok(app.notices.some((text) => text.includes('P0:')));
});

test('runtime shows a snapshot even when playback is filtered out by player mode', async () => {
  const app = await boot({ mode: 0 });
  app.advance(16000);
  assert.ok(
    app.notices.some((text) => text.includes('MODE=0') && text.includes('DIAG'))
  );
});

test('runtime shows a snapshot after a supposedly successful Hungarian-audio decision', async () => {
  const app = await boot({ language: 'hu' });
  app.advance(16000);
  assert.ok(
    app.notices.some(
      (text) => text.includes('"done":true') && text.includes('"language":"hu"')
    )
  );
});

test('runtime reports an empty caption list instead of silently stopping', async () => {
  const app = await boot({ language: 'en' });
  app.advance(16000);
  assert.ok(app.notices.some((text) => text.includes('C1:')));
  assert.equal(app.notices.filter((text) => text.includes('DIAG')).length, 1);
});

test('runtime reports a missing video ID without requiring manual DevTools', async () => {
  const app = await boot({ video: '' });
  app.advance(21000);
  assert.ok(app.notices.some((text) => text.includes('V0:')));
});
