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
  const videos = new Map<string, CaptionSources>();

  function register(sources: CaptionSources) {
    const video = sources[0]?.url.searchParams.get('v');
    if (!video) return;
    videos.delete(video);
    videos.set(video, sources);
    if (videos.size > 8) {
      const oldest = videos.keys().next().value;
      if (oldest !== undefined) videos.delete(oldest);
    }
  }

  function plan(resource: string) {
    const request = timedTextUrl(resource);
    if (
      !request ||
      !/^hu(?:-|$)/i.test(request.searchParams.get('tlang') ?? '')
    )
      return null;
    const video = request.searchParams.get('v');
    if (!video) return null;

    const available = videos.get(video)?.filter(
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
    for (const { url } of available ?? []) {
      if (
        TRACK_KEYS.every(
          (key) => url.searchParams.get(key) === request.searchParams.get(key)
        )
      )
        continue;
      const translated = getUrl(url, 'hu');
      if (translated) alternates.add(translated);
      if (alternates.size === 2) break;
    }

    return {
      alternates: [...alternates],
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
    cancel?: AbortSignal | null
  ) {
    if (hasCaptionText(text)) {
      console.info('[subtitles] YouTube returned Hungarian captions');
      return null;
    }

    const { alternates, source, originalSource } = recoveryPlan;
    if (alternates.length) {
      const result = await withTimeout(
        async (signal) => {
          for (const alternate of alternates) {
            if (signal?.aborted || cancel?.aborted) break;
            try {
              // eslint-disable-next-line no-await-in-loop
              const response = await fetchSource(alternate, signal);
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

    if (!source) return null;
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

  return { register, plan, recover };
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
    const plan = method.toUpperCase() === 'GET' ? recovery.plan(url) : null;
    if (!plan) return originalFetch(resource, init);
    const response = await fetchWithoutXhr(resource, init);
    if (!canRecover(response.status)) return response;

    try {
      const text = response.ok ? await response.clone().text() : '';
      const result = await recovery.recover(
        text,
        plan,
        (alternate, signal) =>
          fetchWithoutXhr(
            request ? new Request(alternate, request) : alternate,
            {
              ...init,
              ...(signal && { signal })
            }
          ),
        originalFetch,
        init?.signal ?? request?.signal
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
    const plan =
      async &&
      !username &&
      !password &&
      method.toUpperCase() === 'GET' &&
      !fetchRequests.has(resource)
        ? recovery.plan(resource)
        : null;
    if (plan) {
      const recoveryPlan = plan;
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
        let body = '';
        if (xhr.status < 300) {
          if (responseType === 'json')
            body = xhr.response ? JSON.stringify(xhr.response) : '';
          else if (isXml && xhr.responseXML)
            body = new XMLSerializer().serializeToString(xhr.responseXML);
          else if (responseType !== 'document') body = xhr.responseText;
        }
        if (hasCaptionText(body)) {
          console.info('[subtitles] YouTube returned Hungarian captions');
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
                credentials: xhr.withCredentials ? 'include' : 'same-origin',
                ...(signal && { signal })
              }),
            originalFetch,
            controller?.signal
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
