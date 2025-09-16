import { describe, it, expect } from "bun:test";
import { generateEntityFileTypes } from "../src/prepare.js";

describe("Detailed Circular Reference Detection", () => {
  it("should break circular references in a simple A->B->A cycle", () => {
    const entityACode = `
      import { Entity, PrimaryKey, Property, ManyToOne } from "@mikro-orm/core";
      import { EntityB } from "./EntityB.js";

      @Entity()
      export class EntityA {
        @PrimaryKey()
        id!: number;

        @Property()
        name!: string;

        @ManyToOne(() => EntityB)
        relatedB!: EntityB;
      }
    `;

    const entityBCode = `
      import { Entity, PrimaryKey, Property, ManyToOne } from "@mikro-orm/core";
      import { EntityA } from "./EntityA.js";

      @Entity()
      export class EntityB {
        @PrimaryKey()
        id!: string;

        @Property()
        title!: string;

        @ManyToOne(() => EntityA)
        relatedA!: EntityA;
      }
    `;

    const result = generateEntityFileTypes(
      [entityACode, entityBCode],
      { usePartialTypes: true },
    );

    // Check that the result is wrapped in namespace schema
    expect(result).toContain("namespace schema {");
    expect(result).toContain("}");

    // Check that entity types are generated
    expect(result).toContain("export type EntityA = {");
    expect(result).toContain("export type EntityB = {");

    // Check that partial types are generated
    expect(result).toContain("export type PartialEntityA = {");
    expect(result).toContain("export type PartialEntityB = {");

    // The circular reference should be broken by inlining primary key objects
    // At least one of the relations should be inlined instead of using partial types
    const hasInlinedRelation = result.includes("relatedB: {") || result.includes("relatedA: {");
    expect(hasInlinedRelation).toBe(true);
  });

  it("should handle a three-way circular reference A->B->C->A", () => {
    const entityACode = `
      import { Entity, PrimaryKey, Property, ManyToOne } from "@mikro-orm/core";
      import { EntityB } from "./EntityB.js";

      @Entity()
      export class EntityA {
        @PrimaryKey()
        id!: number;

        @Property()
        name!: string;

        @ManyToOne(() => EntityB)
        relatedB!: EntityB;
      }
    `;

    const entityBCode = `
      import { Entity, PrimaryKey, Property, ManyToOne } from "@mikro-orm/core";
      import { EntityC } from "./EntityC.js";

      @Entity()
      export class EntityB {
        @PrimaryKey()
        id!: string;

        @Property()
        title!: string;

        @ManyToOne(() => EntityC)
        relatedC!: EntityC;
      }
    `;

    const entityCCode = `
      import { Entity, PrimaryKey, Property, ManyToOne } from "@mikro-orm/core";
      import { EntityA } from "./EntityA.js";

      @Entity()
      export class EntityC {
        @PrimaryKey()
        id!: number;

        @Property()
        description!: string;

        @ManyToOne(() => EntityA)
        relatedA!: EntityA;
      }
    `;

    const result = generateEntityFileTypes(
      [entityACode, entityBCode, entityCCode],
      { usePartialTypes: true },
    );

    // Check that the result is wrapped in namespace schema
    expect(result).toContain("namespace schema {");
    expect(result).toContain("}");

    // Check that all entity types are generated
    expect(result).toContain("export type EntityA = {");
    expect(result).toContain("export type EntityB = {");
    expect(result).toContain("export type EntityC = {");

    // Check that partial types are generated
    expect(result).toContain("export type PartialEntityA = {");
    expect(result).toContain("export type PartialEntityB = {");
    expect(result).toContain("export type PartialEntityC = {");

    // The circular reference should be broken by inlining at least one primary key object
    const hasInlinedRelation = result.includes("relatedB: {") || 
                              result.includes("relatedC: {") || 
                              result.includes("relatedA: {");
    expect(hasInlinedRelation).toBe(true);
  });

  it("should handle circular references with collections", () => {
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
      [userCode, postCode, commentCode],
      { usePartialTypes: true },
    );

    // Check that the result is wrapped in namespace schema
    expect(result).toContain("namespace schema {");
    expect(result).toContain("}");

    // Check that all entity types are generated
    expect(result).toContain("export type User = {");
    expect(result).toContain("export type Post = {");
    expect(result).toContain("export type Comment = {");

    // Check that partial types are generated
    expect(result).toContain("export type PartialUser = {");
    expect(result).toContain("export type PartialPost = {");
    expect(result).toContain("export type PartialComment = {");

    // Check that collections are properly handled
    expect(result).toContain("posts: Array<");
    expect(result).toContain("comments: Array<");

    // The circular reference should be broken somewhere in the chain
    // User -> Post -> Comment -> User creates a cycle
    const hasInlinedRelation = result.includes("author: {") || 
                              result.includes("post: {");
    expect(hasInlinedRelation).toBe(true);
  });
});
