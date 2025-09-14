import { Entity, PrimaryKey, Property, ManyToOne, Collection, OneToMany } from "@mikro-orm/core";
import { User } from "./User.js";
import { Comment } from "./Comment.js";

@Entity()
export class Post {
  @PrimaryKey()
  id!: string;

  @Property()
  title!: string;

  @Property({ type: "text" })
  content!: string;

  @Property()
  publishedAt!: Date;

  @ManyToOne(() => User)
  author!: User;

  @OneToMany(() => Comment, comment => comment.post)
  comments = new Collection<Comment>(this);

  constructor({ title, content, publishedAt, author, comments }: Post) {
    this.title = title;
    this.content = content;
    this.publishedAt = publishedAt;
    this.author = author;
    this.comments = comments;
  }
}
