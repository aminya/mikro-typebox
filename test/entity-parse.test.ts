import { describe, it, expect } from "bun:test";
import { generateEntityTypes, generateEntityFileTypes } from "../src/entity-parse.js";

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
      expect(result).toContain("posts: any");
      expect(result).not.toContain("Collection<Post>");
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

      const result = generateEntityFileTypes([userCode, postCode, commentCode]);
      
      // Check that entity references are replaced with their ID types
      expect(result).toContain("author: number"); // User entity ID type
      expect(result).toContain("post: string"); // Post entity ID type
      expect(result).toContain("posts: any"); // Collection becomes any when entity ID types are not available
      expect(result).toContain("comments: any"); // Collection becomes any when entity ID types are not available
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

      const result = generateEntityFileTypes([code]);
      
      expect(result).toContain("export type User = {");
      expect(result).toContain("id: number");
      expect(result).toContain("name: string");
    });

    it("should handle empty array", () => {
      const result = generateEntityFileTypes([]);
      expect(result).toBe("");
    });
  });
});
