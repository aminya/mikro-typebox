import * as Codegen from "@sinclair/typebox-codegen";
import { existsSync } from "fs";
import { readdir, readFile, writeFile } from "fs/promises";
import { generateEntityFileTypes } from "./prepare.js";
import { postprocessEnums } from "./post.js";
import path from "path";

export const modelsToFunction = {
  arktype: "ArkType",
  effect: "Effect",
  "io-ts": "IoTs",
  javascript: "JavaScript",
  "json-schema": "JsonSchema",
  typebox: "TypeBox",
  typescript: "TypeScript",
  valibot: "Valibot",
  value: "Value",
  yup: "Yup",
  zod: "Zod",
} as const;

export type GenerateEntityValidatorOptions = {
  /**
   * Directory containing the entities
   * @default "./src/entities"
   */
  entitiesDir?: string | undefined;
  /**
   * The file to write the code to if `write` is true.
   * @default "./src/entity-validators.ts"
   */
  outputFile?: string | undefined;
  /**
   * Whether to write the code to a file.
   * The code is returned from the function regardless of this option.
   * @default true
   */
  write?: boolean | undefined;
  /**
   * Target validation library (Zod, TypeBox, Valibot, etc.)
   * @default "typebox"
   */
  targetValidationLibrary?: keyof typeof modelsToFunction | undefined;
  /**
   * Whether to generate partial types instead of inline primary key references.
   * @default true for typebox and false for other libraries
   */
  partials?: boolean | undefined;
  /**
   * Whether to print verbose output.
   * @default false
   */
  verbose?: boolean | undefined;
};

/**
 * Generate a validator for the Mikro-ORM entities in the entities directory.
 * @param opts - The options for the validator.
 * @returns The validator code.
 */
export async function generateEntityValidator(
  opts: GenerateEntityValidatorOptions,
): Promise<string> {
  // read the entity files
  const filesMap = await readEntities(opts);

  // generate the entity types
  const { typesCode, enumDefinitions } = generateEntityFileTypes(filesMap, {
    usePartialTypes:
      opts.partials ??
      (opts.targetValidationLibrary === undefined ||
        opts.targetValidationLibrary === "typebox"),
  });

  if (opts.verbose) {
    console.log("Types Code\n", typesCode);
  }

  // generate the validator via the types
  const output: string = generateValidator(opts, typesCode);

  // postprocess enums to replace redefined enums with imports
  const outputFile = opts.outputFile ?? "./src/entity-validators.ts";

  const postprocessedCode = postprocessEnums(output, enumDefinitions, outputFile);

  // format the code
  const formattedCode = await formatCode(postprocessedCode);

  if (opts.verbose) {
    console.log("Output\n", formattedCode);
  }

  // write the code to a file
  if (opts.write) {
    await writeFile(
      outputFile,
      formattedCode
    );
  }

  return formattedCode;
}

async function readEntities(opts: GenerateEntityValidatorOptions) {
  const entitiesDir = opts.entitiesDir ?? "./src/entities";
  if (!existsSync(entitiesDir)) {
    throw new Error(
      `Entities directory does not exist: ${entitiesDir}. Set the entitiesDir option to the correct directory.`,
    );
  }

  const entities = await readdir(entitiesDir);

  // filter to only include TypeScript files
  const extensions = new Set([
    ".ts",
    ".mts",
    ".cts",
    ".js",
    ".mjs",
    ".cjs",
    ".jsx",
    ".tsx",
  ]);
  const entityFiles = entities.filter((entity) =>
    extensions.has(path.extname(entity)),
  );

  // read the entity files and return a map of entity names to their contents
  return new Map(await Promise.all(
    entityFiles.map(async (entity): Promise<[string, string]> => {
      const entityPath = `${entitiesDir}/${entity}`;
      const content = await readFile(entityPath, "utf-8");
      return [entity, content];
    }),
  ));
}

function generateValidator(
  opts: GenerateEntityValidatorOptions,
  typesCode: string,
) {
  if (
    opts.targetValidationLibrary === undefined ||
    opts.targetValidationLibrary === "typebox"
  ) {
    // generate the typebox code
    return Codegen.TypeScriptToTypeBox.Generate(typesCode, {
      useExportEverything: true,
      useTypeBoxImport: true,
      useIdentifiers: false,
    });
  } else if (opts.targetValidationLibrary in modelsToFunction) {
    // generate the model
    const model = Codegen.TypeScriptToModel.Generate(typesCode);

    // get the model name
    const modelName = modelsToFunction[opts.targetValidationLibrary];

    // generate the code
    return Codegen[`ModelTo${modelName}`].Generate(model);
  } else {
    throw new Error(
      `Invalid target validation library: ${opts.targetValidationLibrary}.\nValid options are: ${Object.keys(modelsToFunction).join(", ")}.`,
    );
  }
}

async function formatCode(code: string) {
  try {
    const prettier = await import("prettier");
    return await prettier.format(code, {
      parser: "typescript",
      singleQuote: false,
    });
  } catch (error) {
    console.error(error);
    return code;
  }
}
