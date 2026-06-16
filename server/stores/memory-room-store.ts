import { Room } from '../models/room';
import { RoomStore } from './room-store';

export class MemoryRoomStore implements RoomStore {
  private readonly rooms = new Map<string, Room>();

  async get(code: string): Promise<Room | undefined> {
    return this.rooms.get(code);
  }

  async set(room: Room): Promise<void> {
    this.rooms.set(room.code, room);
  }

  async setIfAbsent(room: Room): Promise<boolean> {
    if (this.rooms.has(room.code)) return false;
    this.rooms.set(room.code, room);
    return true;
  }

  async delete(code: string): Promise<void> {
    this.rooms.delete(code);
  }

  async list(): Promise<Room[]> {
    return [...this.rooms.values()];
  }
}
