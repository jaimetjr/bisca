import { describe, it, expect } from 'vitest';
import { resolvePlayerName, clampPlayerName } from '../../shared/lib/player-name';
import { PLAYER_NAME_MAX_LENGTH } from '../../shared/constants/game';

const FALLBACK = 'Jogador';

describe('clampPlayerName', () => {
  it('corta no limite que o servidor aceita', () => {
    // Longer names are rejected with INVALID_MESSAGE on join/create.
    const long = 'Maximiliano Fernandes';
    expect(clampPlayerName(long).length).toBeLessThanOrEqual(PLAYER_NAME_MAX_LENGTH);
  });

  it('não deixa espaço sobrando quando o corte cai no meio de uma palavra', () => {
    // 'Ana Bartolomeu' -> 12 chars is 'Ana Bartolo'... a cut landing on a space
    // would otherwise ship a trailing blank.
    const name = 'Ana' + ' '.repeat(PLAYER_NAME_MAX_LENGTH) + 'Silva';
    expect(clampPlayerName(name)).toBe('Ana');
  });

  it('devolve vazio para entrada só de espaços', () => {
    expect(clampPlayerName('   ')).toBe('');
  });
});

describe('resolvePlayerName', () => {
  it('usa o nome digitado quando é convidado', () => {
    const name = resolvePlayerName({
      isLoggedIn: false, profileName: null, typedName: '  Zé  ', fallback: FALLBACK,
    });
    expect(name).toBe('Zé');
  });

  it('usa o nome do perfil quando está logado', () => {
    const name = resolvePlayerName({
      isLoggedIn: true, profileName: 'Jaime T', typedName: 'ignorado', fallback: FALLBACK,
    });
    expect(name).toBe('Jaime T');
  });

  it('cai no placeholder enquanto o perfil não chegou', () => {
    // This is the bug the loading guard exists for: the value is correct as a
    // last resort, but acting on it bakes "Jogador" into the match params and
    // labels the player that way for the whole game. SetupScreen must not start
    // a match while useProfileName reports isPending.
    const name = resolvePlayerName({
      isLoggedIn: true, profileName: null, typedName: '', fallback: FALLBACK,
    });
    expect(name).toBe(FALLBACK);
  });

  it('cai no placeholder quando o convidado não digitou nada', () => {
    const name = resolvePlayerName({
      isLoggedIn: false, profileName: null, typedName: '', fallback: FALLBACK,
    });
    expect(name).toBe(FALLBACK);
  });

  it('ignora o que o convidado digitou depois de logar', () => {
    const name = resolvePlayerName({
      isLoggedIn: true, profileName: 'Ana', typedName: 'apelido antigo', fallback: FALLBACK,
    });
    expect(name).toBe('Ana');
  });
});
