import type { BaseConfig } from '@/types';

const config: BaseConfig = {
  uiServer: {
    host: location.hostname || 'localhost',
    port: parseInt(location.port || '8080'),
    protocol: 'ui0.0.1',
  },
};

export default config;
