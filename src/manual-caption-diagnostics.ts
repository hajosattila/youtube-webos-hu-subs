import { getPlayerManager } from './player_api';
import { observeCaptionCalls } from './caption-api-trace';
import { summarizeCaptionValue } from './caption-diagnostics';

const BUILD = 'HU CC TRACE – 0.5.5';
let panel: HTMLPreElement | null = null;
function display(text: string) {
  if (!document.body) return;
  if (!panel) {
    panel = document.createElement('pre');
    Object.assign(panel.style, {
      position: 'fixed',
      top: '1em',
      left: '1em',
      maxWidth: '92vw',
      maxHeight: '72vh',
      overflow: 'hidden',
      whiteSpace: 'pre-wrap',
      fontSize: '20px',
      lineHeight: '1.25',
      padding: '16px',
      color: 'white',
      background: 'rgba(0,0,0,0.85)',
      zIndex: '2147483647',
      pointerEvents: 'none'
    });
    document.body.appendChild(panel);
  }
  panel.textContent = text;
}

window.setTimeout(
  () =>
    display(
      `${BUILD}\nAutomatika kikapcsolva ebben a mérésben.\nIndíts el egy angol videót, majd nyomd meg egyszer a CC-t.`
    ),
  1000
);

getPlayerManager()
  .then((manager) => {
    const player = manager.player as typeof manager.player &
      Record<string, unknown>;
    const entries: string[] = [];
    let scheduled: number | undefined;
    let stage = 'CC előtt';
    let before: string[] | null = null;
    function read(method: string, ...args: unknown[]) {
      try {
        const fn = player[method];
        return typeof fn === 'function'
          ? Reflect.apply(fn, player, args)
          : undefined;
      } catch {
        return undefined;
      }
    }
    function show() {
      const id = read('getCaptionWindowContainerId');
      const container =
        typeof id === 'string' ? document.getElementById(id) : null;
      const nativeText = container?.textContent?.length ?? -1;
      const text = [
        BUILD,
        'Automatika kikapcsolva – csak a kézi CC-műveletet figyeli.',
        stage,
        ...(before ?? ['BEFORE: még nincs kézi művelet']),
        `CC=${summarizeCaptionValue(read('isSubtitlesOn'))}`,
        `SELECTED=${summarizeCaptionValue(read('getOption', 'captions', 'track'))}`,
        `TRACKS=${summarizeCaptionValue(read('getOption', 'captions', 'tracklist'))}`,
        `ASR=${summarizeCaptionValue(read('getOption', 'captions', 'tracklist', { includeAsr: true }))}`,
        `CAPTION-TEXT-LENGTH=${nativeText}`,
        `HOOK=${observer.hooked.join(',')}`,
        ...entries.slice(-8)
      ].join('\n');
      display(text);
    }
    function captureBefore() {
      if (before) return;
      before = [
        `BEFORE CC=${summarizeCaptionValue(read('isSubtitlesOn'))}`,
        `BEFORE SELECTED=${summarizeCaptionValue(read('getOption', 'captions', 'track'))}`
      ];
    }
    function schedule() {
      window.clearTimeout(scheduled);
      scheduled = window.setTimeout(show, 1000);
    }
    const observer = observeCaptionCalls(player, (method, args) => {
      captureBefore();
      const allowed = new Set([
        'captions',
        'subtitles',
        'track',
        'tracklist',
        'reload'
      ]);
      const safe = args.map((arg) =>
        typeof arg === 'string' && allowed.has(arg)
          ? arg
          : summarizeCaptionValue(arg)
      );
      entries.push(`${method}(${safe.join(',')})`);
      if (entries.length > 16) entries.shift();
      stage = 'CC-művelet után';
      schedule();
    });
    // A Leanback control may call internal methods instead of the public export.
    // Observe the UI event too, then read state after the native handler completes.
    document.addEventListener(
      'click',
      () => {
        captureBefore();
        stage = 'Kattintás után';
        schedule();
      },
      true
    );
    document.addEventListener(
      'keydown',
      (event) => {
        if (event.keyCode === 13 || event.keyCode === 67) {
          captureBefore();
          stage = 'Gombnyomás után';
          schedule();
        }
      },
      true
    );
    manager.addEventListener('newVideo', () => {
      entries.length = 0;
      before = null;
      stage = 'Új videó';
      schedule();
    });
    show();
  })
  .catch(() => display(`${BUILD}\nA lejátszó megfigyelése nem indult el.`));
