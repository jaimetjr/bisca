import { describe, it, expect } from 'vitest';
import { chooseOpenMessage, type LobbyOpenState } from '../../shared/lib/lobby-open-message';

const base: LobbyOpenState = {
  intent: 'create', reconnectToken: '', playerId: '', roomCode: '', hasCreated: false,
};
const S = (o: Partial<LobbyOpenState>) => chooseOpenMessage({ ...base, ...o });

describe('chooseOpenMessage', () => {
  it('creates the room on a host first connect', () => {
    expect(S({ intent: 'create' })).toEqual({ kind: 'create_room' });
  });

  it('joins on a joiner first connect', () => {
    expect(S({ intent: 'join', roomCode: 'ABCDE' }))
      .toEqual({ kind: 'join_room', roomCode: 'ABCDE' });
  });

  it('reclaims the seat whenever a token is held, whatever the intent', () => {
    for (const intent of ['create', 'join', 'resume']) {
      expect(S({ intent, reconnectToken: 't', playerId: 'p', roomCode: 'ABCDE', hasCreated: true }))
        .toEqual({ kind: 'reconnect' });
    }
  });

  it('never creates a second room while the seat is still held', () => {
    // The original bug: a dropped socket re-sent create_room and stranded the
    // host with a new code after they had already shared the old one.
    expect(S({ intent: 'create', reconnectToken: 't', playerId: 'p', hasCreated: true }))
      .toEqual({ kind: 'reconnect' });
  });

  it('lets a host start over once the seat is gone', () => {
    // Regression: hasCreated stayed true forever, so Try Again fell through to
    // join_room on the dead code and the button looked broken.
    expect(S({ intent: 'create', reconnectToken: '', playerId: '', roomCode: 'DEAD1', hasCreated: true }))
      .toEqual({ kind: 'create_room' });
  });

  it('re-joins rather than creating when a joiner loses its seat', () => {
    expect(S({ intent: 'join', reconnectToken: '', playerId: '', roomCode: 'ABCDE', hasCreated: false }))
      .toEqual({ kind: 'join_room', roomCode: 'ABCDE' });
  });

  it('treats resume with a live token as a reconnect', () => {
    expect(S({ intent: 'resume', reconnectToken: 't', playerId: 'p', roomCode: 'ABCDE' }))
      .toEqual({ kind: 'reconnect' });
  });

  it('falls back to joining when a resumed session has expired', () => {
    expect(S({ intent: 'resume', roomCode: 'ABCDE' }))
      .toEqual({ kind: 'join_room', roomCode: 'ABCDE' });
  });

  it('has nothing to send for a resume with neither token nor code', () => {
    expect(S({ intent: 'resume' })).toEqual({ kind: 'none' });
  });
});
