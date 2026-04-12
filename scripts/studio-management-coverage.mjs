import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestFile = path.join(
  root,
  'apps',
  'web-vue',
  'src',
  'features',
  'management',
  'management-domain-manifest.ts',
);

const manifestSource = fs.readFileSync(manifestFile, 'utf8');
const domainIds = ['config', 'agents', 'channels', 'skills', 'cron'].filter((domainId) =>
  manifestSource.includes(`id: '${domainId}'`),
);

const output = {
  generatedAt: new Date().toISOString(),
  domains: domainIds,
  webViews: [
    'apps/web-vue/src/views/ConfigView.vue',
    'apps/web-vue/src/views/AgentsView.vue',
    'apps/web-vue/src/views/ChannelsView.vue',
    'apps/web-vue/src/views/SkillsView.vue',
    'apps/web-vue/src/views/CronView.vue',
  ],
  apiModules: [
    'apps/api/modules/config',
    'apps/api/modules/agents',
    'apps/api/modules/channels',
    'apps/api/modules/skills',
    'apps/api/modules/cron',
  ],
  tests: [
    'tests/system/studio-web-config-workbench.test.mjs',
    'tests/system/studio-web-agents-routes.test.mjs',
    'tests/system/studio-web-channels-routes.test.mjs',
    'tests/system/studio-web-cron-tabs-primitives.test.mjs',
  ],
};

process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
