import { describe, it, expect } from "bun:test";
import { generateEntityFileTypes } from "../src/prepare.js";
import {
  buildEntityCode,
  expectNamespaceStructure,
  expectEntityType,
  expectPartialType,
  expectInlinedRelation
} from "./test-utils.js";

describe("Detailed Circular Reference Detection", () => {
  it("should break circular references in a simple A->B->A cycle", () => {
    const entityACode = buildEntityCode({
      name: "EntityA",
      primaryKey: { name: "id", type: "number" },
      properties: [
        { name: "name", type: "string", decorator: "Property" }
      ],
      relations: [
        { name: "relatedB", type: "ManyToOne" as const, target: "EntityB" }
      ],
      imports: []
    });
    const entityBCode = buildEntityCode({
      name: "EntityB",
      primaryKey: { name: "id", type: "string" },
      properties: [
        { name: "title", type: "string", decorator: "Property" }
      ],
      relations: [
        { name: "relatedA", type: "ManyToOne" as const, target: "EntityA" }
      ],
      imports: []
    });

    const result = generateEntityFileTypes(
      new Map([["EntityA.ts", entityACode], ["EntityB.ts", entityBCode]]),
      { usePartialTypes: true },
    ).typesCode;

    // Check that the result is wrapped in namespace schema
    expectNamespaceStructure(result);

    // Check that entity types are generated
    expectEntityType(result, "EntityA");
    expectEntityType(result, "EntityB");

    // Check that partial types are generated
    expectPartialType(result, "EntityA");
    expectPartialType(result, "EntityB");

    // The circular reference should be broken by inlining primary key objects
    // At least one of the relations should be inlined instead of using partial types
    const hasInlinedRelation = result.includes("relatedB: {") || result.includes("relatedA: {");
    expect(hasInlinedRelation).toBe(true);
  });

  it("should handle a three-way circular reference A->B->C->A", () => {
    const entityACode = buildEntityCode({
      name: "EntityA",
      primaryKey: { name: "id", type: "number" },
      properties: [
        { name: "name", type: "string", decorator: "Property" }
      ],
      relations: [
        { name: "relatedB", type: "ManyToOne" as const, target: "EntityB" }
      ],
      imports: []
    });
    const entityBCode = buildEntityCode({
      name: "EntityB",
      primaryKey: { name: "id", type: "string" },
      properties: [
        { name: "title", type: "string", decorator: "Property" }
      ],
      relations: [
        { name: "relatedC", type: "ManyToOne" as const, target: "EntityC" }
      ],
      imports: []
    });
    const entityCCode = buildEntityCode({
      name: "EntityC",
      primaryKey: { name: "id", type: "number" },
      properties: [
        { name: "description", type: "string", decorator: "Property" }
      ],
      relations: [
        { name: "relatedA", type: "ManyToOne" as const, target: "EntityA" }
      ],
      imports: []
    });

    const result = generateEntityFileTypes(
      new Map([["EntityA.ts", entityACode], ["EntityB.ts", entityBCode], ["EntityC.ts", entityCCode]]),
      { usePartialTypes: true },
    ).typesCode;

    // Check that the result is wrapped in namespace schema
    expectNamespaceStructure(result);

    // Check that all entity types are generated
    expectEntityType(result, "EntityA");
    expectEntityType(result, "EntityB");
    expectEntityType(result, "EntityC");

    // Check that partial types are generated
    expectPartialType(result, "EntityA");
    expectPartialType(result, "EntityB");
    expectPartialType(result, "EntityC");

    // The circular reference should be broken by inlining at least one primary key object
    const hasInlinedRelation = result.includes("relatedB: {") || 
                              result.includes("relatedC: {") || 
                              result.includes("relatedA: {");
    expect(hasInlinedRelation).toBe(true);
  });

  it("should handle circular references with collections", () => {
    const result = generateEntityFileTypes(
      new Map([["User.ts", buildEntityCode({
        name: "User",
        primaryKey: { name: "id", type: "number" },
        properties: [
          { name: "name", type: "string", decorator: "Property" }
        ],
        relations: [
          { name: "posts", type: "OneToMany" as const, target: "Post", inverseSide: "post => post.author" }
        ],
        imports: []
      })], ["Post.ts", buildEntityCode({
          name: "Post",
          primaryKey: { name: "id", type: "string" },
          properties: [
            { name: "title", type: "string", decorator: "Property" }
          ],
          relations: [
            { name: "author", type: "ManyToOne" as const, target: "User" },
            { name: "comments", type: "OneToMany" as const, target: "Comment", inverseSide: "comment => comment.post" }
          ],
          imports: []
        })], ["Comment.ts", buildEntityCode({
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
        })]]),
      { usePartialTypes: true }
    ).typesCode;

    // Check that the result is wrapped in namespace schema
    expectNamespaceStructure(result);

    // Check that all entity types are generated
    expectEntityType(result, "User");
    expectEntityType(result, "Post");
    expectEntityType(result, "Comment");

    // Check that partial types are generated
    expectPartialType(result, "User");
    expectPartialType(result, "Post");
    expectPartialType(result, "Comment");

    // Check that collections are properly handled
    expect(result).toContain("posts: Collection<");
    expect(result).toContain("comments: Collection<");

    // The circular reference should be broken somewhere in the chain
    // User -> Post -> Comment -> User creates a cycle
    const hasInlinedRelation = result.includes("author: {") || 
                              result.includes("post: {");
    expect(hasInlinedRelation).toBe(true);
  });
});
