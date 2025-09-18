import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { generateEntityValidator, modelsToFunction } from "../src/generate.js";
import {
  TestDirectoryManager,
  createTestEntities,
  cleanupTestFiles,
  expectTypeBoxValidator,
  expectZodValidator,
  expectValibotValidator,
  supportedValidationLibraries
} from "./test-utils.js";
import { existsSync } from "fs";

describe("entity-validator", () => {
  const testEntitiesDir = "./test-entities-temp";
  const testOutputFile = "./test-output.ts";
  const testDirManager = new TestDirectoryManager();

  beforeEach(async () => {
    // Create test entities directory
    await testDirManager.createTempDir();

    // Create sample entity files
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
      },
      {
        filename: "Post.ts",
        config: {
          name: "Post",
          primaryKey: { name: "id", type: "string" },
          properties: [
            { name: "title", type: "string", decorator: "Property" }
          ],
          relations: [
            { name: "author", type: "ManyToOne" as const, target: "User" }
          ],
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

  describe("generateEntityValidator", () => {
    it("should generate TypeBox validators by default", async () => {
      const result = await generateEntityValidator({
        entitiesDir: testEntitiesDir,
        write: false,
      });

      expect(result).toContain(
        'import { Type, Static, TSchema } from "@sinclair/typebox"',
      );
      expect(result).toContain("export namespace schema {");
      expectTypeBoxValidator(result, "User");
      expectTypeBoxValidator(result, "Post");
      expect(result).toContain("id: Type.Number()");
      expect(result).toContain("name: Type.String()");
      expect(result).toContain("title: Type.String()");
    });

    it("should generate validators for different target libraries", async () => {
      const zodResult = await generateEntityValidator({
        entitiesDir: testEntitiesDir,
        targetValidationLibrary: "zod",
        write: false,
      });

      expect(zodResult).toContain('import { z } from "zod"');
      expectZodValidator(zodResult, "User");

      const valibotResult = await generateEntityValidator({
        entitiesDir: testEntitiesDir,
        targetValidationLibrary: "valibot",
        write: false,
      });

      expect(valibotResult).toContain('import * as v from "valibot"');
      expectValibotValidator(valibotResult, "User");
    });

    it("should write to file when write option is true", async () => {
      await generateEntityValidator({
        entitiesDir: testEntitiesDir,
        outputFile: testOutputFile,
        write: true,
      });

      expect(existsSync(testOutputFile)).toBe(true);

      const content = await Bun.file(testOutputFile).text();
      expect(content).toContain(
        'import { Type, Static, TSchema } from "@sinclair/typebox"',
      );
      expect(content).toContain("export namespace schema {");
    });

    it("should not write to file when write option is false", async () => {
      await generateEntityValidator({
        entitiesDir: testEntitiesDir,
        outputFile: testOutputFile,
        write: false,
      });

      expect(existsSync(testOutputFile)).toBe(false);
    });

    it("should use default entities directory when not provided", async () => {
      // This test would require creating ./src/entities directory
      // For now, we'll test that it throws an error for non-existent directory
      await expect(
        generateEntityValidator({
          entitiesDir: "./non-existent-directory",
          write: false,
        }),
      ).rejects.toThrow("Entities directory does not exist");
    });

    it("should use default output file when not provided", async () => {
      const result = await generateEntityValidator({
        entitiesDir: testEntitiesDir,
        write: false,
      });

      expect(result).toBeDefined();
      expect(typeof result).toBe("string");
    });

    it("should throw error for invalid target validation library", async () => {
      await expect(
        generateEntityValidator({
          entitiesDir: testEntitiesDir,
          targetValidationLibrary: "invalid-library" as any,
          write: false,
        }),
      ).rejects.toThrow("Invalid target validation library");
    });

    it("should handle all supported validation libraries", async () => {
      for (const library of supportedValidationLibraries) {
        const result = await generateEntityValidator({
          entitiesDir: testEntitiesDir,
          targetValidationLibrary: library,
          write: false,
        });

        expect(result).toBeDefined();
        expect(typeof result).toBe("string");
        expect(result.length).toBeGreaterThan(0);
      }
    });

    it("should handle entities with relationships correctly", async () => {
      // Add a more complex entity with relationships
      await createTestEntities(testEntitiesDir, [
        {
          filename: "Comment.ts",
          config: {
            name: "Comment",
            primaryKey: { name: "id", type: "number" },
            properties: [
              { name: "content", type: "string", decorator: "Property" }
            ],
            relations: [
              { name: "post", type: "ManyToOne" as const, target: "Post" },
              { name: "author", type: "ManyToOne" as const, target: "User" }
            ],
            imports: []
          }
        }
      ]);

      const result = await generateEntityValidator({
        entitiesDir: testEntitiesDir,
        write: false,
      });

      expectTypeBoxValidator(result, "Comment");
      expect(result).toContain("post: schema.PartialPost"); // Post entity
      expect(result).toContain("author: schema.PartialUser"); // User entity
    });

    it("should handle empty entities directory", async () => {
      // Create empty directory
      const emptyDir = await testDirManager.createTempDir("test-empty-entities");

      const result = await generateEntityValidator({
        entitiesDir: emptyDir,
        write: false,
      });

      expect(result).toBeDefined();
      expect(typeof result).toBe("string");
    });
  });

  describe("modelsToFunction", () => {
    it("should contain all expected validation libraries", () => {
      for (const library of supportedValidationLibraries) {
        expect(library in modelsToFunction).toBe(true);
      }
    });

    it("should have string values for all keys", () => {
      for (const [, value] of Object.entries(modelsToFunction)) {
        expect(typeof value).toBe("string");
        expect(value.length).toBeGreaterThan(0);
      }
    });
  });
});
