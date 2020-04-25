/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {Path, TransformExitResult} from '@romejs/js-compiler';
import {arrayExpression, referenceIdentifier} from '@romejs/js-ast';
import {descriptions} from '@romejs/diagnostics';

export default {
  name: 'sparseArray',
  enter(path: Path): TransformExitResult {
    const {node} = path;

    if (node.type === 'ArrayExpression' && node.elements.includes(undefined)) {
      return path.context.addFixableDiagnostic({
        old: node,
        fixed: arrayExpression.quick(node.elements.map((elem) => elem ===
          undefined ? referenceIdentifier.create({name: 'undefined'}) : elem)),
      }, descriptions.LINT.SPARSE_ARRAY);
    }

    return node;
  },
};
