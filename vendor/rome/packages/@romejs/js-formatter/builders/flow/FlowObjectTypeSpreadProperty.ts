/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import Builder from '../../Builder';
import {Tokens, operator} from '../../tokens';
import {
  AnyNode,
  FlowObjectTypeSpreadProperty,
  flowObjectTypeSpreadProperty,
} from '@romejs/js-ast';

export default function FlowObjectTypeSpreadProperty(
  builder: Builder,
  node: AnyNode,
): Tokens {
  node = flowObjectTypeSpreadProperty.assert(node);

  return [operator('...'), ...builder.tokenize(node.argument, node)];
}
