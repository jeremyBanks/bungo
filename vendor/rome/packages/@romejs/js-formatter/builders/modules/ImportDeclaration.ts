/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import Builder from '../../Builder';
import {
  Tokens,
  concat,
  linkedGroups,
  operator,
  space,
  word,
} from '../../tokens';
import {
  AnyNode,
  ExportExternalDeclaration,
  ImportDeclaration,
  importDeclaration,
} from '@romejs/js-ast';

export default function ImportDeclaration(
  builder: Builder,
  node: AnyNode,
): Tokens {
  node = importDeclaration.assert(node);

  const tokens: Tokens = [word('import'), space];

  if (node.importKind === 'type' || node.importKind === 'typeof') {
    tokens.push(word(node.importKind));
    tokens.push(space);
  }

  const {namedSpecifiers, defaultSpecifier, namespaceSpecifier} = node;

  if (namedSpecifiers.length > 0 || namespaceSpecifier !== undefined ||
        defaultSpecifier !==
        undefined) {
    tokens.push(
      concat(printModuleSpecifiers(builder, node)),
      space,
      word('from'),
      space,
    );
  }

  return [
    linkedGroups([
      concat(tokens),
      concat(builder.tokenize(node.source, node)),
      operator(';'),
    ]),
  ];
}

export function printModuleSpecifiers(
  builder: Builder,
  node: ImportDeclaration | ExportExternalDeclaration,
): Tokens {
  const {namedSpecifiers, defaultSpecifier, namespaceSpecifier} = node;

  let tokens: Tokens = [];

  if (defaultSpecifier !== undefined) {
    tokens = builder.tokenize(node.defaultSpecifier, node);

    if (namedSpecifiers.length > 0 || namespaceSpecifier !== undefined) {
      tokens.push(operator(','), space);
    }
  }

  if (namespaceSpecifier !== undefined) {
    tokens.push(concat(builder.tokenize(namespaceSpecifier, node)));

    if (namedSpecifiers.length > 0) {
      tokens.push(operator(','), space);
    }
  }

  if (namedSpecifiers.length === 0) {
    return tokens;
  } else {
    return [
      concat(tokens),
      operator('{'),
      builder.tokenizeCommaList(namedSpecifiers, node, {
        trailing: true,
      }),
      operator('}'),
    ];
  }
}
