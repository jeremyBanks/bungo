/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import Builder from '../../Builder';
import {Token, concat} from '../../tokens';
import {FlowNullableTypeAnnotation} from '@romejs/js-ast';

export default function FlowNullableTypeAnnotation(
  builder: Builder,
  node: FlowNullableTypeAnnotation,
): Token {
  return concat(['?', builder.tokenize(node.typeAnnotation, node)]);
}
