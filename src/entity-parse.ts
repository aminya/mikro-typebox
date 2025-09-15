import * as ts from "typescript";

/**
 * Process multiple entity files and generate types with proper entity ID replacement
 */
export function generateEntityFileTypes(fileContents: string[]): string {
	// First pass: collect all entities and their primary key info from all files
	const entityPrimaryKeys = new Map<string, { fieldName: string; fieldType: ts.TypeNode }>();
	const allCode = fileContents.join("\n");
	const sourceFile = ts.createSourceFile("temp.ts", allCode, ts.ScriptTarget.Latest, true);

	// Collect all entities from all files
	visitEntities(sourceFile, entityPrimaryKeys);

	// Second pass: process each file with the complete entity map
	const generatedTypes = fileContents.map((code) => generateEntityTypes(code, entityPrimaryKeys)).join("\n");
	
	// Wrap the generated types in a namespace schema
	return `export namespace schema {\n${generatedTypes}\n}`;
}

/**
 * Cleanup the code to remove the imports and the calls to the imported symbols
 */
export function generateEntityTypes(code: string, entityPrimaryKeys: Map<string, { fieldName: string; fieldType: ts.TypeNode }> = new Map()): string {
	const sourceFile = ts.createSourceFile("temp.ts", code, ts.ScriptTarget.Latest, true);

	// Collect imports and their symbols
	const importNodes = new Set<ts.Node>();
	const importedSymbols = new Set<string>();
	visitImports(sourceFile, importNodes, importedSymbols);

	// Find calls to imported symbols
	const callExpressionsToRemove: Set<ts.Node> = new Set();
	visitCalls(sourceFile, importedSymbols, callExpressionsToRemove);

	// Collect entity classes and their primary key info from this file
	visitEntities(sourceFile, entityPrimaryKeys);

	// Apply the transformer
	const result = ts.transform(sourceFile, [
		(ctx) => transformer(ctx, importNodes, callExpressionsToRemove, entityPrimaryKeys)
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
 * Create a named partial type (Partial<Entity>) with required ID and optional other properties
 */
function createPartialEntityType(
	entityName: string, 
	primaryKeyInfo: { fieldName: string; fieldType: ts.TypeNode },
	allProperties: ts.PropertySignature[]
): ts.TypeAliasDeclaration {
	// Create the partial type with required ID and optional other properties
	const partialProperties = allProperties.map(prop => {
		if (ts.isPropertySignature(prop) && ts.isIdentifier(prop.name) && prop.name.text === primaryKeyInfo.fieldName) {
			// Keep the primary key as required
			return prop;
		} else {
			// Make all other properties optional
			return ts.factory.createPropertySignature(
				prop.modifiers,
				prop.name,
				ts.factory.createToken(ts.SyntaxKind.QuestionToken), // Add ? to make optional
				prop.type
			);
		}
	});

	return ts.factory.createTypeAliasDeclaration(
		[ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
		`Partial${entityName}`,
		undefined,
		ts.factory.createTypeLiteralNode(partialProperties)
	);
}

/**
 * Create an inline object type with just the primary key field for deep references
 */
function createPrimaryKeyObjectType(primaryKeyInfo: { fieldName: string; fieldType: ts.TypeNode }): ts.TypeLiteralNode {
	return ts.factory.createTypeLiteralNode([
		ts.factory.createPropertySignature(
			undefined,
			primaryKeyInfo.fieldName,
			undefined,
			primaryKeyInfo.fieldType
		)
	]);
}

/**
 * Replace entity type references with partial entity types
 */
function replaceEntityTypeWithPrimaryKey(
	type: ts.TypeNode,
	entityPrimaryKeys: Map<string, { fieldName: string; fieldType: ts.TypeNode }>
): ts.TypeNode {
	if (ts.isTypeReferenceNode(type) && ts.isIdentifier(type.typeName)) {
		const entityName = type.typeName.text;
		const primaryKeyInfo = entityPrimaryKeys.get(entityName);
		if (primaryKeyInfo) {
			return ts.factory.createTypeReferenceNode(ts.factory.createIdentifier(`schema.Partial${entityName}`), undefined);
		}
	}
	return type;
}

/**
 * Replace entity type references with inline primary key objects for deep references
 */
function replaceEntityTypeWithInlinePrimaryKey(
	type: ts.TypeNode,
	entityPrimaryKeys: Map<string, { fieldName: string; fieldType: ts.TypeNode }>
): ts.TypeNode {
	if (ts.isTypeReferenceNode(type) && ts.isIdentifier(type.typeName)) {
		const entityName = type.typeName.text;
		const primaryKeyInfo = entityPrimaryKeys.get(entityName);
		if (primaryKeyInfo) {
			return createPrimaryKeyObjectType(primaryKeyInfo);
		}
	}
	return type;
}

/**
 * Transform Collection<T> to Array<T> and replace entity types in generic arguments with inline primary key objects
 */
function transformCollectionType(
	type: ts.TypeNode,
	entityPrimaryKeys: Map<string, { fieldName: string; fieldType: ts.TypeNode }>
): ts.TypeNode {
	if (
		ts.isTypeReferenceNode(type) &&
		ts.isIdentifier(type.typeName) &&
		type.typeName.text === "Collection"
	) {
		if (type.typeArguments && type.typeArguments.length > 0) {
			// Replace entity types in the generic arguments with inline primary key objects for deep references
			const transformedTypeArgs = type.typeArguments.map((typeArg) => 
				replaceEntityTypeWithInlinePrimaryKey(typeArg, entityPrimaryKeys)
			);
			return ts.factory.createTypeReferenceNode(ts.factory.createIdentifier("Array"), transformedTypeArgs);
		} else {
			return ts.factory.createTypeReferenceNode(ts.factory.createIdentifier("Array"), type.typeArguments);
		}
	}
	return type;
}

/**
 * Transform a type node by replacing entities and collections
 */
function transformTypeNode(
	type: ts.TypeNode,
	entityPrimaryKeys: Map<string, { fieldName: string; fieldType: ts.TypeNode }>
): ts.TypeNode {
	// First try to replace Collection<T> with Array<T>
	const collectionTransformed = transformCollectionType(type, entityPrimaryKeys);
	if (collectionTransformed !== type) {
		return collectionTransformed;
	}
	
	// Then try to replace entity types with primary key objects
	return replaceEntityTypeWithPrimaryKey(collectionTransformed, entityPrimaryKeys);
}

/**
 * Collect entity classes and their primary key info
 */
function visitEntities(node: ts.Node, entityPrimaryKeys: Map<string, { fieldName: string; fieldType: ts.TypeNode }>): void {
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

			// Find the @PrimaryKey() property to get the field name and type
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

			if (primaryKeyProperty && ts.isPropertyDeclaration(primaryKeyProperty) && primaryKeyProperty.type && primaryKeyProperty.name && ts.isIdentifier(primaryKeyProperty.name)) {
				entityPrimaryKeys.set(className, {
					fieldName: primaryKeyProperty.name.text,
					fieldType: primaryKeyProperty.type
				});
			}
		}
	}

	ts.forEachChild(node, (childNode) => visitEntities(childNode, entityPrimaryKeys));
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
	entityPrimaryKeys: Map<string, { fieldName: string; fieldType: ts.TypeNode }>
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

							// Transform the type by replacing entities and collections
							type = transformTypeNode(type, entityPrimaryKeys);

							return ts.factory.createPropertySignature(undefined, propertyName, member.questionToken, type);
						}
						return null;
					})
					.filter((item): item is ts.PropertySignature => item !== null);

				// Create the main entity type
				const mainType = ts.factory.createTypeAliasDeclaration(
					[ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
					className,
					undefined,
					ts.factory.createTypeLiteralNode(propertySignatures)
				);

				// Create the partial type if this is an entity with a primary key
				const primaryKeyInfo = entityPrimaryKeys.get(className);
				if (primaryKeyInfo) {
					const partialType = createPartialEntityType(className, primaryKeyInfo, propertySignatures);
					return [mainType, partialType];
				}

				return mainType;
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

			// Transform type reference nodes (Collection<T> and entity types)
			if (ts.isTypeReferenceNode(node)) {
				return transformTypeNode(node, entityPrimaryKeys);
			}

			// Transform property signatures with entity types
			if (ts.isPropertySignature(node) && node.type) {
				const transformedType = transformTypeNode(node.type, entityPrimaryKeys);
				if (transformedType !== node.type) {
					return ts.factory.createPropertySignature(node.modifiers, node.name, node.questionToken, transformedType);
				}
			}

			return ts.visitEachChild(node, visitor, context);
		};

		return ts.visitNode(sourceFile, visitor) as ts.SourceFile;
	};
};
