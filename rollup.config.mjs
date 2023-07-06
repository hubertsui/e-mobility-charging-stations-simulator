/* eslint-disable n/no-unpublished-import */
import { cpus } from 'node:os';

import json from '@rollup/plugin-json';
import terser from '@rollup/plugin-terser';
import typescript from '@rollup/plugin-typescript';
import { copy } from '@web/rollup-plugin-copy';
import analyze from 'rollup-plugin-analyzer';
import del from 'rollup-plugin-delete';

const isDevelopmentBuild = process.env.BUILD === 'development';
const isAnalyzeBuild = process.env.ANALYZE;

export default {
  input: ['src/start.ts', 'src/charging-station/ChargingStationWorker.ts'],
  strictDeprecations: true,
  output: [
    {
      dir: 'dist',
      format: 'esm',
      sourcemap: !!isDevelopmentBuild,
      plugins: [terser({ maxWorkers: cpus().length / 2 })],
    },
  ],
  external: [
    '@mikro-orm/core',
    '@mikro-orm/reflection',
    'ajv',
    'ajv-formats',
    'basic-ftp',
    'chalk',
    'http-status-codes',
    'just-clone',
    'just-merge',
    'mnemonist/lru-map-with-delete.js',
    'mnemonist/queue.js',
    'moment',
    'mongodb',
    'node:async_hooks',
    'node:crypto',
    'node:events',
    'node:fs',
    'node:http',
    'node:path',
    'node:perf_hooks',
    'node:stream',
    'node:url',
    'node:util',
    'node:worker_threads',
    'poolifier',
    'tar',
    'winston',
    'winston-daily-rotate-file',
    'winston/lib/winston/transports/index.js',
    'ws',
  ],
  plugins: [
    json(),
    typescript({
      tsconfig: 'tsconfig.json',
      compilerOptions: {
        sourceMap: !!isDevelopmentBuild,
      },
    }),
    del({
      targets: [
        'dist/*',
        '!dist/assets',
        'dist/assets/*.json',
        'dist/assets/json-schemas',
        'dist/assets/station-templates',
        'dist/assets/ui-protocol',
      ],
    }),
    copy({
      rootDir: 'src',
      patterns: 'assets/**/*.json',
      exclude: [
        'assets/config-template.json',
        'assets/*config[-_.]*.json',
        'assets/idtags-template.json',
        'assets/authorization-tags-template.json',
        'assets/ui-protocol/**/*',
      ],
    }),
    isAnalyzeBuild && analyze(),
  ],
};
