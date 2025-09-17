import * as ts from "typescript";

/**
 * Postprocesses generated code to detect redefined enums with Enum<OriginalName> pattern
 * and replace them with imports of the original enums aliased as Enum<OriginalName>
 */
export function postprocessEnums(
    code: string,
    enumMap: Map<string, string>
): string {
    const sourceFile = ts.createSourceFile(
        "temp.ts",
        code,
        ts.ScriptTarget.Latest,
        true,
    );

    // Collect enum definitions and their original names
    const enumDefinitions = new Map<string, string>();
    const enumUsages = new Map<string, string>();

    // First pass: collect enum definitions and usages
    const visitor = (node: ts.Node) => {
        // Find enum declarations with Enum<OriginalName> pattern
        if (ts.isEnumDeclaration(node) && node.name) {
            const enumName = node.name.text;
            if (enumName.startsWith("Enum")) {
                const originalName = enumName.substring(4); // Remove "Enum" prefix
                enumDefinitions.set(enumName, originalName);
            }
        }

        // Find Type.Enum() calls that reference the redefined enums
        if (ts.isCallExpression(node) &&
            ts.isPropertyAccessExpression(node.expression) &&
            ts.isIdentifier(node.expression.expression) &&
            node.expression.expression.text === "Type" &&
            node.expression.name.text === "Enum" &&
            node.arguments.length === 1 &&
            node.arguments[0] &&
            ts.isIdentifier(node.arguments[0])) {
            const enumRef = node.arguments[0].text;
            if (enumRef.startsWith("Enum")) {
                const originalName = enumRef.substring(4);
                enumUsages.set(enumRef, originalName);
            }
        }

        ts.forEachChild(node, visitor);
    };

    visitor(sourceFile);

    if (enumDefinitions.size === 0) {
        return code; // No enums to process
    }

    // Generate import statements for the original enums
    const imports: string[] = [];
    const processedEnums = new Set<string>();

    for (const [enumName, originalName] of enumDefinitions) {
        if (!processedEnums.has(originalName)) {
            // Use the enum map to find the correct import path
            const enumPath = enumMap.get(originalName);
            const importPath = enumPath ?? "./entities";
            imports.push(`import { ${originalName} as ${enumName} } from "${importPath}";`);
            processedEnums.add(originalName);
        }
    }

    // Remove the redefined enum declarations and replace Type.Enum() calls
    const transformer = (context: ts.TransformationContext) => {
        return (sourceFile: ts.SourceFile) => {
            const visitor = (node: ts.Node): ts.Node | undefined => {
                // Remove redefined enum declarations
                if (ts.isEnumDeclaration(node) && node.name) {
                    const enumName = node.name.text;
                    if (enumDefinitions.has(enumName)) {
                        return undefined; // Remove the enum declaration
                    }
                }

                return ts.visitEachChild(node, visitor, context);
            };

            return ts.visitNode(sourceFile, visitor) as ts.SourceFile;
        };
    };

    // Apply the transformation
    const result = ts.transform(sourceFile, [transformer]);
    const transformedSourceFile = result.transformed[0];
    result.dispose();

    if (!transformedSourceFile) {
        return code;
    }

    // Generate the final code with imports
    const transformedCode = ts.createPrinter().printFile(transformedSourceFile);

    // Insert imports at the top of the file
    const importSection = imports.join("\n") + "\n\n";
    return importSection + transformedCode;
}
