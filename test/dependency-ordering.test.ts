import { describe, it, expect } from "bun:test";
import { readFile } from "fs/promises";
import { generateEntityFileTypes } from "../src/prepare.js";
import path from "path";

describe("Dependency Ordering", () => {
  it("should order entities by dependency (least dependent first)", async () => {
    // Read the test entity files in a specific order that would cause issues
    // if dependency ordering wasn't working
    const files = [
      "./test/test-entities/Comment.ts",
      "./test/test-entities/User.ts",
      "./test/test-entities/Post.ts",
    ]
    const filesMap = new Map(await Promise.all(files.map(async (file) => {
      return [path.basename(file), await readFile(file, "utf-8")] as [string, string];
    })));

    // Generate types with dependency ordering
    const result = generateEntityFileTypes(filesMap, { usePartialTypes: true }).typesCode;

    // Split the result into lines to analyze the order
    const lines = result.split('\n');

    // Find the line numbers where each entity type is defined
    const userLineIndex = lines.findIndex(line => line.includes('export type User = {'));
    const postLineIndex = lines.findIndex(line => line.includes('export type Post = {'));
    const commentLineIndex = lines.findIndex(line => line.includes('export type Comment = {'));

    // User should come first (no dependencies)
    // Comment should come second (depends on User and Post, but User is processed first)
    // Post should come last (depends on User and Comment)
    expect(userLineIndex).toBeGreaterThan(-1);
    expect(postLineIndex).toBeGreaterThan(-1);
    expect(commentLineIndex).toBeGreaterThan(-1);

    // Verify the ordering: User < Comment < Post (User has fewest dependencies, then Comment, then Post)
    expect(userLineIndex).toBeLessThan(commentLineIndex);
    expect(commentLineIndex).toBeLessThan(postLineIndex);

    // Verify the structure is correct
    expect(result).toContain('export namespace schema {');
    expect(result).toContain('export type Collection<T> = { [k: number]: T; };');
    expect(result).toContain('export type User = {');
    expect(result).toContain('export type Post = {');
    expect(result).toContain('export type Comment = {');
  });

  it("should handle entities with no dependencies correctly", async () => {
    // Test with just User entity (no dependencies)
    const userCode = await readFile("./test/test-entities/User.ts", "utf-8");
    const fileContents = new Map([["User.ts", userCode]]);

    const result = generateEntityFileTypes(fileContents, { usePartialTypes: true }).typesCode;

    expect(result).toContain('export type User = {');
    expect(result).toContain('export namespace schema {');
  });

  it("should handle circular dependencies gracefully", async () => {
    const files = [
      "./test/test-entities/Comment.ts",
      "./test/test-entities/User.ts",
      "./test/test-entities/Post.ts",
    ]
    const filesMap = new Map(await Promise.all(files.map(async (file) => {
      return [path.basename(file), await readFile(file, "utf-8")] as [string, string];
    })));

    const result = generateEntityFileTypes(filesMap, { usePartialTypes: true }).typesCode;

    // Should still generate valid output even with circular dependencies
    expect(result).toContain('export namespace schema {');
    expect(result).toContain('export type User = {');
    expect(result).toContain('export type Post = {');
    expect(result).toContain('export type Comment = {');

    // Should contain partial type references for circular references
    expect(result).toContain('author: schema.PartialUser');
    expect(result).toContain('post: schema.PartialPost');
  });

  it("should ensure schema references work with namespace approach", async () => {
    // This test verifies that the dependency ordering works with the schema namespace approach
    // which allows forward references within the namespace
    const files = [
      "./test/test-entities/Comment.ts",
      "./test/test-entities/User.ts",
      "./test/test-entities/Post.ts",
    ]
    const filesMap = new Map(await Promise.all(files.map(async (file) => {
      return [path.basename(file), await readFile(file, "utf-8")] as [string, string];
    })));

    // Process in worst-case order: Comment first (depends on Post and User)
    const result = generateEntityFileTypes(filesMap, { usePartialTypes: true }).typesCode;

    // Split into lines and find entity definitions
    const lines = result.split('\n');
    const userLineIndex = lines.findIndex(line => line.includes('export type User = {'));
    const postLineIndex = lines.findIndex(line => line.includes('export type Post = {'));
    const commentLineIndex = lines.findIndex(line => line.includes('export type Comment = {'));

    // Verify that entities are in dependency order (User < Comment < Post)
    expect(userLineIndex).toBeLessThan(commentLineIndex);
    expect(commentLineIndex).toBeLessThan(postLineIndex);

    // Verify that all schema references are within the namespace
    const namespaceStart = lines.findIndex(line => line.includes('export namespace schema {'));
    const namespaceEnd = lines.findLastIndex(line => line.includes('}'));

    expect(namespaceStart).toBeGreaterThan(-1);
    expect(namespaceEnd).toBeGreaterThan(namespaceStart);

    // All schema.PartialUser and schema.PartialPost references should be within the namespace
    const partialUserRefs = lines
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => line.includes('schema.PartialUser'));

    const partialPostRefs = lines
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => line.includes('schema.PartialPost'));

    for (const ref of partialUserRefs) {
      expect(ref.index).toBeGreaterThan(namespaceStart);
      expect(ref.index).toBeLessThan(namespaceEnd);
    }

    for (const ref of partialPostRefs) {
      expect(ref.index).toBeGreaterThan(namespaceStart);
      expect(ref.index).toBeLessThan(namespaceEnd);
    }

    // Verify that the generated code is valid TypeScript structure
    expect(result).toMatch(/export namespace schema \{[^}]*\}/);
  });

  it("should work with different file input orders", async () => {
    const files = [
      "./test/test-entities/Comment.ts",
      "./test/test-entities/User.ts",
      "./test/test-entities/Post.ts",
    ]
    const filesMap = new Map(await Promise.all(files.map(async (file) => {
      return [path.basename(file), await readFile(file, "utf-8")] as [string, string];
    })));

    // Test different input orders - all should produce the same dependency-ordered output
    const orders = [
      ["Comment.ts", "User.ts", "Post.ts"], // Worst case: Comment first
      ["Post.ts", "Comment.ts", "User.ts"], // Another order
      ["User.ts", "Comment.ts", "Post.ts"], // Already good order
    ];

    const results = orders.map(order => {
      const fileContents = new Map(order.map(file => [file, filesMap.get(file)!]));
      return generateEntityFileTypes(fileContents, { usePartialTypes: true }).typesCode;
    }
    );

    // All results should have the same entity ordering
    for (let i = 1; i < results.length; i++) {
      const lines1 = results[0].split('\n');
      const lines2 = results[i].split('\n');

      const userIndex1 = lines1.findIndex(line => line.includes('export type User = {'));
      const userIndex2 = lines2.findIndex(line => line.includes('export type User = {'));

      const commentIndex1 = lines1.findIndex(line => line.includes('export type Comment = {'));
      const commentIndex2 = lines2.findIndex(line => line.includes('export type Comment = {'));

      const postIndex1 = lines1.findIndex(line => line.includes('export type Post = {'));
      const postIndex2 = lines2.findIndex(line => line.includes('export type Post = {'));

      // All should have the same relative ordering: User < Comment < Post
      expect(userIndex1 < commentIndex1).toBe(userIndex2 < commentIndex2);
      expect(commentIndex1 < postIndex1).toBe(commentIndex2 < postIndex2);

      // Verify the specific ordering we expect
      expect(userIndex1).toBeLessThan(commentIndex1);
      expect(commentIndex1).toBeLessThan(postIndex1);
      expect(userIndex2).toBeLessThan(commentIndex2);
      expect(commentIndex2).toBeLessThan(postIndex2);
    }
  });
});
