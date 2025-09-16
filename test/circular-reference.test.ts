import { describe, it, expect } from "bun:test";
import {
  generateEntityTypes,
  generateEntityFileTypes,
} from "../src/prepare.js";

describe("Circular Reference Detection and Breaking", () => {
  describe("generateEntityFileTypes", () => {
    it("should detect and break circular references in entity relations", () => {
      const userCode = `
        import { Entity, PrimaryKey, Property, ManyToOne, Collection, OneToMany } from "@mikro-orm/core";
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
        [userCode, postCode, commentCode],
        { usePartialTypes: true },
      );

      // Check that the result is wrapped in namespace schema
      expect(result).toContain("namespace schema {");
      expect(result).toContain("}");

      // Check that entity types are generated
      expect(result).toContain("export type User = {");
      expect(result).toContain("export type Post = {");
      expect(result).toContain("export type Comment = {");

      // Check that partial types are generated
      expect(result).toContain("export type PartialUser = {");
      expect(result).toContain("export type PartialPost = {");
      expect(result).toContain("export type PartialComment = {");

      // Check that relations use partial types or are broken by circular reference detection
      expect(result).toContain("posts: Array<schema.PartialPost>");
      // The author relation should be broken due to circular reference detection
      expect(result).toContain("author: {");
      expect(result).toContain("id: number");
      expect(result).toContain("comments: Array<schema.PartialComment>");
      // The post relation should be broken due to circular reference detection
      expect(result).toContain("post: {");
      expect(result).toContain("id: string");
    });

    it("should break circular references by inlining primary key objects", () => {
      // Create a more complex circular reference scenario
      const userCode = `
        import { Entity, PrimaryKey, Property, ManyToOne, Collection, OneToMany } from "@mikro-orm/core";
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
        [userCode, postCode, commentCode],
        { usePartialTypes: true },
      );

      // The circular reference should be detected and broken
      // In this case, User -> Post -> Comment -> User creates a cycle
      // The system should break the cycle by inlining primary key objects where needed

      // Check that the result is wrapped in namespace schema
      expect(result).toContain("namespace schema {");
      expect(result).toContain("}");

      // Check that entity types are generated
      expect(result).toContain("export type User = {");
      expect(result).toContain("export type Post = {");
      expect(result).toContain("export type Comment = {");

      // Check that partial types are generated
      expect(result).toContain("export type PartialUser = {");
      expect(result).toContain("export type PartialPost = {");
      expect(result).toContain("export type PartialComment = {");
    });

    it("should handle entities without circular references normally", () => {
      const userCode = `
        import { Entity, PrimaryKey, Property } from "@mikro-orm/core";

        @Entity()
        export class User {
          @PrimaryKey()
          id!: number;

          @Property()
          name!: string;
        }
      `;

      const result = generateEntityFileTypes([userCode], { usePartialTypes: true });

      // Check that the result is wrapped in namespace schema
      expect(result).toContain("namespace schema {");
      expect(result).toContain("}");

      // Check that entity type is generated
      expect(result).toContain("export type User = {");
      expect(result).toContain("id: number");
      expect(result).toContain("name: string");

      // Check that partial type is generated
      expect(result).toContain("export type PartialUser = {");
    });

    it("should handle entities with usePartialTypes: false", () => {
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

      const result = generateEntityFileTypes(
        [userCode, postCode],
        { usePartialTypes: false },
      );

      // Check that the result is wrapped in namespace schema
      expect(result).toContain("namespace schema {");
      expect(result).toContain("}");

      // Check that entity types are generated
      expect(result).toContain("export type User = {");
      expect(result).toContain("export type Post = {");

      // Check that relations use inline primary key objects (not partial types)
      expect(result).toContain("post: {");
      expect(result).toContain("id: string");
      expect(result).not.toContain("schema.PartialPost");
    });
  });
});
