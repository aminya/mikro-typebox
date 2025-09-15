import * as Codegen from "@sinclair/typebox-codegen";
import { existsSync } from "fs";
import { readdir, readFile, writeFile } from "fs/promises";
import { generateEntityFileTypes, wrapInNamespace } from "./entity-parse.js";

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

	// read the entity files
	const entityContents = await Promise.all(entities.map((entity) => readFile(`${entitiesDir}/${entity}`, "utf-8")));

	// generate the entity file types
	const typesCode = generateEntityFileTypes(entityContents);

	let output: string;
	if (opts.targetValidationLibrary === undefined || opts.targetValidationLibrary === "typebox") {
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

	// wrap the schemas in the namespace schema
	output = wrapInNamespace(output);
	
	// write the code to a file
	if (opts.write) {
		await writeFile(opts.outputFile ?? "./src/entity-validators.ts", output);
	}

	return output;
}

