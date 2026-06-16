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
  /**
   * When true, the server enforces the strict "must follow suit if able" rule.
   * Defaults to false (casual variant) so existing rooms keep working.
   */
  strictFollowSuit?: boolean;
}