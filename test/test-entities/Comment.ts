import { Entity, PrimaryKey, Property, ManyToOne } from "@mikro-orm/core";
import { Post } from "./Post.js";
import { User } from "./User.js";

@Entity()
export class Comment {
  @PrimaryKey()
  id!: number;

  @Property()
  content!: string;

  @Property()
  createdAt!: Date;

  @ManyToOne(() => Post)
  post!: Post;

  @ManyToOne(() => User)
  author!: User;


  constructor({ content, createdAt, post, author }: Comment) {
    this.content = content;
    this.createdAt = createdAt;
    this.post = post;
    this.author = author;
  }
}
