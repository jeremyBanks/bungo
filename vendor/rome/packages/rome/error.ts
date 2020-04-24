/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  Diagnostics,
  getDiagnosticsFromError,
  DiagnosticSuppressions,
} from '@romejs/diagnostics';
import {printDiagnosticsToString} from '@romejs/cli-diagnostics';

export class RomeDiagnosticsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RomeDiagnosticsError';
  }

  getHTML(): string {
    return '';
  }

  getAnsi(): string {
    return '';
  }
}

export function throwDiagnostics(diagnostics: Diagnostics) {
  if (diagnostics.length === 0) {
    return;
  }

  const suppressions: DiagnosticSuppressions = [];

  // We do not want to expose the `diagnostics`
  const err = new RomeDiagnosticsError(printDiagnosticsToString({
    diagnostics,
    suppressions,
    format: 'none',
  }));
  err.getHTML = () => printDiagnosticsToString({
    diagnostics,
    suppressions,
    format: 'html',
  });
  err.getAnsi = () => printDiagnosticsToString({
    diagnostics,
    suppressions,
    format: 'ansi',
  });
  throw err;
}

export function wrapForErrors<
  T,
  Args extends Array<unknown>
>(callback: (...args: Args) => Promise<T>): (...args: Args) => Promise<T> {
  return async function(...args: Args): Promise<T> {
    try {
      return await callback(...args);
    } catch (err) {
      // Catches DiagnosticsError
      const diags = getDiagnosticsFromError(err);
      if (diags === undefined) {
        throw err;
      } else {
        throw throwDiagnostics(diags);
      }
    }
  };
}
