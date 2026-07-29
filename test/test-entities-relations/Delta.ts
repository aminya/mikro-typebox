import { Entity, ManyToOne, PrimaryKey, Property } from "@mikro-orm/core";
import { Alpha } from "./Alpha.js";
import { Gamma } from "./Gamma.js";

/** Depends on {@link Gamma}, which itself only depends on other entities via nullable relations */
@Entity()
export class Delta {
  @PrimaryKey()
  id!: string;

  @ManyToOne(() => Alpha)
  alpha!: Alpha;

  @ManyToOne(() => Gamma, { nullable: true })
  gamma?: Gamma | null;

  @Property()
  amount!: number;
}
