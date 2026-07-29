import { describe, it, expect } from "bun:test";
import { readFile } from "fs/promises";
import { generateEntityFileTypes } from "../src/prepare.js";

for (const folder of ["./test/test-entities/", "./test/test-entities-2/"]) {
    describe("Test Entities Circular Reference Detection", () => {
        it(`should detect and break circular references in ${folder}`, async () => {
            const fileContents = new Map([
                ["User.ts", await readFile(`${folder}/User.ts`, "utf-8")],
                ["Post.ts", await readFile(`${folder}/Post.ts`, "utf-8")],
                ["Comment.ts", await readFile(`${folder}/Comment.ts`, "utf-8")],
            ]);

            // Generate types with circular reference detection
            const result = generateEntityFileTypes(fileContents, { usePartialTypes: true }).typesCode;

            // The cycles (User <-> Post and Post <-> Comment) are broken on the to-many
            // side, by inlining a primary key object instead of referencing the entity
            expect(result).toContain('posts: Collection<{');
            expect(result).toContain('id: string;');
            expect(result).toContain('}');

            expect(result).toContain('comments: Collection<{');
            expect(result).toContain('id: number;');
            expect(result).toContain('}');

            // The to-one sides do not complete a cycle anymore, so they keep their partial types
            expect(result).toContain('author: schema.PartialUser');
            expect(result).toContain('post: schema.PartialPost');

            // Verify the structure is correct
            expect(result).toContain('export namespace schema {');
            expect(result).toContain('export type User = {');
            expect(result).toContain('export type Post = {');
            expect(result).toContain('export type Comment = {');
        });

        it("should handle test-entities with usePartialTypes: false", async () => {
            // Read the test entity files
            const fileContents = new Map([
                ["User.ts", await readFile("./test/test-entities/User.ts", "utf-8")],
                ["Post.ts", await readFile("./test/test-entities/Post.ts", "utf-8")],
                ["Comment.ts", await readFile("./test/test-entities/Comment.ts", "utf-8")],
            ]);

            // Generate types without partial types (should inline all entity references)
            const result = generateEntityFileTypes(fileContents, { usePartialTypes: false }).typesCode;

            // All entity references should be inlined to primary key objects
            expect(result).toContain('author: {');
            expect(result).toContain('id: number;');
            expect(result).toContain('}');

            expect(result).toContain('post: {');
            expect(result).toContain('id: string;');
            expect(result).toContain('}');

            // Collections should also be inlined
            expect(result).toContain('posts: Collection<{');
            expect(result).toContain('comments: Collection<{');
        });

        it("should work with CLI command for test-entities", async () => {
            // This test verifies that the CLI command works correctly with the updated test-entities
            // We'll test by running the CLI command and checking that it produces valid output
            const { spawn } = await import("bun");

            const proc = spawn([
                "bun",
                "./src/cli.ts",
                "generate",
                "-e",
                "./test/test-entities/",
                "--target",
                "typebox",
                "--no-write"
            ]);

            const exitCode = await proc.exited;
            expect(exitCode).toBe(0);

            // The command should succeed without errors
            // Note: We can't easily capture stdout with bun spawn, but exit code 0 indicates success
        });
    });

}
