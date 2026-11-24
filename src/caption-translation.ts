type Cue = { text: string; setText: (translation: string) => void };

function readCaptions(body: string) {
  const cues: Cue[] = [];
  const text = body.trim();
  if (text.startsWith('{')) {
    const data = JSON.parse(text);
    if (!Array.isArray(data?.events)) return null;
    for (const event of data.events) {
      if (!Array.isArray(event?.segs)) continue;
      const original = event.segs
        .map((part: { utf8?: string } | null) => part?.utf8 ?? '')
        .join('')
        .trim();
      if (original)
        cues.push({
          text: original,
          setText: (translation) => {
            event.segs = [{ utf8: translation }];
          }
        });
    }
    return { cues, serialize: () => JSON.stringify(data) };
  }

  if (text.startsWith('WEBVTT')) {
    const blocks = text.split(/\r?\n\r?\n/);
    blocks.forEach((block, index) => {
      const lines = block.split(/\r?\n/);
      const time = lines.findIndex((line) => line.includes(' --> '));
      if (time < 0 || time > 1) return;
      const original = lines
        .slice(time + 1)
        .join(' ')
        .replace(/<[^>]*>/g, '')
        .trim();
      if (original)
        cues.push({
          text: original,
          setText: (translation) => {
            const escaped = translation
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;');
            blocks[index] = [...lines.slice(0, time + 1), escaped].join('\n');
          }
        });
    });
    return { cues, serialize: () => blocks.join('\n\n') + '\n' };
  }

  if (!text.startsWith('<') || /<!DOCTYPE/i.test(text)) return null;
  const xml = new DOMParser().parseFromString(text, 'text/xml');
  if (xml.getElementsByTagName('parsererror').length) return null;
  const root = xml.documentElement.localName;
  if (!['timedtext', 'transcript', 'tt'].includes(root)) return null;
  for (const cue of Array.from(
    xml.getElementsByTagNameNS('*', root === 'transcript' ? 'text' : 'p')
  )) {
    const original = cue.textContent?.trim();
    if (original)
      cues.push({
        text: original,
        setText: (translation) => {
          cue.textContent = translation;
        }
      });
  }
  return { cues, serialize: () => new XMLSerializer().serializeToString(xml) };
}

export async function translateCaptions(
  body: string,
  fetchTranslation: typeof fetch,
  signal: AbortSignal | undefined
): Promise<string | null> {
  const captions = readCaptions(body);
  if (!captions?.cues.length) return null;

  const unique = new Map<string, Cue[]>();
  for (const cue of captions.cues) {
    const group = unique.get(cue.text);
    if (group) group.push(cue);
    else unique.set(cue.text, [cue]);
  }

  const batches: string[][] = [];
  let batch: string[] = [];
  let length = 0;
  for (const text of unique.keys()) {
    const size = encodeURIComponent(text).length + 3;
    if (size > 5000) return null;
    if (length + size > 5000 || batch.length === 60) {
      batches.push(batch);
      batch = [];
      length = 0;
    }
    batch.push(text);
    length += size;
  }
  batches.push(batch);

  let next = 0;
  let failed = false;
  async function translateBatch() {
    while (!failed && !signal?.aborted && next < batches.length) {
      const texts = batches[next++];
      if (!texts) return;
      const url = new URL('https://translate.googleapis.com/translate_a/t');
      url.searchParams.set('client', 'dict-chrome-ex');
      url.searchParams.set('sl', 'auto');
      url.searchParams.set('tl', 'hu');
      for (const text of texts) url.searchParams.append('q', text);

      try {
        // eslint-disable-next-line no-await-in-loop
        const response = await fetchTranslation(url.href, {
          ...(signal && { signal }),
          credentials: 'omit',
          referrerPolicy: 'no-referrer'
        });
        // eslint-disable-next-line no-await-in-loop
        const result = response.ok ? await response.json() : null;
        if (!Array.isArray(result) || result.length !== texts.length) {
          failed = true;
          return;
        }
        texts.forEach((text, index) => {
          const item = result[index];
          const translated = Array.isArray(item) ? item[0] : item;
          if (typeof translated !== 'string' || !translated.trim()) {
            failed = true;
            return;
          }
          for (const cue of unique.get(text) ?? []) cue.setText(translated);
        });
      } catch {
        failed = true;
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(3, batches.length) }, translateBatch)
  );
  return failed || signal?.aborted ? null : captions.serialize();
}
