/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

// TODO: Shift file into packages/@romejs/js-compiler/transforms/lint/__rtests__
// after all open linting PRs have been merged.

import {test, TestHelper} from 'rome';
import lint from './lint';
import {parseJS} from '@romejs/js-parser';
import {createUnknownFilePath} from '@romejs/path';
import {DEFAULT_PROJECT_CONFIG} from '@romejs/project';
import {ConstSourceType, ConstProgramSyntax} from '@romejs/js-ast';
import {DiagnosticCategory} from '@romejs/diagnostics';
import {printDiagnosticsToString} from '@romejs/cli-diagnostics';

type TestLintOptions = {
  category: undefined | DiagnosticCategory;
  format?: boolean;
  sourceType?: ConstSourceType;
  syntax?: Array<ConstProgramSyntax>;
};

export async function testLintMultiple(
  t: TestHelper,
  inputs: Array<string>,
  opts: TestLintOptions,
) {
  for (const input of inputs) {
    await testLint(t, input, opts);
  }
}

export async function testLint(t: TestHelper, input: string, {
  syntax = [],
  category,
  format = false,
  sourceType = 'module',
}: TestLintOptions) {
  t.addToAdvice({
    type: 'log',
    category: 'info',
    message: 'Lint options',
  });

  t.addToAdvice({
    type: 'inspect',
    data: {
      category,
      syntax,
      format,
      sourceType,
    },
  });

  t.addToAdvice({
    type: 'log',
    category: 'info',
    message: 'Input',
  });

  t.addToAdvice({
    type: 'code',
    code: input,
  });

  const ast = parseJS({
    input,
    sourceType,
    path: createUnknownFilePath('unknown'),
    syntax,
  });

  const res = await lint({
    options: {},
    format,
    ast,
    sourceText: input,
    project: {
      folder: undefined,
      config: DEFAULT_PROJECT_CONFIG,
    },
  });

  const diagnostics = res.diagnostics.filter((diag) => {
    return diag.description.category === category;
  }).map((diag) => {
    return {
      ...diag,
      location: {
        ...diag.location,
        sourceText: input,
      },
    };
  });

  const snapshotName = await t.snapshot(printDiagnosticsToString({
    diagnostics,
    suppressions: res.suppressions,
  }));

  if (format) {
    await t.snapshotNamed(`${snapshotName}: formatted`, res.src);
  }

  t.clearAdvice();
}

test('format disabled in project config should not regenerate the file', async (
  t,
) => {
  // Intentionally weird formatting
  await testLint(t, 'foobar ( "yes" );', {category: undefined, format: false});
});

test(
  'format enabled in project config should result in regenerated file',
  async (t) => {
    await testLint(t, 'foobar ( "yes" );', {
      category: undefined,
      format: true,
    });
  },
);
