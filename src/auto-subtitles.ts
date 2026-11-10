import {
  AutomaticCaptions,
  mediaAudioSnapshot,
  type CaptionPlayer
} from './automatic-captions';
import { getPlayerManager, PlayerMode } from './player_api';
import { showNotification } from './ui';
import { captionDiagnostics } from './caption-diagnostics';

const BUILD = 'HU AUTO D3 – 0.5.4';
let managerReady = false;

function notify(text: string, duration = 60000) {
  try {
    showNotification(text, duration);
  } catch {
    console.warn('[subtitles] Diagnostic display unavailable');
  }
}

window.setTimeout(() => notify(`${BUILD}\nDiagnosztika elindult`, 8000), 1000);
window.setTimeout(() => {
  if (!managerReady) notify(`${BUILD}\nP0: a lejátszó nem érhető el`);
}, 20000);

getPlayerManager()
  .then((manager) => {
    managerReady = true;
    let observedVideo: string | null = null;
    let shown = false;
    let mode = 'init';
    let watchdog: number | undefined;
    const automatic = new AutomaticCaptions((message) => snapshot(message));

    function snapshot(reason: string) {
      if (shown) return;
      shown = true;
      try {
        const diagnosis = captionDiagnostics(
          manager.player,
          mediaAudioSnapshot(document.querySelector('video')),
          'D3'
        );
        notify(
          `${BUILD}\n${reason}\nMODE=${mode}\nSTATE=${JSON.stringify(automatic.getStatus())}\n${diagnosis}`
        );
      } catch {
        notify(`${BUILD}\nD0: a részletes állapot nem olvasható`);
      }
    }

    const update = () => {
      try {
        const video = manager.player.getVideoData().video_id;
        if (video && video !== observedVideo) {
          observedVideo = video;
          shown = false;
          window.clearTimeout(watchdog);
          // Show a snapshot even if a branch never reports a failure, or thinks
          // it has finished. Diagnostic builds must not stop silently.
          watchdog = window.setTimeout(
            () => snapshot('Állapot 15 másodperc után'),
            15000
          );
        }
        const currentMode = manager.playerMode;
        mode = String(currentMode);
        if (currentMode !== PlayerMode.NORMAL) return;
        const media = mediaAudioSnapshot(document.querySelector('video'));
        automatic.update(
          manager.player as typeof manager.player & CaptionPlayer,
          media.selected
        );
      } catch {
        snapshot('P2: a lejátszó állapotának kiolvasása sikertelen');
      }
    };
    manager.addEventListener('newVideo', () => {
      automatic.reset();
      update();
    });
    manager.addEventListener('playbackStart', update);
    window.setTimeout(() => {
      if (!observedVideo) snapshot('V0: a videóazonosító nem érhető el');
    }, 20000);
    document.addEventListener('webOSRelaunch', () => {
      automatic.reset();
      observedVideo = null;
      update();
    });
    window.setInterval(update, 500);
    update();
  })
  .catch(() =>
    notify(`${BUILD}\nP0: az automatikus felirat nem tudott elindulni`)
  );
