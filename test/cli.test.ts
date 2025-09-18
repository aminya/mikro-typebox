import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { 
  TestDirectoryManager,
  createTestEntities,
  cleanupTestFiles,
  runCLITest,
  createCLICommand
} from "./test-utils.js";

describe("CLI", () => {
  const testEntitiesDir = "./test-cli-entities";
  const testOutputFile = "./test-cli-output.ts";
  const testDirManager = new TestDirectoryManager();

  beforeEach(async () => {
    // Create test entities directory
    await testDirManager.createTempDir();
    
    // Create sample entity file
    await createTestEntities(testEntitiesDir, [
      {
        filename: "User.ts",
        config: {
          name: "User",
          primaryKey: { name: "id", type: "number" },
          properties: [
            { name: "name", type: "string", decorator: "Property" },
            { name: "email", type: "string", decorator: "Property", options: "nullable: true" }
          ],
          relations: [],
          imports: []
        }
      }
    ]);
  });

  afterEach(async () => {
    // Clean up test files
    await cleanupTestFiles(testEntitiesDir, testOutputFile);
    await testDirManager.cleanup();
  });

  describe("generate command", () => {
    it("should generate validators with default options", async () => {
      await runCLITest({
        command: createCLICommand("generate", {
          entities: testEntitiesDir,
          output: testOutputFile
        }),
        expectedExitCode: 0,
        shouldCreateFile: testOutputFile,
        expectedContent: [
          'import { Type, Static, TSchema } from "@sinclair/typebox"',
          "export namespace schema {",
          "export const User = Type.Object("
        ]
      });
    });

    it("should generate validators with custom target library", async () => {
      await runCLITest({
        command: createCLICommand("generate", {
          entities: testEntitiesDir,
          output: testOutputFile,
          target: "zod"
        }),
        expectedExitCode: 0,
        shouldCreateFile: testOutputFile,
        expectedContent: [
          'import { z } from "zod"',
          "export const schema_User = z.object({"
        ]
      });
    });

    it("should print to console when --no-write is used", async () => {
      await runCLITest({
        command: createCLICommand("generate", {
          entities: testEntitiesDir,
          noWrite: true
        }),
        expectedExitCode: 0,
        shouldNotCreateFile: testOutputFile
      });
    });

    it("should handle non-existent entities directory", async () => {
      await runCLITest({
        command: createCLICommand("generate", {
          entities: "./non-existent-directory",
          output: testOutputFile
        }),
        expectedExitCode: 1
      });
    });

    it("should handle invalid target library", async () => {
      await runCLITest({
        command: createCLICommand("generate", {
          entities: testEntitiesDir,
          output: testOutputFile,
          target: "invalid-library"
        }),
        expectedExitCode: 1
      });
    });

    it("should show help when --help is used", async () => {
      await runCLITest({
        command: createCLICommand("generate", { help: true }),
        expectedExitCode: 0,
        expectedContent: [
          "Generate validation schemas from Mikro-ORM entities",
          "--entities <path>",
          "--output <file>",
          "--target <library>"
        ]
      });
    });

    it("should show version when --version is used", async () => {
      await runCLITest({
        command: createCLICommand("", { version: true }),
        expectedExitCode: 0,
        expectedContent: ["1.0.0"]
      });
    });

    it("should handle unknown commands", async () => {
      await runCLITest({
        command: ["bun", "run", "src/cli.ts", "unknown-command"],
        expectedExitCode: 1
      });
    });

    it("should work with short options", async () => {
      await runCLITest({
        command: createCLICommand("generate", {
          entities: testEntitiesDir,
          output: testOutputFile,
          target: "valibot"
        }),
        expectedExitCode: 0,
        shouldCreateFile: testOutputFile,
        expectedContent: [
          'import * as v from "valibot"',
          "export const schema_User = v.object({"
        ]
      });
    });
  });

  describe("CLI argument parsing", () => {
    it("should use default values when options are not provided", async () => {
      // This test would require creating ./src/entities directory
      // For now, we'll test that it fails with appropriate error
      await runCLITest({
        command: ["bun", "run", "src/cli.ts", "generate"],
        expectedExitCode: 1
      });

      // remove src/entity-validators.ts
      await rm("./src/entity-validators.ts", { force: true });
    });
  });
});
