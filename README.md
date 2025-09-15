# mikro-typebox

Generate validation schemas from Mikro-ORM entities. Supports TypeBox, Zod, Valibot, ArkType, Effect, io-ts, Yup, and more.

## Features

- 🏗️ **Entity Type Generation**: Converts Mikro-ORM entity classes to TypeScript types
- 🔄 **Multiple Validation Libraries**: Supports TypeBox, Zod, Valibot, ArkType, Effect, io-ts, Yup, and more
- 🎯 **Smart Type Resolution**: Automatically replaces entity references with their ID types
- 📦 **Collection Handling**: Converts `Collection<T>` to `Array<T>` with proper type mapping
- 🧹 **Code Cleanup**: Removes imports, decorators, and method calls from generated types

## Installation

```shell
npm install --save-dev mikro-typebox
```

## CLI Usage

The package includes a command-line interface for easy usage:

```shell
# Generate typebox schema from `./src/entities` to `./src/entity-validators.ts`
npx mikro-typebox generate

# Generate for Zod
npx mikro-typebox generate --target zod

# Specify entities directory and output file
npx mikro-typebox generate --target zod --entities ./src/models --output ./src/entity-validators.ts
```

### CLI Options

#### `generate` command

- `-e, --entities <path>`: Directory containing entity files (default: `./src/entities`)
- `-o, --output <file>`: Output file path (default: `./src/entity-validators.ts`)
- `--no-write`: Print the code to the console instead of writing to a file (default: writes to a file)
- `-t, --target <library>`: Target validation library (default: `typebox`)

### Supported Validation Libraries

- `typebox` - TypeBox (default)
- `zod` - Zod
- `valibot` - Valibot
- `arktype` - ArkType
- `effect` - Effect
- `io-ts` - io-ts
- `yup` - Yup
- `json-schema` - JSON Schema
- `javascript` - JavaScript
- `typescript` - TypeScript
- `value` - Value

## Programmatic Usage

You can also use the API to generate validation schemas programmatically.

### `generateEntityValidator(options)`

Generates validation schemas from Mikro-ORM entities.

#### Parameters

- `options.entitiesDir` (optional): Directory containing the entity files (default: `"./src/entities"`)
- `options.outputFile` (optional): File path to write the generated code (default: `"./src/entity-validators.ts"`)
- `options.write` (optional): Whether to write the code to a file (default: `true`)
- `options.targetValidationLibrary` (optional): Target validation library (default: `"typebox"`)


### `generateEntityTypes(code, entityIdTypes)`

Converts Mikro-ORM entity code to TypeScript types.

#### Parameters

- `code`: The entity code as a string
- `entityIdTypes` (optional): Map of entity names to their ID types

### `generateEntityFileTypes(fileContents)`

Processes multiple entity files and generates types with proper entity ID replacement.

#### Parameters

- `fileContents`: Array of entity file contents as strings

## Usage Examples

```typescript
import { generateEntityValidator } from 'mikro-typebox';

// Generate for TypeBox
await generateEntityValidator({
  entitiesDir: './src/entities',
  outputFile: './src/validators.ts',
  write: true
});

// Generate for Zod
const zodCode = await generateEntityValidator({
  entitiesDir: './src/entities',
  targetValidationLibrary: 'zod',
  outputFile: './src/zod-validators.ts',
  write: true
});


// Generate for Valibot
const valibotCode = await generateEntityValidator({
  entitiesDir: './src/entities',
  targetValidationLibrary: 'valibot',
  outputFile: './src/valibot-validators.ts',
  write: true
});
```

### Working with Entity Files

Given a Mikro-ORM entity file like this:

```typescript
// src/entities/User.ts
import { Entity, PrimaryKey, Property, Collection, OneToMany } from '@mikro-orm/core';
import { Book } from './Book';

@Entity()
export class User {
  @PrimaryKey()
  id!: number;

  @Property()
  name!: string;

  @Property()
  email!: string;

  @OneToMany(() => Book, book => book.author)
  books = new Collection<Book>(this);

  constructor({ name, email }: User) {
    this.name = name;
    this.email = email;
  }
}

// src/entities/Book.ts
import { Entity, PrimaryKey, Property, ManyToOne } from '@mikro-orm/core';
import { User } from './User';

@Entity()
export class Book {
  @PrimaryKey()
  id!: number;

  @Property()
  title!: string;

  @ManyToOne(() => User)
  author!: User;

  constructor({ title, author }: Book) {
    this.title = title;
    this.author = author;
  }
}
```

And then generate validation schemas (e.g., with TypeBox):

```typescript
import { Type, Static } from '@sinclair/typebox'

export namespace schema {
    export type Book = Static<typeof Book>
    export const Book = Type.Object({
        id: Type.Number(),
        title: Type.String(),
        author: Type.Object({
            id: Type.Number()
        })
    }, { "$id": "schema.Book" })

    export type User = Static<typeof User>
    export const User = Type.Object({
        id: Type.Number(),
        name: Type.String(),
        email: Type.String(),
        books: Type.Any()
    }, { "$id": "schema.User" })

}
```

or for Zod

```typescript
import { z } from 'zod'

export type schema_Book = z.infer<typeof schema_Book>
export const schema_Book = z.object({
    id: z.number(),
    title: z.string(),
    author: z.object({})
})

export type schema_User = z.infer<typeof schema_User>
export const schema_User = z.object({
    id: z.number(),
    name: z.string(),
    email: z.string(),
    books: z.any()
})
```

### Programmatic Usage

```typescript
import { generateEntityTypes, generateEntityFileTypes } from 'mikro-typebox';

// Process a single entity file
const entityCode = `
import { Entity, PrimaryKey, Property } from '@mikro-orm/core';

@Entity()
export class Product {
  @PrimaryKey()
  id!: number;

  @Property()
  name!: string;
}
`;

const types = generateEntityTypes(entityCode);
console.log(types);
// Output: export type Product = { id: number; name: string; };

// Process multiple entity files
const fileContents = [entityCode, anotherEntityCode];
const allTypes = generateEntityFileTypes(fileContents);
```

## How It Works

1. **Entity Discovery**: Scans entity files for classes decorated with `@Entity()`
2. **Type Extraction**: Extracts property types and relationships from entity classes
3. **ID Type Resolution**: Replaces entity references with their primary key types
4. **Collection Conversion**: Converts `Collection<T>` to `Array<T>` with proper type mapping
5. **Code Cleanup**: Removes Mikro-ORM specific imports, decorators, and method calls
6. **Schema Generation**: Converts TypeScript types to validation schemas using the target library

## License

Apache-2.0, Copyright (c) 2025 Amin Yara

