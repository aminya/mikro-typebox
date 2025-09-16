import {
  Entity,
  PrimaryKey,
  Property,
  Collection,
  OneToMany,
} from "@mikro-orm/core";
import { Post } from "./Post.js";

@Entity()
export class User {
  @PrimaryKey()
  id!: number;

  @Property()
  name!: string;

  @Property()
  email!: string;

  @Property({ nullable: true })
  age?: number;

  @OneToMany(() => Post, (post) => post.author)
  posts = new Collection<Post>(this);

  constructor({ name, email, age }: User) {
    this.name = name;
    this.email = email;
    this.age = age;
  }
}
