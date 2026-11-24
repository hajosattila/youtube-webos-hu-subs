// Based on the approach in webosbrew/youtube-webos#472.
type JsonObject = Record<string, unknown>;

const HUNGARIAN_LABEL = 'Magyar (automatikus fordítás)';

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isHungarian(value: unknown) {
  return typeof value === 'string' && /^hu(?:-|$)/i.test(value);
}

export function timedTextUrl(value: unknown): URL | null {
  if (typeof value !== 'string' || !value) return null;

  try {
    const url = new URL(value, 'https://www.youtube.com');
    return url.protocol === 'https:' &&
      (url.hostname === 'youtube.com' ||
        url.hostname.endsWith('.youtube.com')) &&
      url.pathname === '/api/timedtext' &&
      !url.username &&
      !url.password
      ? url
      : null;
  } catch {
    return null;
  }
}

export function withTimedTextParams(
  url: URL,
  params: Record<string, string | null>
): string {
  const result = new URL(url.href);
  // Preserve the original encoding of all untouched query parameters.
  const query = url.search
    ? url.search
        .slice(1)
        .split('&')
        .filter((part) => {
          const entry = new URLSearchParams(part);
          return !Object.keys(params).some((key) => entry.has(key));
        })
    : [];
  result.search = [
    ...query,
    ...Object.entries(params).flatMap(([key, value]) =>
      value === null ? [] : [new URLSearchParams([[key, value]]).toString()]
    )
  ].join('&');
  return result.href;
}

function autoDubbedLanguages(response: JsonObject) {
  const streaming = response.streamingData;
  const formats = isObject(streaming) ? streaming.adaptiveFormats : null;
  const languages = new Set<string>();
  if (Array.isArray(formats)) {
    for (const format of formats) {
      const audio = isObject(format) ? format.audioTrack : null;
      if (
        isObject(audio) &&
        audio.isAutoDubbed === true &&
        typeof audio.id === 'string'
      ) {
        languages.add(audio.id.replace(/\.\d+$/, '').toLowerCase());
      }
    }
  }
  return languages;
}

function getSources(renderer: JsonObject, response: JsonObject) {
  const tracks: unknown[] = Array.isArray(renderer.captionTracks)
    ? renderer.captionTracks
    : [];
  const audioTracks: unknown[] = Array.isArray(renderer.audioTracks)
    ? renderer.audioTracks
    : [];
  const defaultAudioIndex = Number.isInteger(renderer.defaultAudioTrackIndex)
    ? (renderer.defaultAudioTrackIndex as number)
    : 0;
  const defaultAudio = audioTracks[defaultAudioIndex];
  const dubbedLanguages = autoDubbedLanguages(response);

  return tracks
    .flatMap((track, index) => {
      if (
        !isObject(track) ||
        typeof track.languageCode !== 'string' ||
        !track.languageCode ||
        isHungarian(track.languageCode) ||
        track.isTranslatable === false
      )
        return [];

      // Only use tracks made available to at least one audio menu.
      if (
        audioTracks.length &&
        !audioTracks.some(
          (audio) =>
            isObject(audio) &&
            Array.isArray(audio.captionTrackIndices) &&
            audio.captionTrackIndices.includes(index)
        )
      )
        return [];

      const url = timedTextUrl(track.baseUrl);
      if (!url) return [];

      const asr =
        track.kind === 'asr' || url.searchParams.get('kind') === 'asr';
      const dubbed =
        url.searchParams.get('variant') === 'timing-optimized' ||
        (asr && dubbedLanguages.has(track.languageCode.toLowerCase()));
      const defaultAudioHasTrack =
        isObject(defaultAudio) &&
        Array.isArray(defaultAudio.captionTrackIndices) &&
        defaultAudio.captionTrackIndices.includes(index);
      const rank =
        (dubbed ? 4 : 0) + (defaultAudioHasTrack ? 0 : 2) + (asr ? 0 : 1);
      return [{ track, index, url, rank, dubbed }];
    })
    .sort((a, b) => a.rank - b.rank);
}

export type CaptionSources = ReturnType<typeof getSources>;
type RegisterSources = (sources: CaptionSources) => void;

function translateTracklist(
  renderer: JsonObject,
  sources: CaptionSources
): JsonObject | null {
  const tracks: unknown[] = Array.isArray(renderer.captionTracks)
    ? renderer.captionTracks
    : [];
  const source = sources[0];
  if (
    !source ||
    tracks.some((track) => isObject(track) && isHungarian(track.languageCode))
  )
    return null;

  const audioTracks = Array.isArray(renderer.audioTracks)
    ? renderer.audioTracks
    : null;

  // Let the player build the translated request from the selected source when
  // the native Auto-translate menu is available.
  const languages = renderer.translationLanguages;
  if (Array.isArray(languages) && languages.length > 0) {
    if (
      languages.some((lang) => isObject(lang) && isHungarian(lang.languageCode))
    )
      return null;

    const usesRuns = languages.some(
      (lang) =>
        isObject(lang) &&
        isObject(lang.languageName) &&
        Array.isArray(lang.languageName.runs)
    );
    return {
      ...renderer,
      translationLanguages: [
        ...languages,
        {
          languageCode: 'hu',
          languageName: usesRuns
            ? { runs: [{ text: 'Magyar' }] }
            : { simpleText: 'Magyar' }
        }
      ]
    };
  }

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
        baseUrl: withTimedTextParams(source.url, { tlang: 'hu' }),
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

  return result;
}

function translatePlayerResponse(
  response: JsonObject,
  registerSources?: RegisterSources
): JsonObject {
  const captions = response.captions;
  if (!isObject(captions)) return response;
  const renderer = captions.playerCaptionsTracklistRenderer;
  if (!isObject(renderer)) return response;
  const sources = getSources(renderer, response);
  registerSources?.(sources);
  const translated = translateTracklist(renderer, sources);
  if (!translated) return response;

  return {
    ...response,
    captions: { ...captions, playerCaptionsTracklistRenderer: translated }
  };
}

export function addHungarianSubtitles(
  value: unknown,
  registerSources?: RegisterSources
): unknown {
  if (!isObject(value)) return value;
  let result = translatePlayerResponse(value, registerSources);
  // Also handle responses that wrap an already parsed playerResponse object.
  if (isObject(value.playerResponse)) {
    const playerResponse = translatePlayerResponse(
      value.playerResponse,
      registerSources
    );
    if (playerResponse !== value.playerResponse)
      result = { ...result, playerResponse };
  }
  return result;
}

export function createCaptionParser(
  originalParse: typeof JSON.parse,
  isEnabled: () => boolean,
  registerSources?: RegisterSources
): typeof JSON.parse {
  return function (this: unknown, ...args: Parameters<typeof JSON.parse>) {
    // Keep parse errors, revivers and any previously installed hook intact.
    const result = originalParse.apply(this, args);
    try {
      if (!isEnabled()) return result;
      const translated = addHungarianSubtitles(result, registerSources);
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
