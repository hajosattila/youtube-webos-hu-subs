type Data = Record<string, unknown>;

function isObject(value: unknown): value is Data {
  return value !== null && typeof value === 'object';
}

const FIELDS = [
  'languageCode',
  'languageInfo',
  'language',
  'audioTrackId',
  'id',
  'code',
  'enabled',
  'audioIsDefault',
  'vssId',
  'vss_id',
  'kind',
  'translationLanguage',
  'track'
];

export function summarizeCaptionValue(value: unknown, depth = 0): string {
  if (value === null || value === undefined) return String(value);
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'number')
    return Number.isInteger(value) && value >= 0 && value < 100
      ? String(value)
      : 'number';
  if (typeof value === 'string') {
    // Only short locale/track IDs are displayed. Never dump arbitrary strings.
    return /^(?:\.?[a-z]{2,3}(?:[_-][a-z0-9]{1,8})*(?:\.\d+)?|[a-z]\.[a-z]{2,3}(?:-[a-z0-9]{1,8})*|\d{1,3})$/i.test(
      value
    )
      ? value
      : `string(${value.length})`;
  }
  if (!isObject(value)) return typeof value;
  if (depth >= 3) return 'object';
  if (Array.isArray(value))
    return `list(${value.length})[${value
      .slice(0, 3)
      .map((item) => summarizeCaptionValue(item, depth + 1))
      .join(';')}]`;
  // Read own data properties only: getters and unknown fields may contain secrets.
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Object.keys(descriptors).filter((key) =>
    /^[a-z0-9_]{1,32}$/i.test(key)
  );
  const values = FIELDS.flatMap((field) => {
    const property = descriptors[field];
    return property && 'value' in property
      ? [`${field}=${summarizeCaptionValue(property.value, depth + 1)}`]
      : [];
  });
  return values.length
    ? `{${values.join(',')}}`
    : `keys(${keys.slice(0, 8).join(',')})`;
}

const summarize = summarizeCaptionValue;

export function captionDiagnostics(
  player: unknown,
  media?: { tracks: unknown; selected: unknown },
  code = 'A1'
): string {
  if (!isObject(player)) return 'DIAG: no player';
  const target = player;
  function read(method: string, ...args: string[]): unknown {
    try {
      const fn = target[method];
      return typeof fn === 'function' ? fn.apply(target, args) : undefined;
    } catch {
      return 'error';
    }
  }
  const flags = [
    'getAudioTrack',
    'getAvailableAudioTracks',
    'getOption',
    'getPlayerResponse',
    'isSubtitlesOn',
    'toggleSubtitles',
    'toggleSubtitlesOn'
  ].map((name) => `${name}:${typeof target[name] === 'function' ? 1 : 0}`);
  const response = read('getPlayerResponse');
  const streaming =
    isObject(response) && isObject(response.streamingData)
      ? response.streamingData
      : {};
  const formats = Array.isArray(streaming.adaptiveFormats)
    ? streaming.adaptiveFormats
    : [];
  const audio = formats.flatMap((format: unknown) =>
    isObject(format) && isObject(format.audioTrack) ? [format.audioTrack] : []
  );
  const captions =
    isObject(response) && isObject(response.captions) ? response.captions : {};
  const renderer = isObject(captions.playerCaptionsTracklistRenderer)
    ? captions.playerCaptionsTracklistRenderer
    : {};
  const lines = [
    `DIAG ${code} (0.5.4)`,
    ...flags,
    `A=${summarize(read('getAudioTrack'))}`,
    `O=${summarize(read('getOption', 'audio', 'track'))}`,
    `L=${summarize(read('getAvailableAudioTracks'))}`,
    `V=${summarize(read('getVideoData'))}`,
    `RA=${summarize(audio)}`,
    `RC=${summarize(renderer.audioTracks)}`,
    `MEDIA=${summarize(media?.tracks)}`,
    `ACTIVE=${summarize(media?.selected)}`
  ];
  lines.push(`CC-TV=${summarize(read('getSubtitlesTrackList'))}`);
  lines.push(`CC-OPT=${summarize(read('getOption', 'captions', 'tracklist'))}`);
  lines.push(`CC-ACTIVE=${summarize(read('getSubtitlesTrack'))}`);
  lines.push(
    `CC-SELECTED=${summarize(read('getOption', 'captions', 'track'))}`
  );
  lines.push(`RESP-CC=${summarize(renderer.captionTracks)}`);
  lines.push(`CC-ON=${summarize(read('isSubtitlesOn'))}`);
  let prototype: object | null = target;
  const methods = new Set<string>();
  for (let depth = 0; prototype && depth < 3; depth++) {
    const properties = Object.getOwnPropertyDescriptors(prototype);
    for (const [name, property] of Object.entries(properties)) {
      if (
        /(audio|caption|subtitle)/i.test(name) &&
        /^[a-z0-9_]{1,48}$/i.test(name) &&
        typeof property.value === 'function'
      )
        methods.add(name);
    }
    prototype = Object.getPrototypeOf(prototype);
  }
  const names = [...methods].sort().slice(0, 24);
  for (let i = 0; i < names.length; i += 3)
    lines.push(`API=${names.slice(i, i + 3).join(',')}`);
  return lines.map((line) => line.slice(0, 150)).join('\n');
}
