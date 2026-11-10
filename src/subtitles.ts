import { createCaptionParser } from './subtitle-tracks';

// Chain the adblock parser rather than replacing its behavior.
JSON.parse = createCaptionParser(JSON.parse, () => true);
