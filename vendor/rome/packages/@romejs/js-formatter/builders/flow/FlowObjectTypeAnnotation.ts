/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import Builder from '../../Builder';
import {Tokens, operator} from '../../tokens';
import {
  FlowObjectTypeAnnotation,
  flowObjectTypeAnnotation,
  AnyNode,
} from '@romejs/js-ast';

export default function FlowObjectTypeAnnotation(
  builder: Builder,
  node: AnyNode,
): Tokens {
  node = flowObjectTypeAnnotation.assert(node);

  return [
    operator(node.exact ? '{|' : '{'),
    builder.tokenizeCommaList(node.properties, node),
    operator(node.exact ? '|}' : '}'),
  ];
}
