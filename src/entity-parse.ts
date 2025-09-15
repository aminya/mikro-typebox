import * as ts from "typescript";

/**
 * Process multiple entity files and generate types with proper entity ID replacement
 */
export function generateEntityFileTypes(fileContents: string[]): string {
	// First pass: collect all entities and their ID types from all files
	const entityIdTypes = new Map<string, ts.TypeNode>();
	const allCode = fileContents.join("\n");
	const sourceFile = ts.createSourceFile("temp.ts", allCode, ts.ScriptTarget.Latest, true);

	// Collect all entities from all files
	visitEntities(sourceFile, entityIdTypes);

	// Second pass: process each file with the complete entity map
	return fileContents.map((code) => generateEntityTypes(code, entityIdTypes)).join("\n");
}

/**
 * Cleanup the code to remove the imports and the calls to the imported symbols
 */
export function generateEntityTypes(code: string, entityIdTypes: Map<string, ts.TypeNode> = new Map()): string {
	const sourceFile = ts.createSourceFile("temp.ts", code, ts.ScriptTarget.Latest, true);

	// Collect imports and their symbols
	const importNodes = new Set<ts.Node>();
	const importedSymbols = new Set<string>();
	visitImports(sourceFile, importNodes, importedSymbols);

	// Find calls to imported symbols
	const callExpressionsToRemove: Set<ts.Node> = new Set();
	visitCalls(sourceFile, importedSymbols, callExpressionsToRemove);

	// Collect entity classes and their ID types from this file
	visitEntities(sourceFile, entityIdTypes);

	// Apply the transformer
	const result = ts.transform(sourceFile, [
		(ctx) => transformer(ctx, importNodes, callExpressionsToRemove, entityIdTypes)
	]);
	const transformedSourceFile = result.transformed[0];
	if (!transformedSourceFile) {
		return code;
	}
	result.dispose();

	return ts.createPrinter().printFile(transformedSourceFile);
}

/**
 * Collect imports and their symbols
 */
function visitImports(node: ts.Node, importNodes: Set<ts.Node>, importedSymbols: Set<string>): void {
	if (ts.isImportDeclaration(node)) {
		const moduleSpecifier = node.moduleSpecifier;

		if (ts.isStringLiteral(moduleSpecifier)) {
			const importPath = moduleSpecifier.text;

			// Mark ALL imports for removal (both regular and type imports)
			importNodes.add(node);

			// collect symbols from non-relative imports
			if (!importPath.includes("./") && node.importClause) {
				// collect named imports (both regular and type)
				if (node.importClause.namedBindings && ts.isNamedImports(node.importClause.namedBindings)) {
					for (const element of node.importClause.namedBindings.elements) {
						importedSymbols.add(element.name.text);
					}
				}

				// collect namespace imports
				if (node.importClause.namedBindings && ts.isNamespaceImport(node.importClause.namedBindings)) {
					importedSymbols.add(node.importClause.namedBindings.name.text);
				}

				// collect default imports
				if (node.importClause.name) {
					importedSymbols.add(node.importClause.name.text);
				}
			}
		}
	}

	ts.forEachChild(node, (childNode) => visitImports(childNode, importNodes, importedSymbols));
}

/**
 * Find calls to imported symbols
 */
function visitCalls(
	node: ts.Node,
	importedSymbols: Set<string>,
	callExpressionsToRemove: Set<ts.Node> = new Set()
): void {
	if (ts.isCallExpression(node)) {
		const expression = node.expression;
		if (ts.isIdentifier(expression) && importedSymbols.has(expression.text)) {
			callExpressionsToRemove.add(node);
		}
	}

	ts.forEachChild(node, (node) => visitCalls(node, importedSymbols, callExpressionsToRemove));
}

/**
 * Collect entity classes and their ID types
 */
function visitEntities(node: ts.Node, entityIdTypes: Map<string, ts.TypeNode>): void {
	if (ts.isClassDeclaration(node) && node.name) {
		// Check if the class has @Entity() decorator
		const hasEntityDecorator = node.modifiers?.some(
			(modifier) =>
				ts.isDecorator(modifier) &&
				ts.isCallExpression(modifier.expression) &&
				ts.isIdentifier(modifier.expression.expression) &&
				modifier.expression.expression.text === "Entity"
		);

		if (hasEntityDecorator) {
			const className = node.name.text;

			// Find the @PrimaryKey() property to get the ID type
			const primaryKeyProperty = node.members.find(
				(member) =>
					ts.isPropertyDeclaration(member) &&
					member.modifiers?.some(
						(modifier) =>
							ts.isDecorator(modifier) &&
							ts.isCallExpression(modifier.expression) &&
							ts.isIdentifier(modifier.expression.expression) &&
							modifier.expression.expression.text === "PrimaryKey"
					)
			);

			if (primaryKeyProperty && ts.isPropertyDeclaration(primaryKeyProperty) && primaryKeyProperty.type) {
				entityIdTypes.set(className, primaryKeyProperty.type);
			}
		}
	}

	ts.forEachChild(node, (childNode) => visitEntities(childNode, entityIdTypes));
}

/**
 * Create a transformer to
 * - remove the identified nodes
 * - convert class declarations to type aliases
 * - remove variable declarations with initializers
 * - remove expression statements (like method calls and assignments)
 * - remove definite assignment assertions (!:)
 * - replace Collection<T> with Array<T>
 */
const transformer = (
	context: ts.TransformationContext,
	importNodes: Set<ts.Node>,
	callExpressionsToRemove: Set<ts.Node>,
	entityIdTypes: Map<string, ts.TypeNode>
) => {
	return (sourceFile: ts.SourceFile) => {
		const visitor = (node: ts.Node): ts.Node | ts.Node[] | undefined => {
			// Remove import declarations
			if (importNodes.has(node)) {
				return undefined;
			}

			// Remove call expressions
			if (callExpressionsToRemove.has(node)) {
				return undefined;
			}

			// Convert class declarations to type aliases
			if (ts.isClassDeclaration(node) && node.name) {
				const className = node.name.text;

				// Extract property signatures from the class
				const propertySignatures = node.members
					.filter((member) => ts.isPropertyDeclaration(member))
					.map((member) => {
						if (ts.isPropertyDeclaration(member) && member.name && ts.isIdentifier(member.name)) {
							const propertyName = member.name.text;
							let type = member.type || ts.factory.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword);

							// Replace entity type references with object types containing primary key
							if (ts.isTypeReferenceNode(type) && ts.isIdentifier(type.typeName)) {
								const entityName = type.typeName.text;
								const idType = entityIdTypes.get(entityName);
								if (idType) {
									// Create a type that has the primary key as required and other properties as optional
									// This allows for both unpopulated (just ID) and populated (full entity) scenarios
									type = ts.factory.createTypeReferenceNode(
										ts.factory.createIdentifier("Pick"),
										[
											ts.factory.createTypeReferenceNode(
												ts.factory.createQualifiedName(
													ts.factory.createIdentifier("schema"),
													ts.factory.createIdentifier(entityName)
												),
												undefined
											),
											ts.factory.createLiteralTypeNode(ts.factory.createStringLiteral("id"))
										]
									);
								}
							}

							// Handle Collection<T> replacement with entity types in generic arguments
							if (
								ts.isTypeReferenceNode(type) &&
								ts.isIdentifier(type.typeName) &&
								type.typeName.text === "Collection"
							) {
								if (type.typeArguments && type.typeArguments.length > 0) {
									// Replace entity types in the generic arguments
									const transformedTypeArgs = type.typeArguments.map((typeArg) => {
										if (ts.isTypeReferenceNode(typeArg) && ts.isIdentifier(typeArg.typeName)) {
											const entityName = typeArg.typeName.text;
											const idType = entityIdTypes.get(entityName);
											if (idType) {
												// Create a type that has the primary key as required and other properties as optional
												return ts.factory.createTypeReferenceNode(
													ts.factory.createIdentifier("Pick"),
													[
														ts.factory.createTypeReferenceNode(
															ts.factory.createQualifiedName(
																ts.factory.createIdentifier("schema"),
																ts.factory.createIdentifier(entityName)
															),
															undefined
														),
														ts.factory.createLiteralTypeNode(ts.factory.createStringLiteral("id"))
													]
												);
											}
											return typeArg;
										}
										return typeArg;
									});
									type = ts.factory.createTypeReferenceNode(ts.factory.createIdentifier("Array"), transformedTypeArgs);
								} else {
									type = ts.factory.createTypeReferenceNode(ts.factory.createIdentifier("Array"), type.typeArguments);
								}
							}

							return ts.factory.createPropertySignature(undefined, propertyName, member.questionToken, type);
						}
						return null;
					})
					.filter((item): item is ts.PropertySignature => item !== null);

				return ts.factory.createTypeAliasDeclaration(
					[ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
					className,
					undefined,
					ts.factory.createTypeLiteralNode(propertySignatures)
				);
			}

			// Remove variable declarations with initializers
			if (ts.isVariableDeclaration(node) && node.initializer) {
				return undefined;
			}

			// Remove expression statements (like method calls and assignments)
			if (ts.isExpressionStatement(node)) {
				return undefined;
			}

			// Remove definite assignment assertions (!:)
			if (ts.isPropertyDeclaration(node) && node.exclamationToken) {
				return ts.factory.createPropertyDeclaration(
					node.modifiers,
					node.name,
					node.questionToken,
					node.type,
					node.initializer
				);
			}

			// Replace Collection<T> with Array<T> and handle entity types in generic arguments
			if (ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName) && node.typeName.text === "Collection") {
				if (node.typeArguments && node.typeArguments.length > 0) {
					// Replace entity types in the generic arguments
					const transformedTypeArgs = node.typeArguments.map((typeArg) => {
						if (ts.isTypeReferenceNode(typeArg) && ts.isIdentifier(typeArg.typeName)) {
							const entityName = typeArg.typeName.text;
							const idType = entityIdTypes.get(entityName);
							if (idType) {
								// Create a type that has the primary key as required and other properties as optional
								return ts.factory.createTypeReferenceNode(
									ts.factory.createIdentifier("Pick"),
									[
										ts.factory.createTypeReferenceNode(
											ts.factory.createQualifiedName(
												ts.factory.createIdentifier("schema"),
												ts.factory.createIdentifier(entityName)
											),
											undefined
										),
										ts.factory.createLiteralTypeNode(ts.factory.createStringLiteral("id"))
									]
								);
							}
							return typeArg;
						}
						return typeArg;
					});
					return ts.factory.createTypeReferenceNode(ts.factory.createIdentifier("Array"), transformedTypeArgs);
				}
				return ts.factory.createTypeReferenceNode(ts.factory.createIdentifier("Array"), node.typeArguments);
			}

			// Replace entity type references with object types containing primary key
			if (ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName)) {
				const entityName = node.typeName.text;
				const idType = entityIdTypes.get(entityName);
				if (idType) {
					// Create a type that has the primary key as required and other properties as optional
					// This allows for both unpopulated (just ID) and populated (full entity) scenarios
					return ts.factory.createTypeReferenceNode(
						ts.factory.createIdentifier("Pick"),
						[
							ts.factory.createTypeReferenceNode(
								ts.factory.createQualifiedName(
									ts.factory.createIdentifier("schema"),
									ts.factory.createIdentifier(entityName)
								),
								undefined
							),
							ts.factory.createLiteralTypeNode(ts.factory.createStringLiteral("id"))
						]
					);
				}
			}

			// Replace entity types in property signatures
			if (
				ts.isPropertySignature(node) &&
				node.type &&
				ts.isTypeReferenceNode(node.type) &&
				ts.isIdentifier(node.type.typeName)
			) {
				const entityName = node.type.typeName.text;
				const idType = entityIdTypes.get(entityName);
				if (idType) {
					// Create a type that has the primary key as required and other properties as optional
					// This allows for both unpopulated (just ID) and populated (full entity) scenarios
					const entityObjectType = ts.factory.createTypeReferenceNode(
						ts.factory.createIdentifier("Pick"),
						[
							ts.factory.createTypeReferenceNode(
								ts.factory.createQualifiedName(
									ts.factory.createIdentifier("schema"),
									ts.factory.createIdentifier(entityName)
								),
								undefined
							),
							ts.factory.createLiteralTypeNode(ts.factory.createStringLiteral("id"))
						]
					);
					return ts.factory.createPropertySignature(node.modifiers, node.name, node.questionToken, entityObjectType);
				}
			}

			return ts.visitEachChild(node, visitor, context);
		};

		return ts.visitNode(sourceFile, visitor) as ts.SourceFile;
	};
};

export function wrapInNamespace(output: string) {
	const lastImportIndex = findLastImportIndex(output);
	return `${output.slice(0, lastImportIndex)}\nexport namespace schema {\n${output.slice(lastImportIndex)}\n}`;
}

function findLastImportIndex(output: string) {
	let lastImportIndex = 0;
	const matches = output.matchAll(/import .*/g);
	for (const match of matches) {
		const [importString, _] = match;
		lastImportIndex += match.index + importString.length;
	}
	return lastImportIndex;
}

