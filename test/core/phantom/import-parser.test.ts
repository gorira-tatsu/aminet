import { describe, expect, test } from "bun:test";
import { extractImportsFromSource } from "../../../src/core/phantom/import-parser.js";

describe("extractImportsFromSource", () => {
  test("extracts ES module imports", () => {
    const source = `
      import express from 'express';
      import { Router } from "express";
      import * as path from 'path';
    `;
    const result = extractImportsFromSource(source);
    expect(result).toContain("express");
    expect(result).not.toContain("path"); // Node.js built-in
  });

  test("extracts require calls", () => {
    const source = `
      const lodash = require('lodash');
      const chalk = require("chalk");
    `;
    const result = extractImportsFromSource(source);
    expect(result).toContain("lodash");
    expect(result).toContain("chalk");
  });

  test("extracts dynamic imports", () => {
    const source = `
      const mod = await import('some-module');
    `;
    const result = extractImportsFromSource(source);
    expect(result).toContain("some-module");
  });

  test("handles scoped packages", () => {
    const source = `
      import { Test } from '@nestjs/testing';
      import core from '@angular/core';
    `;
    const result = extractImportsFromSource(source);
    expect(result).toContain("@nestjs/testing");
    expect(result).toContain("@angular/core");
  });

  test("extracts package name from subpath imports", () => {
    const source = `
      import fp from 'lodash/fp';
      import { join } from '@scope/pkg/utils';
    `;
    const result = extractImportsFromSource(source);
    expect(result).toContain("lodash");
    expect(result).toContain("@scope/pkg");
    // Should NOT contain the subpath
    expect(result).not.toContain("lodash/fp");
  });

  test("excludes relative imports", () => {
    const source = `
      import foo from './foo';
      import bar from '../bar';
      import baz from '/absolute/path';
    `;
    const result = extractImportsFromSource(source);
    expect(result).toHaveLength(0);
  });

  test("excludes Node.js built-in modules", () => {
    const source = `
      import fs from 'fs';
      import { join } from 'path';
      import crypto from 'crypto';
      import { createServer } from 'http';
      import { readFile } from 'node:fs';
    `;
    const result = extractImportsFromSource(source);
    expect(result).toHaveLength(0);
  });

  test("excludes Bun built-in modules", () => {
    const source = `
      import { Database } from 'bun:sqlite';
    `;
    const result = extractImportsFromSource(source);
    expect(result).toHaveLength(0);
  });

  test("deduplicates imports", () => {
    const source = `
      import express from 'express';
      import { Router } from 'express';
      const e = require('express');
    `;
    const result = extractImportsFromSource(source);
    expect(result.filter((i) => i === "express")).toHaveLength(1);
  });

  test("handles export from syntax", () => {
    const source = `
      export { default } from 'some-pkg';
      export * from 'another-pkg';
    `;
    const result = extractImportsFromSource(source);
    expect(result).toContain("some-pkg");
    expect(result).toContain("another-pkg");
  });
});
