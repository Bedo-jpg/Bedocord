import { z } from 'zod';
import { isIPv4 } from 'node:net';
import type { Endpoint } from './types.js';

export const profileSchema = z.object({name:z.string().trim().min(1).max(32), avatar:z.string().min(1).max(12), color:z.string().regex(/^#[0-9a-f]{6}$/i)}).strict();
export const endpointSchema = z.object({host:z.string().max(45),port:z.number().int().min(1024).max(65534)}).strict();
export function validateEndpoint(input: unknown, allowLoopback = false): Endpoint {
  const value = endpointSchema.parse(input);
  if (!isIPv4(value.host)) throw new Error('Geçerli bir özel IPv4 adresi gerekli.');
  const [a,b] = value.host.split('.').map(Number);
  if (!(a===26 || a===10 || (a===172 && b>=16 && b<=31) || (a===192 && b===168) || (a===100 && b>=64 && b<=127) || (allowLoopback && a===127))) throw new Error('Radmin veya özel ağ adresini seçin.');
  return value;
}
export const presenceSchema = z.object({room:z.string().max(80).nullable(),muted:z.boolean(),deafened:z.boolean(),screen:z.string().max(100).nullable()}).strict();
export const eventSchema = z.object({groupId:z.string().uuid(),id:z.string().max(100),author:z.string().uuid(),seq:z.number().int().min(1).max(2147483647),clock:z.number().int().min(1).max(Number.MAX_SAFE_INTEGER-1000),date:z.number().int().min(0).max(8640000000000000),kind:z.enum(['message','channel','profile']),payload:z.record(z.string(),z.unknown()),signature:z.string().max(1024)}).strict();
export function validatePayload(kind: string, payload: unknown) {
  if (kind==='message') return z.object({channel:z.string().min(1).max(80),text:z.string().trim().min(1).max(4000)}).strict().parse(payload);
  if (kind==='channel') return z.object({id:z.string().uuid(),name:z.string().trim().min(1).max(32),type:z.enum(['text','voice'])}).strict().parse(payload);
  if (kind==='profile') return profileSchema.parse(payload);
  throw new Error('Bilinmeyen olay türü.');
}
export {broadcastWinner} from './media-policy.js';
