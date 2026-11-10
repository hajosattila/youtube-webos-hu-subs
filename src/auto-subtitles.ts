import {
  AutomaticCaptions,
  mediaAudioSnapshot,
  type CaptionPlayer
} from './automatic-captions';
import { getPlayerManager, PlayerMode } from './player_api';
import { showNotification } from './ui';
import { captionDiagnostics } from './caption-diagnostics';

getPlayerManager()
  .then((manager) => {
    const automatic = new AutomaticCaptions((message) => {
      console.warn('[subtitles]', message);
      if (message.startsWith('A1:') || message.startsWith('C2:')) {
        const diagnosis = captionDiagnostics(
          manager.player,
          mediaAudioSnapshot(document.querySelector('video')),
          message.slice(0, 2)
        );
        console.info('[subtitles]', diagnosis);
        showNotification(diagnosis, 60000);
      } else {
        showNotification(`Automatikus felirat: ${message}`, 10000);
      }
    });
    const update = () => {
      if (manager.playerMode !== PlayerMode.NORMAL) return;
      const media = mediaAudioSnapshot(document.querySelector('video'));
      automatic.update(
        manager.player as typeof manager.player & CaptionPlayer,
        media.selected
      );
    };
    manager.addEventListener('newVideo', () => {
      automatic.reset();
      update();
    });
    manager.addEventListener('playbackStart', update);
    // Audio switching need not change playback state. Keep observing, but never
    // repeatedly enforce a caption choice after the initial policy was applied.
    window.setInterval(update, 500);
    update();
  })
  .catch(() => console.warn('[subtitles] Automatic caption setup unavailable'));
