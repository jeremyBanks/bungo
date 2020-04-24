/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {Diagnostics} from '@romejs/diagnostics';
import {SourceMapGenerator} from '@romejs/codec-source-map';
import {AbsoluteFilePath} from '@romejs/path';
import {MasterRequest, TestWorkerBridge} from '@romejs/core';
import {CoverageFile, InspectorClient} from '@romejs/v8';
import child = require('child_process');

export type TestSource = {
  code: string;
  sourceMap: SourceMapGenerator;
  path: AbsoluteFilePath;
};

export type TestSources = Map<string, TestSource>;

export type TestRunnerConstructorOptions = {
  sources: TestSources;
  request: MasterRequest;
  addDiagnostics: Diagnostics;
  options: TestRunnerOptions;
};

export type TestRunnerOptions = {
  coverage: boolean;
  showAllCoverage: boolean;
  updateSnapshots: boolean;
  freezeSnapshots: boolean;
  verboseDiagnostics: boolean;
  syncTests: boolean;
};

export type CoverageFolder = {
  name: undefined | string;
  folders: Map<string, CoverageFolder>;
  files: Map<string, CoverageFile>;
};

export type TestWorkerContainer = {
  bridge: TestWorkerBridge;
  process: child.ChildProcess;
  inspector: undefined | InspectorClient;
};

export type TestWorkerContainers = Array<TestWorkerContainer>;
