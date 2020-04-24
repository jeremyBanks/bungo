/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {JSNodeBase} from '../index';
import {createBuilder} from '../utils';

export type BigIntLiteral = JSNodeBase & {
  type: 'BigIntLiteral';
  value: string;
};

export const bigIntLiteral = createBuilder<BigIntLiteral>('BigIntLiteral', {
  bindingKeys: {},
  visitorKeys: {},
});
