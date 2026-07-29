import { Entity, OneToOne, PrimaryKey, Property } from "@mikro-orm/core";
import { Beta } from "./Beta.js";

/** Covers `OneToOne`, which must be tracked for the ordering just like `ManyToOne` */
@Entity()
export class Epsilon {
  @PrimaryKey()
  id!: string;

  @OneToOne(() => Beta)
  beta!: Beta;

  @Property()
  state!: string;
}
