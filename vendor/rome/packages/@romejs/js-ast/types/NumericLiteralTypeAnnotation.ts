/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {JSNodeBase, NumericLiteral} from '../index';
import {createBuilder} from '../utils';

export type NumericLiteralTypeAnnotation = JSNodeBase & {
  type: 'NumericLiteralTypeAnnotation';
  value: number;
  format?: NumericLiteral['format'];
};

export const numericLiteralTypeAnnotation = createBuilder<NumericLiteralTypeAnnotation>(
  'NumericLiteralTypeAnnotation',
  {
    bindingKeys: {},
    visitorKeys: {},
  },
);
