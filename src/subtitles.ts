import { createCaptionParser } from './subtitle-tracks';
import {
  createCaptionRecovery,
  installCaptionRecovery
} from './subtitle-recovery';
import './hooks/fetch';

const recovery = createCaptionRecovery();

// Chain the adblock parser rather than replacing its behavior.
JSON.parse = createCaptionParser(JSON.parse, () => true, recovery.register);
installCaptionRecovery(recovery, window);
