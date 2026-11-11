/** Version de l'outil et commit de construction, injectes par vite.config.ts (audit R3). */
import { versionOutil } from 'aedificium-ui';

declare const __VERSION__: string;
declare const __COMMIT__: string;

export const VERSION_OUTIL = versionOutil(
  typeof __VERSION__ !== 'undefined' ? __VERSION__ : 'dev',
  typeof __COMMIT__ !== 'undefined' ? __COMMIT__ : 'local',
);
