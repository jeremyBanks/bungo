/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import Builder from '../../Builder';
import {Tokens, word, space} from '../../tokens';
import {FlowDeclareModule, flowDeclareModule, AnyNode} from '@romejs/js-ast';

export default function FlowDeclareModule(
  builder: Builder,
  node: AnyNode,
): Tokens {
  node = flowDeclareModule.assert(node);

  return [
    word('declare'),
    space,
    word('module'),
    space,
    ...builder.tokenize(node.id, node),
    space,
    ...builder.tokenize(node.body, node),
  ];
}
