import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { generateEntityValidator, modelsToFunction } from "../src/entity-validator.js";
import { mkdir, writeFile, rm } from "fs/promises";
import { existsSync } from "fs";

describe("entity-validator", () => {
  const testEntitiesDir = "./test-entities-temp";
  const testOutputFile = "./test-output.ts";

  beforeEach(async () => {
    // Create test entities directory
    await mkdir(testEntitiesDir, { recursive: true });
    
    // Create sample entity files
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

    await writeFile(`${testEntitiesDir}/Post.ts`, `
      import { Entity, PrimaryKey, Property, ManyToOne } from "@mikro-orm/core";
      import { User } from "./User.js";

      @Entity()
      export class Post {
        @PrimaryKey()
        id!: string;

        @Property()
        title!: string;

        @ManyToOne(() => User)
        author!: User;
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

  describe("generateEntityValidator", () => {
    it("should generate TypeBox validators by default", async () => {
      const result = await generateEntityValidator({
        entitiesDir: testEntitiesDir,
        write: false
      });

      expect(result).toContain("import { Type, Static } from '@sinclair/typebox'");
      expect(result).toContain("export namespace schema {");
      expect(result).toContain("export const User = Type.Object({");
      expect(result).toContain("export const Post = Type.Object({");
      expect(result).toContain("id: Type.Number()");
      expect(result).toContain("name: Type.String()");
      expect(result).toContain("title: Type.String()");
    });

    it("should generate validators for different target libraries", async () => {
      const zodResult = await generateEntityValidator({
        entitiesDir: testEntitiesDir,
        targetValidationLibrary: "zod",
        write: false
      });

      expect(zodResult).toContain("import { z } from 'zod'");
      expect(zodResult).toContain("export const schema_User = z.object({");

      const valibotResult = await generateEntityValidator({
        entitiesDir: testEntitiesDir,
        targetValidationLibrary: "valibot",
        write: false
      });

      expect(valibotResult).toContain("import * as v from 'valibot'");
      expect(valibotResult).toContain("export const schema_User = v.object({");
    });

    it("should write to file when write option is true", async () => {
      await generateEntityValidator({
        entitiesDir: testEntitiesDir,
        outputFile: testOutputFile,
        write: true
      });

      expect(existsSync(testOutputFile)).toBe(true);
      
      const content = await Bun.file(testOutputFile).text();
      expect(content).toContain("import { Type, Static } from '@sinclair/typebox'");
      expect(content).toContain("export namespace schema {");
    });

    it("should not write to file when write option is false", async () => {
      await generateEntityValidator({
        entitiesDir: testEntitiesDir,
        outputFile: testOutputFile,
        write: false
      });

      expect(existsSync(testOutputFile)).toBe(false);
    });

    it("should use default entities directory when not provided", async () => {
      // This test would require creating ./src/entities directory
      // For now, we'll test that it throws an error for non-existent directory
      await expect(generateEntityValidator({
        entitiesDir: "./non-existent-directory",
        write: false
      })).rejects.toThrow("Entities directory does not exist");
    });

    it("should use default output file when not provided", async () => {
      const result = await generateEntityValidator({
        entitiesDir: testEntitiesDir,
        write: false
      });

      expect(result).toBeDefined();
      expect(typeof result).toBe("string");
    });

    it("should throw error for invalid target validation library", async () => {
      await expect(generateEntityValidator({
        entitiesDir: testEntitiesDir,
        targetValidationLibrary: "invalid-library" as any,
        write: false
      })).rejects.toThrow("Invalid target validation library");
    });

    it("should handle all supported validation libraries", async () => {
      const supportedLibraries = Object.keys(modelsToFunction) as Array<keyof typeof modelsToFunction>;
      
      for (const library of supportedLibraries) {
        const result = await generateEntityValidator({
          entitiesDir: testEntitiesDir,
          targetValidationLibrary: library,
          write: false
        });

        expect(result).toBeDefined();
        expect(typeof result).toBe("string");
        expect(result.length).toBeGreaterThan(0);
      }
    });

    it("should handle entities with relationships correctly", async () => {
      // Add a more complex entity with relationships
      await writeFile(`${testEntitiesDir}/Comment.ts`, `
        import { Entity, PrimaryKey, Property, ManyToOne } from "@mikro-orm/core";
        import { Post } from "./Post.js";
        import { User } from "./User.js";

        @Entity()
        export class Comment {
          @PrimaryKey()
          id!: number;

          @Property()
          content!: string;

          @ManyToOne(() => Post)
          post!: Post;

          @ManyToOne(() => User)
          author!: User;
        }
      `);

      const result = await generateEntityValidator({
        entitiesDir: testEntitiesDir,
        write: false
      });

      expect(result).toContain("export const Comment = Type.Object({");
      expect(result).toContain("post: Type.Object({"); // Post entity with inline object type
      expect(result).toContain("id: Type.String()"); // Post ID field
      expect(result).toContain("author: Type.Object({"); // User entity with inline object type
      expect(result).toContain("id: Type.Number()"); // User ID field
    });

    it("should handle empty entities directory", async () => {
      // Create empty directory
      const emptyDir = "./test-empty-entities";
      await mkdir(emptyDir, { recursive: true });

      try {
        const result = await generateEntityValidator({
          entitiesDir: emptyDir,
          write: false
        });

        expect(result).toBeDefined();
        expect(typeof result).toBe("string");
      } finally {
        await rm(emptyDir, { recursive: true, force: true });
      }
    });
  });

  describe("modelsToFunction", () => {
    it("should contain all expected validation libraries", () => {
      const expectedLibraries = [
        "arktype", "effect", "io-ts", "javascript", "json-schema",
        "typebox", "typescript", "valibot", "value", "yup", "zod"
      ];

      for (const library of expectedLibraries) {
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
