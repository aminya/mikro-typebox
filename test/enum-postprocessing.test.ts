import { describe, it, expect } from "bun:test";
import { postprocessEnums } from "../src/post.js";

describe("Enum Postprocessing", () => {
  it("should replace redefined enums with imports", () => {
    const input = `export enum EnumUserRole {
  ADMIN = "admin",
  USER = "user",
  MODERATOR = "moderator",
}

export type UserRole = Static<typeof UserRole>;
export const UserRole = Type.Enum(EnumUserRole);

export enum EnumUserStatus {
  ACTIVE = "active",
  INACTIVE = "inactive",
  PENDING = "pending",
}

export type UserStatus = Static<typeof UserStatus>;
export const UserStatus = Type.Enum(EnumUserStatus);`;

    const enumMap = new Map([
      ["UserRole", "./entities"],
      ["UserStatus", "./entities"],
    ]);
    const result = postprocessEnums(input, enumMap);

    // Should add imports for the original enums
    expect(result).toContain('import { UserRole as EnumUserRole } from "./entities";');
    expect(result).toContain('import { UserStatus as EnumUserStatus } from "./entities";');

    // Should remove the redefined enum declarations
    expect(result).not.toContain('export enum EnumUserRole {');
    expect(result).not.toContain('export enum EnumUserStatus {');

    // Should replace Type.Enum() calls with original enum names
    expect(result).toContain('Type.Enum(EnumUserRole)');
    expect(result).toContain('Type.Enum(EnumUserStatus)');

    // Should not contain the redefined enum references
    expect(result).not.toContain('Type.Enum(UserRole)');
    expect(result).not.toContain('Type.Enum(UserStatus)');
  });

  it("should handle code without enums", () => {
    const input = `export type User = {
  id: number;
  name: string;
};`;

    const enumMap = new Map();
    const result = postprocessEnums(input, new Map());

    // Should return the input unchanged
    expect(result).toBe(input);
  });

  it("should handle mixed content with and without enums", () => {
    const input = `export type User = {
  id: number;
  name: string;
};

export enum EnumUserRole {
  ADMIN = "admin",
  USER = "user",
}

export type UserRole = Static<typeof UserRole>;
export const UserRole = Type.Enum(EnumUserRole);

export type Post = {
  title: string;
  author: User;
};`;

    const enumMap = new Map([
      ["UserRole", "./entities"],
    ]);
    const result = postprocessEnums(input, enumMap);

    // Should add import for the enum
    expect(result).toContain('import { UserRole as EnumUserRole } from "./entities";');

    // Should remove the redefined enum declaration
    expect(result).not.toContain('export enum EnumUserRole {');

    // Should replace Type.Enum() call
    expect(result).toContain('Type.Enum(EnumUserRole)');
    expect(result).not.toContain('Type.Enum(UserRole)');

    // Should preserve other content
    expect(result).toContain('export type User = {');
    expect(result).toContain('export type Post = {');
  });
});
