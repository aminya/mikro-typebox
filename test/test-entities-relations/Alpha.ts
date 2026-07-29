import { Entity, PrimaryKey, Property } from "@mikro-orm/core";

/** Root entity: has no relations at all */
@Entity()
export class Alpha {
  @PrimaryKey()
  id!: string;

  @Property()
  name!: string;
}
