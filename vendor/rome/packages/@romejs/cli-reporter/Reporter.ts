/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  MarkupFormatOptions,
  ansiEscapes,
  lineWrapAnsi,
  markupTag,
  markupToAnsi,
  markupToPlainText,
  stripAnsi,
} from '@romejs/string-markup';
import {
  RemoteReporterClientMessage,
  RemoteReporterReceiveMessage as RemoteReporterServerMessage,
  ReporterDerivedStreams,
  ReporterProgress,
  ReporterProgressOptions,
  ReporterStream,
  ReporterStreamMeta,
} from './types';
import {humanizeNumber, removeSuffix} from '@romejs/string-utils';
import Progress from './Progress';
import {interpolate} from './util';
import prettyFormat from '@romejs/pretty-format';
import stream = require('stream');
import {CWD_PATH} from '@romejs/path';
import {Event} from '@romejs/events';
import readline = require('readline');
import {MarkupTagName} from '@romejs/string-markup/types';
import select, {SelectArguments, SelectOptions} from './select';

type ListOptions = {
  reverse?: boolean;
  truncate?: number;
  ordered?: boolean;
};

// rome-suppress-next-line lint/noExplicitAny
type WrapperFactory = <T extends (...args: Array<any>) => any>(callback: T) => T;

export type ReporterOptions = {
  streams?: Array<ReporterStream>;
  stdin?: NodeJS.ReadStream;
  programName?: string;
  hasClearScreen?: boolean;
  programVersion?: string;
  markupOptions?: MarkupFormatOptions;
  disabled?: boolean;
  verbose?: boolean;
  useRemoteProgressBars?: boolean;
  startTime?: number;
  wrapperFactory?: WrapperFactory;
};

export type LogOptions = {
  nonTTY?: string;
  noPrefix?: boolean;
  stderr?: boolean;
  newline?: boolean;
};

export type LogCategoryOptions = LogOptions & {
  unicodePrefix: string;
  rawPrefix: string;
  markupTag: MarkupTagName;
  unicodeSuffix?: string;
};

type QuestionValidateResult<T> = [false, string] | [true, T];

type QuestionOptions = {
  hint?: string;
  default?: string;
  yes?: boolean;
  normalize?: (value: string) => string;
};

let remoteProgressIdCounter = 0;

const INDENT = '  ';

type Stdout = stream.Writable & {
  isTTY?: boolean;
  columns?: number;
};

function getStreamFormat(stdout: undefined | Stdout): ReporterStream['format'] {
  return stdout !== undefined && stdout.isTTY === true ? 'ansi' : 'none';
}

export default class Reporter {
  constructor(opts: ReporterOptions = {}) {
    this.programName = opts.programName === undefined
      ? 'rome'
      : opts.programName;
    this.programVersion = opts.programVersion;

    this.noProgress = process.env.CI === '1';
    this.isVerbose = Boolean(opts.verbose);

    this.startTime = opts.startTime === undefined ? Date.now() : opts.startTime;
    this.hasClearScreen = opts.hasClearScreen === undefined
      ? true
      : opts.hasClearScreen;
    this.activeElements = new Set();
    this.indentLevel = 0;
    this.indentString = '';
    this.enabled = opts.disabled === true ? 0 : 1;
    this.markupOptions = opts.markupOptions === undefined
      ? {}
      : opts.markupOptions;
    this.hasSpacer = false;
    this.shouldRedirectOutToErr = false;
    this.stdin = opts.stdin;

    this.wrapperFactory = opts.wrapperFactory;

    this.remoteClientProgressBars = new Map();
    this.remoteServerProgressBars = new Map();

    this.sendRemoteServerMessage = new Event({
      name: 'sendRemoteServerMessage',
    });
    this.sendRemoteClientMessage = new Event({
      name: 'sendRemoteClientMessage',
    });

    this.isRemote = opts.useRemoteProgressBars === true;

    this.outStreams = new Set();
    this.errStreams = new Set();
    this.streams = new Set();

    if (opts.streams !== undefined) {
      for (const stream of opts.streams) {
        this.addStream(stream);
      }
    }
  }

  static DEFAULT_COLUMNS = 100;

  attachStdoutStreams(stdout?: Stdout, stderr?: Stdout): ReporterDerivedStreams {
    const columns = stdout === undefined || stdout.columns === undefined
      ? Reporter.DEFAULT_COLUMNS
      : stdout.columns;

    const columnsUpdated: Event<number, void> = new Event({
      name: 'columnsUpdated',
    });

    // Windows terminals are awful
    const unicode = process.platform !== 'win32';

    const outStream: ReporterStream = {
      type: 'out',
      format: getStreamFormat(stdout),
      columns,
      unicode,
      write(chunk) {
        if (stdout !== undefined) {
          stdout.write(chunk);
        }
      },

      teardown() {},
    };

    const errStream: ReporterStream = {
      type: 'error',
      format: getStreamFormat(stderr),
      columns,
      unicode,
      write(chunk) {
        if (stderr !== undefined) {
          stderr.write(chunk);
        }
      },
    };

    // Watch for resizing
    if (outStream.format === 'ansi' && stdout !== undefined) {
      const onStdoutResize = () => {
        if (stdout !== undefined && stdout.columns !== undefined) {
          const {columns} = stdout;
          columnsUpdated.send(columns);
          this.setStreamColumns([outStream, errStream], columns);
        }
      };

      outStream.teardown = () => {
        stdout.off('resize', onStdoutResize);
      };

      stdout.on('resize', onStdoutResize);
    }

    this.addStream(outStream);
    this.addStream(errStream);

    return {
      columnsUpdated,
      stdout: outStream,
      stderr: errStream,
    };
  }

  attachCaptureStream(format: ReporterStream['format'] = 'none'): {
    read: () => string;
  } {
    let buff = '';

    this.addStream({
      format,
      type: 'all',
      columns: Reporter.DEFAULT_COLUMNS,
      unicode: true,

      write(chunk) {
        buff += chunk;
      },
    });

    return {
      read() {
        return buff;
      },
    };
  }

  static fromProcess(opts: ReporterOptions = {}): Reporter {
    const reporter = new Reporter({
      ...opts,
      markupOptions: {
        cwd: CWD_PATH,
        ...opts.markupOptions,
      },
    });

    reporter.attachStdoutStreams(process.stdout, process.stderr);

    return reporter;
  }

  programName: string;
  programVersion: string | undefined;
  markupOptions: MarkupFormatOptions;

  isRemote: boolean;
  noProgress: boolean;
  isVerbose: boolean;
  hasSpacer: boolean;
  indentLevel: number;
  indentString: string;
  enabled: number;
  startTime: number;
  shouldRedirectOutToErr: boolean;
  wrapperFactory: undefined | WrapperFactory;
  outStreams: Set<ReporterStream>;
  errStreams: Set<ReporterStream>;
  streams: Set<ReporterStream>;
  sendRemoteServerMessage: Event<RemoteReporterServerMessage, void>;
  sendRemoteClientMessage: Event<RemoteReporterClientMessage, void>;
  stdin: undefined | NodeJS.ReadStream;

  remoteClientProgressBars: Map<string, Progress>;
  remoteServerProgressBars: Map<string, {end: () => void}>;

  // track whether we've output anything, we need this to avoid outputting multiple spacers etc
  hasClearScreen: boolean;

  //Store active progress indicators so we can easily bail out and destroy them
  activeElements: Set<{
    render: () => void;
    end: () => void;
  }>;

  processRemoteClientMessage(msg: RemoteReporterClientMessage) {
    if (msg.type === 'PROGRESS_CREATE') {
      this.remoteClientProgressBars.set(msg.id, this.progressLocal(
        msg.opts,
        () => {
          this.sendRemoteServerMessage.call({
            type: 'ENDED',
            id: msg.id,
          });
        },
      ));
      return;
    }

    let bar = this.remoteClientProgressBars.get(msg.id);
    if (bar === undefined) {
      throw new Error(
          `Remote reporter message for progress bar ${msg.id} that does not exist`,
        );
    }

    bar.processRemoteClientMessage(msg);

    if (msg.type === 'PROGRESS_END') {
      this.remoteClientProgressBars.delete(msg.id);
    }
  }

  receivedRemoteServerMessage(msg: RemoteReporterServerMessage) {
    // Currently the only message a remote Reporter can send is that it has ended
    switch (msg.type) {
      case 'ENDED': {
        const progress = this.remoteServerProgressBars.get(msg.id);
        if (progress !== undefined) {
          progress.end();
        }
      }
    }
  }

  getMessagePrefix(): string {
    return '';
  }

  normalizeMessage(
    stream: ReporterStream,
    tty: string,
    opts: LogOptions,
  ): string {
    let msg = stream.format !== 'none' || opts.nonTTY === undefined
      ? tty
      : opts.nonTTY;

    if (opts.noPrefix !== true) {
      msg = this.getMessagePrefix() + msg;
    }

    // Don't indent if there is no indent, or the message is empty
    const {indentString} = this;
    if (indentString !== '' && msg !== '') {
      // Indent each line, leaving out the indentation for empty lines
      msg = indentString + msg.replace(/\n([^\n])/g, `\n${indentString}$1`);
    }

    // Track if there's going to be a completely empty line
    this.hasSpacer = msg === '' || msg[msg.length - 1] === '\n';

    return msg;
  }

  redirectOutToErr(should: boolean) {
    this.shouldRedirectOutToErr = should;
  }

  setStreamColumns(streams: Array<ReporterStream>, columns: number) {
    for (const stream of streams) {
      if (!this.streams.has(stream)) {
        throw new Error(
            "Trying to setStreamColumns on a stream that isn't attached to this Reporter",
          );
      }

      stream.columns = columns;
    }

    for (const elem of this.activeElements) {
      elem.render();
    }
  }

  addStream(stream: ReporterStream) {
    this.streams.add(stream);

    if (stream.type === 'error' || stream.type === 'all') {
      this.errStreams.add(stream);
    }

    if (stream.type === 'out' || stream.type === 'all') {
      this.outStreams.add(stream);
    }
  }

  removeStream(stream: ReporterStream) {
    if (stream.teardown !== undefined) {
      stream.teardown();
    }
    this.streams.delete(stream);
    this.outStreams.delete(stream);
    this.errStreams.delete(stream);
  }

  //# Stdin
  getStdin(): NodeJS.ReadStream {
    const {stdin} = this;
    if (stdin === undefined) {
      throw new Error('This operation expected a stdin but we have none');
    }
    return stdin;
  }

  async question(
    message: string,
    {hint, default: def = '', yes = false}: QuestionOptions = {},
  ): Promise<string> {
    if (yes) {
      return def;
    }

    const stdin = this.getStdin();

    const origPrompt = `<dim emphasis>?</dim> <emphasis>${message}</emphasis>`;
    let prompt = origPrompt;
    if (hint !== undefined) {
      prompt += ` <dim>${hint}</dim>`;
    }
    if (def !== '') {
      prompt += ` (${def})`;
    }
    prompt += ': ';
    this.logAll(prompt, {
      newline: false,
    });

    const rl = readline.createInterface({
      input: stdin,
      output: new stream.Writable({
        write: (chunk, encoding, callback) => {
          this.writeAll(chunk);
          callback();
        },
      }),
      terminal: false,
    });

    return new Promise((resolve) => {
      rl.on('line', (line) => {
        rl.close();

        const normalized = line === '' ? def : line;

        // Replace initial prompt
        this.writeAll(ansiEscapes.cursorUp());
        this.writeAll(ansiEscapes.eraseLine);

        let prompt = origPrompt;
        prompt += ': ';
        if (normalized === '') {
          prompt += '<dim>empty</dim>';
        } else {
          prompt += normalized;
        }
        this.logAll(prompt);

        resolve(normalized);
      });
    });
  }

  async questionValidate<T>(
    message: string,
    validate: (value: string) => QuestionValidateResult<T>,
    options: Omit<QuestionOptions, 'normalize'> = {},
  ): Promise<T> {
    while (true) {
      let res: undefined | QuestionValidateResult<T>;

      await this.question(`${message}`, {
        ...options,
        normalize: (value: string): string => {
          res = validate(value);

          if (res[0] === true && typeof res[1] === 'string') {
            return res[1];
          } else {
            return value;
          }
        },
      });

      if (res === undefined) {
        throw new Error('normalize should have been called');
      }

      if (res[0] === false) {
        this.error(res[1]);
        continue;
      } else {
        return res[1];
      }
    }
  }

  async radioConfirm(message: string): Promise<boolean> {
    const answer = await this.radio(message, {
      options: {
        yes: {
          label: 'Yes',
          shortcut: 'y',
        },
        no: {
          label: 'No',
          shortcut: 'n',
        },
      },
    });
    return answer === 'yes';
  }

  async radio<Options extends SelectOptions>(
    message: string,
    arg: SelectArguments<Options>,
  ): Promise<keyof Options> {
    const set = await this.select(message, {...arg, radio: true});

    // Should always have at least one element
    return Array.from(set)[0];
  }

  async select<Options extends SelectOptions>(
    message: string,
    args: SelectArguments<Options>,
  ): Promise<Set<keyof Options>> {
    return select(this, message, args);
  }

  //# Control
  isEnabled(stderr: undefined | boolean): boolean {
    return this.getStreams(stderr).size > 0;
  }

  getStreams(stderr: undefined | boolean): Set<ReporterStream> {
    if (this.enabled === 0) {
      return new Set();
    }

    if (this.shouldRedirectOutToErr) {
      return this.errStreams;
    }

    if (stderr) {
      return this.errStreams;
    }

    return this.outStreams;
  }

  enable(): () => void {
    let alreadyDisabled = false;

    this.enabled++;

    return () => {
      if (alreadyDisabled) {
        throw new Error('Already disabled Reporter');
      }

      this.enabled--;
      alreadyDisabled = true;
    };
  }

  //# LIFECYCLE
  teardown() {
    for (const stream of this.streams) {
      this.removeStream(stream);
    }

    for (const elem of this.activeElements) {
      elem.end();
    }
    this.activeElements.clear();
  }

  fork(opts: Partial<ReporterOptions> = {}) {
    return new Reporter({
      streams: [...this.streams],
      verbose: this.isVerbose,
      markupOptions: this.markupOptions,
      wrapperFactory: this.wrapperFactory,
      ...opts,
    });
  }

  //# INDENTATION METHODS
  indent(callback: () => void) {
    this.indentLevel++;
    this.updateIndent();

    callback();
    this.indentLevel--;
    this.updateIndent();
  }

  noIndent(callback: () => void) {
    const prevIndentLevel = this.indentLevel;
    this.indentLevel = 0;
    this.updateIndent();
    callback();
    this.indentLevel = prevIndentLevel;
    this.updateIndent();
  }

  updateIndent() {
    this.indentString = INDENT.repeat(this.indentLevel);
  }

  //# INTERNAL
  prependEmoji(
    stream: ReporterStream,
    msg: string,
    emoji: string,
    fallback?: string,
  ): string {
    if (stream.format === 'none') {
      return `${emoji} ${msg}`;
    } else {
      if (fallback === undefined) {
        return msg;
      } else {
        return `${fallback} ${msg}`;
      }
    }
  }

  //# VISUALISATION
  table(head: Array<string>, rawBody: Array<Array<string | number>>) {
    // Format the head, just treat it like another row
    head = head.map((field: string): string => markupTag('emphasis', field));

    // Humanize all number fields
    const rows: Array<Array<string>> = [];
    if (head.length > 0) {
      rows.push(head);
    }
    for (const row of rawBody) {
      rows.push(row.map((field) => {
        if (typeof field === 'number') {
          return humanizeNumber(field);
        } else {
          return field;
        }
      }));
    }

    // Get the max number of columns for a row
    const columnCount = Math.max(...rows.map((columns) => columns.length));

    for (const stream of this.getStreams(false)) {
      // Get column widths
      const cols: Array<number> = [];
      for (let i = 0; i < columnCount; i++) {
        const widths = rows.map((row): number => {
          const str = row[i];
          if (str === undefined) {
            // Could be an excessive column
            return 0;
          } else {
            return this.markupifyLength(stream, str);
          }
        });
        cols[i] = Math.max(...widths);
      }

      // Format all rows
      const builtRows = rows.map((row): string => {
        for (let i = 0; i < row.length; i++) {
          const field = row[i];
          const padding = cols[i] - this.markupifyLength(stream, field);
          row[i] = field + ' '.repeat(padding);
        }
        return row.join(' ');
      });

      this.logOne(stream, builtRows.join('\n'));
    }
  }

  verboseInspect(val: unknown) {
    if (this.isVerbose) {
      this.inspect(val);
    }
  }

  inspect(value: unknown) {
    if (!this.isEnabled(false)) {
      return;
    }

    let formatted = value;

    if (typeof formatted !== 'number' && typeof formatted !== 'string') {
      formatted = prettyFormat(formatted, {markup: true});
    }

    this.logAll(String(formatted));
  }

  //# ESCAPE HATCHES
  clearLineAll() {
    for (const stream of this.getStreams(false)) {
      this.clearLineSpecific(stream);
    }
  }

  clearLineSpecific(stream: ReporterStream) {
    stream.write(ansiEscapes.eraseLine);
    stream.write(ansiEscapes.cursorTo(0));
  }

  writeAll(msg: string, opts: LogOptions = {}) {
    for (const stream of this.getStreams(opts.stderr)) {
      this.writeSpecific(stream, msg, opts);
    }
  }

  writeSpecific(stream: ReporterStream, msg: string, opts: LogOptions = {}) {
    if (!this.isEnabled(opts.stderr)) {
      return;
    }

    this.hasClearScreen = false;

    if (stream.format === 'ansi' && this.activeElements.size > 0) {
      // A progress bar is active and has probably drawn to the screen
      this.clearLineSpecific(stream);
    }

    stream.write(msg);
  }

  //# UTILITIES
  getTotalTime(): number {
    return Date.now() - this.startTime;
  }

  clearScreen() {
    for (const stream of this.getStreams(false)) {
      if (stream.format === 'ansi') {
        stream.write(ansiEscapes.clearScreen);
      }
    }
    this.hasClearScreen = true;
  }

  //# SECTIONS
  heading(text: string) {
    this.spacer();
    this.logAll(`<inverse><emphasis>${text}</emphasis></inverse>`, {
      nonTTY: `# ${text}`,
    });
    this.spacer();
  }

  section(title: undefined | string, callback: () => void) {
    this.hr(title === undefined ? undefined : `<emphasis>${title}</emphasis>`);
    this.indent(() => {
      callback();
      this.spacer();
    });
  }

  hr(text?: string) {
    const {hasClearScreen} = this;

    this.spacer();

    if (hasClearScreen && text === undefined) {
      return;
    }

    for (const stream of this.getStreams(false)) {
      const prefix = this.markupify(stream, text === undefined
        ? ''
        : ` ${text} `);
      const prefixLength = this.indentString.length + this.markupifyLength(
        stream,
        prefix,
      );
      const barLength = Math.max(0, stream.columns - prefixLength);
      this.logOneNoMarkup(stream, prefix + '\u2501'.repeat(barLength));
    }

    this.spacer();
  }

  async steps(callbacks: Array<{
    message: string;
    callback: () => Promise<void>;
    clear?: boolean;
  }>) {
    const total = callbacks.length;
    let current = 1;
    for (const {clear, message, callback} of callbacks) {
      this.step(current, total, message);

      if (clear) {
        this.hasClearScreen = true;
      }

      await callback();
      current++;

      // If a step doesn't produce any output, or just progress bars that are cleared, we can safely remove the previous `step` message line
      if (clear && this.hasClearScreen) {
        for (const stream of this.getStreams(false)) {
          if (stream.format === 'ansi') {
            stream.write(ansiEscapes.cursorTo(0));
            stream.write(ansiEscapes.cursorUp());
            stream.write(ansiEscapes.eraseLine);
          }
        }
      }
    }
  }

  step(current: number, total: number, msg: string) {
    if (msg.endsWith('?')) {
      msg = `${removeSuffix(msg, '?')}...?`;
    } else {
      msg += '...';
    }

    this.logAll(`<dim>[${current}/${total}]</dim> ${msg}`);
  }

  spacer() {
    if (!this.hasSpacer) {
      this.forceSpacer();
    }
  }

  forceSpacer() {
    this.logAll('');
  }

  wrapCallback: WrapperFactory = (callback) => {
    const {wrapperFactory} = this;
    if (wrapperFactory === undefined) {
      return callback;
    } else {
      return wrapperFactory(callback);
    }
  };

  //# LOG
  stripMarkup(str: string) {
    return markupToPlainText(str, this.markupOptions);
  }

  markupifyLength(stream: ReporterStream, str: string): number {
    const markup = this.markupify(stream, str);

    if (stream.format === 'ansi') {
      return stripAnsi(markup).length;
    }

    // TODO html
    return markup.length;
  }

  markupify(stream: ReporterStreamMeta, str: string): string {
    switch (stream.format) {
      case 'ansi':
        return markupToAnsi(str, this.markupOptions);

      case 'html':
      case 'none':
        // TODO
        return markupToPlainText(str);

      case 'markup':
        return str;
    }
  }

  logAll(tty: string, opts: LogOptions = {}) {
    for (const stream of this.getStreams(opts.stderr)) {
      this.logOne(stream, tty, opts);
    }
  }

  logAllNoMarkup(tty: string, opts: LogOptions = {}) {
    for (const stream of this.getStreams(opts.stderr)) {
      this.logOneNoMarkup(stream, tty, opts);
    }
  }

  logOne(stream: ReporterStream, tty: string, opts: LogOptions = {}) {
    const msg = stream.format !== 'none' || opts.nonTTY === undefined
      ? tty
      : opts.nonTTY;
    const formatted = this.markupify(stream, msg);
    this.logOneNoMarkup(stream, formatted, opts);
  }

  logOneNoMarkup(stream: ReporterStream, tty: string, opts: LogOptions = {}) {
    if (!this.isEnabled(opts.stderr)) {
      return;
    }

    let msg = this.normalizeMessage(stream, tty, opts);
    if (opts.newline !== false) {
      msg += '\n';
    }
    this.writeSpecific(stream, msg, opts);
  }

  logAllWithCategory(
    rawInner: string,
    args: Array<unknown>,
    opts: LogCategoryOptions,
  ) {
    if (!this.isEnabled(opts.stderr)) {
      return;
    }

    const inner = markupTag(opts.markupTag, rawInner);
    const unicodeSuffix = opts.unicodeSuffix === undefined
      ? ''
      : markupTag('emphasis', markupTag(opts.markupTag, opts.unicodeSuffix));

    for (const stream of this.getStreams(opts.stderr)) {
      // Format the prefix, selecting it depending on if we're a unicode stream
      const prefixInner = stream.unicode ? opts.unicodePrefix : opts.rawPrefix;
      const prefix = markupTag('emphasis', markupTag(
        opts.markupTag,
          this.getMessagePrefix() +
          prefixInner,
      ));

      const prefixMarkup = this.markupify(stream, prefix);
      const innerMarkup = this.markupify(stream, inner);

      // Ignore suffix unless we're a unicode stream
      const suffixMarkup = stream.unicode
        ? this.markupify(stream, unicodeSuffix)
        : '';

      // Format with string-markup, we only do the first message rather than the interpolated string so you can pass in any data and not have to worry about escaping it
      const formatted = prefixMarkup + innerMarkup + suffixMarkup;

      // Interpolate %s
      const interpolated = interpolate(formatted, args);

      // Line wrap
      let wrapped = interpolated;
      if (stream.format === 'ansi') {
        const allowedWidth = stream.columns - INDENT.length * this.indentLevel;
        const indent = stripAnsi(prefixMarkup).length;
        wrapped = lineWrapAnsi(interpolated, allowedWidth, indent);
      }

      this.logOneNoMarkup(stream, wrapped, {
        // No prefix as we added it ourselves at the beginning, this is so the indentation is correct when line wrapped
        noPrefix: true,
        ...opts,
      });
    }
  }

  success(msg: string, ...args: Array<unknown>) {
    this.logAllWithCategory(msg, args, {
      unicodePrefix: '\u2714 ',
      rawPrefix: '\u221a ',
      markupTag: 'success',
    });
  }

  error(msg: string, ...args: Array<unknown>) {
    this.logAllWithCategory(msg, args, {
      markupTag: 'error',
      unicodePrefix: '\u2716 ',
      rawPrefix: '\xd7 ',
      stderr: true,
    });
  }

  errorObj(err: Error) {
    this.error(err.stack || err.message || err.name || 'Unknown Error');
  }

  info(msg: string, ...args: Array<unknown>) {
    this.logAllWithCategory(msg, args, {
      unicodePrefix: '\u2139 ',
      rawPrefix: 'i ',
      markupTag: 'info',
    });
  }

  warn(msg: string, ...args: Array<unknown>) {
    this.logAllWithCategory(msg, args, {
      unicodePrefix: '\u26a0 ',
      rawPrefix: '! ',
      unicodeSuffix: ' \u26a0',
      markupTag: 'warn',
      stderr: true,
    });
  }

  verbose(msg: string, ...args: Array<unknown>) {
    if (this.isVerbose) {
      this.verboseForce(msg, args);
    }
  }

  verboseForce(msg: string, ...args: Array<unknown>) {
    this.logAllWithCategory(msg, args, {
      unicodePrefix: '\u26a1 ',
      rawPrefix: '* ',
      markupTag: 'dim',
    });
  }

  command(command: string) {
    this.logAll(`<dim>$ ${command}</dim>`, {
      nonTTY: `$ ${command}`,
    });
  }

  //# LISTS
  _getListIndentation(): string {
    // If we're at the top level then add some implicit indentation
    return this.indentLevel === 0 ? '  ' : '';
  }

  processedList<T>(
    items: Array<T>,
    callback: (item: T, display: (str: string) => void) => void,
    opts: ListOptions = {},
  ) {
    if (items.length === 0) {
      // We make some assumptions that there's at least one item
      return;
    }

    const indent = this._getListIndentation();

    let tuples: Array<[number, T]>;
    if (opts.reverse === true) {
      tuples = items.reverse().map((item, i) => [items.length - i, item]);
    } else {
      tuples = items.map((item, i) => [i, item]);
    }

    // Truncate if necessary
    let truncatedCount = 0;
    if (opts.truncate !== undefined) {
      tuples = tuples.slice(0, opts.truncate);
      truncatedCount = items.length - tuples.length;
    }

    let indentLength = indent.length;

    if (opts.ordered) {
      // Get the highest visible number. It could be at the start or the end depending on if it was reversed
      const highestVisible = Math.max(tuples[0][0], tuples[tuples.length - 1][0]);

      // Length of the largest visible number plus the dot for padding
      const numLen = humanizeNumber(highestVisible + 1).length + 1;

      // "0. "
      indentLength += numLen + 1;

      for (const [index, item] of tuples) {
        callback(
          item,
          (str) => {
            const num: string = `<pad count="${numLen}" dir="right">${humanizeNumber(
                index +
                1,
            )}.</pad>`;
            this.logAll(`${indent}<dim>${num}</dim> ${str}`);
          },
        );
      }
    } else {
      // "- "
      indentLength += 2;

      for (const [, item] of tuples) {
        callback(item, (str) => {
          this.logAll(`${indent}<dim>-</dim> ${str}`);
        });
      }
    }

    if (truncatedCount > 0) {
      const indent = ' '.repeat(indentLength);
      this.logAll(`${indent}and <number>${truncatedCount}</number> others...`);
    }
  }

  list(items: Array<string>, opts: ListOptions = {}) {
    this.processedList(items, (str, display) => display(str), opts);
  }

  progress(opts?: ReporterProgressOptions): ReporterProgress {
    if (this.isRemote) {
      return this.progressRemote(opts);
    } else {
      return this.progressLocal(opts);
    }
  }

  progressLocal(opts?: ReporterProgressOptions, onEnd?: () => void): Progress {
    const bar = new Progress(this, opts, () => {
      this.activeElements.delete(bar);
      if (onEnd !== undefined) {
        onEnd();
      }
    });
    this.activeElements.add(bar);
    return bar;
  }

  progressRemote(opts?: ReporterProgressOptions): ReporterProgress {
    const id: string = `${process.pid}:${remoteProgressIdCounter++}`;

    this.sendRemoteClientMessage.send({
      type: 'PROGRESS_CREATE',
      opts,
      id,
    });

    let closed = false;

    const dispatch = (message: RemoteReporterClientMessage) => {
      if (!closed) {
        this.sendRemoteClientMessage.send(message);
      }
    };

    const end = () => {
      this.activeElements.delete(progress);
      this.remoteServerProgressBars.delete(id);
      closed = true;
    };

    const progress: ReporterProgress = {
      render() {
        // Don't do anything
        // This is called when columns have updated and we want to force a rerender
      },

      setCurrent: (current: number) => {
        dispatch({
          type: 'PROGRESS_SET_CURRENT',
          current,
          id,
        });
      },

      setTotal: (total: number, approximate: boolean = false) => {
        dispatch({
          type: 'PROGRESS_SET_TOTAL',
          total,
          approximate,
          id,
        });
      },

      setText: (text: string) => {
        dispatch({
          type: 'PROGRESS_SET_TEXT',
          text,
          id,
        });
      },

      setApproximateETA: (duration: number) => {
        dispatch({
          type: 'PROGRESS_SET_APPROXIMATE_ETA',
          duration,
          id,
        });
      },

      pushText: (text: string) => {
        dispatch({
          type: 'PROGRESS_PUSH_TEXT',
          text,
          id,
        });
      },

      popText: (text: string) => {
        dispatch({
          type: 'PROGRESS_POP_TEXT',
          text,
          id,
        });
      },

      tick: () => {
        dispatch({
          type: 'PROGRESS_TICK',
          id,
        });
      },

      end: () => {
        dispatch({
          type: 'PROGRESS_END',
          id,
        });
      },

      pause: () => {
        dispatch({
          type: 'PROGRESS_PAUSE',
          id,
        });
      },

      resume: () => {
        dispatch({
          type: 'PROGRESS_RESUME',
          id,
        });
      },
    };

    this.remoteServerProgressBars.set(id, {
      end,
    });

    this.activeElements.add(progress);

    return progress;
  }
}
