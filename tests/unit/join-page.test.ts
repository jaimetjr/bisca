import { describe, it, expect } from 'vitest';
import { joinPageHtml, roomGoneHtml, INVITE_LANGUAGES } from '../../server/lib/join-page';

// The invite page is the only thing a recipient sees before installing, so it
// carries the store button and has to speak their language. It also must not
// promise a room that no longer exists — see roomGoneHtml.

describe('joinPageHtml', () => {
  it('shows the code, the deep link and the store link', () => {
    const html = joinPageHtml('WDAK7', 'pt-BR');
    expect(html).toContain('WDAK7');
    expect(html).toContain('bisca:///join?code=WDAK7');
    expect(html).toContain('play.google.com/store/apps/details?id=com.jaimetjr.bisca');
  });

  it('translates the invitation instead of always serving Portuguese', () => {
    const it_ = joinPageHtml('WDAK7', 'it');
    const de = joinPageHtml('WDAK7', 'de');
    const pt = joinPageHtml('WDAK7', 'pt-BR');

    expect(it_).toContain('lang="it"');
    expect(de).toContain('lang="de"');
    // Each language must have its own body copy, not the Portuguese one.
    expect(it_).not.toBe(pt);
    expect(de).not.toBe(pt);
    expect(it_).not.toBe(de);
  });

  it('sets the html lang for every supported language', () => {
    for (const lang of INVITE_LANGUAGES) {
      expect(joinPageHtml('WDAK7', lang), lang).toContain(`lang="${lang}"`);
    }
  });

  it('gives Brazil and Portugal their own copy', () => {
    expect(joinPageHtml('WDAK7', 'pt-BR')).not.toBe(joinPageHtml('WDAK7', 'pt-PT'));
  });
});

describe('roomGoneHtml', () => {
  it('does not claim the visitor is invited to a live room', () => {
    const html = roomGoneHtml('pt-BR');
    // No deep link: there is nothing to open.
    expect(html).not.toContain('bisca:///join');
    // Still offers the app, since installing is the point of the page.
    expect(html).toContain('play.google.com/store/apps/details?id=com.jaimetjr.bisca');
  });

  it('is translated too', () => {
    expect(roomGoneHtml('it')).toContain('lang="it"');
    expect(roomGoneHtml('it')).not.toBe(roomGoneHtml('pt-BR'));
  });
});
