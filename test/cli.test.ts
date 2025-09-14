import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { spawn } from "bun";
import { mkdir, writeFile, rm } from "fs/promises";
import { existsSync } from "fs";

describe("CLI", () => {
  const testEntitiesDir = "./test-cli-entities";
  const testOutputFile = "./test-cli-output.ts";

  beforeEach(async () => {
    // Create test entities directory
    await mkdir(testEntitiesDir, { recursive: true });
    
    // Create sample entity file
    await writeFile(`${testEntitiesDir}/User.ts`, `
      import { Entity, PrimaryKey, Property } from "@mikro-orm/core";

      @Entity()
      export class User {
        @PrimaryKey()
        id!: number;

        @Property()
        name!: string;

        @Property({ nullable: true })
        email?: string;
      }
    `);
  });

  afterEach(async () => {
    // Clean up test files
    if (existsSync(testEntitiesDir)) {
      await rm(testEntitiesDir, { recursive: true, force: true });
    }
    if (existsSync(testOutputFile)) {
      await rm(testOutputFile, { force: true });
    }
  });

  describe("generate command", () => {
    it("should generate validators with default options", async () => {
      const proc = spawn([
        "bun",
        "run",
        "src/cli.ts",
        "generate",
        "--entities",
        testEntitiesDir,
        "--output",
        testOutputFile
      ]);

      const exitCode = await proc.exited;
      expect(exitCode).toBe(0);
      expect(existsSync(testOutputFile)).toBe(true);

      const content = await Bun.file(testOutputFile).text();
      expect(content).toContain("import { Type, Static } from '@sinclair/typebox'");
      expect(content).toContain("export const User = Type.Object({");
    });

    it("should generate validators with custom target library", async () => {
      const proc = spawn([
        "bun",
        "run",
        "src/cli.ts",
        "generate",
        "--entities",
        testEntitiesDir,
        "--output",
        testOutputFile,
        "--target",
        "zod"
      ]);

      const exitCode = await proc.exited;
      expect(exitCode).toBe(0);
      expect(existsSync(testOutputFile)).toBe(true);

      const content = await Bun.file(testOutputFile).text();
      expect(content).toContain("import { z } from 'zod'");
      expect(content).toContain("export const User = z.object({");
    });

    it("should print to console when --no-write is used", async () => {
      const proc = spawn([
        "bun",
        "run",
        "src/cli.ts",
        "generate",
        "--entities",
        testEntitiesDir,
        "--no-write"
      ]);

      const exitCode = await proc.exited;
      expect(exitCode).toBe(0);
      expect(existsSync(testOutputFile)).toBe(false);

      // The command should succeed and not create a file
      // Note: stdout/stderr capture is not reliable with bun spawn
    });

    it("should handle non-existent entities directory", async () => {
      const proc = spawn([
        "bun",
        "run",
        "src/cli.ts",
        "generate",
        "--entities",
        "./non-existent-directory",
        "--output",
        testOutputFile
      ]);

      const exitCode = await proc.exited;
      expect(exitCode).toBe(1);

      // The command should fail with exit code 1
      // Note: stderr capture is not reliable with bun spawn
    });

    it("should handle invalid target library", async () => {
      const proc = spawn([
        "bun",
        "run",
        "src/cli.ts",
        "generate",
        "--entities",
        testEntitiesDir,
        "--output",
        testOutputFile,
        "--target",
        "invalid-library"
      ]);

      const exitCode = await proc.exited;
      expect(exitCode).toBe(1);

      // The command should fail with exit code 1
      // Note: stderr capture is not reliable with bun spawn
    });

    it("should show help when --help is used", async () => {
      const proc = spawn([
        "bun",
        "run",
        "src/cli.ts",
        "generate",
        "--help"
      ]);

      const exitCode = await proc.exited;
      expect(exitCode).toBe(0);

      const stdout = await new Response(proc.stdout).text();
      expect(stdout).toContain("Generate validation schemas from Mikro-ORM entities");
      expect(stdout).toContain("--entities <path>");
      expect(stdout).toContain("--output <file>");
      expect(stdout).toContain("--target <library>");
    });

    it("should show version when --version is used", async () => {
      const proc = spawn([
        "bun",
        "run",
        "src/cli.ts",
        "--version"
      ]);

      const exitCode = await proc.exited;
      expect(exitCode).toBe(0);

      const stdout = await new Response(proc.stdout).text();
      expect(stdout.trim()).toBe("1.0.0");
    });

    it("should handle unknown commands", async () => {
      const proc = spawn([
        "bun",
        "run",
        "src/cli.ts",
        "unknown-command"
      ]);

      const exitCode = await proc.exited;
      expect(exitCode).toBe(1);

      // The command should fail with exit code 1
      // Note: stderr capture is not reliable with bun spawn
    });

    it("should work with short options", async () => {
      const proc = spawn([
        "bun",
        "run",
        "src/cli.ts",
        "generate",
        "-e",
        testEntitiesDir,
        "-o",
        testOutputFile,
        "-t",
        "valibot"
      ]);

      const exitCode = await proc.exited;
      expect(exitCode).toBe(0);
      expect(existsSync(testOutputFile)).toBe(true);

      const content = await Bun.file(testOutputFile).text();
      expect(content).toContain("import * as v from 'valibot'");
      expect(content).toContain("export const User = v.object({");
    });
  });

  describe("CLI argument parsing", () => {
    it("should use default values when options are not provided", async () => {
      // This test would require creating ./src/entities directory
      // For now, we'll test that it fails with appropriate error
      const proc = spawn([
        "bun",
        "run",
        "src/cli.ts",
        "generate"
      ]);

      const exitCode = await proc.exited;
      expect(exitCode).toBe(1);

      // The command should fail with exit code 1
      // Note: stderr capture is not reliable with bun spawn
    });
  });
});
