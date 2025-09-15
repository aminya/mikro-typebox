import { Entity, PrimaryKey, Property, Collection, OneToMany } from '@mikro-orm/core';
import { Book } from './Book.js';

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
