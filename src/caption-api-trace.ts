const METHODS = [
  'toggleSubtitles',
  'toggleSubtitlesOn',
  'setOption',
  'setSubtitlesTrack',
  'loadModule',
  'unloadModule'
] as const;

export function observeCaptionCalls(
  player: object,
  record: (method: string, args: unknown[]) => void
) {
  const target = player as Record<string, unknown>;
  const restorers: (() => void)[] = [];
  const hooked: string[] = [];
  for (const method of METHODS) {
    const original = target[method];
    if (typeof original !== 'function') continue;
    const wrapper = function (this: unknown, ...args: unknown[]) {
      const relevant =
        !['setOption', 'loadModule', 'unloadModule'].includes(method) ||
        (typeof args[0] === 'string' &&
          ['captions', 'subtitles'].includes(args[0]));
      if (relevant) {
        try {
          record(method, args);
        } catch {
          /* Diagnostics must not block a native call. */
        }
      }
      return Reflect.apply(original, this, args);
    };
    try {
      target[method] = wrapper;
      if (target[method] !== wrapper) continue;
      hooked.push(method);
      restorers.push(() => {
        if (target[method] === wrapper) target[method] = original;
      });
    } catch {
      /* Some exported player methods may be read-only. */
    }
  }
  return {
    hooked,
    stop: () => {
      for (const restore of restorers) restore();
    }
  };
}
