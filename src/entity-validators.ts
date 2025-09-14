import { Type, Static } from '@sinclair/typebox'


export type User = Static<typeof User>
export const User = Type.Object({
id: Type.Number(),
name: Type.String(),
email: Type.Optional(Type.String())
}, {"$id":"User"})