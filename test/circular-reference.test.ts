import { describe, it, expect } from "bun:test";
import {
  generateEntityTypes,
  generateEntityFileTypes,
} from "../src/prepare.js";
import {
  buildEntityCode,
  commonEntities,
  expectNamespaceStructure,
  expectEntityType,
  expectPartialType,
  expectInlinedRelation,
  expectNoDecorators,
  type EntityConfig
} from "./test-utils.js";

describe("Circular Reference Detection and Breaking", () => {
  const userCode = buildEntityCode({
    name: "User",
    primaryKey: { name: "id", type: "number" },
    properties: [
      { name: "name", type: "string", decorator: "Property" }
    ],
    relations: [
      { name: "posts", type: "OneToMany", target: "Post", inverseSide: "post => post.author" }
    ],
    imports: []
  });
  const postCode = buildEntityCode({
    name: "Post",
    primaryKey: { name: "id", type: "string" },
    properties: [
      { name: "title", type: "string", decorator: "Property" }
    ],
    relations: [
      { name: "author", type: "ManyToOne", target: "User" },
      { name: "comments", type: "OneToMany", target: "Comment", inverseSide: "comment => comment.post" }
    ],
    imports: []
  });
  const commentCode = buildEntityCode({
    name: "Comment",
    primaryKey: { name: "id", type: "number" },
    properties: [
      { name: "content", type: "string", decorator: "Property" }
    ],
    relations: [
      { name: "post", type: "ManyToOne", target: "Post" },
      { name: "author", type: "ManyToOne", target: "User" }
    ],
    imports: []
  });

  describe("generateEntityFileTypes", () => {
    it("should detect and break circular references in entity relations", () => {
      const result = generateEntityFileTypes(
        new Map([["User.ts", userCode], ["Post.ts", postCode], ["Comment.ts", commentCode]]),
        { usePartialTypes: true },
      ).typesCode;

      // Check that the result is wrapped in namespace schema
      expectNamespaceStructure(result);

      // Check that entity types are generated
      expectEntityType(result, "User");
      expectEntityType(result, "Post");
      expectEntityType(result, "Comment");

      // Check that partial types are generated
      expectPartialType(result, "User");
      expectPartialType(result, "Post");
      expectPartialType(result, "Comment");

      // Check that relations use partial types or are broken by circular reference detection
      expect(result).toContain("posts: Collection<schema.PartialPost> | Array<schema.PartialPost>");
      // The author relation should be broken due to circular reference detection
      expectInlinedRelation(result, "author", "number");
      expect(result).toContain("comments: Collection<schema.PartialComment> | Array<schema.PartialComment>");
      // The post relation should be broken due to circular reference detection
      expectInlinedRelation(result, "post", "string");
    });

    it("should break circular references by inlining primary key objects", () => {
      const result = generateEntityFileTypes(
        new Map([["User.ts", userCode], ["Post.ts", postCode], ["Comment.ts", commentCode]]),
        { usePartialTypes: true },
      ).typesCode;

      // The circular reference should be detected and broken
      // In this case, User -> Post -> Comment -> User creates a cycle
      // The system should break the cycle by inlining primary key objects where needed

      // Check that the result is wrapped in namespace schema
      expectNamespaceStructure(result);

      // Check that entity types are generated
      expectEntityType(result, "User");
      expectEntityType(result, "Post");
      expectEntityType(result, "Comment");

      // Check that partial types are generated
      expectPartialType(result, "User");
      expectPartialType(result, "Post");
      expectPartialType(result, "Comment");
    });

    it("should handle entities without circular references normally", () => {
      const userConfig = {
        name: "User",
        primaryKey: { name: "id", type: "number" },
        properties: [
          { name: "name", type: "string", decorator: "Property" }
        ],
        relations: [],
        imports: []
      };

      const userCode = buildEntityCode(userConfig);
      const result = generateEntityFileTypes(new Map([["User.ts", userCode]]), { usePartialTypes: true }).typesCode;

      // Check that the result is wrapped in namespace schema
      expectNamespaceStructure(result);

      // Check that entity type is generated
      expectEntityType(result, "User");
      expect(result).toContain("id: number");
      expect(result).toContain("name: string");

      // Check that partial type is generated
      expectPartialType(result, "User");
    });

    it("should handle entities with usePartialTypes: false", () => {
      const userCode = buildEntityCode({
        name: "User",
        primaryKey: { name: "id", type: "number" },
        properties: [
          { name: "name", type: "string", decorator: "Property" }
        ],
        relations: [
          { name: "post", type: "ManyToOne", target: "Post" }
        ],
        imports: []
      });
      const postCode = buildEntityCode({
        name: "Post",
        primaryKey: { name: "id", type: "string" },
        properties: [
          { name: "title", type: "string", decorator: "Property" }
        ],
        relations: [],
        imports: []
      });

      const result = generateEntityFileTypes(
        new Map([["User.ts", userCode], ["Post.ts", postCode]]),
        { usePartialTypes: false },
      ).typesCode;

      // Check that the result is wrapped in namespace schema
      expectNamespaceStructure(result);

      // Check that entity types are generated
      expectEntityType(result, "User");
      expectEntityType(result, "Post");

      // Check that relations use inline primary key objects (not partial types)
      expectInlinedRelation(result, "post", "string");
      expect(result).not.toContain("schema.PartialPost");
    });
  });
});
