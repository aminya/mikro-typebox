# mikro-typebox

A TypeScript library that generates validation schemas from Mikro-ORM entities. It converts Mikro-ORM entity classes into TypeScript types and then generates validation schemas using various validation libraries like TypeBox, Zod, Valibot, and more.

## Features

- 🏗️ **Entity Type Generation**: Converts Mikro-ORM entity classes to TypeScript types
- 🔄 **Multiple Validation Libraries**: Supports TypeBox, Zod, Valibot, ArkType, Effect, io-ts, Yup, and more
- 🎯 **Smart Type Resolution**: Automatically replaces entity references with their ID types
- 📦 **Collection Handling**: Converts `Collection<T>` to `Array<T>` with proper type mapping
- 🧹 **Code Cleanup**: Removes imports, decorators, and method calls from generated types

## Installation

```bash
npm install --save-dev mikro-typebox
```

## API Reference

### `generateEntityValidator(options)`

Generates validation schemas from Mikro-ORM entities.

#### Parameters

- `options.entitiesDir` (optional): Directory containing the entity files (default: `"./src/entities"`)
- `options.outputFile` (optional): File path to write the generated code
- `options.targetValidationLibrary` (optional): Target validation library (default: `"typebox"`)

#### Supported Validation Libraries

- `"typebox"` - TypeBox (default)
- `"zod"` - Zod
- `"valibot"` - Valibot
- `"arktype"` - ArkType
- `"effect"` - Effect
- `"io-ts"` - io-ts
- `"yup"` - Yup
- `"json-schema"` - JSON Schema
- `"javascript"` - JavaScript
- `"typescript"` - TypeScript
- `"value"` - Value

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

### Basic Usage with TypeBox

```typescript
import { generateEntityValidator } from 'mikro-typebox';

// Generate TypeBox schemas from entities
const validatorCode = await generateEntityValidator({
  entitiesDir: './src/entities',
  outputFile: './src/validators.ts'
});

console.log(validatorCode);
```

### Using Different Validation Libraries

```typescript
import { generateEntityValidator } from 'mikro-typebox';

// Generate Zod schemas
const zodCode = await generateEntityValidator({
  entitiesDir: './src/entities',
  targetValidationLibrary: 'zod',
  outputFile: './src/zod-validators.ts'
});

// Generate Valibot schemas
const valibotCode = await generateEntityValidator({
  entitiesDir: './src/entities',
  targetValidationLibrary: 'valibot',
  outputFile: './src/valibot-validators.ts'
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
}
```

The library will generate TypeScript types like this:

```typescript
export type User = {
  id: number;
  name: string;
  email: string;
  books: Array<number>; // Book entity replaced with its ID type
};

export type Book = {
  id: number;
  title: string;
  author: number; // User entity replaced with its ID type
};
```

And then generate validation schemas (e.g., with TypeBox):

```typescript
import { Type } from '@sinclair/typebox';

export const UserSchema = Type.Object({
  id: Type.Number(),
  name: Type.String(),
  email: Type.String(),
  books: Type.Array(Type.Number())
});

export const BookSchema = Type.Object({
  id: Type.Number(),
  title: Type.String(),
  author: Type.Number()
});
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

## Requirements

- Node.js 16+
- TypeScript 4.5+
- Mikro-ORM entities with proper decorators

## License

Apache-2.0, Copyright (c) 2025 Amin Yara

