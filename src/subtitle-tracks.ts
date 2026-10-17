// Based on the approach in webosbrew/youtube-webos#472.
type JsonObject = Record<string, unknown>;

const HUNGARIAN_LABEL = 'Magyar (automatikus fordítás)';

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isHungarian(value: unknown) {
  return typeof value === 'string' && /^hu(?:-|$)/i.test(value);
}

function translatedUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null;

  try {
    const url = new URL(value, 'https://www.youtube.com');
    if (
      url.protocol !== 'https:' ||
      (url.hostname !== 'youtube.com' &&
        !url.hostname.endsWith('.youtube.com')) ||
      url.pathname !== '/api/timedtext' ||
      url.username ||
      url.password
    )
      return null;

    // Keep the source language and all authorization parameters intact.
    url.searchParams.set('tlang', 'hu');
    return url.toString();
  } catch {
    return null;
  }
}

function translateTracklist(renderer: JsonObject): JsonObject | null {
  const captionTracks = renderer.captionTracks;
  if (!Array.isArray(captionTracks)) return null;
  const tracks: unknown[] = captionTracks;
  if (
    tracks.length === 0 ||
    tracks.some((track) => isObject(track) && isHungarian(track.languageCode))
  )
    return null;

  const audioTracks = Array.isArray(renderer.audioTracks)
    ? renderer.audioTracks
    : null;
  const defaultAudioIndex = Number.isInteger(renderer.defaultAudioTrackIndex)
    ? (renderer.defaultAudioTrackIndex as number)
    : 0;
  const defaultAudio = audioTracks?.[defaultAudioIndex];
  const preferredIndices =
    isObject(defaultAudio) && Array.isArray(defaultAudio.captionTrackIndices)
      ? defaultAudio.captionTrackIndices
      : [];

  function findSource(indices: unknown[], preferManual: boolean) {
    for (const index of indices) {
      if (typeof index !== 'number' || !Number.isInteger(index)) continue;
      const track = tracks[index];
      if (
        !isObject(track) ||
        typeof track.languageCode !== 'string' ||
        !track.languageCode ||
        track.isTranslatable === false ||
        (preferManual && track.kind === 'asr')
      )
        continue;

      // Do not offer a source excluded from every audio track's caption menu.
      if (
        audioTracks?.length &&
        !audioTracks.some(
          (audio) =>
            isObject(audio) &&
            Array.isArray(audio.captionTrackIndices) &&
            audio.captionTrackIndices.includes(index)
        )
      )
        continue;

      const baseUrl = translatedUrl(track.baseUrl);
      if (baseUrl) return { track, index, baseUrl };
    }
    return null;
  }

  const indices = tracks.map((_track, index) => index);
  const source =
    findSource(preferredIndices, true) ??
    findSource(preferredIndices, false) ??
    findSource(indices, true) ??
    findSource(indices, false);
  if (!source) return null;

  // Only copy caption metadata for the target language. In particular, an
  // Arabic source's rtl flag or an ASR source's kind must not label this track.
  const name =
    isObject(source.track.name) && Array.isArray(source.track.name.runs)
      ? { runs: [{ text: HUNGARIAN_LABEL }] }
      : { simpleText: HUNGARIAN_LABEL };
  const result: JsonObject = {
    ...renderer,
    captionTracks: [
      ...tracks,
      {
        baseUrl: source.baseUrl,
        name,
        vssId: '.hu',
        languageCode: 'hu',
        isTranslatable: true,
        trackName: HUNGARIAN_LABEL
      }
    ]
  };

  if (audioTracks) {
    result.audioTracks = audioTracks.map((audio) =>
      isObject(audio) &&
      Array.isArray(audio.captionTrackIndices) &&
      audio.captionTrackIndices.includes(source.index)
        ? {
            ...audio,
            captionTrackIndices: [...audio.captionTrackIndices, tracks.length]
          }
        : audio
    );
  }

  // Some clients expose the native Auto-translate menu as well as captionTracks.
  const languages = renderer.translationLanguages;
  if (
    Array.isArray(languages) &&
    !languages.some((lang) => isObject(lang) && isHungarian(lang.languageCode))
  ) {
    result.translationLanguages = [
      ...languages,
      { languageCode: 'hu', languageName: { simpleText: 'Magyar' } }
    ];
  }

  return result;
}

function translatePlayerResponse(response: JsonObject): JsonObject {
  const captions = response.captions;
  if (!isObject(captions)) return response;
  const renderer = captions.playerCaptionsTracklistRenderer;
  if (!isObject(renderer)) return response;
  const translated = translateTracklist(renderer);
  if (!translated) return response;

  return {
    ...response,
    captions: { ...captions, playerCaptionsTracklistRenderer: translated }
  };
}

export function addHungarianSubtitles(value: unknown): unknown {
  if (!isObject(value)) return value;
  let result = translatePlayerResponse(value);
  // Also handle responses that wrap an already parsed playerResponse object.
  if (isObject(value.playerResponse)) {
    const playerResponse = translatePlayerResponse(value.playerResponse);
    if (playerResponse !== value.playerResponse)
      result = { ...result, playerResponse };
  }
  return result;
}

export function createCaptionParser(
  originalParse: typeof JSON.parse,
  isEnabled: () => boolean
): typeof JSON.parse {
  return function (this: unknown, ...args: Parameters<typeof JSON.parse>) {
    // Keep parse errors, revivers and any previously installed hook intact.
    const result = originalParse.apply(this, args);
    try {
      if (!isEnabled()) return result;
      const translated = addHungarianSubtitles(result);
      if (translated !== result)
        console.info('[subtitles] Added Hungarian auto-translation option');
      return translated;
    } catch {
      // Do not log caption URLs: they can contain signatures and session tokens.
      console.warn(
        '[subtitles] Keeping original captions after processing error'
      );
      return result;
    }
  };
}
