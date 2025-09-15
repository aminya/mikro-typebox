import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { generateEntityValidator } from "../src/entity-validator.js";
import { generateEntityFileTypes } from "../src/entity-parse.js";
import { mkdir, writeFile, rm } from "fs/promises";
import { existsSync } from "fs";

describe("Integration Tests", () => {
  const testEntitiesDir = "./test-integration-entities";
  const testOutputFile = "./test-integration-output.ts";

  beforeEach(async () => {
    // Create test entities directory
    await mkdir(testEntitiesDir, { recursive: true });
    
    // Create a complete set of related entities
    await writeFile(`${testEntitiesDir}/User.ts`, `
      import { Entity, PrimaryKey, Property, Collection, OneToMany } from "@mikro-orm/core";
      import { Post } from "./Post.js";

      @Entity()
      export class User {
        @PrimaryKey()
        id!: number;

        @Property()
        name!: string;

        @Property()
        email!: string;

        @Property({ nullable: true })
        age?: number;

        @OneToMany(() => Post, post => post.author)
        posts = new Collection<Post>(this);
      }
    `);

    await writeFile(`${testEntitiesDir}/Post.ts`, `
      import { Entity, PrimaryKey, Property, ManyToOne, Collection, OneToMany } from "@mikro-orm/core";
      import { User } from "./User.js";
      import { Comment } from "./Comment.js";

      @Entity()
      export class Post {
        @PrimaryKey()
        id!: string;

        @Property()
        title!: string;

        @Property({ type: "text" })
        content!: string;

        @Property()
        publishedAt!: Date;

        @ManyToOne(() => User)
        author!: User;

        @OneToMany(() => Comment, comment => comment.post)
        comments = new Collection<Comment>(this);
      }
    `);

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

        @Property()
        createdAt!: Date;

        @ManyToOne(() => Post)
        post!: Post;

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

  describe("Complete workflow with TypeBox", () => {
    it("should generate complete TypeBox validators for all entities", async () => {
      const result = await generateEntityValidator({
        entitiesDir: testEntitiesDir,
        targetValidationLibrary: "typebox",
        write: false
      });

      // Check TypeBox imports
      expect(result).toContain("import { Type, Static } from '@sinclair/typebox'");
      expect(result).toContain("export namespace schema {");

      // Check User entity
      expect(result).toContain("export const User = Type.Object({");
      expect(result).toContain("id: Type.Number()");
      expect(result).toContain("name: Type.String()");
      expect(result).toContain("email: Type.String()");
      expect(result).toContain("age: Type.Optional(Type.Number())");
      expect(result).toContain("posts: Type.Any()"); // Collection becomes any when entity ID types are not available

      // Check Post entity
      expect(result).toContain("export const Post = Type.Object({");
      expect(result).toContain("title: Type.String()");
      expect(result).toContain("content: Type.String()");
      expect(result).toContain("publishedAt: Type.Date()");
      expect(result).toContain("author: schema.PartialUser"); // User entity with partial type
      expect(result).toContain("comments: Type.Any()"); // Collection becomes any when entity ID types are not available

      // Check Comment entity
      expect(result).toContain("export const Comment = Type.Object({");
      expect(result).toContain("content: Type.String()");
      expect(result).toContain("createdAt: Type.Date()");
      expect(result).toContain("post: schema.PartialPost"); // Post entity with partial type
      expect(result).toContain("author: schema.PartialUser"); // User entity with partial type
      
      // Check that partial types are generated
      expect(result).toContain("export const PartialUser = Type.Object({");
      expect(result).toContain("export const PartialPost = Type.Object({");
      expect(result).toContain("export const PartialComment = Type.Object({");
    });

    it("should write validators to file", async () => {
      await generateEntityValidator({
        entitiesDir: testEntitiesDir,
        outputFile: testOutputFile,
        targetValidationLibrary: "typebox",
        write: true
      });

      expect(existsSync(testOutputFile)).toBe(true);
      
      const content = await Bun.file(testOutputFile).text();
      expect(content).toContain("export namespace schema {");
      expect(content).toContain("export const User = Type.Object({");
      expect(content).toContain("export const Post = Type.Object({");
      expect(content).toContain("export const Comment = Type.Object({");
    });
  });

  describe("Complete workflow with Zod", () => {
    it("should generate complete Zod validators for all entities", async () => {
      const result = await generateEntityValidator({
        entitiesDir: testEntitiesDir,
        targetValidationLibrary: "zod",
        write: false
      });

      // Check Zod imports
      expect(result).toContain("import { z } from 'zod'");

      // Check User entity
      expect(result).toContain("export const schema_User = z.object({");
      expect(result).toContain("id: z.number()");
      expect(result).toContain("name: z.string()");
      expect(result).toContain("email: z.string()");
      expect(result).toContain("age: z.number().optional()");
      expect(result).toContain("posts: z.any()"); // Collection becomes any when entity ID types are not available

      // Check Post entity
      expect(result).toContain("export const schema_Post = z.object({");
      expect(result).toContain("title: z.string()");
      expect(result).toContain("content: z.string()");
      expect(result).toContain("publishedAt: z.date()");
      expect(result).toContain("author: z.object({"); // User entity with inline object type
      expect(result).toContain("id: z.number()"); // User ID within object
      expect(result).toContain("comments: z.any()"); // Collection becomes any when entity ID types are not available

      // Check Comment entity
      expect(result).toContain("export const schema_Comment = z.object({");
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
        write: false
      });

      // Check Valibot imports
      expect(result).toContain("import * as v from 'valibot'");

      // Check User entity
      expect(result).toContain("export const schema_User = v.object({");
      expect(result).toContain("id: v.number()");
      expect(result).toContain("name: v.string()");
      expect(result).toContain("email: v.string()");
      expect(result).toContain("age: v.optional(v.number())");
      expect(result).toContain("posts: v.any()"); // Collection becomes any when entity ID types are not available

      // Check Post entity
      expect(result).toContain("export const schema_Post = v.object({");
      expect(result).toContain("title: v.string()");
      expect(result).toContain("content: v.string()");
      expect(result).toContain("publishedAt: v.date()");
      expect(result).toContain("author: v.object({"); // User entity with inline object type
      expect(result).toContain("id: v.number()"); // User ID within object
      expect(result).toContain("comments: v.any()"); // Collection becomes any when entity ID types are not available

      // Check Comment entity
      expect(result).toContain("export const schema_Comment = v.object({");
      expect(result).toContain("content: v.string()");
      expect(result).toContain("createdAt: v.date()");
      expect(result).toContain("post: v.object({"); // Post entity with inline object type
      expect(result).toContain("author: v.object({"); // User entity with inline object type
    });
  });

  describe("Entity parsing integration", () => {
    it("should correctly parse and transform complex entity relationships", async () => {
      const entityFiles = [
        await Bun.file(`${testEntitiesDir}/User.ts`).text(),
        await Bun.file(`${testEntitiesDir}/Post.ts`).text(),
        await Bun.file(`${testEntitiesDir}/Comment.ts`).text()
      ];

      const result = generateEntityFileTypes(entityFiles);

      // Check that the result is wrapped in namespace schema
      expect(result).toContain("namespace schema {");
      expect(result).toContain("}");
      
      // Check that entity references are replaced with inline object types containing primary key
      expect(result).toContain("export type User = {");
      expect(result).toContain("posts: any"); // Collection becomes any when entity ID types are not available

      expect(result).toContain("export type Post = {");
      expect(result).toContain("author: schema.PartialUser"); // User entity with partial type
      expect(result).toContain("comments: any"); // Collection becomes any when entity ID types are not available

      expect(result).toContain("export type Comment = {");
      expect(result).toContain("post: schema.PartialPost"); // Post entity with partial type
      expect(result).toContain("author: schema.PartialUser"); // User entity with partial type
      
      // Check that partial types are generated
      expect(result).toContain("export type PartialUser = {");
      expect(result).toContain("export type PartialPost = {");
      expect(result).toContain("export type PartialComment = {");

      // Check that imports and decorators are removed
      expect(result).not.toContain("import {");
      expect(result).not.toContain("@Entity()");
      expect(result).not.toContain("@PrimaryKey()");
      expect(result).not.toContain("@Property()");
      expect(result).not.toContain("@ManyToOne()");
      expect(result).not.toContain("@OneToMany()");
    });
  });

  describe("Error handling integration", () => {
    it("should handle missing entities directory gracefully", async () => {
      await expect(generateEntityValidator({
        entitiesDir: "./non-existent-directory",
        write: false
      })).rejects.toThrow("Entities directory does not exist");
    });

    it("should handle empty entities directory", async () => {
      const emptyDir = "./test-empty-integration-entities";
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

    it("should handle invalid target validation library", async () => {
      await expect(generateEntityValidator({
        entitiesDir: testEntitiesDir,
        targetValidationLibrary: "invalid-library" as any,
        write: false
      })).rejects.toThrow("Invalid target validation library");
    });
  });

  describe("All validation libraries integration", () => {
    it("should generate validators for all supported libraries", async () => {
      const supportedLibraries = [
        "arktype", "effect", "io-ts", "javascript", "json-schema",
        "typebox", "typescript", "valibot", "value", "yup", "zod"
      ] as const;

      for (const library of supportedLibraries) {
        const result = await generateEntityValidator({
          entitiesDir: testEntitiesDir,
          targetValidationLibrary: library,
          write: false
        });

        expect(result).toBeDefined();
        expect(typeof result).toBe("string");
        expect(result.length).toBeGreaterThan(0);
        
        // Each library should generate some form of validator
        expect(result).toContain("User");
        expect(result).toContain("Post");
        expect(result).toContain("Comment");
      }
    });
  });
});
