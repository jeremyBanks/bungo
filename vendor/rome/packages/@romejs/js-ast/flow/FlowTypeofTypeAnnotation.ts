/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {JSNodeBase, AnyFlowPrimary} from '../index';
import {createBuilder} from '../utils';

export type FlowTypeofTypeAnnotation = JSNodeBase & {
  type: 'FlowTypeofTypeAnnotation';
  argument: AnyFlowPrimary;
};

export const flowTypeofTypeAnnotation = createBuilder<FlowTypeofTypeAnnotation>(
  'FlowTypeofTypeAnnotation',
  {
    bindingKeys: {},
    visitorKeys: {
      argument: true,
    },
  },
);
