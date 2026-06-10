import { describe, it, expect } from 'vitest';
import {
  parseAnilistEpTitle,
  detectPartNumber,
  buildDisplayEpisodes,
} from './malToAnilist';

describe('parseAnilistEpTitle', () => {
  it('parses "Episode 13 - Title"', () => {
    expect(parseAnilistEpTitle('Episode 13 - My Dream Home'))
      .toEqual({ num: 13, title: 'My Dream Home' });
  });
  it('parses "Ep. 1: Title"', () => {
    expect(parseAnilistEpTitle('Ep. 1: Pilot')).toEqual({ num: 1, title: 'Pilot' });
  });
  it('returns title only when no episode prefix', () => {
    expect(parseAnilistEpTitle('Wedding')).toEqual({ num: null, title: 'Wedding' });
  });
});

describe('detectPartNumber', () => {
  it('returns 1 for plain titles', () => {
    expect(detectPartNumber('Mushoku Tensei')).toBe(1);
  });
  it('parses "Part 2"', () => {
    expect(detectPartNumber('Mushoku Tensei II: Isekai Ittara Honki Dasu Part 2')).toBe(2);
  });
  it('parses roman numeral "Cour II"', () => {
    expect(detectPartNumber('Some Anime Cour II')).toBe(2);
  });
});

describe('buildDisplayEpisodes', () => {
  it('falls back to AniList total when Jikan returns only 1 episode', () => {
    const r = buildDisplayEpisodes({
      jikanEpisodes: [{ mal_id: 1, title: 'Episode 1' }],
      anilistTotal: 12,
      anilistTitles: { 1: 'My Dream Home', 2: 'Wedding', 12: 'Succession' },
      estimatedAiring: 0,
      jikanReportedTotal: 12,
    });
    expect(r.episodes.length).toBe(12);
    expect(r.source).toBe('mixed');
    expect(r.episodes[0].title).toBe('My Dream Home');
    expect(r.episodes[1].title).toBe('Wedding');
    expect(r.episodes[11].title).toBe('Succession');
  });

  it('fills titles from AniList when Jikan titles are generic', () => {
    const r = buildDisplayEpisodes({
      jikanEpisodes: [
        { mal_id: 1, title: 'Episode 1' },
        { mal_id: 2, title: 'Episode 2' },
      ],
      anilistTotal: 2,
      anilistTitles: { 1: 'Pilot', 2: 'Awakening' },
      estimatedAiring: 0,
      jikanReportedTotal: 2,
    });
    expect(r.episodes.map(e => e.title)).toEqual(['Pilot', 'Awakening']);
    expect(r.source).toBe('mixed');
  });

  it('preserves real Jikan titles over AniList', () => {
    const r = buildDisplayEpisodes({
      jikanEpisodes: [{ mal_id: 1, title: 'Real Jikan Title' }],
      anilistTotal: 1,
      anilistTitles: { 1: 'AniList Title' },
      estimatedAiring: 0,
      jikanReportedTotal: 1,
    });
    expect(r.episodes[0].title).toBe('Real Jikan Title');
    expect(r.source).toBe('jikan');
  });

  it('produces empty result with no data', () => {
    const r = buildDisplayEpisodes({
      jikanEpisodes: [], anilistTotal: 0, anilistTitles: {},
      estimatedAiring: 0, jikanReportedTotal: 0,
    });
    expect(r.episodes).toEqual([]);
    expect(r.source).toBe('empty');
  });

  it('sorts and offsets overall numbers by Part start (Season 2 Part 2)', () => {
    const r = buildDisplayEpisodes({
      jikanEpisodes: [
        { mal_id: 2, title: 'Wedding' },
        { mal_id: 1, title: 'My Dream Home' },
      ],
      anilistTotal: 12,
      anilistTitles: {},
      estimatedAiring: 0,
      jikanReportedTotal: 12,
      partStart: 13,
    });
    // Local mal_id ordering preserved, overall numbers offset by partStart
    expect(r.episodes[0]).toMatchObject({ mal_id: 1, overallNumber: 13 });
    expect(r.episodes[1]).toMatchObject({ mal_id: 2, overallNumber: 14 });
    expect(r.episodes[11]).toMatchObject({ overallNumber: 24 });
  });

  it('uses airing estimate when no AniList total or Jikan data', () => {
    const r = buildDisplayEpisodes({
      jikanEpisodes: [], anilistTotal: 0, anilistTitles: {},
      estimatedAiring: 5, jikanReportedTotal: 0,
    });
    expect(r.episodes.length).toBe(5);
    expect(r.source).toBe('estimated');
  });
});
