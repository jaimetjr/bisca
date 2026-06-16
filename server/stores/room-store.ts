import { Room } from '../models/room';

export interface RoomStore {
  get(code: string): Promise<Room | undefined>;
  set(room: Room): Promise<void>;
  delete(code: string): Promise<void>;
  list(): Promise<Room[]>;
  /** Returns true if the room existed and was set; false if a code collision happened. */
  setIfAbsent(room: Room): Promise<boolean>;
}
