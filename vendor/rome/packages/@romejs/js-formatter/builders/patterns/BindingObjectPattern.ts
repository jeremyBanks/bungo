/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import Builder from '../../Builder';
import {Tokens, concat} from '../../tokens';
import {bindingObjectPattern, AnyNode} from '@romejs/js-ast';
import ObjectExpression from '../objects/ObjectExpression';
import {printPatternMeta} from '../utils';

export default function BindingObjectPattern(
  builder: Builder,
  node: AnyNode,
): Tokens {
  node = bindingObjectPattern.assert(node);

  return [
    concat(ObjectExpression(builder, node)),
    concat(printPatternMeta(builder, node, node.meta)),
  ];
}
