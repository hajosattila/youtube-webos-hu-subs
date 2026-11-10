import { AutomaticCaptions, type CaptionPlayer } from './automatic-captions';
import { getPlayerManager, PlayerMode } from './player_api';

getPlayerManager()
  .then((manager) => {
    const automatic = new AutomaticCaptions();
    const update = () => {
      if (manager.playerMode !== PlayerMode.NORMAL) return;
      automatic.update(manager.player as typeof manager.player & CaptionPlayer);
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
