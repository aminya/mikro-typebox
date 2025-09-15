import * as Codegen from "@sinclair/typebox-codegen";
import { existsSync } from "fs";
import { readdir, readFile, writeFile } from "fs/promises";
import { generateEntityFileTypes } from "./entity-parse.js";
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
	zod: "Zod"
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
};

/**
 * Generate a validator for the Mikro-ORM entities in the entities directory.
 * @param opts - The options for the validator.
 * @returns The validator code.
 */
export async function generateEntityValidator(opts: GenerateEntityValidatorOptions): Promise<string> {
	const entitiesDir = opts.entitiesDir ?? "./src/entities";
	if (!existsSync(entitiesDir)) {
		throw new Error(`Entities directory does not exist: ${entitiesDir}. Set the entitiesDir option to the correct directory.`);
	}

	const entities = await readdir(entitiesDir);

	// filter to only include TypeScript files
	const extensions = new Set([".ts", ".mts", ".cts", ".js", ".mjs", ".cjs", ".jsx", ".tsx"]);
	const entityFiles = entities.filter((entity) => extensions.has(path.extname(entity)));

	// read the entity files
	const entityContents = await Promise.all(entityFiles.map((entity) => readFile(`${entitiesDir}/${entity}`, "utf-8")));

	const isTypeBox = opts.targetValidationLibrary === undefined || opts.targetValidationLibrary === "typebox";

	// generate the entity file types
	const typesCode = generateEntityFileTypes(entityContents, { usePartialTypes: opts.partials ?? isTypeBox });

	let output: string;
	if (isTypeBox || opts.targetValidationLibrary === undefined) {
		output = Codegen.TypeScriptToTypeBox.Generate(typesCode, {
			useExportEverything: true,
			useTypeBoxImport: true,
			useIdentifiers: true
		});
	} else if (opts.targetValidationLibrary in modelsToFunction) {
		// generate the model
		const model = Codegen.TypeScriptToModel.Generate(typesCode);

		// get the model name
		const modelName = modelsToFunction[opts.targetValidationLibrary];

		// generate the code
		output = Codegen[`ModelTo${modelName}`].Generate(model);
	} else {
		throw new Error(`Invalid target validation library: ${opts.targetValidationLibrary}.\nValid options are: ${Object.keys(modelsToFunction).join(", ")}.`);
	}

	// write the code to a file
	if (opts.write) {
		await writeFile(opts.outputFile ?? "./src/entity-validators.ts", output);
	}

	return output;
}

