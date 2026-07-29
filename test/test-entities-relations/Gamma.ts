import { Entity, ManyToOne, PrimaryKey, Property } from "@mikro-orm/core";
import { Alpha } from "./Alpha.js";
import { Beta } from "./Beta.js";

/** Covers a nullable relation, whose target is wrapped in a union type */
@Entity()
export class Gamma {
  @PrimaryKey()
  id!: string;

  @ManyToOne(() => Alpha)
  alpha!: Alpha;

  @ManyToOne(() => Beta, { nullable: true })
  beta?: Beta | null;

  @Property()
  quantity!: number;
}
