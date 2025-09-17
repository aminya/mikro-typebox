import { describe, it, expect } from "bun:test";
import {
  generateEntityTypes,
  generateEntityFileTypes,
} from "../src/prepare.js";

describe("entity-parse", () => {
  describe("generateEntityTypes", () => {
    it("should convert a simple entity class to a type alias", () => {
      const code = `
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
      `;

      const result = generateEntityTypes(code);

      expect(result).toContain("export type User = {");
      expect(result).toContain("id: number");
      expect(result).toContain("name: string");
      expect(result).toContain("email?: string");
      expect(result).not.toContain("@Entity()");
      expect(result).not.toContain("@PrimaryKey()");
      expect(result).not.toContain("@Property()");
      expect(result).not.toContain("import { Entity, PrimaryKey, Property }");
    });

    it("should handle entities with Collection relationships", () => {
      const code = `
        import { Entity, PrimaryKey, Property, Collection, OneToMany } from "@mikro-orm/core";
        import { Post } from "./Post.js";

        @Entity()
        export class User {
          @PrimaryKey()
          id!: number;

          @Property()
          name!: string;

          @OneToMany(() => Post, post => post.author)
          posts = new Collection<Post>(this);
        }
      `;

      const result = generateEntityTypes(code);

      expect(result).toContain("export type User = {");
      expect(result).toContain("posts: Collection<Post> | Array<Post>");
    });

    it("should handle entities with ManyToOne relationships", () => {
      const code = `
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
      `;

      const result = generateEntityTypes(code);

      expect(result).toContain("export type Post = {");
      expect(result).toContain("author: User");
    });

    it("should remove imports and decorators", () => {
      const code = `
        import { Entity, PrimaryKey, Property } from "@mikro-orm/core";
        import { SomeOtherImport } from "some-package";

        @Entity()
        export class User {
          @PrimaryKey()
          id!: number;

          @Property()
          name!: string;
        }

        const someVariable = "test";
        someFunction();
      `;

      const result = generateEntityTypes(code);

      expect(result).not.toContain("import {");
      expect(result).not.toContain("@Entity()");
      expect(result).not.toContain("@PrimaryKey()");
      expect(result).not.toContain("@Property()");
      expect(result).not.toContain("const someVariable");
      expect(result).not.toContain("someFunction()");
    });

    it("should handle entities with different ID types", () => {
      const code = `
        import { Entity, PrimaryKey, Property } from "@mikro-orm/core";

        @Entity()
        export class User {
          @PrimaryKey()
          id!: number;
        }

        @Entity()
        export class Post {
          @PrimaryKey()
          id!: string;
        }
      `;

      const result = generateEntityTypes(code);

      expect(result).toContain("export type User = {");
      expect(result).toContain("id: number");
      expect(result).toContain("export type Post = {");
      expect(result).toContain("id: string");
    });

    it("should handle optional properties", () => {
      const code = `
        import { Entity, PrimaryKey, Property } from "@mikro-orm/core";

        @Entity()
        export class User {
          @PrimaryKey()
          id!: number;

          @Property({ nullable: true })
          email?: string;

          @Property()
          name!: string;
        }
      `;

      const result = generateEntityTypes(code);

      expect(result).toContain("email?: string");
      expect(result).toContain("name: string");
    });
  });

  describe("generateEntityFileTypes", () => {
    it("should process multiple entity files and replace entity references with ID types", () => {
      const userCode = `
        import { Entity, PrimaryKey, Property, Collection, OneToMany } from "@mikro-orm/core";
        import { Post } from "./Post.js";

        @Entity()
        export class User {
          @PrimaryKey()
          id!: number;

          @Property()
          name!: string;

          @OneToMany(() => Post, post => post.author)
          posts = new Collection<Post>(this);
        }
      `;

      const postCode = `
        import { Entity, PrimaryKey, Property, ManyToOne, Collection, OneToMany } from "@mikro-orm/core";
        import { User } from "./User.js";
        import { Comment } from "./Comment.js";

        @Entity()
        export class Post {
          @PrimaryKey()
          id!: string;

          @Property()
          title!: string;

          @ManyToOne(() => User)
          author!: User;

          @OneToMany(() => Comment, comment => comment.post)
          comments = new Collection<Comment>(this);
        }
      `;

      const commentCode = `
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
      `;

      const result = generateEntityFileTypes(
        new Map([["User.ts", userCode], ["Post.ts", postCode], ["Comment.ts", commentCode]]),
        { usePartialTypes: true },
      ).typesCode;

      // Check that the result is wrapped in namespace schema
      expect(result).toContain("namespace schema {");
      expect(result).toContain("}");

      // Check that entity references are replaced with partial types or broken by circular reference detection
      expect(result).toContain("author: "); // User entity with partial type or inlined object
      expect(result).toContain("post: "); // Post entity with partial type or inlined object
      expect(result).toContain("posts: Collection<schema.PartialPost> | Array<schema.PartialPost>"); // Collection with partial entity type
      expect(result).toContain("comments: Collection<schema.PartialComment> | Array<schema.PartialComment>"); // Collection with partial entity type

      // Check that partial types are generated
      expect(result).toContain("export type PartialUser = {");
      expect(result).toContain("export type PartialPost = {");
      expect(result).toContain("export type PartialComment = {");
    });

    it("should handle single entity file", () => {
      const code = `
        import { Entity, PrimaryKey, Property } from "@mikro-orm/core";

        @Entity()
        export class User {
          @PrimaryKey()
          id!: number;

          @Property()
          name!: string;
        }
      `;

      const result = generateEntityFileTypes(new Map([["User.ts", code]])).typesCode;

      // Check that the result is wrapped in namespace schema
      expect(result).toContain("namespace schema {");
      expect(result).toContain("}");

      expect(result).toContain("export type User = {");
      expect(result).toContain("id: number");
      expect(result).toContain("name: string");
    });

    it("should handle empty array", () => {
      const result = generateEntityFileTypes(new Map()).typesCode;
      expect(result).toContain("export namespace schema {");
      expect(result).toContain("export type Collection<T> = { [k: number]: T; };");
    });

    it("should generate partial types when partials: true", () => {
      const userCode = `
        import { Entity, PrimaryKey, Property, ManyToOne } from "@mikro-orm/core";
        import { Post } from "./Post.js";

        @Entity()
        export class User {
          @PrimaryKey()
          id!: number;

          @Property()
          name!: string;

          @ManyToOne(() => Post)
          post!: Post;
        }
      `;

      const postCode = `
        import { Entity, PrimaryKey, Property } from "@mikro-orm/core";

        @Entity()
        export class Post {
          @PrimaryKey()
          id!: string;

          @Property()
          title!: string;
        }
      `;

      const result = generateEntityFileTypes(new Map([["User.ts", userCode], ["Post.ts", postCode]]), {
        usePartialTypes: true,
      }).typesCode;

      // Check that the result is wrapped in namespace schema
      expect(result).toContain("namespace schema {");
      expect(result).toContain("}");

      // Check that entity references are replaced with partial types
      expect(result).toContain("post: schema.PartialPost"); // Post entity with partial type

      // Check that partial types are generated
      expect(result).toContain("export type PartialUser = {");
      expect(result).toContain("export type PartialPost = {");
    });
  });
});
