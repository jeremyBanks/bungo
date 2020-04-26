/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  Diagnostic,
  DiagnosticAdvice,
  DiagnosticDescriptionOptionalCategory,
  DiagnosticLocation,
  Diagnostics,
  DiagnosticsError,
  catchDiagnosticsSync,
  createBlessedDiagnosticMessage,
  createSingleDiagnosticError,
  descriptions,
} from '@romejs/diagnostics';
import {UnknownObject} from '@romejs/typescript-helpers';
import {
  JSONArray,
  JSONObject,
  JSONPropertyValue,
  JSONValue,
} from '@romejs/codec-json';
import {
  ConsumeContext,
  ConsumeKey,
  ConsumePath,
  ConsumePropertyDefinition,
  ConsumePropertyMetadata,
  ConsumeSourceLocationRequestTarget,
  ConsumerHandleUnexpected,
  ConsumerOnDefinition,
  ConsumerOptions,
} from './types';
import {SourceLocation, UNKNOWN_POSITION} from '@romejs/parser-core';
import {
  Number0,
  Number1,
  UnknownNumber,
  ob1Add,
  ob1Coerce0,
  ob1Coerce1,
} from '@romejs/ob1';
import {isValidIdentifierName} from '@romejs/js-ast-utils';
import {escapeString} from '@romejs/string-escape';
import {
  AbsoluteFilePath,
  RelativeFilePath,
  URLFilePath,
  UnknownFilePath,
  createAbsoluteFilePath,
  createURLFilePath,
  createUnknownFilePath,
} from '@romejs/path';

type UnexpectedConsumerOptions = {
  loc?: SourceLocation;
  target?: ConsumeSourceLocationRequestTarget;
  at?: 'suffix' | 'prefix' | 'none';
  atParent?: boolean;
};

function isComputedPart(part: ConsumeKey): boolean {
  return typeof part === 'number' || !isValidIdentifierName(part);
}

export default class Consumer {
  constructor(opts: ConsumerOptions) {
    this.path = opts.filePath;
    this.filename = this.path === undefined ? undefined : this.path.join();

    this.value = opts.value;
    this.parent = opts.parent;
    this.keyPath = opts.objectPath;
    this.context = opts.context;
    this.onDefinition = opts.onDefinition;
    this.propertyMetadata = opts.propertyMetadata;
    this.usedNames = new Set();
    this.forkCache = new Map();
    this.forceDiagnosticTarget = opts.forceDiagnosticTarget;

    // See shouldDispatchUnexpected for explanation
    this.hasHandledUnexpected = false;
    this.handleUnexpected = opts.handleUnexpectedDiagnostic;
  }

  path: undefined | UnknownFilePath;
  filename: undefined | string;

  handleUnexpected: undefined | ConsumerHandleUnexpected;
  onDefinition: undefined | ConsumerOnDefinition;
  propertyMetadata: undefined | ConsumePropertyMetadata;
  parent: undefined | Consumer;
  value: unknown;
  context: ConsumeContext;
  keyPath: ConsumePath;
  usedNames: Set<string>;
  forkCache: Map<string, Consumer>;
  hasHandledUnexpected: boolean;
  forceDiagnosticTarget: undefined | ConsumeSourceLocationRequestTarget;

  capture<T>(): {
    consumer: Consumer;
    definitions: Array<ConsumePropertyDefinition>;
    diagnostics: Diagnostics;
  } {
    let diagnostics: Diagnostics = [];
    const definitions: Array<ConsumePropertyDefinition> = [];

    const consumer = this.clone({
      onDefinition: (def, consumer) => {
        if (this.onDefinition !== undefined) {
          this.onDefinition(def, consumer);
        }

        definitions.push(def);
      },
      handleUnexpectedDiagnostic(diag) {
        diagnostics.push(diag);
      },
    });
    return {consumer, definitions, diagnostics};
  }

  async bufferDiagnostics<T>(
    callback: (consumer: Consumer) => Promise<T> | T,
  ): Promise<T> {
    const {diagnostics, consumer} = await this.capture();
    const result = await callback(consumer);
    if (result === undefined || diagnostics.length > 0) {
      throw new DiagnosticsError('Captured diagnostics', diagnostics);
    }
    return result;
  }

  handleThrownDiagnostics(callback: () => void) {
    if (this.handleUnexpected === undefined) {
      callback();
    } else {
      const {diagnostics} = catchDiagnosticsSync(callback);

      if (diagnostics !== undefined) {
        for (const diag of diagnostics) {
          this.handleUnexpected(diag);
        }
      }
    }
  }

  declareDefinition(
    def: Omit<ConsumePropertyDefinition, 'objectPath' | 'metadata'>,
  ) {
    if (this.onDefinition !== undefined) {
      this.onDefinition(
        ({
          ...def,
          objectPath: this.keyPath,
          metadata: this.propertyMetadata,
        } as ConsumePropertyDefinition),
        this,
      );
    }
  }

  getDiagnosticLocation(
    target: ConsumeSourceLocationRequestTarget = 'all',
  ): DiagnosticLocation {
    const {getDiagnosticPointer} = this.context;
    if (getDiagnosticPointer === undefined) {
      return {};
    }

    const {forceDiagnosticTarget} = this;
    if (forceDiagnosticTarget !== undefined) {
      target = forceDiagnosticTarget;
    }
    return getDiagnosticPointer(this.keyPath, target);
  }

  getLocation(target?: ConsumeSourceLocationRequestTarget): SourceLocation {
    const location = this.getDiagnosticLocation(target);
    if (
      location === undefined ||
      location.start === undefined ||
      location.end === undefined
    ) {
      return {
        filename: this.filename,
        start: UNKNOWN_POSITION,
        end: UNKNOWN_POSITION,
      };
    } else {
      return {
        filename: location.filename,
        start: location.start,
        end: location.end,
      };
    }
  }

  getLocationRange(
    startIndex: Number0,
    endIndex: Number0 = startIndex,
    target?: ConsumeSourceLocationRequestTarget,
  ): SourceLocation {
    const loc = this.getLocation(target);
    if (loc.start === UNKNOWN_POSITION) {
      return loc;
    }

    const {start, end} = loc;

    // We don't support handling line differences here... yet?
    if (start.line !== end.line) {
      return loc;
    }

    return {
      ...loc,
      start: {
        ...start,
        column: ob1Add(start.column, startIndex),
        index: ob1Add(start.index, startIndex),
      },
      end: {
        ...start,
        column: ob1Add(start.column, endIndex),
        index: ob1Add(start.index, endIndex),
      },
    };
  }

  getKey(): Consumer {
    return this.clone({
      forceDiagnosticTarget: 'key',
      value: this.getParentKey(),
    });
  }

  getParentKey(): ConsumeKey {
    return this.keyPath[this.keyPath.length - 1];
  }

  hasChangedFromSource(): boolean {
    const {getOriginalValue} = this.context;
    if (getOriginalValue === undefined) {
      return false;
    }

    const originalValue = getOriginalValue(this.keyPath);
    return !this.wasInSource() || this.value !== originalValue;
  }

  wasInSource() {
    return this.getDiagnosticLocation() !== undefined;
  }

  getKeyPathString(path: ConsumePath = this.keyPath): string {
    const {normalizeKey} = this.context;
    let str = '';

    for (let i = 0; i < path.length; i++) {
      let part = path[i];
      const nextPart = path[i + 1];

      if (typeof part === 'string' && normalizeKey !== undefined) {
        part = normalizeKey(part);
      }

      // If we are a computed property then wrap in brackets, the previous part would not have inserted a dot
      // We allow a computed part at the beginning of a path
      if (isComputedPart(part) && i > 0) {
        const inner =
          typeof part === 'number'
            ? String(part)
            : escapeString(
                part,
                {
                  quote: "'",
                },
              );

        str += `[${inner}]`;
      } else {
        if (nextPart === undefined || isComputedPart(nextPart)) {
          // Don't append a dot if there are no parts or the next is computed
          str += part;
        } else {
          str += `${part}.`;
        }
      }
    }

    return str;
  }

  generateUnexpectedMessage(
    msg: string,
    opts: UnexpectedConsumerOptions,
  ): string {
    const {at = 'suffix', atParent = false} = opts;
    const {parent} = this;

    let target: Consumer = this;

    if (atParent) {
      if (parent === undefined) {
        // Cannot target the parent if it does not exist
        return msg;
      } else {
        target = parent;
      }
    }

    if (at === 'suffix') {
      msg += ` at <emphasis>${target.getKeyPathString()}</emphasis>`;
    } else {
      msg = `<emphasis>${target.getKeyPathString()}</emphasis> ${msg}`;
    }

    return msg;
  }

  unexpected(
    description: DiagnosticDescriptionOptionalCategory = descriptions.CONSUME.INVALID,
    opts: UnexpectedConsumerOptions = {},
  ): DiagnosticsError {
    const {target = 'value'} = opts;

    const {filename} = this;
    let location = this.getDiagnosticLocation(target);
    const fromSource = location !== undefined;

    const message = this.generateUnexpectedMessage(
      description.message.value,
      opts,
    );
    description = {
      ...description,
      message: createBlessedDiagnosticMessage(message),
    };

    const advice: DiagnosticAdvice = [...(description.advice || [])];

    // Make the errors more descriptive
    if (fromSource) {
      if (this.hasChangedFromSource()) {
        advice.push({
          type: 'log',
          category: 'warn',
          message: 'Our internal value has been modified since we read the original source',
        });
      }
    } else {
      // Go up the consumer tree and take the position from the first consumer found in the source
      let consumer: undefined | Consumer = this;
      do {
        const possibleLocation = consumer.getDiagnosticLocation(target);
        if (possibleLocation !== undefined) {
          location = possibleLocation;
          break;
        }
        consumer = consumer.parent;
      } while (consumer !== undefined);

      // If consumer is undefined and we have no filename then we were not able to find a location,
      // in this case, just throw a normal error
      if (consumer === undefined && filename === undefined) {
        throw new Error(message);
      }

      // Warn that we didn't find this value in the source if it's parent wasn't either
      if (this.parent === undefined || !this.parent.wasInSource()) {
        advice.push({
          type: 'log',
          category: 'warn',
          message: `This value was expected to be found at <emphasis>${this.getKeyPathString()}</emphasis> but was not in the original source`,
        });
      }
    }

    if (opts.loc !== undefined) {
      location = opts.loc;
    }

    if (location === undefined) {
      throw new Error(message);
    }

    const diagnostic: Diagnostic = {
      description: {
        category: this.context.category,
        ...description,
        advice,
      },
      location: {
        ...location,
        filename: this.filename,
      },
    };

    const err = createSingleDiagnosticError(diagnostic);

    if (this.handleUnexpected === undefined) {
      throw err;
    } else {
      if (this.shouldDispatchUnexpected()) {
        this.handleUnexpected(diagnostic);
        this.hasHandledUnexpected = true;
      }

      // Still allow throwing the diagnostic
      return err;
    }
  }

  // Only dispatch a single error for the current consumer, and suppress any if we have a parent consumer with errors
  // We do this since we could be producing redundant stale errors based on
  // results we've normalized to allow us to continue
  shouldDispatchUnexpected(): boolean {
    if (this.hasHandledUnexpected) {
      return false;
    }

    const {parent} = this;
    if (parent !== undefined) {
      return parent.shouldDispatchUnexpected();
    }

    return true;
  }

  clone(opts: Partial<ConsumerOptions>): Consumer {
    return new Consumer({
      onDefinition: this.onDefinition,
      handleUnexpectedDiagnostic: this.handleUnexpected,
      filePath: this.path,
      context: this.context,
      value: this.value,
      parent: this.parent,
      objectPath: this.keyPath,
      propertyMetadata: this.propertyMetadata,
      ...opts,
    });
  }

  fork(
    key: ConsumeKey,
    value: unknown,
    propertyMetadata?: ConsumePropertyMetadata,
  ) {
    // We require this cache as we sometimes want to store state about a forked property such as used items
    const cached = this.forkCache.get(String(key));
    if (
      cached !== undefined &&
      cached.value === value &&
      (cached.propertyMetadata === undefined ||
      cached.propertyMetadata === propertyMetadata)
    ) {
      return cached;
    }

    const forked = this.clone({
      propertyMetadata,
      value,
      parent: this,
      objectPath: [...this.keyPath, key],
    });
    this.forkCache.set(String(key), forked);
    return forked;
  }

  _normalizeValueForSet(value: unknown): unknown {
    if (value instanceof Set) {
      return Array.from(value);
    }

    if (value instanceof Map) {
      const obj: UnknownObject = {};
      for (const [key, val] of value) {
        obj[key] = val;
      }
      return obj;
    }

    return value;
  }

  getValue(def?: unknown): unknown {
    if (this.exists()) {
      return this.value;
    } else {
      return def;
    }
  }

  setValue(rawValue: unknown): this {
    const value = this._normalizeValueForSet(rawValue);
    this.value = value;

    // If we're at the root (as indicated by the lack of these properties) then go no where else
    const {parent, keyPath} = this;
    if (parent === undefined || keyPath.length === 0) {
      return this;
    }

    // Validate the parent is an object
    const parentValue = parent.asUnknown();
    if (
      parentValue === undefined ||
      parentValue === null ||
      typeof parentValue !== 'object'
    ) {
      throw parent.unexpected(descriptions.CONSUME.SET_PROPERTY_NON_OBJECT);
    }

    // Mutate the parent
    const parentObj = parent.asUnknownObject();
    const key = this.getParentKey();
    parentObj[String(key)] = value;
    parent.setValue(parentObj);

    return this;
  }

  has(key: string): boolean {
    return this.get(key).asUnknown() != null;
  }

  setProperty(key: string, value: unknown): Consumer {
    return this.get(key).setValue(value);
  }

  get(key: string, metadata?: ConsumePropertyMetadata): Consumer {
    const value = this.asUnknownObject();
    this.markUsedProperty(key);
    return this.fork(key, value[key], metadata);
  }

  markUsedProperty(name: string) {
    this.usedNames.add(name);
  }

  enforceUsedProperties(type: string = 'property', recursive: boolean = true) {
    if (!this.isObject()) {
      return;
    }

    const knownProperties = Array.from(this.usedNames.keys());

    for (const [key, value] of this.asMap(false, false)) {
      if (!this.usedNames.has(key)) {
        value.unexpected(
          descriptions.CONSUME.UNUSED_PROPERTY(
            this.getKeyPathString([key]),
            type,
            knownProperties,
          ),
          {
            target: 'key',
            at: 'suffix',
            atParent: true,
          },
        );
      }

      if (recursive) {
        value.enforceUsedProperties(type, true);
      }
    }
  }

  asPossibleParsedJSON(): Consumer {
    if (typeof this.asUnknown() === 'string') {
      return this.clone({
        value: JSON.parse(this.asString()),
      });
    } else {
      return this;
    }
  }

  // JSON
  asJSONValue(): JSONValue {
    const {value} = this;

    switch (typeof value) {
      case 'number':
      case 'string':
      case 'boolean':
        return value;
    }

    if (value === null) {
      return null;
    }

    if (Array.isArray(value)) {
      return this.asJSONArray();
    }

    if (this.isObject()) {
      return this.asJSONObject();
    }

    this.unexpected(descriptions.CONSUME.EXPECTED_JSON_VALUE);
    return '';
  }

  asJSONArray(): JSONArray {
    const arr: JSONArray = [];
    for (const value of this.asArray()) {
      arr.push(value.asJSONValue());
    }
    return arr;
  }

  asJSONObject(): JSONObject {
    const obj: JSONObject = {};
    for (const [key, value] of this.asMap()) {
      obj[key] = value.asJSONPropertyValue();
    }
    return obj;
  }

  asJSONPropertyValue(): JSONPropertyValue {
    if (this.exists()) {
      return this.asJSONValue();
    } else {
      return undefined;
    }
  }

  //
  exists() {
    return this.value != null;
  }

  isObject(): boolean {
    const {value} = this;
    return (
      typeof value === 'object' &&
      value !== null &&
      value.constructor === Object
    );
  }

  // OBJECTS
  keys(optional?: boolean): Array<string> {
    return Object.keys(this.asUnknownObject(optional));
  }

  asUnknownObject(optional: boolean = false): UnknownObject {
    this.declareDefinition({
      type: 'object',
      default: undefined,
      required: !optional,
    });

    if (optional === true && !this.exists()) {
      return {};
    }

    const {value} = this;
    if (!this.isObject()) {
      this.unexpected(descriptions.CONSUME.EXPECTED_OBJECT);
      return {};
    }

    // @ts-ignore
    return {...value};
  }

  asMap(optional?: boolean, markUsed = true): Map<string, Consumer> {
    const value = this.asUnknownObject(optional);
    const map = new Map();
    for (const key in value) {
      if (markUsed) {
        this.markUsedProperty(key);
      }
      map.set(key, this.fork(key, value[key]));
    }
    return map;
  }

  // ARRAY-LIKES
  asSet(optional?: boolean): Set<Consumer> {
    const arr = this.asArray(optional);
    const setVals: Set<unknown> = new Set();
    const set: Set<Consumer> = new Set();

    for (let i = 0; i < arr.length; i++) {
      const consumer = arr[i];
      const value = consumer.asUnknown();
      if (setVals.has(value)) {
        continue;
      }

      setVals.add(value);
      set.add(consumer);
    }

    return set;
  }

  asPlainArray(optional: boolean = false): Array<unknown> {
    this.declareDefinition({
      type: 'array',
      default: undefined,
      required: !optional,
    });

    if (optional === true && !this.exists()) {
      return [];
    }

    const {value} = this;

    if (!Array.isArray(value)) {
      this.unexpected(descriptions.CONSUME.EXPECTED_ARRAY);
      return [];
    }

    return [...value];
  }

  asArray(optional?: boolean): Array<Consumer> {
    const arr = this.asPlainArray(optional);

    return arr.map((val, index) => {
      return this.fork(index, val);
    });
  }

  asImplicitArray(): Array<Consumer> {
    if (Array.isArray(this.asUnknown())) {
      return this.asArray();
    } else if (!this.exists()) {
      return [];
    } else {
      return [this];
    }
  }

  // DATES
  asDateOrVoid(def?: Date): undefined | Date {
    this.declareDefinition({
      type: 'date',
      default: def,
      required: false,
    });
    if (this.exists()) {
      return this._asDate(def);
    } else {
      return undefined;
    }
  }

  asDate(def?: Date): Date {
    this.declareDefinition({
      type: 'date',
      default: def,
      required: true,
    });
    return this._asDate(def);
  }

  _asDate(def?: Date): Date {
    const value = this.getValue(def);
    if (!(value instanceof Date)) {
      this.unexpected(descriptions.CONSUME.EXPECTED_DATE);
      return new Date();
    }
    return value;
  }

  // BOOLEANS
  asBooleanOrVoid(def?: boolean): undefined | boolean {
    this.declareDefinition({
      type: 'boolean',
      default: def,
      required: false,
    });
    if (this.exists()) {
      return this._asBoolean(def);
    } else {
      return undefined;
    }
  }

  asBoolean(def?: boolean): boolean {
    this.declareDefinition({
      type: 'boolean',
      default: def,
      required: true,
    });
    return this._asBoolean(def);
  }

  _asBoolean(def?: boolean): boolean {
    const value = this.getValue(def);
    if (typeof value !== 'boolean') {
      this.unexpected(descriptions.CONSUME.EXPECTED_BOOLEAN);
      return false;
    }
    return value;
  }

  // STRINGS
  asStringOrVoid(def?: string): undefined | string {
    this.declareDefinition({
      type: 'string',
      default: def,
      required: false,
    });

    if (this.exists()) {
      return this._asString(def);
    } else {
      return undefined;
    }
  }

  asString(def?: string): string {
    this.declareDefinition({
      type: 'string',
      default: def,
      required: true,
    });
    return this._asString(def);
  }

  _asString(def?: string): string {
    const value = this.getValue(def);
    if (typeof value !== 'string') {
      this.unexpected(descriptions.CONSUME.EXPECTED_STRING);
      return '';
    }
    return value;
  }

  asStringSet<ValidValue>(
    validValues: Array<ValidValue>,
    def?: ValidValue,
  ): ValidValue {
    const value = this.asString(String(def));

    // @ts-ignore
    if (validValues.includes(value)) {
      // @ts-ignore
      return value;
    } else {
      this.unexpected(
        descriptions.CONSUME.INVALID_STRING_SET_VALUE(
          value,
          // rome-suppress-next-line lint/noExplicitAny
          ((validValues as any) as Array<string>),
        ),
        {
          target: 'value',
        },
      );
      return validValues[0];
    }
  }

  asStringSetOrVoid<ValidValue extends string>(
    validValues: Array<ValidValue>,
  ): undefined | ValidValue {
    if (this.exists()) {
      return this.asStringSet(validValues);
    } else {
      return undefined;
    }
  }

  // BIGINT
  asBigIntOrVoid(def?: number | bigint): undefined | bigint {
    this.declareDefinition({
      type: 'bigint',
      default: def,
      required: false,
    });
    if (this.exists()) {
      return this._asBigInt(def);
    } else {
      return undefined;
    }
  }

  asBigInt(def?: number | bigint): bigint {
    this.declareDefinition({
      type: 'bigint',
      default: def,
      required: true,
    });
    return this._asBigInt(def);
  }

  _asBigInt(def?: number | bigint): bigint {
    const value = this.getValue(def);

    if (typeof value === 'number') {
      return BigInt(value);
    }

    if (typeof value === 'bigint') {
      return value;
    }

    this.unexpected(descriptions.CONSUME.EXPECTED_BIGINT);
    return BigInt('0');
  }

  // PATHS
  asURLFilePath(): URLFilePath {
    const path = this.asUnknownFilePath();
    if (path.isURL()) {
      return path.assertURL();
    } else {
      this.unexpected(descriptions.CONSUME.EXPECTED_URL);
      return createURLFilePath('unknown://').append(path);
    }
  }

  asUnknownFilePath(): UnknownFilePath {
    return createUnknownFilePath(this.asString());
  }

  asAbsoluteFilePath(): AbsoluteFilePath {
    const path = this.asUnknownFilePath();
    if (path.isAbsolute()) {
      return path.assertAbsolute();
    } else {
      this.unexpected(descriptions.CONSUME.EXPECTED_ABSOLUTE_PATH);
      return createAbsoluteFilePath('/').append(path);
    }
  }

  asRelativeFilePath(): RelativeFilePath {
    const path = this.asUnknownFilePath();
    if (path.isRelative()) {
      return path.assertRelative();
    } else {
      this.unexpected(descriptions.CONSUME.EXPECTED_RELATIVE_PATH);
      return path.toExplicitRelative();
    }
  }

  asExplicitRelativeFilePath(): RelativeFilePath {
    const path = this.asRelativeFilePath();

    if (path.isExplicitRelative()) {
      return path;
    } else {
      this.unexpected(descriptions.CONSUME.EXPECTED_EXPLICIT_RELATIVE_PATH);
      return path.toExplicitRelative();
    }
  }

  // NUMBER
  asNumberOrVoid(def?: number): undefined | number {
    this.declareDefinition({
      type: 'number',
      default: def,
      required: false,
    });

    if (this.exists()) {
      return this._asNumber(def);
    } else {
      return undefined;
    }
  }

  asZeroIndexedNumber(): Number0 {
    return ob1Coerce0(this.asNumber());
  }

  asOneIndexedNumber(): Number1 {
    return ob1Coerce1(this.asNumber());
  }

  asNumberFromString(def?: number): number {
    this.declareDefinition({
      type: 'number',
      default: def,
      required: true,
    });
    return this._asNumberFromString(def);
  }

  asNumberFromStringOrVoid(def?: number): undefined | number {
    this.declareDefinition({
      type: 'number',
      default: def,
      required: false,
    });

    if (this.exists()) {
      return this._asNumberFromString(def);
    } else {
      return undefined;
    }
  }

  _asNumberFromString(def?: number): number {
    if (def !== undefined && !this.exists()) {
      return def;
    }

    const str = this._asString();
    const num = Number(str);
    if (isNaN(num)) {
      this.unexpected(descriptions.CONSUME.EXPECTED_VALID_NUMBER);
      return NaN;
    } else {
      return num;
    }
  }

  asNumber(def?: number): number {
    this.declareDefinition({
      type: 'number',
      default: def,
      required: true,
    });
    return this._asNumber(def);
  }

  asNumberInRange(
    opts: {
      min?: number;
      max?: number;
      default?: number;
    },
  ): number

  asNumberInRange(
    opts: {
      min: Number0;
      max?: Number0;
      default?: Number0;
    },
  ): Number0

  asNumberInRange(
    opts: {
      min: Number1;
      max?: Number1;
      default?: Number1;
    },
  ): Number1

  asNumberInRange(
    opts: {
      min?: UnknownNumber;
      max?: UnknownNumber;
      default?: UnknownNumber;
    },
  ): UnknownNumber {
    const num = this._asNumber(opts.default);
    const {min, max} = opts;

    this.declareDefinition({
      type: 'number-range',
      default: opts.default,
      required: true,
      // @ts-ignore
      min,
      max,
    });

    // Nice error message when both min and max are specified
    if (min !== undefined && max !== undefined && (num < min || num > max)) {
      this.unexpected(descriptions.CONSUME.EXPECTED_NUMBER_BETWEEN(min, max));
      return num;
    }

    if (min !== undefined && num < min) {
      this.unexpected(descriptions.CONSUME.EXPECTED_NUMBER_HIGHER(min));
    }

    if (max !== undefined && num > max) {
      this.unexpected(descriptions.CONSUME.EXPECTED_NUMBER_LOWER(max));
    }

    return num;
  }

  _asNumber(def?: UnknownNumber): number {
    const value = this.getValue(def);
    if (typeof value !== 'number') {
      this.unexpected(descriptions.CONSUME.EXPECTED_NUMBER);
      return 0;
    }
    return value;
  }

  //
  asUnknown(): unknown {
    return this.value;
  }

  // rome-suppress-next-line lint/noExplicitAny
  asAny(): any {
    return this.value;
  }
}
