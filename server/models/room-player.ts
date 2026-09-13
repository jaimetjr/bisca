export interface RoomPlayer {
  id: string;
  name: string;
  team?: 0 | 1;   // only used in 4-player rooms
  /** Set while their socket is down; cleared on reconnect. */
  disconnectedAt?: number;
}
