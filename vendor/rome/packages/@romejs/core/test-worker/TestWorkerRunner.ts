/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {UnknownObject} from '@romejs/typescript-helpers';
import {
  Diagnostic,
  DiagnosticAdvice,
  DiagnosticLogCategory,
  INTERNAL_ERROR_LOG_ADVICE,
  catchDiagnostics,
  createBlessedDiagnosticMessage,
  createSingleDiagnosticError,
  deriveDiagnosticFromError,
  descriptions,
  getErrorStackAdvice,
} from '@romejs/diagnostics';
import {
  GlobalTestOptions,
  TestCallback,
  TestOptions,
} from '@romejs-runtime/rome/test';
import {
  default as TestWorkerBridge,
  TestWorkerBridgeRunOptions,
} from '../common/bridges/TestWorkerBridge';
import {TestRunnerOptions} from '../master/testing/types';
import SnapshotManager from './SnapshotManager';
import TestAPI, {OnTimeout} from './TestAPI';
import executeMain from '../common/utils/executeMain';
import {
  FileReference,
  convertTransportFileReference,
} from '../common/types/files';
import {AbsoluteFilePath, createAbsoluteFilePath} from '@romejs/path';
import {escapeMarkup, markup} from '@romejs/string-markup';
import {ErrorFrames, getErrorStructure} from '@romejs/v8';
import prettyFormat from '@romejs/pretty-format';

const MAX_RUNNING_TESTS = 20;

function cleanFrames(frames: ErrorFrames): ErrorFrames {
  // TODO we should actually get the frames before module init and do it that way
  // Remove everything before the original module factory
  let latestTestWorkerFrame = frames.find((frame, i) => {
    if (
      frame.typeName === 'global' &&
      frame.methodName === undefined &&
      frame.functionName === undefined
    ) {
      // We are the global.<anonymous> frame
      // Now check for Script.runInContext
      const nextFrame = frames[i + 1];
      if (
        nextFrame !== undefined &&
        nextFrame.typeName === 'Script' &&
        nextFrame.methodName === 'runInContext'
      ) {
        // Yes!
        // TODO also check for ___$romejs$core$common$utils$executeMain_ts$default (packages/romejs/core/common/utils/executeMain.ts:69:17)
        return true;
      }
    }

    return false;
  });

  // And if there was no module factory frame, then we must be inside of a test
  if (latestTestWorkerFrame === undefined) {
    latestTestWorkerFrame = frames.find((frame) => {
      return (
        frame.typeName !== undefined &&
        frame.typeName.includes('$TestWorkerRunner')
      );
    });
  }

  if (latestTestWorkerFrame === undefined) {
    return frames;
  }

  return frames.slice(0, frames.indexOf(latestTestWorkerFrame));
}

export default class TestWorkerRunner {
  constructor(opts: TestWorkerBridgeRunOptions, bridge: TestWorkerBridge) {
    this.opts = opts;
    this.locked = false;
    this.file = convertTransportFileReference(opts.file);
    this.options = opts.options;
    this.bridge = bridge;
    this.projectFolder = createAbsoluteFilePath(opts.projectFolder);

    this.snapshotManager = new SnapshotManager(
      this,
      createAbsoluteFilePath(opts.file.real),
    );

    this.emitConsoleDiagnostics = false;
    this.consoleAdvice = [];
    this.hasFocusedTest = false;
    this.foundTests = new Map();
  }

  foundTests: Map<
    string,
    {
      callsiteError: Error;
      options: TestOptions;
      callback: undefined | TestCallback;
    }
  >;
  hasFocusedTest: boolean;
  bridge: TestWorkerBridge;
  projectFolder: AbsoluteFilePath;
  file: FileReference;
  options: TestRunnerOptions;
  snapshotManager: SnapshotManager;
  opts: TestWorkerBridgeRunOptions;
  locked: boolean;
  consoleAdvice: DiagnosticAdvice;
  emitConsoleDiagnostics: boolean;

  createConsole(): Partial<Console> {
    const addDiagnostic = (
      category: DiagnosticLogCategory,
      args: Array<unknown>,
    ) => {
      let textParts: Array<string> = [];
      if (args.length === 1 && typeof args[0] === 'string') {
        textParts.push(escapeMarkup(args[0]));
      } else {
        textParts = args.map((arg) => prettyFormat(arg, {markup: true}));
      }
      const text = textParts.join(' ');

      const err = new Error();

      // Remove the first two frames to get to the actual source
      const frames = cleanFrames(getErrorStructure(err).frames.slice(2));

      this.consoleAdvice.push({
        type: 'log',
        category,
        text,
      });
      this.consoleAdvice = this.consoleAdvice.concat(
        getErrorStackAdvice(err, undefined, frames),
      );
    };

    function logInfo(...args: Array<unknown>): void {
      addDiagnostic('info', args);
    }

    return {
      assert(expression: unknown, ...args: Array<unknown>): void {
        if (!expression) {
          args[0] = `Assertion failed${args.length === 0 ? '' : `: ${args[0]}`}`;
          addDiagnostic('warn', args);
        }
      },
      dir(obj: unknown): void {
        addDiagnostic('info', [obj]);
      },
      error: (...args: Array<unknown>): void => {
        addDiagnostic('error', args);
      },
      warn: (...args: Array<unknown>): void => {
        addDiagnostic('warn', args);
      },
      dirxml: logInfo,
      debug: logInfo,
      info: logInfo,
      log: logInfo,
      trace: logInfo,
      // Noop
      count(): void {},
      countReset(): void {},
      table(): void {},
      time(): void {},
      timeEnd(): void {},
      timeLog(): void {},
      clear(): void {},
      group(): void {},
      groupCollapsed(): void {},
      groupEnd(): void {},
      profile(): void {},
      profileEnd(): void {},
      timeStamp(): void {},
    };
  }

  //  Global variables to expose to tests
  getEnvironment(): UnknownObject {
    const testOptions: GlobalTestOptions = {
      dirname: this.file.real.getParent().join(),
      register: (
        callsiteError: Error,
        opts: TestOptions,
        callback?: TestCallback,
      ) => {
        this.registerTest(callsiteError, opts, callback);
      },
    };

    return {
      __ROME__TEST_OPTIONS__: testOptions,
      console: this.createConsole(),
    };
  }

  async emitDiagnostic(diagnostic: Diagnostic) {
    await this.bridge.testError.call({
      ref: undefined,
      diagnostic,
    });
  }

  // execute the test file and discover tests
  async discoverTests() {
    const {code} = this.opts;

    const res = await executeMain({
      path: this.file.real,
      code,
      globals: this.getEnvironment(),
    });

    if (res.syntaxError !== undefined) {
      const message = `A bundle was generated that contained a syntax error: ${res.syntaxError.description.message.value}`;

      throw createSingleDiagnosticError({
        ...res.syntaxError,
        description: {
          ...res.syntaxError.description,
          message: createBlessedDiagnosticMessage(message),
          advice: [INTERNAL_ERROR_LOG_ADVICE],
        },
        location: {
          ...res.syntaxError.location,
          filename: this.file.uid,
        },
      });
    }
  }

  lockTests() {
    this.locked = true;
  }

  registerTest(
    callsiteError: Error,
    options: TestOptions,
    callback: undefined | TestCallback,
  ) {
    if (this.locked) {
      throw new Error("Test can't be added outside of init");
    }

    let testName = options.name;
    if (Array.isArray(testName)) {
      testName = testName.join(' > ');
    }

    if (this.foundTests.has(testName)) {
      throw new Error(`Test ${testName} has already been defined`);
    }

    this.foundTests.set(
      testName,
      {
        callback,
        options,
        callsiteError,
      },
    );

    if (options.only === true) {
      this.hasFocusedTest = true;
    }
  }

  onError(
    testName: undefined | string,
    opts: {
      error: Error;
      firstAdvice: DiagnosticAdvice;
      lastAdvice: DiagnosticAdvice;
    },
  ) {
    const filename = this.file.real.join();

    let ref = undefined;
    if (testName === undefined) {
      testName = 'unknown';
    } else {
      ref = {
        filename,
        testName,
      };
    }

    let diagnostic: Diagnostic = deriveDiagnosticFromError({
      error: opts.error,
      category: 'tests/failure',
      label: escapeMarkup(testName),
      filename,
      cleanFrames,
    });

    diagnostic = {
      ...diagnostic,
      description: {
        ...diagnostic.description,
        advice: [
          ...opts.firstAdvice,
          ...(diagnostic.description.advice || []),
          ...opts.lastAdvice,
        ],
      },
    };

    this.emitConsoleDiagnostics = true;
    this.bridge.testError.send({
      ref,
      diagnostic,
    });
  }

  async teardownTest(testName: string, api: TestAPI) {
    api.clearTimeout();

    try {
      await api.teardownEvent.callOptional();
    } catch (err) {
      this.onError(
        testName,
        {
          error: err,
          firstAdvice: [],
          lastAdvice: [
            {
              type: 'log',
              category: 'info',
              text: `Error occured while running <emphasis>teardown</emphasis> for test <emphasis>${testName}</emphasis>`,
            },
          ],
        },
      );
    }
  }

  async runTest(testName: string, callback: TestCallback) {
    let onTimeout: OnTimeout = () => {
      throw new Error("Promise wasn't created. Should be impossible.");
    };

    const timeoutPromise = new Promise((resolve, reject) => {
      onTimeout = (time: number) => {
        reject(new Error(`Test timeout - exceeded ${String(time)}ms`));
      };
    });

    const api = new TestAPI({
      file: this.file,
      testName,
      onTimeout,
      snapshotManager: this.snapshotManager,
      options: this.options,
    });

    try {
      const res = callback(api);

      // Ducktyping this to detect a cross-realm Promise
      if (res !== undefined && typeof res.then === 'function') {
        await Promise.race([timeoutPromise, res]);
      }

      this.bridge.testSuccess.send({
        ref: {
          filename: this.file.real.join(),
          testName,
        },
      });
    } catch (err) {
      this.onError(
        testName,
        {
          error: err,
          firstAdvice: [],
          lastAdvice: api.advice,
        },
      );
    } finally {
      await this.teardownTest(testName, api);
    }
  }

  async run(): Promise<void> {
    const promises: Set<Promise<void>> = new Set();

    const {foundTests} = this;
    if (foundTests.size === 0) {
      this.bridge.testError.send({
        ref: undefined,
        diagnostic: {
          location: {
            filename: this.file.uid,
          },
          description: descriptions.TESTS.UNDECLARED,
        },
      });
    }

    // Execute all the tests
    for (const [testName, {options, callback}] of foundTests) {
      if (callback === undefined) {
        continue;
      }

      this.bridge.testStart.send({
        ref: {
          filename: this.file.real.join(),
          testName,
        },
        timeout: options.timeout,
      });

      const promise = this.runTest(testName, callback);

      if (this.options.syncTests) {
        await promise;
      } else {
        promise.then(() => {
          promises.delete(promise);
        });
        promises.add(promise);

        // if there's 5 promises, then wait for one of them to finish
        if (promises.size > MAX_RUNNING_TESTS) {
          await Promise.race(Array.from(promises));
        }
      }
    }

    // Execute the remaining tests
    await Promise.all(Array.from(promises));

    // Save the snapshot
    await this.snapshotManager.save();

    if (this.emitConsoleDiagnostics) {
      await this.emitDiagnostic({
        description: descriptions.TESTS.LOGS(this.consoleAdvice),
        location: {
          filename: this.file.uid,
        },
      });
    }
  }

  async emitFoundTests() {
    const tests = [];

    for (const [testName, {callback, options}] of this.foundTests) {
      let isSkipped = callback === undefined;
      if (this.hasFocusedTest && options.only !== true) {
        isSkipped = true;
      }

      tests.push({
        ref: {
          filename: this.file.real.join(),
          testName,
        },
        isSkipped,
      });
    }

    await this.bridge.testsFound.call(tests);
  }

  async wrap(callback: () => Promise<void>): Promise<void> {
    try {
      const {diagnostics} = await catchDiagnostics(callback);

      if (diagnostics !== undefined) {
        for (const diagnostic of diagnostics) {
          await this.bridge.testError.call({
            ref: undefined,
            diagnostic,
          });
        }
      }
    } catch (err) {
      this.onError(
        undefined,
        {
          error: err,
          firstAdvice: [],
          lastAdvice: [
            {
              type: 'log',
              category: 'info',
              text: markup`Error occured while executing test file <filelink emphasis target="${this.file.uid}" />`,
            },
            INTERNAL_ERROR_LOG_ADVICE,
          ],
        },
      );
    }
  }

  async prepare(): Promise<void> {
    return this.wrap(async () => {
      // Setup
      await this.snapshotManager.init();
      await this.discoverTests();
      await this.emitFoundTests();

      // Execute
      this.lockTests();
    });
  }
}
