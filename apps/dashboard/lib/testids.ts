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
  resumesList: "resumes-list",
  resumesEmpty: "resumes-empty",
  resumeCreateButton: "resume-create-button",
  resumeEditor: "resume-editor",
  resumeSaveIndicator: "resume-save-indicator",
  resumePreview: "resume-preview",
  resumePreviewMeta: "resume-preview-meta",
  resumeNameInput: "resume-name-input",
  resumePageSize: "resume-page-size",
  resumeMargin: "resume-margin",
  resumeAccent: "resume-accent",
  resumeShowIcons: "resume-show-icons",
  resumeDeleteButton: "resume-delete-button",
  resumePrintLink: "resume-print-link",
  portfolioClaim: "portfolio-claim",
  portfolioSlugInput: "portfolio-slug-input",
  portfolioSlugStatus: "portfolio-slug-status",
  portfolioTemplatePick: "portfolio-template-pick",
  portfolioCreateButton: "portfolio-create-button",
  portfolioEditor: "portfolio-editor",
  portfolioSaveIndicator: "portfolio-save-indicator",
  portfolioPublishButton: "portfolio-publish-button",
  portfolioPublishState: "portfolio-publish-state",
  portfolioPublicUrl: "portfolio-public-url",
  portfolioDiscoverable: "portfolio-discoverable",
  portfolioPreviewFrame: "portfolio-preview-frame",
  sourcesPage: "sources-page",
  sourcesGallery: "sources-gallery",
  sourcesLinkedinUpload: "sources-linkedin-upload",
  sourcesTriage: "sources-triage",
  sourcesTriageEmpty: "sources-triage-empty",
  sourcesHistory: "sources-history",
  sourcesConnections: "sources-connections",
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

export const resumeItemTestId = (id: string) => `resume-item-${id}`;

export const portfolioTemplateTestId = (id: string) =>
  `portfolio-template-${id}`;
export const portfolioConfigFieldTestId = (key: string) =>
  `portfolio-config-${key}`;

export const sourceConnectInputTestId = (connectorId: string) =>
  `sources-connect-${connectorId}-input`;
export const sourceConnectButtonTestId = (connectorId: string) =>
  `sources-connect-${connectorId}-button`;
export const sourceConnectionTestId = (id: string) => `source-connection-${id}`;
export const sourceCheckUpdatesTestId = (id: string) =>
  `source-check-updates-${id}`;
export const sourceRemoveTestId = (id: string) => `source-remove-${id}`;
export const triageItemTestId = (id: string) => `triage-item-${id}`;
export const triageImportTestId = (id: string) => `triage-import-${id}`;
export const triageSkipTestId = (id: string) => `triage-skip-${id}`;
export const triageEditTestId = (id: string) => `triage-edit-${id}`;
export const triageDestinationTestId = (id: string) =>
  `triage-destination-${id}`;
export const triageImportGroupTestId = (key: string) =>
  `triage-import-group-${key}`;
export const receiptItemTestId = (id: string) => `receipt-item-${id}`;
export const receiptReimportTestId = (id: string) => `receipt-reimport-${id}`;

export const profileSectionTestId = (key: string) => `profile-section-${key}`;
export const profileAddItemTestId = (key: string) => `profile-add-${key}`;
export const profileItemTestId = (key: string, index: number) =>
  `profile-item-${key}-${index}`;
export const profileRemoveItemTestId = (key: string, index: number) =>
  `profile-remove-${key}-${index}`;
