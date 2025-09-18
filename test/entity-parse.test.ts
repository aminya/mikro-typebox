import { describe, it, expect } from "bun:test";
import {
  generateEntityTypes,
  generateEntityFileTypes,
} from "../src/prepare.js";
import {
  buildEntityCode,
  expectEntityType,
  expectNamespaceStructure,
  expectPartialType,
  expectNoDecorators,
  expectNoImports,
  expectPartialRelation,
  expectCollectionRelation
} from "./test-utils.js";

describe("entity-parse", () => {
  describe("generateEntityTypes", () => {
    it("should convert a simple entity class to a type alias", () => {
      const code = buildEntityCode({
        name: "User",
        primaryKey: { name: "id", type: "number" },
        properties: [
          { name: "name", type: "string", decorator: "Property" },
          { name: "email", type: "string", decorator: "Property", options: "nullable: true" }
        ],
        relations: [],
        imports: []
      });
      const result = generateEntityTypes(code);

      expectEntityType(result, "User");
      expect(result).toContain("id: number");
      expect(result).toContain("name: string");
      expect(result).toContain("email?: string");
      expectNoDecorators(result);
      expectNoImports(result);
    });

    it("should handle entities with Collection relationships", () => {
      const code = buildEntityCode({
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
      const result = generateEntityTypes(code);

      expectEntityType(result, "User");
      expect(result).toContain("posts: Collection<Post> | Array<Post>");
    });

    it("should handle entities with ManyToOne relationships", () => {
      const code = buildEntityCode({
        name: "Post",
        primaryKey: { name: "id", type: "string" },
        properties: [
          { name: "title", type: "string", decorator: "Property" }
        ],
        relations: [
          { name: "author", type: "ManyToOne", target: "User" }
        ],
        imports: []
      });
      const result = generateEntityTypes(code);

      expectEntityType(result, "Post");
      expect(result).toContain("author: User");
    });

    it("should remove imports and decorators", () => {
      const code = buildEntityCode({
        name: "User",
        primaryKey: { name: "id", type: "number" },
        properties: [
          { name: "name", type: "string", decorator: "Property" }
        ],
        relations: [],
        imports: ['{ SomeOtherImport } from "some-package"']
      }) + `

        const someVariable = "test";
        someFunction();`;

      const result = generateEntityTypes(code);

      expectNoImports(result);
      expectNoDecorators(result);
      expect(result).not.toContain("const someVariable");
      expect(result).not.toContain("someFunction()");
    });

    it("should handle entities with different ID types", () => {
      const code = buildEntityCode({
        name: "User",
        primaryKey: { name: "id", type: "number" },
        properties: [],
        relations: [],
        imports: []
      }) + "\n\n" + buildEntityCode({
        name: "Post",
        primaryKey: { name: "id", type: "string" },
        properties: [],
        relations: [],
        imports: []
      });
      const result = generateEntityTypes(code);

      expectEntityType(result, "User");
      expect(result).toContain("id: number");
      expectEntityType(result, "Post");
      expect(result).toContain("id: string");
    });

    it("should handle optional properties", () => {
      const code = buildEntityCode({
        name: "User",
        primaryKey: { name: "id", type: "number" },
        properties: [
          { name: "email", type: "string", decorator: "Property", options: "nullable: true" },
          { name: "name", type: "string", decorator: "Property" }
        ],
        relations: [],
        imports: []
      });
      const result = generateEntityTypes(code);

      expect(result).toContain("email?: string");
      expect(result).toContain("name: string");
    });
  });

  describe("generateEntityFileTypes", () => {
    it("should process multiple entity files and replace entity references with ID types", () => {
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

      const result = generateEntityFileTypes(
        new Map([["User.ts", buildEntityCode({
          name: "User",
          primaryKey: { name: "id", type: "number" },
          properties: [
            { name: "name", type: "string", decorator: "Property" }
          ],
          relations: [
            { name: "posts", type: "OneToMany", target: "Post", inverseSide: "post => post.author" }
          ],
          imports: []
        })], ["Post.ts", buildEntityCode({
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
        })], ["Comment.ts", commentCode]]),
        { usePartialTypes: true }
      ).typesCode;

      // Check that the result is wrapped in namespace schema
      expectNamespaceStructure(result);

      // Check that entity references are replaced with partial types or broken by circular reference detection
      expect(result).toContain("author: "); // User entity with partial type or inlined object
      expect(result).toContain("post: "); // Post entity with partial type or inlined object
      expectCollectionRelation(result, "posts", "Post"); // Collection with partial entity type
      expectCollectionRelation(result, "comments", "Comment"); // Collection with partial entity type

      // Check that partial types are generated
      expectPartialType(result, "User");
      expectPartialType(result, "Post");
      expectPartialType(result, "Comment");
    });

    it("should handle single entity file", () => {
      const userConfig = {
        name: "User",
        primaryKey: { name: "id", type: "number" },
        properties: [
          { name: "name", type: "string", decorator: "Property" }
        ],
        relations: [],
        imports: []
      };

      const code = buildEntityCode(userConfig);
      const result = generateEntityFileTypes(new Map([["User.ts", code]])).typesCode;

      // Check that the result is wrapped in namespace schema
      expectNamespaceStructure(result);

      expectEntityType(result, "User");
      expect(result).toContain("id: number");
      expect(result).toContain("name: string");
    });

    it("should handle empty array", () => {
      const result = generateEntityFileTypes(new Map()).typesCode;
      expectNamespaceStructure(result);
      expect(result).toContain("export type Collection<T> = { [k: number]: T; };");
    });

    it("should generate partial types when partials: true", () => {
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

      const result = generateEntityFileTypes(new Map([["User.ts", userCode], ["Post.ts", postCode]]), {
        usePartialTypes: true,
      }).typesCode;

      // Check that the result is wrapped in namespace schema
      expectNamespaceStructure(result);

      // Check that entity references are replaced with partial types
      expectPartialRelation(result, "post", "Post"); // Post entity with partial type

      // Check that partial types are generated
      expectPartialType(result, "User");
      expectPartialType(result, "Post");
    });
  });
});
