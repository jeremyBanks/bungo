/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import Builder from '../../Builder';
import {Tokens, concat} from '../../tokens';
import {AnyNode, computedMemberProperty} from '@romejs/js-ast';
import {operator} from '@romejs/js-formatter/tokens';

export default function ComputedMemberProperty(
  builder: Builder,
  node: AnyNode,
): Tokens {
  node = computedMemberProperty.assert(node);

  return [
    operator('['),
    concat(builder.tokenize(node.value, node)),
    operator(']'),
  ];
}
