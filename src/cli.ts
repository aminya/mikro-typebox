#!/usr/bin/env node

import { program } from 'commander';
import { generateEntityValidator, modelsToFunction } from './generate.js';

async function main() {
  program
    .name('mikro-typebox')
    .description('Generate validation schemas from Mikro-ORM entities')
    .version('1.0.0');

  const modelNames = Object.keys(modelsToFunction);

  program
    .command('generate')
    .description('Generate validation schemas from Mikro-ORM entities')
    .option('-e, --entities <path>', 'Directory containing the entity files', './src/entities')
    .option('-o, --output <file>', 'Output file path', './src/entity-validators.ts')
    .option('--no-write', 'Print the code to the console instead of writing to a file', false)
    .option('-t, --target <library>', `Target validation library (${modelNames.join(', ')})`, 'typebox')
    .option('--partials', 'Generate partial types instead of inline primary key references (default: true for typebox)')
    .option('--no-partials')
    .action(async (options) => {
      try {
        const result = await generateEntityValidator({
          entitiesDir: options.entities,
          outputFile: options.output,
          targetValidationLibrary: options.target,
          write: !options.noWrite,
          partials: options.partials ?? (options.noPartials ? false : undefined)
        });

        if (options.noWrite) {
          console.log(result);
        }
      } catch (error) {
        console.error('Error:', error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  // Handle unknown commands
  program.on('command:*', () => {
    console.error(`Invalid command: ${program.args.join(' ')}`);
    console.error('See --help for a list of available commands.');
    process.exit(1);
  });

  // Parse command line arguments
  program.parse();

}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
