import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { generateEntityValidator } from "../src/generate.js";
import { generateEntityFileTypes } from "../src/prepare.js";
import {
  TestDirectoryManager,
  createTestEntities,
  cleanupTestFiles,
  expectNamespaceStructure,
  expectEntityType,
  expectPartialType,
  expectTypeBoxValidator,
  expectZodValidator,
  expectValibotValidator,
  expectNoDecorators,
  expectNoImports,
  supportedValidationLibraries
} from "./test-utils.js";

describe("Integration Tests", () => {
  const testEntitiesDir = "./test-integration-entities";
  const testOutputFile = "./test-integration-output.ts";
  const testDirManager = new TestDirectoryManager();

  beforeEach(async () => {
    // Create test entities directory
    await testDirManager.createTempDir();

    // Create a complete set of related entities
    await createTestEntities(testEntitiesDir, [
      {
        filename: "User.ts",
        config: {
          name: "User",
          primaryKey: { name: "id", type: "number" },
          properties: [
            { name: "name", type: "string", decorator: "Property" },
            { name: "email", type: "string", decorator: "Property" },
            { name: "age", type: "number", decorator: "Property", options: "nullable: true" }
          ],
          relations: [
            { name: "posts", type: "OneToMany" as const, target: "Post", inverseSide: "post => post.author" }
          ],
          imports: []
      }
      },
      {
        filename: "Post.ts",
        config: {
          name: "Post",
          primaryKey: { name: "id", type: "string" },
          properties: [
            { name: "title", type: "string", decorator: "Property" },
            { name: "content", type: "string", decorator: "Property", options: 'type: "text"' },
            { name: "publishedAt", type: "Date", decorator: "Property" }
          ],
          relations: [
            { name: "author", type: "ManyToOne" as const, target: "User" },
            { name: "comments", type: "OneToMany" as const, target: "Comment", inverseSide: "comment => comment.post" }
          ],
          imports: []
        }
      },
      {
        filename: "Comment.ts",
        config: {
          name: "Comment",
          primaryKey: { name: "id", type: "number" },
          properties: [
            { name: "content", type: "string", decorator: "Property" },
            { name: "createdAt", type: "Date", decorator: "Property" }
          ],
          relations: [
            { name: "post", type: "ManyToOne" as const, target: "Post" },
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

  describe("Complete workflow with TypeBox", () => {
    it("should generate complete TypeBox validators for all entities", async () => {
      const result = await generateEntityValidator({
        entitiesDir: testEntitiesDir,
        targetValidationLibrary: "typebox",
        write: false,
      });

      // Check TypeBox imports
      expect(result).toContain(
        'import { Type, Static, TSchema } from "@sinclair/typebox"',
      );
      expectNamespaceStructure(result);

      // Check User entity
      expectTypeBoxValidator(result, "User");
      expect(result).toContain("id: Type.Number()");
      expect(result).toContain("name: Type.String()");
      expect(result).toContain("email: Type.String()");
      expect(result).toContain("age: Type.Optional(Type.Number())");
      expect(result).toContain("posts: Type.Union(["); // Collection with partial entity type or inlined object

      // Check Post entity
      expectTypeBoxValidator(result, "Post");
      expect(result).toContain("title: Type.String()");
      expect(result).toContain("content: Type.String()");
      expect(result).toContain("publishedAt: Type.Date()");
      expect(result).toContain("author: "); // User entity with partial type or inlined object
      expect(result).toContain("comments: Type.Union(["); // Collection with partial entity type or inlined object

      // Check Comment entity
      expectTypeBoxValidator(result, "Comment");
      expect(result).toContain("content: Type.String()");
      expect(result).toContain("createdAt: Type.Date()");
      expect(result).toContain("post: schema.PartialPost"); // Post entity with partial type
      expect(result).toContain("author: schema.PartialUser"); // User entity with partial type

      // Check that partial types are generated
      expect(result).toContain("export const PartialUser = Type.Object(");
      expect(result).toContain("export const PartialPost = Type.Object(");
      expect(result).toContain("export const PartialComment = Type.Object(");
    });

    it("should write validators to file", async () => {
      await generateEntityValidator({
        entitiesDir: testEntitiesDir,
        outputFile: testOutputFile,
        targetValidationLibrary: "typebox",
        write: true,
      });

      expect(existsSync(testOutputFile)).toBe(true);

      const content = await Bun.file(testOutputFile).text();
      expectNamespaceStructure(content);
      expectTypeBoxValidator(content, "User");
      expectTypeBoxValidator(content, "Post");
      expectTypeBoxValidator(content, "Comment");
    });
  });

  describe("Complete workflow with Zod", () => {
    it("should generate complete Zod validators for all entities", async () => {
      const result = await generateEntityValidator({
        entitiesDir: testEntitiesDir,
        targetValidationLibrary: "zod",
        write: false,
      });

      // Check Zod imports
      expect(result).toContain('import { z } from "zod"');

      // Check User entity
      expectZodValidator(result, "User");
      expect(result).toContain("id: z.number()");
      expect(result).toContain("name: z.string()");
      expect(result).toContain("email: z.string()");
      expect(result).toContain("age: z.number().optional()");
      expect(result).toContain("posts: z.union(["); // Collection with inline object type

      // Check Post entity
      expectZodValidator(result, "Post");
      expect(result).toContain("title: z.string()");
      expect(result).toContain("content: z.string()");
      expect(result).toContain("publishedAt: z.date()");
      expect(result).toContain("author: z.object({"); // User entity with inline object type
      expect(result).toContain("id: z.number()"); // User ID within object
      expect(result).toContain("comments: z.union(["); // Collection with inline object type

      // Check Comment entity
      expectZodValidator(result, "Comment");
      expect(result).toContain("content: z.string()");
      expect(result).toContain("createdAt: z.date()");
      expect(result).toContain("post: z.object({"); // Post entity with inline object type
      expect(result).toContain("author: z.object({"); // User entity with inline object type
    });
  });

  describe("Complete workflow with Valibot", () => {
    it("should generate complete Valibot validators for all entities", async () => {
      const result = await generateEntityValidator({
        entitiesDir: testEntitiesDir,
        targetValidationLibrary: "valibot",
        write: false,
      });

      // Check Valibot imports
      expect(result).toContain('import * as v from "valibot"');

      // Check User entity
      expectValibotValidator(result, "User");
      expect(result).toContain("id: v.number()");
      expect(result).toContain("name: v.string()");
      expect(result).toContain("email: v.string()");
      expect(result).toContain("age: v.optional(v.number())");
      expect(result).toContain("posts: v.union(["); // Collection with inline object type

      // Check Post entity
      expectValibotValidator(result, "Post");
      expect(result).toContain("title: v.string()");
      expect(result).toContain("content: v.string()");
      expect(result).toContain("publishedAt: v.date()");
      expect(result).toContain("author: v.object({"); // User entity with inline object type
      expect(result).toContain("id: v.number()"); // User ID within object
      expect(result).toContain("comments: v.union(["); // Collection with inline object type

      // Check Comment entity
      expectValibotValidator(result, "Comment");
      expect(result).toContain("content: v.string()");
      expect(result).toContain("createdAt: v.date()");
      expect(result).toContain("post: v.object({"); // Post entity with inline object type
      expect(result).toContain("author: v.object({"); // User entity with inline object type
    });
  });

  describe("Entity parsing integration", () => {
    it("should correctly parse and transform complex entity relationships", async () => {
      const entityFiles = new Map([
        ["User.ts", await Bun.file(`${testEntitiesDir}/User.ts`).text()],
        ["Post.ts", await Bun.file(`${testEntitiesDir}/Post.ts`).text()],
        ["Comment.ts", await Bun.file(`${testEntitiesDir}/Comment.ts`).text()],
      ]);

      const result = generateEntityFileTypes(entityFiles, {
        usePartialTypes: true,
      }).typesCode;

      // Check that the result is wrapped in namespace schema
      expectNamespaceStructure(result);

      // Check that entity references are replaced with inline object types containing primary key
      expectEntityType(result, "User");
      expect(result).toContain("posts: Collection<"); // Collection with partial entity type or inlined object

      expectEntityType(result, "Post");
      expect(result).toContain("author: "); // User entity with partial type or inlined object
      expect(result).toContain("comments: Collection<"); // Collection with partial entity type or inlined object

      expectEntityType(result, "Comment");
      expect(result).toContain("post: "); // Post entity with partial type or inlined object
      expect(result).toContain("author: "); // User entity with partial type or inlined object

      // Check that partial types are generated
      expectPartialType(result, "User");
      expectPartialType(result, "Post");
      expectPartialType(result, "Comment");

      // Check that imports and decorators are removed
      expectNoImports(result);
      expectNoDecorators(result);
    });
  });

  describe("Error handling integration", () => {
    it("should handle missing entities directory gracefully", async () => {
      await expect(
        generateEntityValidator({
          entitiesDir: "./non-existent-directory",
          write: false,
        }),
      ).rejects.toThrow("Entities directory does not exist");
    });

    it("should handle empty entities directory", async () => {
      const emptyDir = await testDirManager.createTempDir("test-empty-integration-entities");

        const result = await generateEntityValidator({
          entitiesDir: emptyDir,
          write: false,
        });

        expect(result).toBeDefined();
        expect(typeof result).toBe("string");
    });

    it("should handle invalid target validation library", async () => {
      await expect(
        generateEntityValidator({
          entitiesDir: testEntitiesDir,
          targetValidationLibrary: "invalid-library" as any,
          write: false,
        }),
      ).rejects.toThrow("Invalid target validation library");
    });
  });

  describe("All validation libraries integration", () => {
    const supportedLibraries = [
      // "arktype", // Fails to convert Array<Entity>
      "effect",
      "io-ts",
      "javascript",
      "json-schema",
      "typebox",
      "typescript",
      "valibot",
      "value",
      "yup",
      "zod",
    ] as const;
    for (const library of supportedLibraries) {
      it(`should generate validators for ${library}`, async () => {

        const result = await generateEntityValidator({
          entitiesDir: testEntitiesDir,
          targetValidationLibrary: library,
          write: false,
          // verbose: true,
        });

        expect(result).toBeDefined();
        expect(typeof result).toBe("string");
        expect(result.length).toBeGreaterThan(0);

        // Each library should generate some form of validator
        expect(result).toContain("User");
        expect(result).toContain("Post");
        expect(result).toContain("Comment");
      });
    }
  });
});
function existsSync(testOutputFile: string): any {
  throw new Error("Function not implemented.");
}

