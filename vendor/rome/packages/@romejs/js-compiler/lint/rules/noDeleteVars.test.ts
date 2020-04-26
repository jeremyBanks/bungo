/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {test} from 'rome';
import {testLint} from '../testHelpers';

test(
  'no delete vars',
  async (t) => {
    await testLint(t, `
  const foo = "test";
  delete foo;
  `, {category: 'lint/noDeleteVars', sourceType: 'script'});
  },
);
