/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {AnyFlowDeclare, AnyFlowPrimary, JSNodeBase} from '../index';
import {createBuilder} from '../utils';

export type FlowDeclareExportDefault = JSNodeBase & {
  type: 'FlowDeclareExportDefault';
  declaration: AnyFlowPrimary | AnyFlowDeclare;
};

export const flowDeclareExportDefault = createBuilder<FlowDeclareExportDefault>(
  'FlowDeclareExportDefault',
  {
    bindingKeys: {},
    visitorKeys: {
      declaration: true,
    },
  },
);
