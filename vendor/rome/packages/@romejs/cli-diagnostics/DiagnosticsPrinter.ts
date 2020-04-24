/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  Diagnostics,
  Diagnostic,
  DiagnosticLanguage,
  DiagnosticSourceType,
  DiagnosticAdvice,
  DiagnosticsProcessor,
  deriveRootAdviceFromDiagnostic,
  getDiagnosticHeader,
} from '@romejs/diagnostics';
import {Reporter} from '@romejs/cli-reporter';
import {
  DiagnosticsPrinterFlags,
  DiagnosticsPrinterOptions,
  DiagnosticsFileReader,
  DiagnosticsFileReaderStats,
} from './types';

import {
  humanizeMarkupFilename,
  formatAnsi,
  markup,
} from '@romejs/string-markup';
import {toLines} from './utils';
import printAdvice from './printAdvice';

import successBanner from './banners/success.json';
import errorBanner from './banners/error.json';
import {
  AbsoluteFilePath,
  createAbsoluteFilePath,
  createUnknownFilePath,
  UnknownFilePath,
  UnknownFilePathMap,
  UnknownFilePathSet,
  AbsoluteFilePathSet,
} from '@romejs/path';
import {Number1, Number0} from '@romejs/ob1';
import {existsSync, readFileTextSync, lstatSync} from '@romejs/fs';

type Banner = {
  // Array<number> should really be [number, number, number], but TypeScript widens the imported types
  palettes: Array<Array<number>>;
  // Array<number> should really be [number, number], same reason as above
  rows: Array<Array<number | Array<number>>>;
};

type PositionLike = {
  line?: undefined | Number1;
  column?: undefined | Number0;
};

export function readDiagnosticsFileLocal(
  path: AbsoluteFilePath,
): ReturnType<DiagnosticsFileReader> {
  if (!existsSync(path)) {
    return;
  }

  const src = readFileTextSync(path);
  const mtime = lstatSync(path).mtimeMs;
  return {content: src, mtime};
}

function equalPosition(
  a: undefined | PositionLike,
  b: undefined | PositionLike,
): boolean {
  if (a === undefined || b === undefined) {
    return false;
  }

  if (a.line !== b.line || a.column !== b.column) {
    return false;
  }

  return true;
}

type BeforeFooterPrintFn = (reporter: Reporter, error: boolean) => void;

export const DEFAULT_PRINTER_FLAGS: DiagnosticsPrinterFlags = {
  grep: '',
  inverseGrep: false,
  focus: '',
  showAllDiagnostics: true,
  fieri: false,
  verboseDiagnostics: false,
  maxDiagnostics: 100,
};

// Dependency that may not be included in the output diagnostic but whose changes may effect the validity of this one
type ChangeFileDependency = {
  type: 'change';
  path: UnknownFilePath;
  mtime: number;
};

// Dependency that will have a code frame in the output diagnostic
type ReferenceFileDependency = {
  type: 'reference';
  path: UnknownFilePath;
  mtime: undefined | number;
  sourceType: undefined | DiagnosticSourceType;
  language: undefined | DiagnosticLanguage;
};

type FileDependency = ChangeFileDependency | ReferenceFileDependency;

export type DiagnosticsPrinterFileSources = UnknownFilePathMap<{
  sourceText: string;
  lines: Array<string>;
}>;

export type DiagnosticsPrinterFileMtimes = UnknownFilePathMap<number>;

export default class DiagnosticsPrinter extends Error {
  constructor(opts: DiagnosticsPrinterOptions) {
    super(
      "Diagnostics printer. If you're seeing this then it wasn't caught and printed correctly.",
    );
    const {cwd, reporter, flags = DEFAULT_PRINTER_FLAGS} = opts;

    this.reporter = reporter;
    this.flags = flags;
    this.readFile = opts.readFile === undefined
      ? readDiagnosticsFileLocal
      : opts.readFile;
    this.cwd = cwd === undefined ? createAbsoluteFilePath(process.cwd()) : cwd;
    this.processor = opts.processor === undefined
      ? new DiagnosticsProcessor()
      : opts.processor;

    this.displayedCount = 0;
    this.problemCount = 0;
    this.filteredCount = 0;
    this.truncatedCount = 0;

    this.hasTruncatedDiagnostics = false;
    this.missingFileSources = new AbsoluteFilePathSet();
    this.fileSources = new UnknownFilePathMap();
    this.fileMtimes = new UnknownFilePathMap();
    this.beforeFooterPrint = [];
  }

  reporter: Reporter;
  processor: DiagnosticsProcessor;
  beforeFooterPrint: Array<BeforeFooterPrintFn>;
  flags: DiagnosticsPrinterFlags;
  cwd: AbsoluteFilePath;
  readFile: DiagnosticsFileReader;

  hasTruncatedDiagnostics: boolean;
  missingFileSources: AbsoluteFilePathSet;
  fileSources: DiagnosticsPrinterFileSources;
  fileMtimes: DiagnosticsPrinterFileMtimes;

  displayedCount: number;
  problemCount: number;
  filteredCount: number;
  truncatedCount: number;

  createFilePath(filename: undefined | string): UnknownFilePath {
    if (filename === undefined) {
      filename = 'unknown';
    }

    const {normalizeFilename} = this.reporter.markupOptions;

    if (normalizeFilename === undefined) {
      return createUnknownFilePath(filename);
    } else {
      return createUnknownFilePath(normalizeFilename(filename));
    }
  }

  throwIfAny() {
    if (this.hasDiagnostics()) {
      throw this;
    }
  }

  hasDiagnostics(): boolean {
    return this.processor.hasDiagnostics();
  }

  getDisplayedProblemsCount() {
    return this.problemCount - this.filteredCount;
  }

  shouldTruncate(): boolean {
    if (!this.flags.showAllDiagnostics && this.displayedCount >
        this.flags.maxDiagnostics) {
      return true;
    } else {
      return false;
    }
  }

  getDiagnostics(): Diagnostics {
    return this.processor.getSortedDiagnostics();
  }

  isFocused(diag: Diagnostic): boolean {
    const focusFlag = this.flags.focus;
    const focusEnabled = focusFlag !== undefined && focusFlag !== '';

    const {filename, start, end} = diag.location;

    // If focus is enabled, exclude locationless errors
    if (focusEnabled && (filename === undefined || start === undefined)) {
      return true;
    }

    // If focus is enabled, check if we should ignore this message
    if (filename !== undefined && start !== undefined && end !== undefined) {
      const niceFilename = humanizeMarkupFilename(
        filename,
        this.reporter.markupOptions,
      );
      const focusId = getDiagnosticHeader({
        filename,
        start,
      });
      if (focusEnabled && focusId !== focusFlag && focusId !== niceFilename) {
        return true;
      }
    }

    return false;
  }

  shouldIgnore(diag: Diagnostic): boolean {
    const {focus, grep, inverseGrep} = this.flags;
    const focusEnabled = focus !== undefined && focus !== '';

    // If focus is enabled, exclude locationless errors
    if (focusEnabled && this.isFocused(diag) === false) {
      return true;
    }

    // An empty grep pattern means show everything
    if (grep === undefined || grep === '') {
      return false;
    }

    // Match against the supplied grep pattern
    let ignored = diag.description.message.value.toLowerCase().includes(grep) ===
      false;
    if (inverseGrep) {
      ignored = !ignored;
    }
    return ignored;
  }

  addFileSource(
    info: ChangeFileDependency | ReferenceFileDependency,
    stats: DiagnosticsFileReaderStats,
  ) {
    this.fileMtimes.set(info.path, stats.mtime);

    if (info.type === 'reference') {
      this.fileSources.set(info.path, {
        sourceText: stats.content,
        lines: toLines({
          path: info.path,
          input: stats.content,
          sourceType: info.sourceType,
          language: info.language,
        }),
      });
    }
  }

  getDependenciesFromDiagnostics(
    diagnostics: Diagnostics,
  ): Array<FileDependency> {
    const deps: Array<FileDependency> = [];

    for (const {
      dependencies,
      description: {advice},
      location: {language, sourceType, mtime, filename},
    } of diagnostics) {
      if (filename !== undefined) {
        deps.push({
          type: 'reference',
          path: this.createFilePath(filename),
          mtime,
          language,
          sourceType,
        });
      }

      if (dependencies !== undefined) {
        for (const {filename, mtime} of dependencies) {
          deps.push({
            type: 'change',
            path: this.createFilePath(filename),
            mtime,
          });
        }
      }

      if (advice !== undefined) {
        for (const item of advice) {
          if (item.type === 'frame') {
            const {location} = item;
            if (location.filename !== undefined && location.sourceText ===
                undefined) {
              deps.push({
                type: 'reference',
                path: this.createFilePath(location.filename),
                language: location.language,
                sourceType: location.sourceType,
                mtime: location.mtime,
              });
            }
          }
        }
      }
    }

    const depsMap: UnknownFilePathMap<FileDependency> = new UnknownFilePathMap();

    // Remove non-absolute filenames and normalize sourceType and language for conflicts
    for (const dep of deps) {
      const path = dep.path;
      if (!path.isAbsolute()) {
        continue;
      }

      const existing = depsMap.get(path);

      // reference dependency can override change since it has more metadata that needs conflict resolution
      if (existing === undefined || existing.type === 'change') {
        depsMap.set(dep.path, dep);
        continue;
      }

      if (dep.type === 'reference') {
        if (existing.sourceType !== dep.sourceType) {
          existing.sourceType = 'unknown';
        }

        if (existing.language !== dep.language) {
          existing.language = 'unknown';
        }
      }
    }

    return Array.from(depsMap.values());
  }

  fetchFileSources(diagnostics: Diagnostics) {
    for (const dep of this.getDependenciesFromDiagnostics(diagnostics)) {
      const {path} = dep;
      if (!path.isAbsolute()) {
        continue;
      }

      const abs = path.assertAbsolute();
      const stats = this.readFile(abs);
      if (stats === undefined) {
        this.missingFileSources.add(abs);
      } else {
        this.addFileSource(dep, stats);
      }
    }
  }

  print() {
    const filteredDiagnostics = this.filterDiagnostics();
    this.fetchFileSources(filteredDiagnostics);
    this.displayDiagnostics(filteredDiagnostics);
  }

  displayDiagnostics(diagnostics: Diagnostics) {
    this.reporter.redirectOutToErr(true);
    for (const diag of diagnostics) {
      this.displayDiagnostic(diag);
    }
    this.reporter.redirectOutToErr(false);
  }

  displayDiagnostic(diag: Diagnostic) {
    const {reporter} = this;
    const {start, end, filename} = diag.location;
    const {advice} = diag.description;

    // Determine if we should skip showing the frame at the top of the diagnostic output

    // We check if there are any frame advice entries that match us exactly, this is

    // useful for stuff like reporting call stacks
    let skipFrame = false;
    if (start !== undefined && end !== undefined && advice !== undefined) {
      adviceLoop: for (const item of advice) {
        if (item.type === 'frame' && item.location.filename === filename &&
            equalPosition(item.location.start, start) && equalPosition(
            item.location.end,
            end,
          )) {
          skipFrame = true;
          break;
        }

        if (item.type === 'stacktrace') {
          for (const frame of item.frames) {
            if (frame.filename === filename && equalPosition(frame, start)) {
              skipFrame = true;
              break adviceLoop;
            }
          }
        }
      }
    }

    // Check if any files this diagnostic depends on have changed
    let outdatedFiles: UnknownFilePathSet = new UnknownFilePathSet();
    for (const {
      path,
      mtime: expectedMtime,
    } of this.getDependenciesFromDiagnostics([diag])) {
      const mtime = this.fileMtimes.get(path);
      if (mtime !== undefined && expectedMtime !== undefined && mtime >
          expectedMtime) {
        outdatedFiles.add(path);
      }
    }

    const outdatedAdvice: DiagnosticAdvice = [];
    const isOutdated = outdatedFiles.size > 0;
    if (isOutdated) {
      const outdatedFilesArr = Array.from(outdatedFiles, (path) => path.join());

      if (outdatedFilesArr.length === 1 && outdatedFilesArr[0] === filename) {
        outdatedAdvice.push(
          {
            type: 'log',
            category: 'warn',
            message: 'This file has been changed since the diagnostic was produced and may be out of date',
          },
        );
      } else {
        outdatedAdvice.push(
          {
            type: 'log',
            category: 'warn',
            message: 'This diagnostic may be out of date as it relies on the following files that have been changed since the diagnostic was generated',
          },
        );

        outdatedAdvice.push({
          type: 'list',
          list: outdatedFilesArr.map(
            (filename) => markup`<filelink target="${filename}" />`,
          ),
        });
      }
    }

    const derived = deriveRootAdviceFromDiagnostic(diag, {
      skipFrame,
      includeHeaderInAdvice: false,
      outdated: isOutdated,
    });

    reporter.hr(derived.header);

    reporter.indent(() => {
      // Concat all the advice together
      const advice: DiagnosticAdvice = [
        ...derived.advice,
        ...outdatedAdvice,
        ...(diag.description.advice || []),
      ];

      // Print advice
      for (const item of advice) {
        const res = printAdvice(item, {
          printer: this,
          flags: this.flags,
          missingFileSources: this.missingFileSources,
          fileSources: this.fileSources,
          diagnostic: diag,
          reporter,
        });
        if (res.printed) {
          reporter.spacer();
        }
        if (res.truncated) {
          this.hasTruncatedDiagnostics = true;
        }
      }

      // Print verbose information
      if (this.flags.verboseDiagnostics) {
        const {origins} = diag;

        if (origins !== undefined && origins.length > 0) {
          reporter.spacer();
          reporter.info('Why are you seeing this diagnostic?');
          reporter.forceSpacer();
          reporter.list(origins.map((origin) => {
            let res = `<emphasis>${origin.category}</emphasis>`;
            if (origin.message !== undefined) {
              res += `: ${origin.message}`;
            }
            return res;
          }), {ordered: true});
        }
      }
    });
  }

  filterDiagnostics(): Diagnostics {
    const diagnostics = this.getDiagnostics();
    const filteredDiagnostics: Diagnostics = [];

    for (const diag of diagnostics) {
      this.problemCount++;

      if (this.shouldIgnore(diag)) {
        this.filteredCount++;
      } else if (this.shouldTruncate()) {
        this.truncatedCount++;
      } else {
        this.displayedCount++;
        filteredDiagnostics.push(diag);
      }
    }

    return filteredDiagnostics;
  }

  onBeforeFooterPrint(fn: BeforeFooterPrintFn) {
    this.beforeFooterPrint.push(fn);
  }

  footer() {
    const {reporter, problemCount} = this;

    const isError = problemCount > 0;

    if (isError) {
      reporter.hr();
    }

    if (this.hasTruncatedDiagnostics) {
      reporter.warn(
        'Some diagnostics have been truncated. Use the --verbose-diagnostics flag to disable truncation.',
      );
    }

    for (const handler of this.beforeFooterPrint) {
      handler(reporter, isError);
    }

    if (isError) {
      this.footerError();
    } else {
      this.footerSuccess();
    }
  }

  showBanner(banner: Banner) {
    for (const stream of this.reporter.getStreams(false)) {
      for (const row of banner.rows) {
        for (const field of row) {
          let palleteIndex;
          let times = 1;
          if (Array.isArray(field)) {
            [palleteIndex, times] = field;
          } else {
            palleteIndex = field;
          }

          const pallete = banner.palettes[palleteIndex];
          stream.write(formatAnsi.bgRgb(' ', {
            r: pallete[0],
            g: pallete[1],
            b: pallete[2],
          }).repeat(times));
        }
        stream.write('\n');
      }
    }
  }

  footerSuccess() {
    const {reporter} = this;

    if (this.flags.fieri) {
      this.showBanner(successBanner);
    }

    reporter.success('No known problems!');
  }

  footerError() {
    const {reporter, filteredCount} = this;

    if (this.flags.fieri) {
      this.showBanner(errorBanner);
    }

    const displayableProblems = this.getDisplayedProblemsCount();
    let str = `Found <number emphasis>${displayableProblems}</number> problem`;
    if (displayableProblems > 1 || displayableProblems === 0) {
      str += 's';
    }

    if (filteredCount > 0) {
      str += `<dim> (${filteredCount} filtered)</dim>`;
    }

    reporter.error(str);

    if (this.truncatedCount > 0) {
      const {maxDiagnostics} = this.flags;
      reporter.warn(
        `Only <number>${maxDiagnostics}</number> errors shown, add the <emphasis>--show-all-diagnostics</emphasis> flag to view the remaining <number>${displayableProblems -
          maxDiagnostics}</number> errors`,
      );
    }
  }
}
