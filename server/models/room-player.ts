import { WebSocket } from 'ws';

export interface RoomPlayer {
  id: string;
  name: string;
  ws: WebSocket;
}