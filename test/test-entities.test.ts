import { describe, it, expect } from "bun:test";
import { readFile } from "fs/promises";
import { generateEntityFileTypes } from "../src/prepare.js";
import { 
  readEntityFiles, 
  testEntityFiles, 
  expectNamespaceStructure,
  expectEntityType,
  expectInlinedRelation,
  runCLITest,
  createCLICommand
} from "./test-utils.js";

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

            // Check that some circular references are broken by inlining primary key objects
            // The exact relations that get broken may vary based on the cycle detection algorithm
            expectInlinedRelation(result, "author", "number");
            expectInlinedRelation(result, "post", "string");

            // Some relations may still use partial types if they don't complete a cycle
            expect(result).toContain('schema.Partial');

            // Verify the structure is correct
            expectNamespaceStructure(result);
            expectEntityType(result, "User");
            expectEntityType(result, "Post");
            expectEntityType(result, "Comment");
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
            expectInlinedRelation(result, "author", "number");
            expectInlinedRelation(result, "post", "string");

            // Collections should also be inlined
            expect(result).toContain('posts: Collection<{');
            expect(result).toContain('comments: Collection<{');
        });

        it("should work with CLI command for test-entities", async () => {
            // This test verifies that the CLI command works correctly with the updated test-entities
            // We'll test by running the CLI command and checking that it produces valid output
            await runCLITest({
                command: createCLICommand("generate", {
                    entities: "./test/test-entities/",
                    target: "typebox",
                    noWrite: true
                }),
                expectedExitCode: 0
            });
        });
    });

}
