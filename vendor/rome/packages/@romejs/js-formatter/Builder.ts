/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {AnyComment, AnyNode} from '@romejs/js-ast';
import {isTypeExpressionWrapperNode, isTypeNode} from '@romejs/js-ast-utils';
import CommentsConsumer from '@romejs/js-parser/CommentsConsumer';
import {
  printComment,
  printLeadingComment,
  printTrailingComment,
} from './builders/comments';
import builderFunctions from './builders/index';
import * as n from './node/index';
import {Token, concat, hardline, indent, join, mark} from './tokens';

export type BuilderMethod<T extends AnyNode = AnyNode> = (
  builder: Builder,
  node: T,
  parent: AnyNode,
) => Token | never;

export type BuilderOptions = {
  typeAnnotations: boolean;
  format?: 'pretty' | 'compact';
  sourceMaps?: boolean;
  sourceText?: string;
};

export default class Builder {
  constructor(opts: BuilderOptions, comments: Array<AnyComment> = []) {
    this.options = opts;
    this.comments = new CommentsConsumer(comments);
    this.printedComments = new Set();
    this.printStack = [];
  }

  options: BuilderOptions;
  comments: CommentsConsumer;
  printedComments: Set<string>;
  printStack: Array<AnyNode>;

  tokenize(node: undefined | AnyNode, parent: AnyNode): Token {
    if (node === undefined) {
      return '';
    }

    if (
      !this.options.typeAnnotations &&
      isTypeNode(node) &&
      !isTypeExpressionWrapperNode(node)
    ) {
      return '';
    }

    const tokenizeNode = builderFunctions.get(node.type);
    if (tokenizeNode === undefined) {
      throw new Error(
        `No known builder for node ${node.type} with parent ${parent.type}`,
      );
    }

    this.printStack.push(node);
    let printedNode = tokenizeNode(this, node, parent);
    const needsParens = n.needsParens(node, parent, this.printStack);
    this.printStack.pop();

    if (printedNode !== '') {
      if (this.options.sourceMaps && node.loc !== undefined) {
        printedNode = concat([
          mark(node.loc, 'start'),
          printedNode,
          mark(node.loc, 'end'),
        ]);
      }

      if (needsParens) {
        printedNode = concat(['(', printedNode, ')']);
      }
    }

    return this.tokenizeComments(node, printedNode);
  }

  tokenizeComments(node: AnyNode, printed: Token): Token {
    const tokens = [];

    const leadingComments = this.getComments('leadingComments', node);
    if (leadingComments !== undefined) {
      let next = node;

      // Leading comments are traversed backward in order to get `next` right
      for (let i = leadingComments.length - 1; i >= 0; i--) {
        const comment = leadingComments[i];
        this.printedComments.add(comment.id);
        tokens.unshift(printLeadingComment(comment, next));
        next = comment;
      }
    }

    tokens.push(printed);

    const trailingComments = this.getComments('trailingComments', node);
    if (trailingComments !== undefined) {
      let previous = node;

      for (const comment of trailingComments) {
        this.printedComments.add(comment.id);
        tokens.push(printTrailingComment(comment, previous));
        previous = comment;
      }
    }

    return concat(tokens);
  }

  tokenizeStatementList(nodes: Array<AnyNode>, parent: AnyNode): Token {
    if (nodes.length === 0) {
      return '';
    }

    const tokens: Array<Token> = [];

    for (let i = 0; i < nodes.length; i++) {
      const isLast = i === nodes.length - 1;
      const node = nodes[i];

      if (node.type === 'EmptyStatement') {
        continue;
      }

      let printed = this.tokenize(node, parent);

      if (!isLast) {
        const nextNode = nodes[i + 1];
        const trailingComments = this.getComments(
          'trailingComments',
          node,
          true,
        );

        let currentNode = node;
        if (trailingComments && trailingComments.length > 0) {
          currentNode = trailingComments[trailingComments.length - 1];
        }

        if (n.getLinesBetween(currentNode, nextNode) > 1) {
          printed = concat([printed, hardline]);
        }
      }

      tokens.push(printed);
    }

    return join(hardline, tokens);
  }

  tokenizeInnerComments(node: AnyNode, shouldIndent: boolean): Token {
    const innerComments = this.getComments('innerComments', node);
    if (innerComments === undefined) {
      return '';
    }

    const tokens: Array<Token> = [];

    for (const comment of innerComments) {
      this.printedComments.add(comment.id);
      tokens.push(printComment(comment));
    }

    return shouldIndent
      ? indent(concat([hardline, join(hardline, tokens)]))
      : join(hardline, tokens);
  }

  getComments(
    kind: 'leadingComments' | 'trailingComments' | 'innerComments',
    node: AnyNode,
    all: boolean = false,
  ): undefined | Array<AnyComment> {
    if (!node) {
      return undefined;
    }

    const ids = node[kind];
    if (ids === undefined) {
      return undefined;
    }

    const comments = this.comments.getCommentsFromIds(ids);

    if (all) {
      return comments;
    } else {
      return comments.filter((comment) => !this.printedComments.has(comment.id));
    }
  }
}
