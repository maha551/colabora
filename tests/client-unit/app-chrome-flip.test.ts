import {
  computeChromeFlipMetrics,
  getExpandedChromeRect,
} from '../../client/src/lib/appChromeFlip';

describe('appChromeFlip', () => {
  describe('computeChromeFlipMetrics', () => {
    it('maps a centered orb onto a full-width top header', () => {
      const from = { left: 178, top: 12, width: 44, height: 44 };
      const to = { left: 0, top: 0, width: 400, height: 56 };
      expect(computeChromeFlipMetrics(from, to)).toEqual({
        translateX: 178,
        translateY: 12,
        scaleX: 0.11,
        scaleY: 44 / 56,
      });
    });

    it('returns identity scale when sizes match', () => {
      const rect = { left: 10, top: 20, width: 56, height: 56 };
      expect(computeChromeFlipMetrics(rect, rect)).toEqual({
        translateX: 0,
        translateY: 0,
        scaleX: 1,
        scaleY: 1,
      });
    });
  });

  describe('getExpandedChromeRect', () => {
    const viewport = { width: 800, height: 600 };

    it('anchors expanded chrome to the top edge', () => {
      expect(getExpandedChromeRect('top', viewport)).toEqual({
        left: 0,
        top: 0,
        width: 800,
        height: 56,
      });
    });

    it('anchors expanded chrome to the bottom edge', () => {
      expect(getExpandedChromeRect('bottom', viewport)).toEqual({
        left: 0,
        top: 544,
        width: 800,
        height: 56,
      });
    });
  });
});
