/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {test} from 'rome';
import {testLint} from '../../api/lint.test';

test('disallow var', async (t) => {
  await testLint(t, 'var foobar;\nfoobar', {category: 'lint/noVar'});
});
