import {
  Entity,
  PrimaryKey,
  Property,
  Collection,
  OneToMany,
  Enum,
} from "@mikro-orm/core";
import { Post } from "./Post.js";

export enum UserRole {
  ADMIN = "admin",
  USER = "user",
  MODERATOR = "moderator"
}

export enum UserStatus {
  ACTIVE = "active",
  INACTIVE = "inactive",
  PENDING = "pending"
}

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

  @Enum()
  role!: UserRole;

  @Enum()
  status!: UserStatus;

  @OneToMany(() => Post, (post) => post.author)
  posts = new Collection<Post>(this);

  constructor({ name, email, age, role, status }: User) {
    this.name = name;
    this.email = email;
    this.age = age;
    this.role = role;
    this.status = status;
  }
}
