import { defineCloudflareConfig } from '@opennextjs/cloudflare';

const config = defineCloudflareConfig();
config.imageOptimization = {
  loader: 'dummy',
};

export default config;
