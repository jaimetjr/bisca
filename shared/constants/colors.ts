const Colors = {
  background: '#1a472a',
  backgroundDark: '#0f2d1a',
  backgroundLight: '#2d6b42',
  tableGreen: '#1e5c35',
  tableFelt: '#2a7a4a',
  card: '#FFFEF5',
  cardShadow: 'rgba(0,0,0,0.3)',
  gold: '#D4A843',
  goldLight: '#E8C96A',
  goldDark: '#B8892E',
  crimson: '#8B1A1A',
  crimsonLight: '#C62828',
  white: '#FFFFFF',
  whiteAlpha: 'rgba(255,255,255,0.15)',
  whiteAlpha2: 'rgba(255,255,255,0.08)',
  text: '#FFFFFF',
  // 0.8, not 0.7: at 0.7 this lands on 4.30:1 over the settings card surface
  // (whiteAlpha over `background`, i.e. #3C634A), just under the 4.5 AA floor
  // for the 13px body copy that uses it. 0.8 → 5.07:1 there, 7.42:1 on
  // `background`.
  textSecondary: 'rgba(255,255,255,0.8)',
  textDark: '#1a1a1a',
  suitOros: '#D4A843',
  suitCopas: '#C62828',
  suitEspadas: '#1565C0',
  suitBastos: '#2E7D32',
  buttonPrimary: '#D4A843',
  buttonSecondary: '#2d6b42',
  // `danger` and `success` are FILL colours — white on #C62828 is 5.62:1, which
  // passes. As *text* on the dark green they are 1.89:1 and 2.07:1, both far
  // under the 4.5 AA floor, and they carry the most important words in the app
  // ("Delete Account", every form error). Hence the separate text tokens below:
  // changing `danger` itself would wreck the filled buttons that rely on it.
  danger: '#C62828',
  success: '#2E7D32',
  /** Text/icon red. 4.65:1 on `background`, 4.70:1 on the sign-out pill, 6.52:1 on `backgroundDark`. */
  dangerText: '#FF8A80',
  /** Text/icon green. 5.27:1 on `background`, 7.40:1 on `backgroundDark`. */
  successText: '#81C784',
  overlay: 'rgba(0,0,0,0.6)',
};

export default Colors;
