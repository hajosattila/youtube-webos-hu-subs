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
    languageCode(track.language) ??
    languageCode(info.id) ??
    languageCode(info.code) ??
    languageCode(track.audioTrackId) ??
    languageCode(track.id)
  );
}

export function mediaAudioSnapshot(video: unknown): {
  tracks: Data[] | null;
  selected: Data | null;
} {
  try {
    if (!isObject(video)) return { tracks: null, selected: null };
    const list = video.audioTracks;
    if (!isObject(list) && !Array.isArray(list))
      return { tracks: null, selected: null };
    const length = (list as { length?: unknown }).length;
    if (
      typeof length !== 'number' ||
      !Number.isInteger(length) ||
      length < 0 ||
      length > 64
    )
      return { tracks: null, selected: null };
    const tracks: Data[] = [];
    for (let i = 0; i < length; i++) {
      const track: unknown = (list as Record<number, unknown>)[i];
      if (!isObject(track)) continue;
      tracks.push({ language: track.language, enabled: track.enabled });
    }
    const enabled = tracks.filter((track) => track.enabled === true);
    // Only the actually enabled native track counts. Do not assume index zero,
    // the first available language, or an opaque media-track ID is the language.
    return {
      tracks,
      selected: enabled.length === 1 ? { language: enabled[0]!.language } : null
    };
  } catch {
    return { tracks: null, selected: null };
  }
}

export interface CaptionPlayer {
  getVideoData(): { video_id?: string | undefined };
  getAudioTrack?(): unknown;
  getPlayerResponse?(): unknown;
  getOption?(module: string, option: string): unknown;
  setOption?(module: string, option: string, value: unknown): void;
  loadModule?(module: string): void;
  unloadModule?(module: string): void;
  getSubtitlesTrackList?(): unknown;
  getSubtitlesTrack?(): unknown;
  setSubtitlesTrack?(track: unknown): void;
  isSubtitlesOn?(): boolean;
  toggleSubtitles?(): void;
  toggleSubtitlesOn?(): void;
}

export class AutomaticCaptions {
  #key: string | null = null;
  #done = false;
  #attempts = 0;
  #loaded = false;
  #selected = false;
  #toggled = false;
  #reported = false;
  #onFailure;
  #language: string | null = null;

  constructor(onFailure: (message: string) => void = console.warn) {
    this.#onFailure = onFailure;
  }

  reset() {
    this.#key = null;
    this.#done = false;
    this.#attempts = 0;
    this.#loaded = false;
    this.#selected = false;
    this.#toggled = false;
    this.#reported = false;
    this.#language = null;
  }

  getStatus() {
    return {
      language: this.#language,
      attempts: this.#attempts,
      done: this.#done,
      loaded: this.#loaded,
      selected: this.#selected,
      toggled: this.#toggled
    };
  }

  update(player: CaptionPlayer, mediaTrack?: unknown) {
    try {
      this.#update(player, mediaTrack);
    } catch {
      // Unsupported/temporarily unavailable player APIs must not break playback.
      this.#attempts++;
      this.#failure('P1: a lejátszó feliratkezelése nem válaszol');
    }
  }

  #update(player: CaptionPlayer, mediaTrack: unknown) {
    const video = player.getVideoData().video_id;
    if (!video) {
      this.reset();
      return;
    }
    const playerLanguage =
      audioLanguage(player.getAudioTrack?.()) ??
      audioLanguage(player.getOption?.('audio', 'track'));
    const nativeLanguage = audioLanguage(mediaTrack);
    const language =
      playerLanguage && nativeLanguage && playerLanguage !== nativeLanguage
        ? null
        : (playerLanguage ?? nativeLanguage);
    // Read the selected audio, never the title, UI language or subtitle language.
    const key = `${video}:${language ?? '?'}`;
    if (key !== this.#key) {
      this.reset();
      this.#key = key;
    }
    this.#language = language;
    if (this.#done || this.#attempts >= 24) return;
    this.#attempts++;
    if (!language) {
      this.#failure('A1: a hangsáv nyelve nem olvasható');
      return;
    }

    // A player can briefly expose the previous video's caption state.
    const response = player.getPlayerResponse?.();
    if (isObject(response) && isObject(response.videoDetails)) {
      const responseVideo = response.videoDetails.videoId;
      if (typeof responseVideo === 'string' && responseVideo !== video) return;
    }

    if (language === 'hu') {
      if (!this.#selected) {
        if (player.isSubtitlesOn?.() === true && player.toggleSubtitles) {
          player.toggleSubtitles();
        } else {
          player.setOption?.('captions', 'track', {});
          player.unloadModule?.('captions');
        }
        this.#selected = true;
      }
      if (player.isSubtitlesOn?.() === false) this.#done = true;
      return;
    }

    // A cached track list does not mean CC is enabled. Always load captions,
    // then explicitly turn CC on when the player exposes its toggle API.
    if (!this.#loaded) {
      player.loadModule?.('captions');
      this.#loaded = true;
    }
    const nativeTracks = player.getSubtitlesTrackList?.();
    const optionTracks = player.getOption?.('captions', 'tracklist');
    const tracks = [nativeTracks, optionTracks].flatMap((list) =>
      Array.isArray(list) ? list : []
    );
    const hungarian = tracks.find(
      (caption: unknown) =>
        isObject(caption) && languageCode(caption.languageCode) === 'hu'
    );
    if (!hungarian) {
      this.#failure('C1: a lejátszó nem kínál magyar feliratsávot');
      return;
    }

    if (
      player.isSubtitlesOn?.() === false &&
      (player.toggleSubtitles || player.toggleSubtitlesOn) &&
      !this.#toggled
    ) {
      (player.toggleSubtitles ?? player.toggleSubtitlesOn)!.call(player);
      this.#toggled = true;
    }

    if (!this.#selected) {
      if (player.setSubtitlesTrack) player.setSubtitlesTrack(hungarian);
      else if (player.setOption)
        player.setOption('captions', 'track', hungarian);
      else {
        this.#failure('C0: a feliratválasztó függvény nem érhető el');
        return;
      }
      this.#selected = true;
    }
    const current =
      player.getSubtitlesTrack?.() ?? player.getOption?.('captions', 'track');
    if (
      player.isSubtitlesOn?.() === true &&
      isObject(current) &&
      languageCode(current.languageCode) === 'hu'
    ) {
      // Only report success after both the CC state and selection are confirmed.
      // Later manual choices must not trigger another toggle or track selection.
      this.#done = true;
      console.info('[subtitles] Foreign audio: Hungarian captions enabled');
    } else {
      this.#failure('C2: a magyar felirat bekapcsolása nem igazolható');
    }
  }

  #failure(message: string) {
    if (this.#attempts >= 24 && !this.#reported) {
      this.#reported = true;
      this.#onFailure(message);
    }
  }
}
