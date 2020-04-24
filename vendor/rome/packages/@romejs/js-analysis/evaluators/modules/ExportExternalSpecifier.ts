/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  AnyNode,
  ExportExternalSpecifier,
  exportExternalSpecifier,
} from '@romejs/js-ast';

export default function ExportExternalSpecifier(node: AnyNode) {
  node = exportExternalSpecifier.assert(node);
  throw new Error('unimplemented');
}
