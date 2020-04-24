/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  MemberExpression,
  TSInferType,
  AnyNode,
  FlowNullableTypeAnnotation,
  UpdateExpression,
  ObjectExpression,
  DoExpression,
  LogicalExpression,
  BinaryExpression,
  SequenceExpression,
  YieldExpression,
  ClassExpression,
  UnaryExpression,
  SpreadElement,
  SpreadProperty,
  ArrowFunctionExpression,
  AssignmentExpression,
  ConditionalExpression,
  UnionTypeAnnotation,
  FlowFunctionTypeAnnotation,
  OptionalCallExpression,
} from '@romejs/js-ast';
import {
  isFor,
  isUnaryLike,
  isConditional,
  isBinary,
} from '@romejs/js-ast-utils';

const PRECEDENCE = {
  '||': 0,
  '&&': 1,
  '??': 1,
  '|': 2,
  '^': 3,
  '&': 4,
  '==': 5,
  '===': 5,
  '!=': 5,
  '!==': 5,
  '<': 6,
  '>': 6,
  '<=': 6,
  '>=': 6,
  in: 6,
  instanceof: 6,
  '>>': 7,
  '<<': 7,
  '>>>': 7,
  '+': 8,
  '-': 8,
  '*': 9,
  '/': 9,
  '%': 9,
  '**': 10,
};

function isClassExtendsClause(node: AnyNode, parent: AnyNode): boolean {
  return (parent.type === 'ClassDeclaration' || parent.type ===
    'ClassExpression') && parent.meta.superClass === node;
}

const parens: Map<AnyNode['type'], // rome-suppress-next-line lint/noExplicitAny
(node: any, parent: AnyNode, printStack: Array<AnyNode>) => boolean> = new Map();
export default parens;

parens.set('TSAsExpression', () => {
  return true;
});

parens.set('TSTypeAssertion', () => {
  return true;
});

parens.set('FlowNullableTypeAnnotation', (
  node: FlowNullableTypeAnnotation,
  parent: AnyNode,
): boolean => {
  return parent.type === 'FlowArrayTypeAnnotation';
});

parens.set('MemberExpression', function(
  node: MemberExpression,
  parent: AnyNode,
): boolean {
  if (node.property.optional) {
    return parent.type === 'CallExpression' && parent.callee === node ||
          parent.type ===
          'MemberExpression' &&
        parent.object === node;
  } else {
    return false;
  }
});

parens.set('UpdateExpression', function(
  node: UpdateExpression,
  parent: AnyNode,
): boolean {
  return (// (foo++).test(), (foo++)[0]
      parent.type === 'MemberExpression' && parent.object === node || // (foo++)()
      parent.type === 'CallExpression' && parent.callee === node || // new (foo++)()
      parent.type === 'NewExpression' && parent.callee === node ||
      isClassExtendsClause(node, parent)
  );
});

parens.set('ObjectExpression', function(
  node: ObjectExpression,
  parent: AnyNode,
  printStack: Array<AnyNode>,
): boolean {
  return isFirstInStatement(printStack, {considerArrow: true});
});

parens.set('DoExpression', function(
  node: DoExpression,
  parent: AnyNode,
  printStack: Array<AnyNode>,
): boolean {
  return isFirstInStatement(printStack);
});

function needsParenLogicalExpression(
  node: BinaryExpression | LogicalExpression,
  parent: AnyNode,
): boolean {
  if (node.operator === '**' && parent.type === 'BinaryExpression' &&
        parent.operator ===
        '**') {
    return parent.left === node;
  }

  if (isClassExtendsClause(node, parent)) {
    return true;
  }

  if ((parent.type === 'CallExpression' || parent.type === 'NewExpression') &&
        parent.callee ===
        node || isUnaryLike(parent) || parent.type === 'MemberExpression' &&
        parent.object ===
        node || parent.type === 'AwaitExpression') {
    return true;
  }

  if (isBinary(parent)) {
    const parentOp = parent.operator;
    const parentPos = PRECEDENCE[parentOp];

    const nodeOp = node.operator;
    const nodePos = PRECEDENCE[nodeOp];

    if ( // Logical expressions with the same precedence don't need parens.
      parentPos === nodePos && parent.right === node && parent.type !==
        'LogicalExpression' || parentPos > nodePos) {
      return true;
    }
  }

  switch (node.operator) {
    case '||':
      if (parent.type === 'LogicalExpression') {
        return parent.operator === '??' || parent.operator === '&&';
      } else {
        return false;
      }

    case '&&':
      return parent.type === 'LogicalExpression' && parent.operator === '??';

    case '??':
      return parent.type === 'LogicalExpression' && parent.operator !== '??';

    default:
      return false;
  }
}

parens.set('LogicalExpression', needsParenLogicalExpression);

parens.set('BinaryExpression', function(
  node: BinaryExpression,
  parent: AnyNode,
): boolean {
  // let i = (1 in []);

  // for ((1 in []);;);
  return node.operator === 'in' && (parent.type === 'VariableDeclarator' ||
    isFor(parent)) || needsParenLogicalExpression(node, parent);
});

parens.set('SequenceExpression', function(
  node: SequenceExpression,
  parent: AnyNode,
): boolean {
  if ( // Although parentheses wouldn"t hurt around sequence
    // expressions in the head of for loops, traditional style
    // dictates that e.g. i++, j++ should not be wrapped with
    // parentheses.
        parent.type === 'ForStatement' || parent.type === 'ThrowStatement' ||
          parent.type ===
          'ReturnStatement' || parent.type === 'IfStatement' && parent.test ===
        node || parent.type === 'WhileStatement' && parent.test === node ||
          parent.type ===
          'ForInStatement' &&
        parent.right === node || parent.type === 'SwitchStatement' &&
        parent.discriminant ===
        node || parent.type === 'ExpressionStatement' && parent.expression ===
      node) {
    return false;
  }

  // Otherwise err on the side of overparenthesization, adding

  // explicit exceptions above if this proves overzealous.
  return true;
});

function needsParenYieldExpression(
  node: YieldExpression,
  parent: AnyNode,
): boolean {
  return isBinary(parent) || isUnaryLike(parent) || parent.type ===
        'MemberExpression' || parent.type === 'CallExpression' &&
          parent.callee ===
          node || parent.type === 'NewExpression' && parent.callee === node ||
          parent.type ===
          'AwaitExpression' &&
        node.type === 'YieldExpression' ||
      parent.type === 'ConditionalExpression' &&
      node === parent.test || isClassExtendsClause(node, parent);
}

parens.set('YieldExpression', needsParenYieldExpression);
parens.set('AwaitExpression', needsParenYieldExpression);

parens.set('OptionalCallExpression', function(
  node: OptionalCallExpression,
  parent: AnyNode,
): boolean {
  return parent.type === 'CallExpression' && parent.callee === node ||
        parent.type ===
        'MemberExpression' &&
      parent.object === node;
});

parens.set('ClassExpression', function(
  node: ClassExpression,
  parent: AnyNode,
  printStack: Array<AnyNode>,
): boolean {
  return isFirstInStatement(printStack, {considerDefaultExports: true});
});

function needsParenUnaryExpression(
  node:
    | UnaryExpression
    | ArrowFunctionExpression
    | AssignmentExpression
    | ConditionalExpression
    | SpreadElement
    | SpreadProperty,

  parent: AnyNode,
): boolean {
  return parent.type === 'MemberExpression' && parent.object === node ||
        parent.type ===
        'CallExpression' &&
      parent.callee === node || parent.type === 'NewExpression' &&
      parent.callee ===
      node || parent.type === 'BinaryExpression' && parent.operator === '**' &&
      parent.left ===
      node || isClassExtendsClause(node, parent);
}

parens.set('UnaryExpression', needsParenUnaryExpression);
parens.set('SpreadElement', needsParenUnaryExpression);
parens.set('SpreadProperty', needsParenUnaryExpression);

parens.set('FunctionExpression', function(
  node: AnyNode,
  parent: AnyNode,
  printStack: Array<AnyNode>,
): boolean {
  return isFirstInStatement(printStack, {considerDefaultExports: true});
});

parens.set('ArrowFunctionExpression', function(
  node: ArrowFunctionExpression,
  parent: AnyNode,
): boolean {
  return parent.type === 'ExportLocalDeclaration' ||
    needsParenConditionalExpression(node, parent);
});

function needsParenConditionalExpression(
  node: ArrowFunctionExpression | AssignmentExpression | ConditionalExpression,
  parent: AnyNode,
): boolean {
  if (isUnaryLike(parent) || isBinary(parent) || parent.type ===
        'ConditionalExpression' && parent.test === node || parent.type ===
        'AwaitExpression' || parent.type === 'MemberExpression' &&
          parent.object ===
          node && parent.property.optional || parent.type ===
        'OptionalCallExpression' && parent.callee === node || parent.type ===
        'TaggedTemplateExpression' || parent.type === 'TSTypeAssertion' ||
        parent.type ===
        'TSAsExpression') {
    return true;
  }

  return needsParenUnaryExpression(node, parent);
}

parens.set('ConditionalExpression', needsParenConditionalExpression);

parens.set('AssignmentExpression', function(
  node: AssignmentExpression,
  parent: AnyNode,
): boolean {
  if (node.left.type === 'AssignmentObjectPattern') {
    return true;
  } else {
    return needsParenConditionalExpression(node, parent);
  }
});

function needsParenUnionTypeAnnotation(
  node: UnionTypeAnnotation,
  parent: AnyNode,
) {
  return parent.type === 'FlowArrayTypeAnnotation' || parent.type ===
        'FlowNullableTypeAnnotation' || parent.type ===
        'IntersectionTypeAnnotation' ||
      parent.type === 'UnionTypeAnnotation' || parent.type === 'TSArrayType' ||
      parent.type ===
      'TSOptionalType';
}

parens.set('UnionTypeAnnotation', needsParenUnionTypeAnnotation);
parens.set('IntersectionTypeAnnotation', needsParenUnionTypeAnnotation);

parens.set(
  'TSInferType',
  function(node: TSInferType, parent: AnyNode): boolean {
    return parent.type === 'TSArrayType' || parent.type === 'TSOptionalType';
  },
);

parens.set('FlowFunctionTypeAnnotation', function(
  node: FlowFunctionTypeAnnotation,
  parent: AnyNode,
  printStack: Array<AnyNode>,
) {
  // Check if we are the return type of an arrow
  for (const printNode of printStack) {
    if (printNode.type === 'ArrowFunctionExpression' &&
          printNode.head.returnType ===
          node) {
      return true;
    }
  }

  // ((a: () => A) => (a: A) => A)
  if (node.returnType !== undefined && node.returnType.type ===
      'FlowFunctionTypeAnnotation') {
    return true;
  }

  return (// (() => A) | (() => B)
    parent.type === 'UnionTypeAnnotation' || // (() => A) & (() => B)
    parent.type === 'IntersectionTypeAnnotation' || // (() => A)[]
    parent.type === 'FlowArrayTypeAnnotation'
  );
});

// Walk up the print stack to deterimine if our node can come first
// in statement.
function isFirstInStatement(
  printStack: Array<AnyNode>,
  {considerArrow = false, considerDefaultExports = false} = {},
): boolean {
  let i = printStack.length - 1;
  let node = printStack[i];
  i--;
  let parent = printStack[i];
  while (i > 0) {
    if (parent.type === 'ExpressionStatement' && parent.expression === node ||
            parent.type ===
            'TaggedTemplateExpression' || considerDefaultExports &&
            parent.type ===
            'ExportDefaultDeclaration' && parent.declaration === node ||
            considerArrow &&
            parent.type === 'ArrowFunctionExpression' &&
          parent.body === node) {
      return true;
    }

    if (parent.type === 'CallExpression' && parent.callee === node ||
              parent.type ===
              'SequenceExpression' &&
            parent.expressions[0] === node ||
          parent.type === 'MemberExpression' &&
          parent.object === node || isConditional(parent) && parent.test ===
        node || isBinary(parent) && parent.left === node || parent.type ===
        'AssignmentExpression' && parent.left === node) {
      node = parent;
      i--;
      parent = printStack[i];
    } else {
      return false;
    }
  }

  return false;
}
