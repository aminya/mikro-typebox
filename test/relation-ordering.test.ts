import { describe, it, expect } from "bun:test";
import { readdir, readFile } from "fs/promises";
import path from "path";
import { generateEntityFileTypes } from "../src/prepare.js";

const entitiesDir = "./test/test-entities-relations";

/**
 * Read the fixture entities the same way the generator does, so that the files are
 * fed in directory order (which is not a valid dependency order here).
 */
async function readRelationEntities(): Promise<Map<string, string>> {
  const entities = await readdir(entitiesDir);
  return new Map(
    await Promise.all(
      entities.map(async (entity): Promise<[string, string]> => {
        const entityPath = path.join(entitiesDir, entity);
        return [entityPath, await readFile(entityPath, "utf-8")];
      }),
    ),
  );
}

/**
 * Every ordering of the given items
 */
function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) {
    return [items];
  }
  return items.flatMap((item, index) =>
    permutations([...items.slice(0, index), ...items.slice(index + 1)]).map(
      (rest) => [item, ...rest],
    ),
  );
}

/**
 * Index of the line declaring the given entity type
 */
function declarationIndex(lines: string[], entityName: string): number {
  const index = lines.findIndex((line) =>
    line.includes(`export type ${entityName} = {`),
  );
  expect(index).toBeGreaterThan(-1);
  return index;
}

describe("Relation ordering", () => {
  it("orders entities linked by nullable, self and one-to-one relations", async () => {
    const filesMap = await readRelationEntities();

    const lines = generateEntityFileTypes(filesMap, { usePartialTypes: true })
      .typesCode.split("\n");

    const alpha = declarationIndex(lines, "Alpha");
    const beta = declarationIndex(lines, "Beta");
    const gamma = declarationIndex(lines, "Gamma");
    const delta = declarationIndex(lines, "Delta");
    const epsilon = declarationIndex(lines, "Epsilon");

    // Alpha has no relations, so it comes first
    expect(alpha).toBeLessThan(beta);
    expect(alpha).toBeLessThan(gamma);
    expect(alpha).toBeLessThan(delta);

    // Gamma -> Beta and Delta -> Gamma are nullable relations, which were previously
    // invisible to the dependency graph because their type is a union
    expect(beta).toBeLessThan(gamma);
    expect(gamma).toBeLessThan(delta);

    // Epsilon -> Beta is a one-to-one relation
    expect(beta).toBeLessThan(epsilon);
  });

  it("produces the same order regardless of the input file order", async () => {
    const filesMap = await readRelationEntities();
    const filePaths = Array.from(filesMap.keys());

    const orders = [
      filePaths,
      Array.from(filePaths).reverse(),
      Array.from(filePaths).sort(),
    ];

    const results = orders.map((order) =>
      generateEntityFileTypes(
        new Map(order.map((filePath) => [filePath, filesMap.get(filePath)!])),
        { usePartialTypes: true },
      ).typesCode,
    );

    for (const result of results) {
      expect(result).toBe(results[0]!);
    }
  });

  it("breaks the same cycles regardless of the input file order", async () => {
    // `readdir` is not sorted on every platform, so entities can reach the generator in
    // any order. Which edge of a cycle gets broken must not depend on that order.
    const names = ["User.ts", "Post.ts", "Comment.ts"];
    const sources = new Map(
      await Promise.all(
        names.map(async (name): Promise<[string, string]> => [
          name,
          await readFile(path.join("./test/test-entities", name), "utf-8"),
        ]),
      ),
    );

    const results = permutations(names).map(
      (order) =>
        generateEntityFileTypes(
          new Map(order.map((name) => [name, sources.get(name)!])),
          { usePartialTypes: true },
        ).typesCode,
    );

    expect(results).toHaveLength(6);
    for (const result of results) {
      expect(result).toBe(results[0]!);
    }
  });
});
