import * as ts from "typescript/unstable/ast"
import * as tsFactory from "typescript/unstable/ast/factory"
import {
  type EntityParseOptions,
  replaceEntityTypeWithPartialType,
  replaceEntityTypeWithPrimaryKey,
  transformTypeNode,
} from "./prepare.js"

// TODO: use the built-in type checker to infer the type

/**
 * Infer type from property initializer by analyzing the AST This handles common patterns like Collection<T> and other
 * generic types
 */
export function inferTypeFromInitializer(
  initializer: ts.Expression,
  entityPrimaryKeys: Map<string, { fieldName: string; fieldType: ts.TypeNode }>,
  options: EntityParseOptions,
  circularReferences: Map<string, Set<string>> = new Map(),
  currentEntity?: string,
): ts.TypeNode | undefined {
  // Handle new Collection<T>(this) pattern
  if (ts.isNewExpression(initializer)) {
    const expression = initializer.expression
    if (
      ts.isIdentifier(expression) &&
      expression.text === "Collection" &&
      initializer.typeArguments &&
      initializer.typeArguments.length > 0
    ) {
      const genericType = initializer.typeArguments[0]
      if (!genericType) {
        return undefined
      }

      // Transform the generic type based on the usePartialTypes option
      const transformedType = options.usePartialTypes
        ? replaceEntityTypeWithPartialType(genericType, entityPrimaryKeys, circularReferences, currentEntity)
        : replaceEntityTypeWithPrimaryKey(genericType, entityPrimaryKeys)

      // Return Collection<T> | Array<T> for compatibility
      return tsFactory.createUnionTypeNode([
        tsFactory.createTypeReferenceNode(tsFactory.createIdentifier("Collection"), [transformedType]),
        tsFactory.createTypeReferenceNode(tsFactory.createIdentifier("Array"), [transformedType]),
      ])
    }
  }

  // Handle other generic type patterns that might be inferred
  if (ts.isTypeReferenceNode(initializer)) {
    // This handles cases where the initializer is already a type reference
    return transformTypeNode(initializer, entityPrimaryKeys, options, circularReferences, currentEntity)
  }

  // Handle array literals
  if (ts.isArrayLiteralExpression(initializer)) {
    // For array literals, we can infer the element type from the first element
    if (initializer.elements.length > 0) {
      const firstElement = initializer.elements[0]
      if (firstElement && ts.isObjectLiteralExpression(firstElement)) {
        // This is likely an array of objects, we can't infer the exact type
        return tsFactory.createTypeReferenceNode(tsFactory.createIdentifier("Array"), [
          tsFactory.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword),
        ])
      }
    }
    return tsFactory.createTypeReferenceNode(tsFactory.createIdentifier("Array"), [
      tsFactory.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword),
    ])
  }

  return undefined
}
