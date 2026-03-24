import { WebSocket } from 'ws';

export interface RoomPlayer {
  id: string;
  name: string;
  ws: WebSocket;
  team?: 0 | 1;   // only used in 4-player rooms
}