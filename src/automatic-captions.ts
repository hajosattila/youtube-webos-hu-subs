type Data = Record<string, unknown>;

function isObject(value: unknown): value is Data {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function languageCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  // Audio IDs commonly encode the locale and a numeric track number: en.0.
  const match = /^([a-z]{2,3})(?:-[a-z0-9]+)*(?:\.\d+)?$/i.exec(value);
  const language = match?.[1]?.toLowerCase();
  if (!language || ['und', 'mul', 'zxx'].includes(language)) return null;
  return language === 'hun' ? 'hu' : language;
}

export function audioLanguage(track: unknown): string | null {
  if (typeof track === 'string') return languageCode(track);
  if (!isObject(track)) return null;
  const info = isObject(track.languageInfo) ? track.languageInfo : {};
  return (
    languageCode(track.languageCode) ??
    languageCode(info.id) ??
    languageCode(info.code) ??
    languageCode(track.audioTrackId) ??
    languageCode(track.id)
  );
}

export interface CaptionPlayer {
  getVideoData(): { video_id?: string | undefined };
  getAudioTrack?(): unknown;
  getPlayerResponse?(): unknown;
  getOption?(module: string, option: string): unknown;
  setOption?(module: string, option: string, value: unknown): void;
  loadModule?(module: string): void;
  unloadModule?(module: string): void;
}

export class AutomaticCaptions {
  #key: string | null = null;
  #done = false;
  #attempts = 0;
  #loaded = false;

  reset() {
    this.#key = null;
    this.#done = false;
    this.#attempts = 0;
    this.#loaded = false;
  }

  update(player: CaptionPlayer) {
    try {
      this.#update(player);
    } catch {
      // Unsupported/temporarily unavailable player APIs must not break playback.
      this.#attempts++;
    }
  }

  #update(player: CaptionPlayer) {
    const video = player.getVideoData().video_id;
    if (!video) {
      this.reset();
      return;
    }
    if (!player.getOption || !player.setOption || !player.getAudioTrack) return;

    const track = player.getAudioTrack();
    const language = audioLanguage(track);
    // Read the selected audio, never the title, UI language or subtitle language.
    if (!language) return;

    const key = `${video}:${language}`;
    if (key !== this.#key) {
      this.reset();
      this.#key = key;
    }
    if (this.#done || this.#attempts >= 24) return;

    // A player can briefly expose the previous video's caption state.
    const response = player.getPlayerResponse?.();
    if (isObject(response) && isObject(response.videoDetails)) {
      const responseVideo = response.videoDetails.videoId;
      if (typeof responseVideo === 'string' && responseVideo !== video) return;
    }

    this.#attempts++;
    if (language === 'hu') {
      player.setOption('captions', 'track', {});
      player.unloadModule?.('captions');
      this.#done = true;
      console.info('[subtitles] Hungarian audio: automatic captions off');
      return;
    }

    const tracks = player.getOption('captions', 'tracklist');
    const hungarian = Array.isArray(tracks)
      ? tracks.find(
          (caption: unknown) =>
            isObject(caption) && languageCode(caption.languageCode) === 'hu'
        )
      : undefined;
    if (!hungarian) {
      if (!this.#loaded) {
        player.loadModule?.('captions');
        this.#loaded = true;
      }
      return;
    }

    player.setOption('captions', 'track', hungarian);
    // Apply once per video/audio language. Later manual choices take precedence.
    this.#done = true;
    console.info('[subtitles] Foreign audio: Hungarian captions selected');
  }
}
