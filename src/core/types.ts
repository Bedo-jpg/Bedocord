export interface Endpoint { host: string; port: number }
export interface Profile { name: string; avatar: string; color: string }
export interface Member { id: string; cert: string; endpoint: Endpoint; profile: Profile }
export interface Roster { groupId: string; name: string; version: number; adminId: string; members: Member[]; revoked: Record<string, number>; signature: string }
export interface Device { deviceId: string; key: string; publicKey: string }
export interface Identity { groupId: string; deviceId: string; key: string; cert: string; ca: string; adminKey?: string; roster: Roster; endpoint: Endpoint; profile: Profile; recovering?: boolean }
export type EventKind = 'message' | 'channel' | 'profile';
export interface ChatEvent { groupId: string; id: string; author: string; seq: number; clock: number; date: number; kind: EventKind; payload: Record<string, any>; signature: string }
export interface Presence { room: string | null; muted: boolean; deafened: boolean; screen: string | null }
export interface PeerView { id: string; profile: Profile; online: boolean; presence: Presence }
export interface Snapshot { groupId: string; name: string; selfId: string; admin: boolean; coordinator: string; peers: PeerView[]; events: (ChatEvent & {backedUp: boolean})[]; channels: {id:string;name:string;type:'text'|'voice'}[]; endpoint: Endpoint; error: string | null }
export const EMPTY_PRESENCE: Presence = { room: null, muted: false, deafened: false, screen: null };
