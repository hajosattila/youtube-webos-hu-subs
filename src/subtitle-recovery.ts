import { timedTextUrl, withTimedTextParams } from './subtitle-tracks';
import type { CaptionSources } from './subtitle-tracks';

import { translateCaptions } from './caption-translation';

const TRACK_KEYS = ['lang', 'kind', 'name', 'variant', 'vss_id'];
const REQUEST_KEYS = ['fmt', 'pot', 'potc', 'sq'];
const REQUEST_FORMAT_KEYS = ['fmt', 'sq'];

function hasCaptionText(text: string) {
  const body = text.trim();
  if (!body) return false;

  if (body.startsWith('{')) {
    try {
      const json = JSON.parse(body);
      if (Array.isArray(json?.events)) {
        return json.events.some(
          (event: { segs?: { utf8?: string }[] } | null) =>
            Array.isArray(event?.segs) &&
            event.segs.some((seg) => seg?.utf8?.trim())
        );
      }
    } catch {
      return false;
    }
    return false;
  }

  if (
    body.includes('<timedtext') ||
    body.includes('<transcript') ||
    /<tt[ >]/.test(body)
  ) {
    return /<(?:p|text)(?:\s|>)/.test(body);
  }
  if (body.startsWith('WEBVTT')) return body.includes('-->');
  return !/<(?:!DOCTYPE\s+html|html)\b/i.test(body);
}

function canRecover(status: number) {
  return (status >= 200 && status < 300) || status === 404 || status === 429;
}

function isHungarianRequest(url: URL) {
  return /^hu(?:-|$)/i.test(url.searchParams.get('tlang') ?? '');
}

function canRecordWorking(url: URL) {
  return (
    !url.searchParams.get('sparams')?.split(',').includes('tlang') &&
    url.searchParams.get('variant') !== 'timing-optimized'
  );
}

function sameTrack(first: URL, second: URL) {
  return TRACK_KEYS.every(
    (key) => first.searchParams.get(key) === second.searchParams.get(key)
  );
}

function sameRequest(first: URL, second: URL) {
  const query = (url: URL) => {
    const params = new URLSearchParams(url.search);
    params.delete('tlang');
    params.sort();
    return params.toString();
  };
  return query(first) === query(second);
}

function xhrCaptionBody(xhr: XMLHttpRequest) {
  if (xhr.status >= 300) return '';
  if (xhr.responseType === 'json')
    return xhr.response ? JSON.stringify(xhr.response) : '';
  if (xhr.responseType === '' || xhr.responseType === 'document') {
    if (xhr.responseXML)
      return new XMLSerializer().serializeToString(xhr.responseXML);
  }
  return xhr.responseType === '' || xhr.responseType === 'text'
    ? xhr.responseText
    : '';
}

async function withTimeout<T>(
  request: (signal: AbortSignal | undefined) => Promise<T | null>,
  milliseconds: number,
  cancel?: AbortSignal | null
) {
  if (cancel?.aborted) return null;
  const controller =
    typeof AbortController === 'function' ? new AbortController() : null;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let stop: (() => void) | undefined;
  try {
    return await Promise.race([
      new Promise<null>((resolve) => {
        stop = () => {
          resolve(null);
          controller?.abort();
        };
        cancel?.addEventListener('abort', stop);
        timeout = setTimeout(stop, milliseconds);
      }),
      request(controller?.signal)
    ]);
  } catch {
    return null;
  } finally {
    if (stop) cancel?.removeEventListener('abort', stop);
    clearTimeout(timeout);
  }
}

export function createCaptionRecovery() {
  const videos = new Map<
    string,
    { sources: CaptionSources; publicVideo: boolean }
  >();
  const workingRequests: URL[] = [];

  function recordWorking(url: URL, body: string) {
    const video = url.searchParams.get('v');
    if (!video || !hasCaptionText(body)) return;
    if (
      videos
        .get(video)
        ?.sources.some(
          ({ url: source, dubbed }) => dubbed && sameTrack(source, url)
        )
    )
      return;
    const previous = workingRequests.findIndex(
      (entry) => entry.href === url.href
    );
    if (previous >= 0) workingRequests.splice(previous, 1);
    workingRequests.unshift(url);
    if (workingRequests.length > 8) workingRequests.pop();
  }

  function register(sources: CaptionSources, publicVideo = false) {
    const video = sources[0]?.url.searchParams.get('v');
    if (!video) return;
    videos.delete(video);
    videos.set(video, { sources, publicVideo });
    if (videos.size > 8) {
      const oldest = videos.keys().next().value;
      if (oldest !== undefined) videos.delete(oldest);
    }
  }

  function plan(resource: string) {
    const request = timedTextUrl(resource);
    if (!request || !isHungarianRequest(request)) return null;
    const video = request.searchParams.get('v');
    if (!video) return null;

    const registered = videos.get(video);
    const session = request.searchParams.get('ei');
    const available = registered?.sources.filter(
      ({ url, dubbed }) =>
        !dubbed &&
        url.origin === request.origin &&
        url.searchParams.get('v') === video &&
        ['c', 'ei'].every((key) => {
          const requestValue = request.searchParams.get(key);
          const sourceValue = url.searchParams.get(key);
          return !requestValue || !sourceValue || requestValue === sourceValue;
        })
    );
    const preferred = available?.[0]?.url ?? request;
    const getUrl = (url: URL, target: string | null) => {
      const signedParams = url.searchParams.get('sparams')?.split(',') ?? [];
      if (signedParams.includes('tlang')) return null;
      const params: Record<string, string | null> = { tlang: target };
      for (const key of REQUEST_KEYS) {
        const value = request.searchParams.get(key);
        if (
          value &&
          value !== url.searchParams.get(key) &&
          !signedParams.includes(key) &&
          (REQUEST_FORMAT_KEYS.includes(key) || !url.searchParams.has(key))
        )
          params[key] = value;
      }
      return withTimedTextParams(url, params);
    };

    const alternates = new Set<string>();
    // The actual successful player request includes runtime parameters that
    // may be absent from the base URL in the player response.
    const working = workingRequests.find(
      (working) =>
        working.searchParams.get('v') === video &&
        working.origin === request.origin &&
        session &&
        working.searchParams.get('ei') === session &&
        sameTrack(working, request) &&
        ['fmt', 'sq'].every(
          (key) =>
            working.searchParams.get(key) === request.searchParams.get(key)
        ) &&
        ['c', 'cver', 'ei'].every((key) => {
          const value = request.searchParams.get(key);
          return !value || working.searchParams.get(key) === value;
        }) &&
        !sameRequest(working, request)
    );
    if (working) {
      alternates.add(withTimedTextParams(working, { tlang: 'hu' }));
    }

    for (const { url } of available ?? []) {
      if (sameTrack(url, request)) continue;
      const translated = getUrl(url, 'hu');
      if (translated) alternates.add(translated);
      if (alternates.size === 2) break;
    }

    return {
      alternates: [...alternates],
      retryUrl: request.searchParams.has('sq') ? null : request.href,
      allowGoogle: Boolean(
        registered?.publicVideo &&
        session &&
        available?.some(({ url }) => url.searchParams.get('ei') === session)
      ),
      source: getUrl(preferred, null) ?? getUrl(request, null),
      originalSource: getUrl(request, null)
    };
  }

  async function recover(
    text: string,
    recoveryPlan: NonNullable<ReturnType<typeof plan>>,
    fetchSource: (
      url: string,
      signal: AbortSignal | undefined
    ) => Promise<Response>,
    fetchTranslation: typeof fetch,
    cancel?: AbortSignal | null,
    status = 200
  ) {
    if (hasCaptionText(text)) {
      console.info('[subtitles] YouTube returned Hungarian captions');
      return null;
    }

    const { alternates, source, originalSource } = recoveryPlan;
    const retrySame =
      !alternates.length && status === 200 && recoveryPlan.retryUrl;
    const attempts = retrySame ? [retrySame] : alternates;
    console.info(
      '[subtitles] Hungarian captions unavailable from YouTube, HTTP',
      status
    );
    if (attempts.length && status !== 429 && !cancel?.aborted) {
      const result = await withTimeout(
        async (signal) => {
          // A single source can be temporarily empty on first selection.
          if (retrySame)
            await new Promise((resolve) => setTimeout(resolve, 400));
          for (const alternate of attempts) {
            if (signal?.aborted || cancel?.aborted) break;
            try {
              // eslint-disable-next-line no-await-in-loop
              const response = await fetchSource(alternate, signal);
              console.info('[subtitles] YouTube retry HTTP', response.status);
              if (response.status === 429) break;
              if (!response.ok) continue;
              // eslint-disable-next-line no-await-in-loop
              const body = await response.clone().text();
              if (hasCaptionText(body)) return { response, body };
            } catch {
              // A failed request can still leave another YouTube source.
            }
          }
          return null;
        },
        3000,
        cancel
      );
      if (result) {
        console.info('[subtitles] Recovered Hungarian captions from YouTube');
        return result;
      }
    }

    if (!source || !recoveryPlan.allowGoogle || cancel?.aborted) return null;
    const result = await withTimeout(
      async (signal) => {
        let response = await fetchSource(source, signal);
        let body = response.ok ? await response.text() : '';
        if (
          !hasCaptionText(body) &&
          originalSource &&
          originalSource !== source
        ) {
          response = await fetchSource(originalSource, signal);
          body = response.ok ? await response.text() : '';
        }
        if (!hasCaptionText(body)) return null;
        const translated = await translateCaptions(
          body,
          fetchTranslation,
          signal
        );
        if (!translated) return null;
        const contentType = response.headers.get('content-type');
        return {
          body: translated,
          response: new Response(translated, {
            headers: contentType ? { 'content-type': contentType } : {}
          })
        };
      },
      12000,
      cancel
    );

    if (result)
      console.info(
        '[subtitles] Recovered Hungarian captions with Google Translate'
      );
    else if (!cancel?.aborted)
      console.info('[subtitles] Hungarian caption recovery returned no text');
    return result;
  }

  return { register, recordWorking, plan, recover };
}

export function installCaptionRecovery(
  recovery: ReturnType<typeof createCaptionRecovery>,
  transport: Pick<Window, 'fetch'> & { XMLHttpRequest: typeof XMLHttpRequest }
) {
  const originalFetch = transport.fetch.bind(transport);

  // On older webOS, whatwg-fetch sends its requests through XMLHttpRequest.
  // Each request must go through at most one recovery handler.
  const fetchRequests = new Map<string, number>();
  async function fetchWithoutXhr(
    resource: RequestInfo | URL,
    init?: RequestInit
  ) {
    const url = resource instanceof Request ? resource.url : String(resource);
    fetchRequests.set(url, (fetchRequests.get(url) ?? 0) + 1);
    try {
      return await originalFetch(resource, init);
    } finally {
      const pending = (fetchRequests.get(url) ?? 1) - 1;
      if (pending) fetchRequests.set(url, pending);
      else fetchRequests.delete(url);
    }
  }

  transport.fetch = async (resource, init) => {
    const request = resource instanceof Request ? resource : null;
    const url = request?.url ?? String(resource);
    const method = init?.method ?? request?.method ?? 'GET';
    if (method.toUpperCase() !== 'GET') return originalFetch(resource, init);
    const captionUrl = timedTextUrl(url);
    if (!captionUrl?.searchParams.get('v'))
      return originalFetch(resource, init);
    if (!isHungarianRequest(captionUrl)) {
      if (!canRecordWorking(captionUrl)) return originalFetch(resource, init);
      const response = await fetchWithoutXhr(resource, init);
      if (response.ok) {
        try {
          recovery.recordWorking(captionUrl, await response.clone().text());
        } catch {
          // The original response remains available to the player.
        }
      }
      return response;
    }
    const response = await fetchWithoutXhr(resource, init);
    if (!canRecover(response.status)) return response;

    try {
      const text = response.ok ? await response.clone().text() : '';
      const plan = recovery.plan(url);
      if (!plan) return response;
      const result = await recovery.recover(
        text,
        plan,
        (alternate, signal) =>
          fetchWithoutXhr(
            request ? new Request(alternate, request) : alternate,
            {
              ...init,
              cache: 'reload',
              ...(signal && { signal })
            }
          ),
        originalFetch,
        init?.signal ?? request?.signal,
        response.status
      );
      return result?.response ?? response;
    } catch {
      return response;
    }
  };

  const NativeXHR = transport.XMLHttpRequest;
  const xhrPrototype = NativeXHR.prototype;
  const originalOpen = xhrPrototype.open;
  const originalAbort = xhrPrototype.abort;
  const eventTypes = ['readystatechange', 'load', 'loadend'];
  const active = new WeakMap<
    XMLHttpRequest,
    {
      reset: () => void;
      onComplete: (event: Event) => void;
    }
  >();

  function CaptionXHR() {
    const xhr = new NativeXHR();
    // At the event target, listener registration order takes precedence.
    // Install before YouTube has attached its completion handlers.
    for (const type of eventTypes)
      xhr.addEventListener(
        type,
        (event) => active.get(xhr)?.onComplete(event),
        true
      );
    return xhr;
  }
  CaptionXHR.prototype = xhrPrototype;
  Object.setPrototypeOf(CaptionXHR, NativeXHR);
  transport.XMLHttpRequest = CaptionXHR as unknown as typeof XMLHttpRequest;

  xhrPrototype.abort = function (this: XMLHttpRequest) {
    active.get(this)?.reset();
    return originalAbort.call(this);
  };
  xhrPrototype.open = function (
    this: XMLHttpRequest,
    ...args: [
      method: string,
      url: string | URL,
      async?: boolean,
      username?: string | null,
      password?: string | null
    ]
  ) {
    active.get(this)?.reset();
    const [method, url, async = true, username, password] = args;
    const resource = String(url);
    const observe =
      async &&
      !username &&
      !password &&
      method.toUpperCase() === 'GET' &&
      !fetchRequests.has(resource);
    const captionUrl = observe ? timedTextUrl(resource) : null;
    if (
      captionUrl?.searchParams.get('v') &&
      !isHungarianRequest(captionUrl) &&
      canRecordWorking(captionUrl)
    ) {
      const xhr = this;
      const reset = () => active.delete(xhr);
      active.set(xhr, {
        reset,
        onComplete(event) {
          if (event.type !== 'readystatechange' || xhr.readyState !== 4) return;
          reset();
          if (xhr.status >= 200 && xhr.status < 300)
            recovery.recordWorking(captionUrl, xhrCaptionBody(xhr));
        }
      });
    }
    if (captionUrl?.searchParams.get('v') && isHungarianRequest(captionUrl)) {
      const xhr = this;
      let delaying = false;
      let listening = true;
      const controller =
        typeof AbortController === 'function' ? new AbortController() : null;
      const overrides: string[] = [];
      const replace = (property: string, value: unknown) => {
        Object.defineProperty(xhr, property, { configurable: true, value });
        overrides.push(property);
      };
      const restore = () => {
        for (const name of overrides) Reflect.deleteProperty(xhr, name);
        overrides.length = 0;
      };
      const reset = () => {
        controller?.abort();
        restore();
        active.delete(xhr);
      };

      function onComplete(event: Event) {
        if (!listening) return;
        if (delaying) {
          event.stopImmediatePropagation();
          return;
        }
        if (event.type !== 'readystatechange' || xhr.readyState !== 4) return;
        if (
          !canRecover(xhr.status) ||
          !['', 'text', 'json', 'document'].includes(xhr.responseType)
        ) {
          reset();
          return;
        }

        const responseType = xhr.responseType;
        const isXml =
          responseType === 'document' ||
          (responseType === '' && xhr.responseXML !== null);
        const body = xhrCaptionBody(xhr);
        if (hasCaptionText(body)) {
          console.info('[subtitles] YouTube returned Hungarian captions');
          reset();
          return;
        }

        const recoveryPlan = recovery.plan(resource);
        if (!recoveryPlan) {
          reset();
          return;
        }
        delaying = true;
        event.stopImmediatePropagation();
        void recovery
          .recover(
            body,
            recoveryPlan,
            (alternate, signal) =>
              fetchWithoutXhr(alternate, {
                cache: 'reload',
                credentials: xhr.withCredentials ? 'include' : 'same-origin',
                ...(signal && { signal })
              }),
            originalFetch,
            controller?.signal,
            xhr.status
          )
          .then((result) => {
            if (active.get(xhr)?.reset !== reset) return;
            if (xhr.readyState !== 4) {
              reset();
              return;
            }
            listening = false;
            if (result) {
              try {
                const xml =
                  (isXml || responseType === '') &&
                  result.body.trim().startsWith('<')
                    ? new DOMParser().parseFromString(result.body, 'text/xml')
                    : null;
                const response =
                  responseType === 'json'
                    ? JSON.parse(result.body)
                    : responseType === 'document'
                      ? xml
                      : result.body;
                replace('response', response);
                if (responseType === '' || responseType === 'text')
                  replace('responseText', result.body);
                if (xml) replace('responseXML', xml);
                if (xhr.status !== 200) {
                  replace('status', 200);
                  replace('statusText', 'OK');
                }
              } catch {
                restore();
              }
            }
            xhr.dispatchEvent(new Event('readystatechange'));
            if (active.get(xhr)?.reset !== reset || xhr.readyState !== 4)
              return;
            xhr.dispatchEvent(new ProgressEvent('load'));
            if (active.get(xhr)?.reset === reset && xhr.readyState === 4)
              xhr.dispatchEvent(new ProgressEvent('loadend'));
          });
      }

      active.set(xhr, { reset, onComplete });
    }
    try {
      // Preserve the original argument count for XMLHttpRequest.open.
      Reflect.apply(originalOpen, this, args);
    } catch (error) {
      active.get(this)?.reset();
      throw error;
    }
  };
}
