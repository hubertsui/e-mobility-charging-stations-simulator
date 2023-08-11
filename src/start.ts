// Partial Copyright Jerome Benoit. 2021-2023. All Rights Reserved.

import { exec } from 'node:child_process';

import chalk from 'chalk';

import { Bootstrap } from './charging-station';

try {
  await Bootstrap.getInstance().start();
  console.log('启动UI页面');
  exec('start http://localhost:8080');
} catch (error) {
  console.error(chalk.red('Startup error: '), error);
}
