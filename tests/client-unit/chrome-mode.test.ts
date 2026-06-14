import {
  isOrbAllowedRoute,
  isMeetingProtocolRoute,
  resolveChromeConfig,
} from '../../client/src/lib/chromeMode';

describe('chromeMode', () => {
  describe('isOrbAllowedRoute', () => {
    it('allows document editor', () => {
      expect(isOrbAllowedRoute('document', '#/document/doc-1')).toBe(true);
    });

    it('allows meeting protocol detail', () => {
      expect(
        isOrbAllowedRoute('organization', '#/organization/org-1/meetings/meet-9')
      ).toBe(true);
    });

    it('denies meetings list and new meeting', () => {
      expect(isOrbAllowedRoute('organization', '#/organization/org-1/schedule')).toBe(
        false
      );
      expect(isOrbAllowedRoute('organization', '#/organization/org-1/meetings/new')).toBe(
        false
      );
    });

    it('denies documents list', () => {
      expect(isOrbAllowedRoute('documents', '#/documents')).toBe(false);
    });
  });

  describe('resolveChromeConfig', () => {
    it('uses bar on mobile document editor with unified bottom nav', () => {
      const cfg = resolveChromeConfig({
        currentView: 'document',
        hash: '#/document/d1',
        isMobile: true,
      });
      expect(cfg).toEqual({
        display: 'bar',
        anchor: 'top',
        orbAllowed: false,
        hideFooter: false,
        immersiveShell: false,
        unifiedBottomNav: true,
      });
    });

    it('uses bar on desktop document editor', () => {
      const cfg = resolveChromeConfig({
        currentView: 'document',
        hash: '#/document/d1',
        isMobile: false,
      });
      expect(cfg.display).toBe('bar');
      expect(cfg.orbAllowed).toBe(false);
      expect(cfg.anchor).toBe('top');
    });

    it('uses bar on activity feed', () => {
      const cfg = resolveChromeConfig({
        currentView: 'activity',
        hash: '#/activity',
        isMobile: false,
      });
      expect(cfg.display).toBe('bar');
      expect(cfg.orbAllowed).toBe(false);
    });

    it('immersive shell on meeting protocol', () => {
      expect(
        isMeetingProtocolRoute('organization', '#/organization/o1/meetings/m1')
      ).toBe(true);
      const cfg = resolveChromeConfig({
        currentView: 'organization',
        hash: '#/organization/o1/meetings/m1',
        isMobile: false,
      });
      expect(cfg.display).toBe('bar');
      expect(cfg.orbAllowed).toBe(false);
      expect(cfg.hideFooter).toBe(true);
      expect(cfg.immersiveShell).toBe(true);
      expect(cfg.unifiedBottomNav).toBe(false);
    });

    it('disables unified bottom nav on mobile meeting protocol', () => {
      const cfg = resolveChromeConfig({
        currentView: 'organization',
        hash: '#/organization/o1/meetings/m1',
        isMobile: true,
      });
      expect(cfg.unifiedBottomNav).toBe(false);
      expect(cfg.immersiveShell).toBe(true);
      expect(cfg.anchor).toBe('bottom');
    });

    it('enables unified bottom nav on mobile activity feed', () => {
      const cfg = resolveChromeConfig({
        currentView: 'activity',
        hash: '#/activity',
        isMobile: true,
      });
      expect(cfg.unifiedBottomNav).toBe(true);
      expect(cfg.anchor).toBe('top');
    });
  });
});
