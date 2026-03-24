import { GameState } from "../../shared/lib/types";
import { RoomPlayer } from "./room-player";

export interface Room {
  code: string;
  hostId: string;
  hostName: string;
  maxPlayers: number;
  players: RoomPlayer[];
  gameState: GameState | null;
  status: 'waiting' | 'playing' | 'finished';
  isPublic: boolean;
  lastActivityAt: number;
}