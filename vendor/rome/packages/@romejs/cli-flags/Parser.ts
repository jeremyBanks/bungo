/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {Reporter} from '@romejs/cli-reporter';
import {serializeCLIFlags} from './serializeCLIFlags';
import {
  ConsumePath,
  ConsumePropertyDefinition,
  ConsumeSourceLocationRequestTarget,
  Consumer,
  consume,
} from '@romejs/consume';
import {naturalCompare, toCamelCase, toKebabCase} from '@romejs/string-utils';
import {createUnknownFilePath} from '@romejs/path';
import {Dict} from '@romejs/typescript-helpers';
import {markup} from '@romejs/string-markup';
import {descriptions} from '@romejs/diagnostics';

export type Examples = Array<{
  description: string;
  command: string;
}>;

type CommandOptions<T extends Dict<unknown>> = {
  name: string;
  category?: string;
  description?: string;
  usage?: string;
  examples?: Examples;
  ignoreFlags?: Array<string>;
  defineFlags?: (consumer: Consumer) => T;
  callback: (flags: T) => void | Promise<void>;
};

type AnyCommandOptions = CommandOptions<Dict<unknown>>;

type ArgDeclaration = {
  definition: ConsumePropertyDefinition;
  name: string;
  command: undefined | string;
};

type DefinedCommand = {
  flags: Dict<unknown>;
  command: AnyCommandOptions;
};

export type ParserOptions<T> = {
  examples?: Examples;
  programName: string;
  usage?: string;
  description?: string;
  version?: string;
  ignoreFlags?: Array<string>;
  defineFlags: (consumer: Consumer) => T;
};

function splitCommandName(cmd: string): Array<string> {
  return cmd.split(' ');
}

type _FlagValue = undefined | number | string | boolean;

export type FlagValue = _FlagValue | Array<_FlagValue>;

export default class Parser<T> {
  constructor(
    reporter: Reporter,
    opts: ParserOptions<T>,
    rawArgs: Array<string>,
  ) {
    this.reporter = reporter;
    this.opts = opts;

    this.shorthandFlags = new Set();
    this.incorrectCaseFlags = new Set();
    this.declaredFlags = new Map();
    this.defaultFlags = new Map();
    this.flags = new Map();
    this.args = [];

    // These are used to track where we should insert an argument for a boolean flag value
    this.flagToArgIndex = new Map();
    this.flagToArgOffset = 0;

    this.consumeRawArgs(rawArgs);

    this.commands = new Map();
    this.ranCommand = undefined;
    this.currentCommand = undefined;

    if (opts.version !== undefined) {
      this.declareArgument({
        command: undefined,
        name: 'version',
        definition: {
          type: 'boolean',
          objectPath: ['version'],
          default: false,
          required: false,
          metadata: {
            description: 'show the version',
          },
        },
      });
    }

    this.declareArgument({
      command: undefined,
      name: 'help',
      definition: {
        type: 'boolean',
        objectPath: ['help'],
        default: false,
        required: false,
        metadata: {
          description: 'show this help screen',
        },
      },
    });

    this.helpMode = this.flags.has('help');
  }

  reporter: Reporter;
  opts: ParserOptions<T>;

  incorrectCaseFlags: Set<string>;
  shorthandFlags: Set<string>;
  flags: Map<string, FlagValue>;
  defaultFlags: Map<string, unknown>;
  declaredFlags: Map<string, ArgDeclaration>;
  flagToArgIndex: Map<string, number>;
  flagToArgOffset: number;

  ranCommand: undefined | string;
  commands: Map<string, AnyCommandOptions>;
  args: Array<string>;

  currentCommand: undefined | string;
  helpMode: boolean;

  looksLikeFlag(flag: undefined | string): boolean {
    return flag !== undefined && flag[0] === '-';
  }

  toCamelCase(name: string): string {
    const camelName = toCamelCase(name);

    // Don't allow passing in straight camelcased names
    if (toKebabCase(name) !== name) {
      this.incorrectCaseFlags.add(name);
    }

    return camelName;
  }

  setFlag(key: string, value: string | boolean) {
    let newValue: FlagValue = value;
    const existing = this.flags.get(key);
    if (existing !== undefined) {
      if (Array.isArray(existing)) {
        newValue = [...existing, value];
      } else {
        newValue = [existing, value];
      }
    }
    this.flags.set(key, newValue);
  }

  consumeRawArgs(rawArgs: Array<string>) {
    while (rawArgs.length > 0) {
      const arg: string = String(rawArgs.shift());

      if (arg === '--') {
        // We consider a -- by itself to halt parsing of args, the rest of the remaining args are added to _
        this.args = this.args.concat(rawArgs);
        break;
      } else if (arg[0] === '-') {
        // Clean the argument by stripping off the dashes
        const name = arg[1] === '-' ? arg.slice(2) : arg.slice(1);

        // Flags beginning with no- are always false
        if (name.startsWith('no-')) {
          const camelName = this.toCamelCase(name.slice(3));
          this.setFlag(camelName, false);
          continue;
        }

        // Allow for arguments to be passed as --foo=bar
        const equalsIndex = name.indexOf('=');
        if (equalsIndex !== -1) {
          const cleanName = this.toCamelCase(name.slice(0, equalsIndex));
          const value = name.slice(equalsIndex + 1);
          this.setFlag(cleanName, value);
          continue;
        }

        const camelName = this.toCamelCase(name);

        // If the next argument is a flag or we're at the end of the args then just set it to `true`
        if (rawArgs.length === 0 || this.looksLikeFlag(rawArgs[0])) {
          this.setFlag(camelName, true);
        } else {
          // Otherwise, take that value
          this.setFlag(camelName, String(rawArgs.shift()));
        }

        this.flagToArgIndex.set(camelName, this.args.length);

        if (arg[0] === '-' && arg[1] !== '-') {
          this.shorthandFlags.add(camelName);
        }
      } else {
        // Not a flag and hasn't been consumed already by a previous arg so it must be a file
        this.args.push(arg);
      }
    }
  }

  getFlagsConsumer(): Consumer {
    const defaultFlags: Dict<FlagValue> = {};

    const flags: Dict<FlagValue> = {};
    for (const [key, value] of this.flags) {
      flags[toCamelCase(key)] = value;
    }

    return consume({
      filePath: createUnknownFilePath('argv'),
      value: flags,
      onDefinition: (def, valueConsumer) => {
        const key = def.objectPath.join('.');

        // Detect root object
        if (key === '') {
          return;
        }

        const value = flags[key];

        // Allow omitting a string flag value
        if (def.type === 'string' && value === true) {
          valueConsumer.setValue('');
        }

        this.declareArgument({
          name: key,
          command: this.currentCommand,
          definition: def,
        });
        defaultFlags[key] = (def.default as FlagValue);

        // We've parsed arguments like `--foo bar` as `{foo: 'bar}`
        // However, --foo may be a boolean flag, so `bar` needs to be correctly added to args
        if (
          def.type === 'boolean' &&
          value !== true &&
          value !== false &&
          value !== undefined
        ) {
          const argIndex = this.flagToArgIndex.get(key);
          if (argIndex === undefined) {
            throw new Error('No arg index. Should always exist.');
          }

          // Insert the argument at the correct place
          this.args.splice(argIndex + this.flagToArgOffset, 0, String(value));

          // Increase offset to correct subsequent insertions
          this.flagToArgOffset++;

          //
          valueConsumer.setValue(true);
        }
      },
      context: {
        category: 'flags/invalid',
        normalizeKey: (key) => {
          return this.incorrectCaseFlags.has(key) ? key : toKebabCase(key);
        },
        getOriginalValue: (keys: ConsumePath) => {
          return flags[keys[0]];
        },
        getDiagnosticPointer: (
          keys: ConsumePath,
          target: ConsumeSourceLocationRequestTarget,
        ) => {
          const {programName} = this.opts;

          return serializeCLIFlags(
            {
              programName,
              commandName: this.currentCommand,
              args: this.args,
              defaultFlags,
              flags,
              incorrectCaseFlags: this.incorrectCaseFlags,
              shorthandFlags: this.shorthandFlags,
            },
            {
              type: 'flag',
              key: String(keys[0]),
              target,
            },
          );
        },
      },
    });
  }

  hasArg(name: string): boolean {
    return this.flags.has(name) && this.flags.get(name) !== undefined;
  }

  declareArgument(decl: ArgDeclaration) {
    // Commands may have colliding flags, this is only a problem in help mode, so make it unique
    const key =
      decl.command === undefined ? decl.name : `${decl.command}.${decl.name}`;

    // Ensure it hasn't been declared more than once
    if (this.declaredFlags.has(key)) {
      throw new Error(`Already declared argument ${key}`);
    }

    // Declare argument
    this.declaredFlags.set(key, decl);
    this.defaultFlags.set(key, decl.definition.default);
  }

  getInterface(): ParserInterface<T> {
    return new ParserInterface(this);
  }

  async maybeDefineCommand(
    commandName: string,
    consumer: Consumer,
  ): Promise<undefined | DefinedCommand> {
    // A command name could be made of multiple strings
    const commandParts = splitCommandName(commandName);
    for (let i = 0; i < commandParts.length; i++) {
      if (commandParts[i] !== this.args[i]) {
        return;
      }
    }

    // Remove command name from arguments
    this.args = this.args.slice(commandParts.length);
    return await this.defineCommandFlags(commandName, consumer);
  }

  checkBadFlags(consumer: Consumer, definedCommand: undefined | DefinedCommand) {
    if (this.helpMode) {
      return;
    }

    // Ignore flags from command and root parser options
    const ignoreFlags: Array<string> = [
      ...((definedCommand !== undefined && definedCommand.command.ignoreFlags) || []),
      ...(this.opts.ignoreFlags || []),
    ];
    for (const key of ignoreFlags) {
      this.shorthandFlags.delete(key);
      this.incorrectCaseFlags.delete(key);
      consumer.markUsedProperty(key);
    }

    for (const shorthandName of this.shorthandFlags) {
      consumer.get(shorthandName).unexpected(
        descriptions.FLAGS.UNSUPPORTED_SHORTHANDS,
      );
    }

    for (const incorrectName of this.incorrectCaseFlags) {
      consumer.get(incorrectName).unexpected(
        descriptions.FLAGS.INCORRECT_CASED_FLAG(incorrectName),
      );
    }

    consumer.enforceUsedProperties('flag', false);
  }

  async init(): Promise<T> {
    // Show help for --version
    if (this.flags.has('version')) {
      this.reporter.logAll(String(this.opts.version));
      process.exit(0);
    }

    const consumer = this.getFlagsConsumer();

    let definedCommand: undefined | DefinedCommand;

    const rootFlags = await consumer.bufferDiagnostics(async (consumer) => {
      const rootFlags = this.opts.defineFlags(consumer);

      for (const key of this.commands.keys()) {
        const defined = await this.maybeDefineCommand(key, consumer);
        if (defined) {
          this.currentCommand = key;
          definedCommand = defined;
          break;
        }
      }

      this.checkBadFlags(consumer, definedCommand);
      this.currentCommand = undefined;

      return rootFlags;
    });

    // Show help for --help
    if (this.helpMode) {
      await this.showHelp(
        definedCommand === undefined ? undefined : definedCommand.command.name,
      );
      process.exit(1);
    }

    if (definedCommand !== undefined) {
      this.ranCommand = definedCommand.command.name;
      await definedCommand.command.callback(definedCommand.flags);
    }

    return rootFlags;
  }

  buildOptionsHelp(keys: Array<string>): Array<string> {
    const lines = [];

    const optionOutput: Array<{
      argName: string;
      arg: string;
      description: string;
    }> = [];
    let argColumnLength: number = 0;

    // Build up options, we need to do this to line up the columns correctly
    for (const key of keys) {
      const decl = this.declaredFlags.get(key);
      if (decl === undefined) {
        throw new Error('Expected argument declaration');
      }

      const {definition: def} = decl;
      const {metadata} = def;
      let argName = decl.name;
      let argCol = toKebabCase(decl.name);

      // For booleans that default to `true`, show the --no- version as that'll be what users should use
      if (def.type === 'boolean' && def.default === true) {
        argCol = `--no-${argCol}`;
        argName = `no-${argName}`;
      } else {
        argCol = `--${argCol}`;
      }

      // Add input specifier unless a boolean
      if (def.type !== 'boolean') {
        // TODO some way to customize this
        // Property metadata in the consumer is a fine place but we want this to be non-CLI specific
        let inputName = undefined;

        if (inputName === undefined) {
          if (def.type === 'number' || def.type === 'number-range') {
            inputName = 'num';
          } else {
            inputName = 'input';
          }
        }

        argCol += ` <${inputName}>`;
      }

      // Set arg col length if we'll be longer
      if (argColumnLength < argCol.length) {
        argColumnLength = argCol.length;
      }

      const descCol: string =
        metadata === undefined || metadata.description === undefined
          ? 'no description found'
          : metadata.description;

      optionOutput.push({
        argName,
        arg: argCol,
        description: descCol,
      });
    }

    // Sort options by argument name
    optionOutput.sort((a, b) => naturalCompare(a.argName, b.argName));

    // Output options
    for (const {arg, description} of optionOutput) {
      lines.push(
        markup`<color fg="brightBlack"><pad count="${argColumnLength}" dir="right">${arg}</pad></color>  ${description}`,
      );
    }

    return lines;
  }

  showUsageHelp(
    description?: string,
    usage: string = '[flags]',
    prefix?: string,
  ) {
    const {reporter} = this;
    const {programName} = this.opts;

    reporter.section(
      `Usage`,
      () => {
        if (description !== undefined) {
          reporter.logAll(description);
          reporter.forceSpacer();
        }

        const commandParts = [programName];
        if (prefix !== undefined) {
          commandParts.push(prefix);
        }
        commandParts.push(usage);

        const command = commandParts.join(' ');
        reporter.command(command);
      },
    );
  }

  showFocusedCommandHelp(commandName: string) {
    const command = this.commands.get(commandName);
    if (command === undefined) {
      throw new Error(`Unknown command ${commandName}`);
    }

    const {reporter} = this;
    const {name, usage, description, examples} = command;

    reporter.forceSpacer();
    this.showUsageHelp(description, usage, name);
    this.showHelpExamples(examples, name);

    // Find arguments that belong to this command
    const argKeys = [];
    for (const [key, decl] of this.declaredFlags) {
      if (decl.command === name) {
        argKeys.push(key);
      }
    }

    const optLines = this.buildOptionsHelp(argKeys);
    if (optLines.length > 0) {
      reporter.section(
        'Command Flags',
        () => {
          for (const line of optLines) {
            reporter.logAll(line);
          }
        },
      );
    }

    reporter.section(
      'Global Flags',
      () => {
        reporter.info('To view global flags run');
        reporter.command('rome --help');
      },
    );
  }

  showGlobalFlags() {
    const {reporter} = this;
    reporter.section(
      'Global Flags',
      () => {
        // Show options not attached to any commands
        const lonerArgKeys = [];
        for (const [key, decl] of this.declaredFlags) {
          if (decl.command === undefined) {
            lonerArgKeys.push(key);
          }
        }

        for (const line of this.buildOptionsHelp(lonerArgKeys)) {
          reporter.logAll(line);
        }
      },
    );
  }

  async showHelp(commandName: undefined | string = this.ranCommand) {
    if (commandName !== undefined) {
      this.showFocusedCommandHelp(commandName);
      return;
    }

    const {reporter} = this;
    const {description, usage, examples, programName} = this.opts;

    this.showUsageHelp(description, usage);
    this.showGlobalFlags();

    // Sort commands into their appropriate categories for output
    const commandsByCategory: Map<undefined | string, Array<AnyCommandOptions>> = new Map();
    const categoryNames: Set<string | undefined> = new Set();
    for (const [name, command] of this.commands) {
      if (name[0] === '_') {
        continue;
      }

      const {category} = command;
      let commandsForCategory = commandsByCategory.get(category);
      if (commandsForCategory === undefined) {
        commandsForCategory = [];
        commandsByCategory.set(category, commandsForCategory);
      }
      commandsForCategory.push(command);
      categoryNames.add(category);
    }

    reporter.section(
      'Commands',
      () => {
        const sortedCategoryNames: Array<string | undefined> = Array.from(
          categoryNames,
        ).sort();

        // Always make sure categoryless commands are displayed first
        if (sortedCategoryNames.includes(undefined)) {
          sortedCategoryNames.splice(sortedCategoryNames.indexOf(undefined), 1);
          sortedCategoryNames.unshift(undefined);
        }

        for (const category of sortedCategoryNames) {
          const commands = commandsByCategory.get(category);
          if (commands === undefined) {
            throw new Error('Impossible. Should always be populated.');
          }

          if (category !== undefined) {
            reporter.logAll(`<emphasis>${category} Commands</emphasis>`);
          }

          // Sort by name
          commands.sort((a, b) => a.name.localeCompare(b.name));

          reporter.list(
            commands.map((cmd) => {
              return `<emphasis>${cmd.name}</emphasis> ${cmd.description ===
              undefined
                ? ''
                : cmd.description}`;
            }),
          );
          reporter.spacer();
        }

        reporter.info('To view help for a specific command run');
        reporter.command(`${programName} command_name --help`);
      },
    );

    this.showHelpExamples(examples);
  }

  showHelpExamples(examples?: Examples, prefix?: string) {
    const {programName} = this.opts;
    const {reporter} = this;

    if (examples === undefined || examples.length === 0) {
      return;
    }

    reporter.section(
      'Examples',
      () => {
        for (const {description, command} of examples) {
          const commandParts = [];
          if (programName !== undefined) {
            commandParts.push(programName);
          }
          if (prefix !== undefined) {
            commandParts.push(prefix);
          }
          commandParts.push(command);

          const builtCommand = commandParts.join(' ');

          reporter.spacer();
          if (description !== undefined) {
            reporter.logAll(description);
          }
          reporter.command(builtCommand);
        }
      },
    );
  }

  commandRequired() {
    if (this.ranCommand) {
      return;
    }

    if (this.args.length === 0) {
      this.reporter.error(
        'No command specified. Run --help to see available commands.',
      );
    } else {
      // TODO command name is not sanitized for markup
      // TODO produce a diagnostic instead
      this.reporter.error(
        `Unknown command <emphasis>${this.args.join(' ')}</emphasis>. Run --help to see available commands.`,
      );
    }

    process.exit(1);
  }

  addCommand(opts: AnyCommandOptions) {
    if (this.currentCommand !== undefined) {
      throw new Error("Nested commands aren't allowed");
    }

    this.commands.set(opts.name, opts);
  }

  async defineCommandFlags(
    cmd: string,
    consumer: Consumer,
  ): Promise<DefinedCommand> {
    const opts = this.commands.get(cmd);
    if (opts === undefined) {
      throw new Error('Expected options');
    }

    this.currentCommand = cmd;

    let flags: Dict<unknown> = {};
    if (opts.defineFlags !== undefined) {
      flags = opts.defineFlags(consumer);
    }

    this.currentCommand = undefined;

    return {
      flags,
      command: opts,
    };
  }
}

export class ParserInterface<T> {
  constructor(parser: Parser<T>) {
    this.parser = parser;
  }

  parser: Parser<T>;

  init(): Promise<T> {
    return this.parser.init();
  }

  showHelp(): Promise<void> {
    return this.parser.showHelp();
  }

  getArgs(): Array<string> {
    return this.parser.args;
  }

  commandRequired() {
    this.parser.commandRequired();
  }

  command(opts: AnyCommandOptions) {
    this.parser.addCommand(opts);
  }
}
