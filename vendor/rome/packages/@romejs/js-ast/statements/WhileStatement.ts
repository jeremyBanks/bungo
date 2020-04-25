/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {AnyExpression, AnyStatement, JSNodeBase} from '../index';
import {createBuilder} from '../utils';

export type WhileStatement = JSNodeBase & {
  type: 'WhileStatement';
  test: AnyExpression;
  body: AnyStatement;
};

export const whileStatement = createBuilder<WhileStatement>('WhileStatement', {
  bindingKeys: {},
  visitorKeys: {
    test: true,
    body: true,
  },
});
