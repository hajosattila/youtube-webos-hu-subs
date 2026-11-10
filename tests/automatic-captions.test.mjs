import assert from 'node:assert/strict';
import { test } from 'node:test';
import { audioLanguage, AutomaticCaptions } from '../src/automatic-captions.ts';
import { addHungarianSubtitles } from '../src/subtitle-tracks.ts';
import { captionDiagnostics } from '../src/caption-diagnostics.ts';

test('audio diagnostics show API availability and actual locale fields', () => {
  const summary = captionDiagnostics({
    getAudioTrack: () => ({ language: 'en', id: 'en.0' }),
    getAvailableAudioTracks: () => [{ languageInfo: { id: 'hu' } }]
  });
  assert.match(summary, /getAudioTrack:1/);
  assert.match(summary, /getOption:0/);
  assert.match(summary, /language=en/);
  assert.match(summary, /id=en\.0/);
  assert.match(summary, /L=.*id=hu/);
});

test('audio diagnostics never print arbitrary values, URLs or credential fields', () => {
  const summary = captionDiagnostics({
    getAudioTrack: () => ({
      languageCode: 'https://example.com/?token=private-token',
      token: 'private-token',
      auth: 'private-auth',
      languageInfo: { id: 'hu', token: 'private-inner' }
    }),
    getVideoData: () => ({ title: 'private-title', author: 'private-author' }),
    getPlayerResponse: () => ({
      streamingData: {
        adaptiveFormats: [
          {
            url: 'https://example.com/private-media',
            audioTrack: { id: 'en.0', token: 'private-token' }
          }
        ]
      }
    })
  });
  assert.doesNotMatch(summary, /https:|private-/);
  assert.match(summary, /id=hu/);
});

test('audio diagnostics do not invoke getters on returned track objects', () => {
  const track = {};
  Object.defineProperty(track, 'language', {
    get() {
      throw new Error('secret getter');
    }
  });
  assert.doesNotThrow(() => captionDiagnostics({ getAudioTrack: () => track }));
});

test('audio diagnostics tolerate missing and throwing player APIs', () => {
  assert.doesNotThrow(() =>
    captionDiagnostics({
      getAudioTrack() {
        throw new Error('secret');
      }
    })
  );
  assert.equal(captionDiagnostics(null), 'DIAG: no player');
});

function fixture() {
  const hu = { languageCode: 'hu', vss_id: '.hu', displayName: 'Magyar' };
  const state = {
    video: 'video-1',
    audio: { languageCode: 'en' },
    tracks: [hu],
    selection: {},
    enabled: false,
    toggles: 0,
    calls: [],
    loads: 0,
    unloads: 0
  };
  const player = {
    getVideoData: () => ({ video_id: state.video }),
    getAudioTrack: () => state.audio,
    getPlayerResponse: () => ({ videoDetails: { videoId: state.video } }),
    getOption: (_module, key) =>
      key === 'tracklist' ? state.tracks : state.selection,
    setOption: (module, key, value) => {
      state.calls.push({ module, key, value });
      state.selection = value;
    },
    loadModule: () => {
      state.loads++;
    },
    unloadModule: () => {
      state.unloads++;
      state.enabled = false;
    },
    isSubtitlesOn: () => state.enabled,
    toggleSubtitles: () => {
      state.toggles++;
      state.enabled = !state.enabled;
    }
  };
  return { player, state, hu, controller: new AutomaticCaptions() };
}

for (const [track, expected] of [
  [{ languageCode: 'en-US' }, 'en'],
  [{ languageCode: 'hu-HU' }, 'hu'],
  [{ languageInfo: { id: 'hu' } }, 'hu'],
  [{ languageInfo: { code: 'en' } }, 'en'],
  [{ audioTrackId: 'hu.0' }, 'hu'],
  [{ id: 'en.1' }, 'en'],
  ['hu.0', 'hu'],
  [{ languageCode: 'hun' }, 'hu'],
  [null, null],
  [{}, null],
  [{ displayName: 'English' }, null],
  [{ id: '0' }, null],
  [{ languageCode: 'und' }, null],
  [{ languageCode: 'mul' }, null],
  [{ languageCode: 'zxx' }, null]
]) {
  test(`reads selected audio language ${JSON.stringify(track)}`, () => {
    assert.equal(audioLanguage(track), expected);
  });
}

test('English audio selects the actual Hungarian track object', () => {
  const { player, state, hu, controller } = fixture();
  controller.update(player);
  assert.equal(state.selection, hu);
  assert.equal(state.calls[0].module, 'captions');
  assert.equal(state.calls[0].key, 'track');
  assert.equal(state.audio.languageCode, 'en');
});

test('Hungarian audio turns captions off and never loads captions', () => {
  const { player, state, controller } = fixture();
  state.audio = { id: 'hu.0' };
  state.selection = state.tracks[0];
  controller.update(player);
  assert.deepEqual(state.selection, {});
  assert.equal(state.loads, 0);
  assert.equal(state.unloads, 1);
});

test('manual subtitle disabling is preserved after automatic enabling', () => {
  const { player, state, controller } = fixture();
  controller.update(player);
  state.selection = {};
  state.enabled = false;
  for (let i = 0; i < 30; i++) controller.update(player);
  assert.deepEqual(state.selection, {});
  assert.equal(state.calls.length, 1);
  assert.equal(state.toggles, 1);
});

test('manual subtitle enabling is preserved on Hungarian audio', () => {
  const { player, state, hu, controller } = fixture();
  state.audio = { languageCode: 'hu' };
  controller.update(player);
  state.selection = hu;
  controller.update(player);
  assert.equal(state.selection, hu);
  assert.equal(state.unloads, 1);
});

test('new videos reapply the default without changing the audio', () => {
  const { player, state, controller } = fixture();
  controller.update(player);
  state.video = 'video-2';
  state.audio = { languageCode: 'hu' };
  controller.update(player);
  assert.equal(state.enabled, false);
  state.video = 'video-3';
  state.audio = { languageCode: 'de' };
  controller.update(player);
  assert.equal(state.selection.languageCode, 'hu');
  assert.equal(state.audio.languageCode, 'de');
});

test('switching between Hungarian and English within a video updates captions', () => {
  const { player, state, controller } = fixture();
  controller.update(player);
  state.audio = { languageCode: 'hu' };
  controller.update(player);
  assert.equal(state.enabled, false);
  state.audio = { languageCode: 'en' };
  controller.update(player);
  assert.equal(state.selection.languageCode, 'hu');
});

test('unknown audio does not infer language from available Hungarian captions', () => {
  const { player, state, controller } = fixture();
  state.audio = {};
  controller.update(player);
  assert.equal(state.calls.length, 0);
  assert.equal(state.loads, 0);
});

test('waits for delayed audio metadata', () => {
  const { player, state, controller } = fixture();
  state.audio = null;
  controller.update(player);
  state.audio = { languageInfo: { id: 'en' } };
  controller.update(player);
  assert.equal(state.selection.languageCode, 'hu');
});

test('loads captions once and waits for a delayed track list', () => {
  const { player, state, hu, controller } = fixture();
  state.tracks = [];
  controller.update(player);
  controller.update(player);
  assert.equal(state.loads, 1);
  assert.equal(state.calls.length, 0);
  state.tracks = [hu];
  controller.update(player);
  assert.equal(state.selection, hu);
});

test('missing captions cause bounded retries without selecting an invalid track', () => {
  const { player, state, controller } = fixture();
  state.tracks = [];
  for (let i = 0; i < 50; i++) controller.update(player);
  assert.equal(state.calls.length, 0);
  assert.equal(state.loads, 1);
});

test('a new video can recover after a timeout', () => {
  const { player, state, hu, controller } = fixture();
  state.tracks = [];
  for (let i = 0; i < 30; i++) controller.update(player);
  state.video = 'next-video';
  state.tracks = [hu];
  controller.update(player);
  assert.equal(state.selection, hu);
});

test('does not use the previous video response during navigation', () => {
  const { player, state, controller } = fixture();
  player.getPlayerResponse = () => ({ videoDetails: { videoId: 'old-video' } });
  controller.update(player);
  assert.equal(state.calls.length, 0);
});

test('missing player APIs and temporary API exceptions do not break playback', () => {
  const { player, state, controller } = fixture();
  const getAudioTrack = player.getAudioTrack;
  delete player.getAudioTrack;
  assert.doesNotThrow(() => controller.update(player));
  player.getAudioTrack = () => {
    throw new Error('not ready');
  };
  assert.doesNotThrow(() => controller.update(player));
  assert.equal(state.calls.length, 0);
  player.getAudioTrack = getAudioTrack;
  controller.update(player);
  assert.equal(state.selection.languageCode, 'hu');
});

test('an idle player does not select captions', () => {
  const { player, state, controller } = fixture();
  state.video = undefined;
  controller.update(player);
  assert.equal(state.calls.length, 0);
});

test('CC is enabled even when the Hungarian track list is already cached', () => {
  const { player, state, hu, controller } = fixture();
  state.selection = hu;
  controller.update(player);
  assert.equal(state.loads, 1);
  assert.equal(state.toggles, 1);
  assert.equal(state.enabled, true);
  assert.equal(state.selection, hu);
});

test('restarting the app enables CC again on the same video', () => {
  const { player, state, controller } = fixture();
  controller.update(player);
  assert.equal(state.enabled, true);
  // Selection survives app closure but the CC switch does not.
  state.enabled = false;
  const restarted = new AutomaticCaptions();
  restarted.update(player);
  assert.equal(state.enabled, true);
  assert.equal(state.selection.languageCode, 'hu');
  assert.equal(state.toggles, 2);
});

test('does not toggle CC off if subtitles are already on', () => {
  const { player, state, controller } = fixture();
  state.enabled = true;
  controller.update(player);
  assert.equal(state.enabled, true);
  assert.equal(state.toggles, 0);
});

test('a delayed CC toggle is requested only once and then confirmed', () => {
  const { player, state, controller } = fixture();
  player.toggleSubtitles = () => {
    state.toggles++;
  };
  for (let i = 0; i < 4; i++) controller.update(player);
  assert.equal(state.toggles, 1);
  state.enabled = true;
  controller.update(player);
  state.enabled = false;
  controller.update(player);
  assert.equal(state.enabled, false);
  assert.equal(state.toggles, 1);
});

test('supports TV-native caption APIs without the getOption interface', () => {
  const { player, state, controller } = fixture();
  delete player.getOption;
  delete player.setOption;
  player.getSubtitlesTrackList = () => state.tracks;
  player.getSubtitlesTrack = () => state.selection;
  player.setSubtitlesTrack = (track) => {
    state.selection = track;
  };
  controller.update(player);
  assert.equal(state.enabled, true);
  assert.equal(state.selection.languageCode, 'hu');
});

test('a no-op track setter is not counted as successful activation', () => {
  const { player } = fixture();
  const failures = [];
  player.setOption = () => {};
  const controller = new AutomaticCaptions((reason) => failures.push(reason));
  for (let i = 0; i < 30; i++) controller.update(player);
  assert.equal(failures.length, 1);
  assert.match(failures[0], /^C2:/);
});

test('a player that cannot enable CC reports the activation failure once', () => {
  const { player } = fixture();
  delete player.toggleSubtitles;
  const failures = [];
  const controller = new AutomaticCaptions((reason) => failures.push(reason));
  for (let i = 0; i < 30; i++) controller.update(player);
  assert.equal(failures.length, 1);
  assert.match(failures[0], /^C2:/);
});

test('does not toggle on an unrelated language when Hungarian captions are absent', () => {
  const { player, state, controller } = fixture();
  state.tracks = [{ languageCode: 'en' }];
  for (let i = 0; i < 30; i++) controller.update(player);
  assert.equal(state.enabled, false);
  assert.equal(state.toggles, 0);
});

test('Hungarian audio disables an already active CC switch once', () => {
  const { player, state, controller } = fixture();
  state.audio = { languageCode: 'hu' };
  state.enabled = true;
  controller.update(player);
  assert.equal(state.enabled, false);
  assert.equal(state.toggles, 1);
  state.enabled = true;
  controller.update(player);
  assert.equal(state.enabled, true);
  assert.equal(state.toggles, 1);
});

test('unreadable audio metadata produces a useful bounded diagnosis', () => {
  const { player, state } = fixture();
  state.audio = null;
  const failures = [];
  const controller = new AutomaticCaptions((reason) => failures.push(reason));
  for (let i = 0; i < 30; i++) controller.update(player);
  assert.equal(failures.length, 1);
  assert.match(failures[0], /^A1:/);
});

test('the injected Hungarian caption can be selected by the automatic policy', () => {
  const data = addHungarianSubtitles({
    captions: {
      playerCaptionsTracklistRenderer: {
        captionTracks: [
          {
            languageCode: 'en',
            baseUrl: 'https://www.youtube.com/api/timedtext?lang=en',
            isTranslatable: true
          }
        ],
        audioTracks: [{ captionTrackIndices: [0] }]
      }
    }
  });
  const { player, state, controller } = fixture();
  state.tracks = data.captions.playerCaptionsTracklistRenderer.captionTracks;
  controller.update(player);
  assert.equal(state.selection.languageCode, 'hu');
  assert.equal(
    new URL(state.selection.baseUrl).searchParams.get('tlang'),
    'hu'
  );
});
