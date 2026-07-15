/**
 * Central registry of `data-testid` values for the dashboard
 * (docs/architecture/08-dashboard-ux.md — every interactive element).
 * Keys are camelCase, values kebab-case `<feature>-<element>`; dynamic ids
 * use the helper functions.
 */
export const TEST_IDS = {
  loginPage: "login-page",
  loginError: "login-error",
  appShell: "app-shell",
  sidebar: "sidebar",
  sidebarNav: "sidebar-nav",
  topBar: "top-bar",
  topBarTitle: "top-bar-title",
  commandPaletteTrigger: "command-palette-trigger",
  commandPalette: "command-palette",
  commandPaletteInput: "command-palette-input",
  userMenuTrigger: "user-menu-trigger",
  userMenuSignOut: "user-menu-sign-out",
  settingsAccountCard: "settings-account-card",
  settingsLinkedAccounts: "settings-linked-accounts",
  linkedAccountsError: "linked-accounts-error",
  profileEditor: "profile-editor",
  profileSaveIndicator: "profile-save-indicator",
  profilePublishButton: "profile-publish-button",
  profilePublishState: "profile-publish-state",
  basicsName: "basics-name",
} as const;

export const navItemTestId = (key: string) => `nav-${key}`;
export const paletteItemTestId = (key: string) => `palette-${key}`;
export const signInButtonTestId = (providerId: string) =>
  `login-provider-${providerId}`;
export const linkedAccountRowTestId = (providerId: string) =>
  `linked-account-${providerId}`;
export const linkProviderTestId = (providerId: string) =>
  `link-provider-${providerId}`;
export const unlinkProviderTestId = (providerId: string) =>
  `unlink-provider-${providerId}`;

export const profileSectionTestId = (key: string) => `profile-section-${key}`;
export const profileAddItemTestId = (key: string) => `profile-add-${key}`;
export const profileItemTestId = (key: string, index: number) =>
  `profile-item-${key}-${index}`;
export const profileRemoveItemTestId = (key: string, index: number) =>
  `profile-remove-${key}-${index}`;
