import { readFile, mkdir, writeFile, rm } from "fs/promises";
import { existsSync } from "fs";
import { spawn } from "bun";
import { expect } from "bun:test";
import path from "path";
import { modelsToFunction } from "../src/generate.ts";

/**
 * Test utilities for mikro-typebox tests
 */

// ============================================================================
// Entity Code Builders
// ============================================================================

export interface EntityProperty {
    name: string;
    type: string;
    decorator: string;
    options?: string;
}

export interface EntityRelation {
    name: string;
    type: "OneToMany" | "ManyToOne" | "OneToOne" | "ManyToMany";
    target: string;
    inverseSide?: string;
}

export interface EntityConfig {
    name: string;
    primaryKey: { name: string; type: string };
    properties: EntityProperty[];
    relations: EntityRelation[];
    imports: string[];
}

export function buildEntityCode(config: EntityConfig): string {
    const { name, primaryKey, properties, relations, imports } = config;

    const decoratorImports = new Set<string>();
    const entityImports = new Set<string>();

    // Collect decorator imports
    decoratorImports.add("Entity");
    decoratorImports.add("PrimaryKey");

    properties.forEach(prop => {
        if (prop.decorator === "Property") {
            decoratorImports.add("Property");
        }
    });

    relations.forEach(rel => {
        decoratorImports.add(rel.type);
        if (rel.type === "OneToMany" || rel.type === "ManyToMany") {
            decoratorImports.add("Collection");
        }
        entityImports.add(rel.target);
    });

    // Build imports section
    const decoratorImportStr = `import { ${Array.from(decoratorImports).join(", ")} } from "@mikro-orm/core";`;
    const entityImportStrs = Array.from(entityImports).map(target =>
        `import { ${target} } from "./${target}.js";`
    );
    const additionalImports = imports.map(imp => `import ${imp};`);

    const allImports = [decoratorImportStr, ...entityImportStrs, ...additionalImports]
        .filter(Boolean)
        .join("\n");

    // Build class body
    const primaryKeyStr = `  @PrimaryKey()\n  ${primaryKey.name}!: ${primaryKey.type};`;

    const propertyStrs = properties.map(prop => {
        const decoratorOptions = prop.options ?
            `({ ${prop.options} })` :
            "()";
        return `  @${prop.decorator}${decoratorOptions}\n  ${prop.name}!: ${prop.type};`;
    });

    const relationStrs = relations.map(rel => {
        const decoratorOptions = rel.inverseSide
            ? `(() => ${rel.target}, ${rel.inverseSide})`
            : `(() => ${rel.target})`;

        return rel.type === "OneToMany" || rel.type === "ManyToMany" ?
            `  @${rel.type}${decoratorOptions}\n  ${rel.name} = new Collection<${rel.target}>(this);` :
            `  @${rel.type}${decoratorOptions}\n  ${rel.name}!: ${rel.target};`;
    });

    const classBody = [
        primaryKeyStr,
        ...propertyStrs,
        ...relationStrs
    ].join("\n\n");

    return `${allImports}

@Entity()
export class ${name} {
${classBody}
}`;
}

// ============================================================================
// Common Entity Configurations
// ============================================================================

export const commonEntities = {
    user: (): EntityConfig => ({
        name: "User",
        primaryKey: { name: "id", type: "number" },
        properties: [
            { name: "name", type: "string", decorator: "Property" },
            { name: "email", type: "string", decorator: "Property" },
            { name: "age", type: "number", decorator: "Property", options: "nullable: true" }
        ],
        relations: [],
        imports: []
    }),

    post: (): EntityConfig => ({
        name: "Post",
        primaryKey: { name: "id", type: "string" },
        properties: [
            { name: "title", type: "string", decorator: "Property" },
            { name: "content", type: "string", decorator: "Property", options: 'type: "text"' },
            { name: "publishedAt", type: "Date", decorator: "Property" }
        ],
        relations: [
            { name: "author", type: "ManyToOne", target: "User" },
            { name: "comments", type: "OneToMany", target: "Comment", inverseSide: "comment => comment.post" }
        ],
        imports: []
    }),

    comment: (): EntityConfig => ({
        name: "Comment",
        primaryKey: { name: "id", type: "number" },
        properties: [
            { name: "content", type: "string", decorator: "Property" },
            { name: "createdAt", type: "Date", decorator: "Property" }
        ],
        relations: [
            { name: "post", type: "ManyToOne", target: "Post" },
            { name: "author", type: "ManyToOne", target: "User" }
        ],
        imports: []
    }),

    userWithPosts: (): EntityConfig => ({
        name: "User",
        primaryKey: { name: "id", type: "number" },
        properties: [
            { name: "name", type: "string", decorator: "Property" },
            { name: "email", type: "string", decorator: "Property" }
        ],
        relations: [
            { name: "posts", type: "OneToMany", target: "Post", inverseSide: "post => post.author" }
        ],
        imports: []
    })
};

// ============================================================================
// File Operations
// ============================================================================

export async function readEntityFiles(filePaths: string[]): Promise<Map<string, string>> {
    return new Map(await Promise.all(filePaths.map(async (filePath) => {
        const content = await readFile(filePath, "utf-8");
        return [path.basename(filePath), content] as [string, string];
    })));
}

export async function createTestEntities(
    entitiesDir: string,
    entities: Array<{ filename: string; config: EntityConfig }>
): Promise<void> {
    await mkdir(entitiesDir, { recursive: true });

    await Promise.all(entities.map(async ({ filename, config }) => {
        const content = buildEntityCode(config);
        await writeFile(`${entitiesDir}/${filename}`, content);
    }));
}

export async function cleanupTestFiles(...paths: string[]): Promise<void> {
    await Promise.all(paths.map(async (path) => {
        if (existsSync(path)) {
            await rm(path, { recursive: true, force: true });
        }
    }));
}

// ============================================================================
// Test Directory Management
// ============================================================================

export class TestDirectoryManager {
    private tempDirs: string[] = [];

    async createTempDir(prefix = "test-"): Promise<string> {
        const tempDir = `${prefix}${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        await mkdir(tempDir, { recursive: true });
        this.tempDirs.push(tempDir);
        return tempDir;
    }

    async cleanup(): Promise<void> {
        await Promise.all(this.tempDirs.map(dir =>
            existsSync(dir) ? rm(dir, { recursive: true, force: true }) : Promise.resolve()
        ));
        this.tempDirs = [];
    }
}

// ============================================================================
// Result Validation Helpers
// ============================================================================

export function expectNamespaceStructure(result: string): void {
    expect(result).toContain("export namespace schema {");
    expect(result).toContain("}");
}

export function expectEntityType(result: string, entityName: string): void {
    expect(result).toContain(`export type ${entityName} = {`);
}

export function expectPartialType(result: string, entityName: string): void {
    expect(result).toContain(`export type Partial${entityName} = {`);
}

export function expectTypeBoxValidator(result: string, entityName: string): void {
    expect(result).toContain(`export const ${entityName} = Type.Object(`);
}

export function expectZodValidator(result: string, entityName: string): void {
    expect(result).toContain(`export const schema_${entityName} = z.object({`);
}

export function expectValibotValidator(result: string, entityName: string): void {
    expect(result).toContain(`export const schema_${entityName} = v.object({`);
}

export function expectNoDecorators(result: string): void {
    expect(result).not.toContain("@Entity()");
    expect(result).not.toContain("@PrimaryKey()");
    expect(result).not.toContain("@Property()");
    expect(result).not.toContain("@ManyToOne()");
    expect(result).not.toContain("@OneToMany()");
}

export function expectNoImports(result: string): void {
    expect(result).not.toContain("import {");
}

export function expectInlinedRelation(result: string, relationName: string, idType: string): void {
    expect(result).toContain(`${relationName}: {`);
    expect(result).toContain(`id: ${idType}`);
    expect(result).toContain("}");
}

export function expectPartialRelation(result: string, relationName: string, entityName: string): void {
    expect(result).toContain(`${relationName}: schema.Partial${entityName}`);
}

export function expectCollectionRelation(result: string, relationName: string, entityName: string): void {
    expect(result).toContain(`${relationName}: Collection<`);
    expect(result).toContain(`schema.Partial${entityName}`);
}

// ============================================================================
// CLI Testing Helpers
// ============================================================================

export interface CLITestOptions {
    command: string[];
    expectedExitCode?: number;
    shouldCreateFile?: string;
    shouldNotCreateFile?: string;
    expectedContent?: string[];
    timeout?: number;
}

export async function runCLITest(options: CLITestOptions): Promise<void> {
    const {
        command,
        expectedExitCode = 0,
        shouldCreateFile,
        shouldNotCreateFile,
        expectedContent = [],
        timeout = 10000
    } = options;

    const proc = spawn(command);

    const timeoutId = setTimeout(() => {
        proc.kill();
    }, timeout);

    const exitCode = await proc.exited;
    clearTimeout(timeoutId);

    expect(exitCode).toBe(expectedExitCode);

    if (shouldCreateFile) {
        expect(existsSync(shouldCreateFile)).toBe(true);

        if (expectedContent.length > 0) {
            const content = await Bun.file(shouldCreateFile).text();
            expectedContent.forEach(expected => {
                expect(content).toContain(expected);
            });
        }
    }

    if (shouldNotCreateFile) {
        expect(existsSync(shouldNotCreateFile)).toBe(false);
    }
}

export function createCLICommand(
    subcommand: string,
    options: {
        entities?: string;
        output?: string;
        target?: string;
        noWrite?: boolean;
        help?: boolean;
        version?: boolean;
    } = {}
): string[] {
    const command = ["bun", "run", "src/cli.ts", subcommand];

    if (options.entities) command.push("--entities", options.entities);
    if (options.output) command.push("--output", options.output);
    if (options.target) command.push("--target", options.target);
    if (options.noWrite) command.push("--no-write");
    if (options.help) command.push("--help");
    if (options.version) command.push("--version");

    return command;
}

// ============================================================================
// Common Test Data
// ============================================================================

export const testEntityFiles = [
    "./test/test-entities/Comment.ts",
    "./test/test-entities/User.ts",
    "./test/test-entities/Post.ts"
];

export const supportedValidationLibraries = Object.keys(modelsToFunction) as Array<keyof typeof modelsToFunction>;

// ============================================================================
// Test Setup/Teardown Helpers
// ============================================================================

export function createTestSetup(entitiesDir: string, outputFile?: string) {
    return {
        async beforeEach() {
            await mkdir(entitiesDir, { recursive: true });
        },

        async afterEach() {
            const filesToClean = [entitiesDir];
            if (outputFile) filesToClean.push(outputFile);
            await cleanupTestFiles(...filesToClean);
        }
    };
}
