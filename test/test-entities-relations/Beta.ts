import { Entity, ManyToOne, PrimaryKey, Property } from "@mikro-orm/core";
import { Alpha } from "./Alpha.js";

/** Covers a nullable self-reference, which must not stall the dependency ordering */
@Entity()
export class Beta {
  @PrimaryKey()
  id!: string;

  @ManyToOne(() => Alpha)
  alpha!: Alpha;

  @ManyToOne(() => Beta, { nullable: true })
  parent?: Beta | null;

  @Property()
  status!: string;
}
