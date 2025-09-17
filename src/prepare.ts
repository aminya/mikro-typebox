import * as ts from "typescript";
import { inferTypeFromInitializer } from "./infer.js";

export interface EntityParseOptions {
  /**
   * When true, creates partial types (PartialEntityName) with required ID and optional other properties.
   * When false, replaces entity references with inline primary key objects to avoid circular references.
   */
  usePartialTypes?: boolean;
}

/**
 * Tracks entity relations to detect circular references
 */
interface EntityRelation {
  from: string;
  to: string;
  propertyName: string;
  isCollection: boolean;
}


/**
 * Sort entities by dependency order, handling circular dependencies gracefully
 * Returns entities in order from least dependent to most dependent
 */
function sortEntitiesByDependency(
  entityRelations: EntityRelation[],
  entityNames: Set<string>,
): string[] {
  const inDegree = new Map<string, number>();
  const adjacencyList = new Map<string, string[]>();
  
  // Initialize in-degree and adjacency list
  for (const entityName of entityNames) {
    inDegree.set(entityName, 0);
    adjacencyList.set(entityName, []);
  }
  
  // Build the graph
  for (const relation of entityRelations) {
    if (entityNames.has(relation.from) && entityNames.has(relation.to)) {
      // Add edge from 'to' to 'from' (dependency: 'from' depends on 'to')
      const dependents = adjacencyList.get(relation.to) || [];
      dependents.push(relation.from);
      adjacencyList.set(relation.to, dependents);
      
      // Increment in-degree of the dependent entity
      inDegree.set(relation.from, (inDegree.get(relation.from) || 0) + 1);
    }
  }
  
  // Try topological sort first
  const queue: string[] = [];
  for (const [entity, degree] of inDegree) {
    if (degree === 0) {
      queue.push(entity);
    }
  }
  
  const result: string[] = [];
  const workingInDegree = new Map(inDegree);
  
  // Process entities in topological order
  while (queue.length > 0) {
    const current = queue.shift()!;
    result.push(current);
    
    // Process all entities that depend on current
    const dependents = adjacencyList.get(current) || [];
    for (const dependent of dependents) {
      const newDegree = (workingInDegree.get(dependent) || 0) - 1;
      workingInDegree.set(dependent, newDegree);
      
      if (newDegree === 0) {
        queue.push(dependent);
      }
    }
  }
  
  // If we couldn't process all entities due to circular dependencies,
  // use a heuristic: sort remaining entities by in-degree (fewer dependencies first)
  // For entities with the same in-degree, use a more sophisticated tiebreaker
  const remaining = Array.from(entityNames).filter(name => !result.includes(name));
  if (remaining.length > 0) {
    remaining.sort((a, b) => {
      const degreeA = inDegree.get(a) || 0;
      const degreeB = inDegree.get(b) || 0;
      
      // Primary sort: by in-degree (fewer dependencies first)
      if (degreeA !== degreeB) {
        return degreeA - degreeB;
      }
      
      // Secondary sort: by number of entities that this entity depends on
      // (entities with fewer outgoing dependencies first)
      const outgoingA = entityRelations.filter(r => r.from === a).length;
      const outgoingB = entityRelations.filter(r => r.from === b).length;
      if (outgoingA !== outgoingB) {
        return outgoingA - outgoingB; // Fewer outgoing dependencies first
      }
      
      // Tertiary sort: by name for consistency
      return a.localeCompare(b);
    });
    result.push(...remaining);
  }
  
  return result;
}

/**
 * Detect circular references in entity relations
 */
function detectCircularReferences(
  entityRelations: EntityRelation[],
  entityNames: Set<string>,
): Map<string, Set<string>> {
  const circularReferences = new Map<string, Set<string>>();
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  const allCycles: string[][] = [];

  function dfs(entityName: string, path: string[]): void {
    if (recursionStack.has(entityName)) {
      // Found a circular reference
      const cycleStart = path.indexOf(entityName);
      const cycle = path.slice(cycleStart);
      cycle.push(entityName); // Complete the cycle
      
      // Store the cycle for later processing
      allCycles.push(cycle);
      return;
    }

    if (visited.has(entityName)) {
      return;
    }

    visited.add(entityName);
    recursionStack.add(entityName);

    // Find all relations from this entity
    const relations = entityRelations.filter(rel => rel.from === entityName);
    for (const relation of relations) {
      if (entityNames.has(relation.to)) {
        dfs(relation.to, [...path, entityName]);
      }
    }

    recursionStack.delete(entityName);
  }

  // Check for cycles starting from each entity
  for (const entityName of entityNames) {
    if (!visited.has(entityName)) {
      dfs(entityName, []);
    }
  }

  // Process cycles to break the minimum number of relations
  const brokenRelations = new Set<string>();
  
  // Sort cycles by length (longest first) to prioritize breaking longer cycles
  allCycles.sort((a, b) => b.length - a.length);
  
  for (const cycle of allCycles) {
    // Check if this cycle is already broken by a previously broken relation
    let isCycleBroken = false;
    for (let i = 0; i < cycle.length - 1; i++) {
      const from = cycle[i];
      const to = cycle[i + 1];
      const relationKey = `${from}->${to}`;
      if (brokenRelations.has(relationKey)) {
        isCycleBroken = true;
        break;
      }
    }
    
    if (!isCycleBroken && cycle.length >= 2) {
      // Break the last relation in the cycle
      const from = cycle[cycle.length - 2];
      const to = cycle[cycle.length - 1];
      if (from && to && from !== to) {
        const relationKey = `${from}->${to}`;
        brokenRelations.add(relationKey);
        
        if (!circularReferences.has(from)) {
          circularReferences.set(from, new Set());
        }
        circularReferences.get(from)!.add(to);
      }
    }
  }

  return circularReferences;
}

/**
 * Collect entity relations from a source file
 */
function collectEntityRelations(
  node: ts.Node,
  entityRelations: EntityRelation[],
  entityNames: Set<string>,
): void {
  if (ts.isClassDeclaration(node) && node.name) {
    const hasEntityDecorator = node.modifiers?.some(
      (modifier) =>
        ts.isDecorator(modifier) &&
        ts.isCallExpression(modifier.expression) &&
        ts.isIdentifier(modifier.expression.expression) &&
        modifier.expression.expression.text === "Entity",
    );

    if (hasEntityDecorator) {
      const className = node.name.text;
      entityNames.add(className);

      // Find all property declarations with relation decorators
      for (const member of node.members) {
        if (ts.isPropertyDeclaration(member) && member.name && ts.isIdentifier(member.name)) {
          const propertyName = member.name.text;
          const propertyType = member.type;

          // Check for ManyToOne or OneToMany decorators
          const hasManyToOne = member.modifiers?.some(
            (modifier) =>
              ts.isDecorator(modifier) &&
              ts.isCallExpression(modifier.expression) &&
              ts.isIdentifier(modifier.expression.expression) &&
              modifier.expression.expression.text === "ManyToOne",
          );

          const hasOneToMany = member.modifiers?.some(
            (modifier) =>
              ts.isDecorator(modifier) &&
              ts.isCallExpression(modifier.expression) &&
              ts.isIdentifier(modifier.expression.expression) &&
              modifier.expression.expression.text === "OneToMany",
          );

          if (hasManyToOne || hasOneToMany) {
            // Extract the target entity name from the type or decorator arguments
            let targetEntityName: string | null = null;
            
            // First try to get from decorator arguments
            if (hasManyToOne) {
              const manyToOneDecorator = member.modifiers?.find(
                (modifier) =>
                  ts.isDecorator(modifier) &&
                  ts.isCallExpression(modifier.expression) &&
                  ts.isIdentifier(modifier.expression.expression) &&
                  modifier.expression.expression.text === "ManyToOne"
              );
              if (manyToOneDecorator && 'expression' in manyToOneDecorator && ts.isCallExpression(manyToOneDecorator.expression) && 
                  manyToOneDecorator.expression.arguments.length > 0) {
                const firstArg = manyToOneDecorator.expression.arguments[0];
                if (firstArg && ts.isStringLiteral(firstArg)) {
                  targetEntityName = firstArg.text;
                }
              }
            }
            
            if (hasOneToMany) {
              const oneToManyDecorator = member.modifiers?.find(
                (modifier) =>
                  ts.isDecorator(modifier) &&
                  ts.isCallExpression(modifier.expression) &&
                  ts.isIdentifier(modifier.expression.expression) &&
                  modifier.expression.expression.text === "OneToMany"
              );
              if (oneToManyDecorator && 'expression' in oneToManyDecorator && ts.isCallExpression(oneToManyDecorator.expression) && 
                  oneToManyDecorator.expression.arguments.length > 0) {
                const firstArg = oneToManyDecorator.expression.arguments[0];
                if (firstArg && ts.isStringLiteral(firstArg)) {
                  targetEntityName = firstArg.text;
                }
              }
            }
            
            // Fallback to type annotation if not found in decorator
            if (!targetEntityName) {
              if (propertyType && ts.isTypeReferenceNode(propertyType) && ts.isIdentifier(propertyType.typeName)) {
                targetEntityName = propertyType.typeName.text;
              } else if (member.initializer && ts.isNewExpression(member.initializer)) {
                // Handle Collection<T> initializers
                const expression = member.initializer.expression;
                if (ts.isIdentifier(expression) && expression.text === "Collection" &&
                    member.initializer.typeArguments && member.initializer.typeArguments.length > 0) {
                  const genericType = member.initializer.typeArguments[0];
                  if (genericType && ts.isTypeReferenceNode(genericType) && ts.isIdentifier(genericType.typeName)) {
                    targetEntityName = genericType.typeName.text;
                  }
                }
              }
            }

            if (targetEntityName && entityNames.has(targetEntityName)) {
              entityRelations.push({
                from: className,
                to: targetEntityName,
                propertyName,
                isCollection: !!hasOneToMany,
              });
            }
          }
        }
      }
    }
  }

  ts.forEachChild(node, (childNode) =>
    collectEntityRelations(childNode, entityRelations, entityNames),
  );
}

/**
 * Process multiple entity files and generate types with proper entity ID replacement
 */
export function generateEntityFileTypes(
  fileContents: string[],
  options: EntityParseOptions = {},
): string {
  // First pass: collect all entities and their primary key info from all files
  const entityPrimaryKeys = new Map<
    string,
    { fieldName: string; fieldType: ts.TypeNode }
  >();
  const entityNames = new Set<string>();
  const entityRelations: EntityRelation[] = [];
  const allCode = fileContents.join("\n");
  const sourceFile = ts.createSourceFile(
    "temp.ts",
    allCode,
    ts.ScriptTarget.Latest,
    true,
  );

  // Collect all entities from all files
  visitEntities(sourceFile, entityPrimaryKeys, entityNames);
  
  // Then collect entity relations for circular reference detection
  collectEntityRelations(sourceFile, entityRelations, entityNames);
  
  // Detect circular references
  const circularReferences = detectCircularReferences(entityRelations, entityNames);

  // Create a map from entity names to their file contents for reordering
  const entityToFileMap = new Map<string, string>();
  const tempSourceFiles = fileContents.map((code, index) => 
    ts.createSourceFile(`temp${index}.ts`, code, ts.ScriptTarget.Latest, true)
  );
  
  // Map each entity to its source file content
  for (let i = 0; i < tempSourceFiles.length; i++) {
    const tempSourceFile = tempSourceFiles[i];
    const originalCode = fileContents[i];
    
    if (tempSourceFile && originalCode) {
      // Find entities in this file
      const fileEntityNames = new Set<string>();
      visitEntities(tempSourceFile, new Map(), fileEntityNames);
      
      // Map each entity to this file's content
      for (const entityName of fileEntityNames) {
        entityToFileMap.set(entityName, originalCode);
      }
    }
  }

  // Sort entities by dependency order
  const sortedEntityNames = sortEntitiesByDependency(entityRelations, entityNames);
  
  // Reorder file contents based on dependency order
  const reorderedFileContents: string[] = [];
  const processedFiles = new Set<string>();
  
  for (const entityName of sortedEntityNames) {
    const fileContent = entityToFileMap.get(entityName);
    if (fileContent && !processedFiles.has(fileContent)) {
      reorderedFileContents.push(fileContent);
      processedFiles.add(fileContent);
    }
  }
  
  // Add any remaining files that weren't processed (shouldn't happen in normal cases)
  for (const fileContent of fileContents) {
    if (!processedFiles.has(fileContent)) {
      reorderedFileContents.push(fileContent);
    }
  }

  // Second pass: process each file with the complete entity map and circular reference info
  const generatedTypes = reorderedFileContents
    .map((code) => generateEntityTypes(code, entityPrimaryKeys, options, circularReferences))
    .join("\n");

  // Wrap the generated types in a namespace schema with Collection type definition
  return `export namespace schema {
export type Collection<T> = { [k: number]: T; };

${generatedTypes}
}`;
}

/**
 * Cleanup the code to remove the imports and the calls to the imported symbols
 */
export function generateEntityTypes(
  code: string,
  entityPrimaryKeys: Map<
    string,
    { fieldName: string; fieldType: ts.TypeNode }
  > = new Map(),
  options: EntityParseOptions = {},
  circularReferences: Map<string, Set<string>> = new Map(),
): string {
  const sourceFile = ts.createSourceFile(
    "temp.ts",
    code,
    ts.ScriptTarget.Latest,
    true,
  );

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
    (ctx) =>
      transformer(
        ctx,
        importNodes,
        callExpressionsToRemove,
        entityPrimaryKeys,
        options,
        circularReferences,
      ),
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
function visitImports(
  node: ts.Node,
  importNodes: Set<ts.Node>,
  importedSymbols: Set<string>,
): void {
  if (ts.isImportDeclaration(node)) {
    const moduleSpecifier = node.moduleSpecifier;

    if (ts.isStringLiteral(moduleSpecifier)) {
      const importPath = moduleSpecifier.text;

      // Mark ALL imports for removal (both regular and type imports)
      importNodes.add(node);

      // collect symbols from non-relative imports
      if (!importPath.includes("./") && node.importClause) {
        // collect named imports (both regular and type)
        if (
          node.importClause.namedBindings &&
          ts.isNamedImports(node.importClause.namedBindings)
        ) {
          for (const element of node.importClause.namedBindings.elements) {
            importedSymbols.add(element.name.text);
          }
        }

        // collect namespace imports
        if (
          node.importClause.namedBindings &&
          ts.isNamespaceImport(node.importClause.namedBindings)
        ) {
          importedSymbols.add(node.importClause.namedBindings.name.text);
        }

        // collect default imports
        if (node.importClause.name) {
          importedSymbols.add(node.importClause.name.text);
        }
      }
    }
  }

  ts.forEachChild(node, (childNode) =>
    visitImports(childNode, importNodes, importedSymbols),
  );
}

/**
 * Find calls to imported symbols
 */
function visitCalls(
  node: ts.Node,
  importedSymbols: Set<string>,
  callExpressionsToRemove: Set<ts.Node> = new Set(),
): void {
  if (ts.isCallExpression(node)) {
    const expression = node.expression;
    if (ts.isIdentifier(expression) && importedSymbols.has(expression.text)) {
      callExpressionsToRemove.add(node);
    }
  }

  ts.forEachChild(node, (node) =>
    visitCalls(node, importedSymbols, callExpressionsToRemove),
  );
}

/**
 * Create a named partial type (Partial<Entity>) with required ID and optional other properties
 */
function createPartialEntityType(
  entityName: string,
  primaryKeyInfo: { fieldName: string; fieldType: ts.TypeNode },
  allProperties: ts.PropertySignature[],
): ts.TypeAliasDeclaration {
  // Create the partial type with required ID and optional other properties
  const partialProperties = allProperties.map((prop) => {
    if (
      ts.isPropertySignature(prop) &&
      ts.isIdentifier(prop.name) &&
      prop.name.text === primaryKeyInfo.fieldName
    ) {
      // Keep the primary key as required
      return prop;
    } else {
      // Make all other properties optional
      return ts.factory.createPropertySignature(
        prop.modifiers,
        prop.name,
        ts.factory.createToken(ts.SyntaxKind.QuestionToken), // Add ? to make optional
        prop.type,
      );
    }
  });

  return ts.factory.createTypeAliasDeclaration(
    [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
    `Partial${entityName}`,
    undefined,
    ts.factory.createTypeLiteralNode(partialProperties),
  );
}

/**
 * Create an inline object type with just the primary key field for deep references
 */
function createPrimaryKeyObjectType(primaryKeyInfo: {
  fieldName: string;
  fieldType: ts.TypeNode;
}): ts.TypeLiteralNode {
  return ts.factory.createTypeLiteralNode([
    ts.factory.createPropertySignature(
      undefined,
      primaryKeyInfo.fieldName,
      undefined,
      primaryKeyInfo.fieldType,
    ),
  ]);
}

/**
 * Replace entity type references with partial entity types (when usePartialTypes is true)
 */
export function replaceEntityTypeWithPartialType(
  type: ts.TypeNode,
  entityPrimaryKeys: Map<string, { fieldName: string; fieldType: ts.TypeNode }>,
  circularReferences: Map<string, Set<string>> = new Map(),
  currentEntity?: string,
): ts.TypeNode {
  if (ts.isTypeReferenceNode(type) && ts.isIdentifier(type.typeName)) {
    const entityName = type.typeName.text;
    const primaryKeyInfo = entityPrimaryKeys.get(entityName);
    if (primaryKeyInfo) {
      // Check if this would create a circular reference
      if (currentEntity && circularReferences.has(currentEntity) && 
          circularReferences.get(currentEntity)!.has(entityName)) {
        // Break the circular reference by inlining the primary key object
        return createPrimaryKeyObjectType(primaryKeyInfo);
      }
      
      return ts.factory.createTypeReferenceNode(
        ts.factory.createIdentifier(`schema.Partial${entityName}`),
        undefined,
      );
    }
  }
  return type;
}

/**
 * Replace entity type references with object types containing primary key (when usePartialTypes is false)
 */
export function replaceEntityTypeWithPrimaryKey(
  type: ts.TypeNode,
  entityPrimaryKeys: Map<string, { fieldName: string; fieldType: ts.TypeNode }>,
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
 * Transform Collection<T> to Array<T> and replace entity types in generic arguments based on usePartialTypes option
 */
function transformCollectionType(
  type: ts.TypeNode,
  entityPrimaryKeys: Map<string, { fieldName: string; fieldType: ts.TypeNode }>,
  options: EntityParseOptions,
  circularReferences: Map<string, Set<string>> = new Map(),
  currentEntity?: string,
): ts.TypeNode {
  if (
    ts.isTypeReferenceNode(type) &&
    ts.isIdentifier(type.typeName) &&
    type.typeName.text === "Collection"
  ) {
    if (type.typeArguments !== undefined && type.typeArguments.length > 0) {
      // Replace entity types in the generic arguments based on the usePartialTypes option
      const transformedTypeArgs = type.typeArguments.map((typeArg) => {
        return options.usePartialTypes ?
          replaceEntityTypeWithPartialType(typeArg, entityPrimaryKeys, circularReferences, currentEntity) : 
          replaceEntityTypeWithPrimaryKey(typeArg, entityPrimaryKeys);
      });
      return ts.factory.createUnionTypeNode([
        ts.factory.createTypeReferenceNode(
          ts.factory.createIdentifier("Collection"),
          transformedTypeArgs,
        ),
        ts.factory.createTypeReferenceNode(
          ts.factory.createIdentifier("Array"),
          transformedTypeArgs,
        ),
      ]);
    } else {
      return ts.factory.createUnionTypeNode([
        ts.factory.createTypeReferenceNode(
          ts.factory.createIdentifier("Collection"),
          type.typeArguments,
        ),
        ts.factory.createTypeReferenceNode(
          ts.factory.createIdentifier("Array"),
          type.typeArguments,
        ),
      ]);
    }
  }
  return type;
}

/**
 * Transform a type node by replacing entities and collections
 */
export function transformTypeNode(
  type: ts.TypeNode,
  entityPrimaryKeys: Map<string, { fieldName: string; fieldType: ts.TypeNode }>,
  options: EntityParseOptions,
  circularReferences: Map<string, Set<string>> = new Map(),
  currentEntity?: string,
): ts.TypeNode {
  // First try to replace Collection<T> with Array<T>
  const collectionTransformed = transformCollectionType(
    type,
    entityPrimaryKeys,
    options,
    circularReferences,
    currentEntity,
  );
  if (collectionTransformed !== type) {
    return collectionTransformed;
  }

  // Then try to replace entity types based on the option
  if (options.usePartialTypes) {
    return replaceEntityTypeWithPartialType(
      collectionTransformed,
      entityPrimaryKeys,
      circularReferences,
      currentEntity,
    );
  } else {
    return replaceEntityTypeWithPrimaryKey(
      collectionTransformed,
      entityPrimaryKeys,
    );
  }
}

/**
 * Collect entity classes and their primary key info
 */
function visitEntities(
  node: ts.Node,
  entityPrimaryKeys: Map<string, { fieldName: string; fieldType: ts.TypeNode }>,
  entityNames?: Set<string>,
): void {
  if (ts.isClassDeclaration(node) && node.name) {
    // Check if the class has @Entity() decorator
    const hasEntityDecorator = node.modifiers?.some(
      (modifier) =>
        ts.isDecorator(modifier) &&
        ts.isCallExpression(modifier.expression) &&
        ts.isIdentifier(modifier.expression.expression) &&
        modifier.expression.expression.text === "Entity",
    );

    if (hasEntityDecorator) {
      const className = node.name.text;
      
      // Add to entity names set if provided
      if (entityNames) {
        entityNames.add(className);
      }

      // Find the @PrimaryKey() property to get the field name and type
      const primaryKeyProperty = node.members.find(
        (member) =>
          ts.isPropertyDeclaration(member) &&
          member.modifiers?.some(
            (modifier) =>
              ts.isDecorator(modifier) &&
              ts.isCallExpression(modifier.expression) &&
              ts.isIdentifier(modifier.expression.expression) &&
              modifier.expression.expression.text === "PrimaryKey",
          ),
      );

      if (
        primaryKeyProperty &&
        ts.isPropertyDeclaration(primaryKeyProperty) &&
        primaryKeyProperty.type &&
        primaryKeyProperty.name &&
        ts.isIdentifier(primaryKeyProperty.name)
      ) {
        entityPrimaryKeys.set(className, {
          fieldName: primaryKeyProperty.name.text,
          fieldType: primaryKeyProperty.type,
        });
      }
    }
  }

  ts.forEachChild(node, (childNode) =>
    visitEntities(childNode, entityPrimaryKeys, entityNames),
  );
}

/**
 * Create a transformer to
 * - remove the identified nodes
 * - convert class declarations to type aliases
 * - remove variable declarations with initializers
 * - remove expression statements (like method calls and assignments)
 * - remove definite assignment assertions (!:)
 * - replace Collection<T> with Array<T>
 * - create partial types when usePartialTypes is true
 */
const transformer = (
  context: ts.TransformationContext,
  importNodes: Set<ts.Node>,
  callExpressionsToRemove: Set<ts.Node>,
  entityPrimaryKeys: Map<string, { fieldName: string; fieldType: ts.TypeNode }>,
  options: EntityParseOptions,
  circularReferences: Map<string, Set<string>>,
) => {
  return (sourceFile: ts.SourceFile) => {
    const visitor = (node: ts.Node, currentEntity?: string): ts.Node | ts.Node[] | undefined => {
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
            if (
              ts.isPropertyDeclaration(member) &&
              member.name &&
              ts.isIdentifier(member.name)
            ) {
              const propertyName = member.name.text;
              let type = member.type;

              // If no explicit type annotation, try to infer from initializer
              if (!type && member.initializer) {
                type = inferTypeFromInitializer(
                  member.initializer,
                  entityPrimaryKeys,
                  options,
                  circularReferences,
                  className,
                );
              }

              // Fallback to any if we still don't have a type
              if (!type) {
                type = ts.factory.createKeywordTypeNode(
                  ts.SyntaxKind.AnyKeyword,
                );
              }

              // Transform the type by replacing entities and collections
              type = transformTypeNode(type, entityPrimaryKeys, options, circularReferences, className);

              return ts.factory.createPropertySignature(
                undefined,
                propertyName,
                member.questionToken,
                type,
              );
            }
            return null;
          })
          .filter((item): item is ts.PropertySignature => item !== null);

        // Create the main entity type
        const mainType = ts.factory.createTypeAliasDeclaration(
          [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
          className,
          undefined,
          ts.factory.createTypeLiteralNode(propertySignatures),
        );

        // Create the partial type if this is an entity with a primary key and usePartialTypes is true
        if (options.usePartialTypes) {
          const primaryKeyInfo = entityPrimaryKeys.get(className);
          if (primaryKeyInfo) {
            const partialType = createPartialEntityType(
              className,
              primaryKeyInfo,
              propertySignatures,
            );
            return [mainType, partialType];
          }
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
          node.initializer,
        );
      }

      // Transform type reference nodes (Collection<T> and entity types)
      if (ts.isTypeReferenceNode(node)) {
        return transformTypeNode(node, entityPrimaryKeys, options, circularReferences, currentEntity);
      }

      // Transform property signatures with entity types
      if (ts.isPropertySignature(node) && node.type) {
        const transformedType = transformTypeNode(
          node.type,
          entityPrimaryKeys,
          options,
          circularReferences,
          currentEntity,
        );
        if (transformedType !== node.type) {
          return ts.factory.createPropertySignature(
            node.modifiers,
            node.name,
            node.questionToken,
            transformedType,
          );
        }
      }

      return ts.visitEachChild(node, (childNode) => visitor(childNode, currentEntity), context);
    };

    return ts.visitNode(sourceFile, visitor) as ts.SourceFile;
  };
};
