/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {Scope} from '../../scopes';
import {
  FlowTypeParameterDeclaration,
  flowTypeParameterDeclaration,
  AnyNode,
} from '@romejs/js-ast';

export default function FlowTypeParameterDeclaration(
  node: AnyNode,
  scope: Scope,
) {
  node = flowTypeParameterDeclaration.assert(node);

  for (const param of node.params) {
    scope.evaluate(param);
  }
}
