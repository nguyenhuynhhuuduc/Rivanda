import type { Pool } from "mysql2/promise";
export function namespace(pool:Pick<Pool,"query">,uploadDir:string,create?:boolean):Promise<string>;
export function filePath(root:string,name:string):string;
export function writeExclusive(root:string,name:string,bytes:Buffer):Promise<void>;
export const FILE:RegExp;
