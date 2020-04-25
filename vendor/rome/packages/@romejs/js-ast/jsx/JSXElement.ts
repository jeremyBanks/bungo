/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  AnyTypeArguments,
  JSNodeBase,
  JSXAttribute,
  JSXExpressionContainer,
  JSXFragment,
  JSXIdentifier,
  JSXMemberExpression,
  JSXNamespacedName,
  JSXReferenceIdentifier,
  JSXSpreadAttribute,
  JSXSpreadChild,
  JSXText,
} from '../index';
import {createBuilder} from '../utils';

export type JSXElement = JSNodeBase & {
  type: 'JSXElement';
  name:
    | JSXReferenceIdentifier
    | JSXIdentifier
    | JSXNamespacedName
    | JSXMemberExpression;
  typeArguments?: AnyTypeArguments;
  attributes: Array<JSXSpreadAttribute | JSXAttribute>;
  selfClosing: boolean;
  children: Array<
    | JSXText
    | JSXExpressionContainer
    | JSXSpreadChild
    | JSXElement
    | JSXFragment>;
};

export const jsxElement = createBuilder<JSXElement>('JSXElement', {
  bindingKeys: {},
  visitorKeys: {
    name: true,
    typeArguments: true,
    attributes: true,
    children: true,
  },
});
