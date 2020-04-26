/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {commandCategories} from '../../common/commands';
import {createLocalCommand} from '../commands';
import ClientRequest from '../ClientRequest';
import {Dict} from '@romejs/typescript-helpers';
import {exists, writeFile} from '@romejs/fs';
import {VERSION} from '../../common/constants';
import {Consumer} from '@romejs/consume';

type Flags = {
  defaults: boolean;
};

export default createLocalCommand({
  category: commandCategories.PROJECT_MANAGEMENT,
  description: 'create a project config',
  usage: '',
  examples: [],
  defineFlags(consumer: Consumer): Flags {
    return {
      defaults: consumer.get('defaults').asBoolean(false),
    };
  },
  async callback(req: ClientRequest, flags: Flags) {
    const {reporter} = req.client;

    const config: Dict<unknown> = {};

    const configPath = req.client.flags.cwd.append('rome.json');
    if (await exists(configPath)) {
      reporter.error(
        `<filelink target="${configPath.join()}" emphasis>rome.json</filelink> file already exists`,
      );
      reporter.info(
        'Use <command>rome config</command> to update an existing config',
      );
      return false;
    }

    reporter.heading('Welcome to Rome!');

    if (flags.defaults === false) {
      const useDefaults = await reporter.radioConfirm(
        'Use recommended settings?',
      );
      if (useDefaults) {
        flags = {defaults: true};
      }
    }

    const name = await reporter.question(
      'Project name',
      {
        yes: flags.defaults,
      },
    );
    if (name !== '') {
      config.name = name;
    }

    config.version = `^${VERSION}`;

    await writeFile(configPath, `${JSON.stringify(config, null, '  ')}\n`);

    reporter.success(
      `Created config <filelink emphasis target="${configPath.join()}" />`,
    );

    return true;
  },
});
