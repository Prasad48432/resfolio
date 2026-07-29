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
  /** The app's scroll container. Assertable because "does the page scroll or does
   * this element scroll" is the invariant the whole chat layout rests on, and it
   * regresses invisibly. */
  appContent: "app-content",
  sidebar: "sidebar",
  sidebarNav: "sidebar-nav",
  topBar: "top-bar",
  topBarTitle: "top-bar-title",
  commandPaletteTrigger: "command-palette-trigger",
  commandPalette: "command-palette",
  commandPaletteInput: "command-palette-input",
  userMenuTrigger: "user-menu-trigger",
  userMenuSignOut: "user-menu-sign-out",
  themeToggle: "theme-toggle",
  settingsAccountCard: "settings-account-card",
  settingsLinkedAccounts: "settings-linked-accounts",
  linkedAccountsError: "linked-accounts-error",
  profileEditor: "profile-editor",
  profileSaveIndicator: "profile-save-indicator",
  profilePublishButton: "profile-publish-button",
  profilePublishState: "profile-publish-state",
  profileProjectedPosts: "profile-projected-posts",
  basicsName: "basics-name",
  resumesList: "resumes-list",
  resumesEmpty: "resumes-empty",
  resumeCreateButton: "resume-create-button",
  /** A template option in the "New resume" menu, keyed by template id. */
  resumeTemplateOption: (templateId: string) =>
    `resume-template-option-${templateId}`,
  resumeEditor: "resume-editor",
  resumeSaveIndicator: "resume-save-indicator",
  resumePreview: "resume-preview",
  resumePreviewMeta: "resume-preview-meta",
  resumeNameInput: "resume-name-input",
  resumePageSize: "resume-page-size",
  resumeMargin: "resume-margin",
  resumeAccent: "resume-accent",
  resumeShowIcons: "resume-show-icons",
  resumeFontSize: "resume-font-size",
  /** Per-link visibility switch, keyed by the profile link's stable id. */
  resumeLinkToggle: (linkId: string) => `resume-link-toggle-${linkId}`,
  resumeDeleteButton: "resume-delete-button",
  resumeSections: "resume-sections",
  resumeVisibility: "resume-visibility",
  resumePublicUrl: "resume-public-url",
  resumeDownloadPdf: "resume-download-pdf",
  /** The shared public-username claim (handle) — same control on /portfolio and
   * /resumes, keyed by usage so both can appear in one test run. */
  handleInput: "handle-input",
  handleStatus: "handle-status",
  handleClaimButton: "handle-claim-button",
  /** The "Public resume" card on /resumes: the /r/<handle> URL + the picker. */
  publicResumeCard: "public-resume-card",
  publicResumeUrl: "public-resume-url",
  publicResumeSelect: "public-resume-select",
  portfolioClaim: "portfolio-claim",
  portfolioSlugInput: "portfolio-slug-input",
  portfolioSlugStatus: "portfolio-slug-status",
  portfolioTemplatePick: "portfolio-template-pick",
  portfolioCreateButton: "portfolio-create-button",
  portfolioEditor: "portfolio-editor",
  portfolioSaveIndicator: "portfolio-save-indicator",
  portfolioPublishButton: "portfolio-publish-button",
  portfolioSetupDialog: "portfolio-setup-dialog",
  portfolioMissingChecklist: "portfolio-missing-checklist",
  portfolioPublishState: "portfolio-publish-state",
  portfolioPublicUrl: "portfolio-public-url",
  portfolioDiscoverable: "portfolio-discoverable",
  portfolioFavicon: "portfolio-favicon",
  portfolioPreviewPlaceholder: "portfolio-preview-placeholder",
  sourcesPage: "sources-page",
  sidebarTrigger: "sidebar-trigger",
  sourcesGallery: "sources-gallery",
  sourcesTriage: "sources-triage",
  sourcesTriageEmpty: "sources-triage-empty",
  sourcesHistory: "sources-history",
  sourcesConnections: "sources-connections",
  blogList: "blog-list",
  blogEmpty: "blog-empty",
  blogCreateButton: "blog-create-button",
  blogEditor: "blog-editor",
  blogSaveIndicator: "blog-save-indicator",
  blogTitleInput: "blog-title-input",
  blogBodyEditor: "blog-body-editor",
  blogToolbar: "blog-toolbar",
  blogPublishToggle: "blog-publish-toggle",
  blogSettingsPanel: "blog-settings-panel",
  blogSettingsToggle: "blog-settings-toggle",
  blogSlugInput: "blog-slug-input",
  blogExcerptInput: "blog-excerpt-input",
  blogSeoTitleInput: "blog-seo-title-input",
  blogSeoDescriptionInput: "blog-seo-description-input",
  blogCoverField: "blog-cover-field",
  blogImageBudget: "blog-image-budget",
  blogDeleteButton: "blog-delete-button",
  aiChat: "ai-chat",
  aiInput: "ai-input",
  /** The composer's character count, shown only near the ceiling. */
  aiInputCount: "ai-input-count",
  /** Over the job-description ceiling. Assertable because the alternative this
   * replaced — a `maxLength` that truncated a pasted posting — was invisible by
   * construction, and an invisible failure needs a visible test. */
  aiInputTooLong: "ai-input-too-long",
  aiSend: "ai-send",
  aiStop: "ai-stop",
  aiThinking: "ai-thinking",
  aiError: "ai-error",
  /** A finished assistant turn that produced nothing renderable, and the
   * truncation notice that usually explains it. Both are assertable because both
   * are states that used to render as blank space. */
  aiEmptyTurn: "ai-empty-turn",
  aiTruncated: "ai-truncated",
  /** The assistant is working but has emitted nothing renderable yet — a
   * reasoning model's normal opening seconds. Assertable because the alternative
   * is an avatar next to blank space, which reads as a crash. */
  aiWorking: "ai-working",
  aiSuggestions: "ai-suggestions",
  /** Saved-chat history (Phase 7). The rail, its two creation/destruction
   * controls, and the mobile trigger that stands in for the rail. */
  chatHistory: "chat-history",
  chatHistoryToggle: "chat-history-toggle",
  chatNew: "chat-new",
  chatClearAll: "chat-clear-all",
  chatClearConfirm: "chat-clear-confirm",
  aiProfileEmpty: "ai-profile-empty",
  aiProposal: "ai-proposal",
  aiProposalPreparing: "ai-proposal-preparing",
  aiProposalEmpty: "ai-proposal-empty",
  aiProposalFailed: "ai-proposal-failed",
  aiProposalApplyAll: "ai-proposal-apply-all",
  aiProposalRejected: "ai-proposal-rejected",
  /** Changes already in the profile — accepted earlier, or written by hand. The
   * opposite of `aiProposalRejected` and previously counted with it, which told
   * users their accepted edits had been refused as fabrication. */
  aiProposalSettled: "ai-proposal-settled",
  /** The in-chat job match (Phase 7): the card itself, the two states the tool
   * has before its result exists, and the actions on it. `jobMatchNoPosting` is
   * the model calling the match tool when nothing in the conversation is long
   * enough to be a posting — a real answer, not an error. */
  jobMatchCard: "job-match-card",
  jobMatchPreparing: "job-match-preparing",
  jobMatchFailed: "job-match-failed",
  jobMatchNoPosting: "job-match-no-posting",
  /** The unified optimise card (`optimise-for-job.tsx`), which replaced the two
   * peer buttons — "Enhance profile for this job" here and "Tailor for this job"
   * in the artefact panel — with one question about where changes land. */
  optimisePanel: "optimise-panel",
  optimiseDestination: "optimise-destination",
  optimiseToProfile: "optimise-to-profile",
  optimiseToResume: "optimise-to-resume",
  optimiseResumePick: "optimise-resume-pick",
  optimiseSubmit: "optimise-submit",
  /** The header line shown when every destination is spent. Assertable because
   * the bug it fixes is a card that offered work it had already done — and the
   * only visible difference between "done" and "not started" was a sentence
   * hidden behind the tile that was not selected. */
  optimiseDone: "optimise-done",
  /** Terms the posting names that the profile demonstrates but does not list.
   * Assertable because the failure it fixes is invisible: the analysis said
   * "Docker ✓" over a resume whose Skills block never printed Docker. */
  skillGapsPanel: "skill-gaps-panel",
  skillGapsApply: "skill-gaps-apply",
  skillGapsDone: "skill-gaps-done",
  /** The confirmation shown below `ENHANCE_CONFIRM_THRESHOLD`, and its two
   * answers. Assertable because the warning existing at all is the product
   * decision — see `@resfolio/job`. */
  jobMatchConfirm: "job-match-confirm",
  jobMatchConfirmCancel: "job-match-confirm-cancel",
  jobMatchConfirmContinue: "job-match-confirm-continue",
  jobMatchEnhanceError: "job-match-enhance-error",
  /** Replaces the enhance offer once this posting has caused profile changes —
   * in this session or in any earlier one. Assertable because the bug it fixes is
   * "the button came back after a reload", which is invisible to any test that
   * only exercises one page load. */
  jobMatchEnhanced: "job-match-enhanced",
  /** The artefact panel beside the conversation, and the three things on it. */
  jobPanel: "job-panel",
  jobPanelToggle: "job-panel-toggle",
  jobPanelPosting: "job-panel-posting",
  jobPanelResume: "job-panel-resume",
  jobPanelResumePick: "job-panel-resume-pick",
  jobPanelResumeDownload: "job-panel-resume-download",
  jobPanelLetter: "job-panel-letter",
  jobPanelScore: "job-panel-score",
  jobPanelDelta: "job-panel-delta",
  /** The rendered analysis, shared by the in-chat card and anything that comes
   * to render one later. `jobInput`/`jobSubmit`/`jobStop`/`jobError`/`jobEmpty`
   * went with `/ai/job` in Phase 7 — there is no textarea, no submit button and
   * no "finished with nothing" panel any more, because the match is a tool call
   * inside a turn the transcript already reports on. */
  jobResult: "job-result",
  jobScore: "job-score",
  jobDowngraded: "job-downgraded",
  jobKeywords: "job-keywords",
  /* `tailorPanel` / `tailorTarget` / `tailorSubmit` / `tailorError` went with the
     "Tailor for this job" entry point (2026-07-28). The trigger, its resume
     picker and its error line are all `optimise*` now; only the review half of
     `resume-tailor.tsx` survives, and it keeps its own ids below. */
  tailorExisting: "tailor-existing",
  tailorReset: "tailor-reset",
  tailorPublicNotice: "tailor-public-notice",
  tailorReview: "tailor-review",
  tailorEmpty: "tailor-empty",
  tailorApplyAll: "tailor-apply-all",
  tailorEmphasis: "tailor-emphasis",
  tailorEmphasisApply: "tailor-emphasis-apply",
  tailorRejected: "tailor-rejected",
  resumeTailoredNotice: "resume-tailored-notice",
  resumeTailoredReset: "resume-tailored-reset",
  letterPanel: "letter-panel",
  letterRecipient: "letter-recipient",
  letterSubmit: "letter-submit",
  letterStop: "letter-stop",
  letterError: "letter-error",
  /** The letter equivalent of `jobEmpty`: finished, billed, nothing to read. */
  letterEmpty: "letter-empty",
  letterResult: "letter-result",
  letterCopy: "letter-copy",
  letterDownload: "letter-download",
  /** Brings the compose form back after a letter exists. The form is hidden once
   * there is a letter — this is the only way back to it, so it is the one control
   * whose absence would strand a user with a draft they don't like. */
  letterRewrite: "letter-rewrite",
  /** The clean-result line. Assertable on purpose: "we checked and found nothing"
   * is a claim the product makes, so it needs a test that it appears. */
  letterChecked: "letter-checked",
  letterFlags: "letter-flags",
  /** A transcript row, keyed by role — the assistant and user turns need to be
   * assertable apart, and message ids are generated so they can't be a key. */
  aiMessage: (role: string) => `ai-message-${role}`,

  /** The nudge shown when a second job posting is about to land in a chat that
   * already carries one. Assertable because the whole point is that it costs no
   * model call — a test can prove it appears with no request in flight. */
  secondPosting: "second-posting",
  secondPostingNewChat: "second-posting-new-chat",
  secondPostingCancel: "second-posting-cancel",
  /** The server's own refusal of a second job, rendered in the transcript. The
   * composer's block is the one users meet; this is what catches a model talked
   * into trying anyway, and it must stay assertable separately for that reason. */
  jobMatchSecond: "job-match-second",
  jobMatchSecondNewChat: "job-match-second-new-chat",

  /** "Applied to this one?", under the posting link — in the chat card and in
   * the artefact panel, one component in both. */
  applyPrompt: "apply-prompt",
  applyPromptSaved: "apply-prompt-saved",
  applyPromptApplied: "apply-prompt-applied",
  applyPromptDone: "apply-prompt-done",

  /** The job tracker (`/jobs`). The board and the flow are two views of one
   * list, so they share a toggle and are asserted apart by these. */
  jobTracker: "job-tracker",
  jobTrackerEmpty: "job-tracker-empty",
  jobTrackerViewBoard: "job-tracker-view-board",
  jobTrackerViewFlow: "job-tracker-view-flow",
  jobBoard: "job-board",
  jobFlow: "job-flow",
  jobFlowEmpty: "job-flow-empty",
  jobFlowSummary: "job-flow-summary",
  jobFlowExportPng: "job-flow-export-png",
  jobFlowExportSvg: "job-flow-export-svg",
  jobFlowCopy: "job-flow-copy",
  /** The edit sheet over one card. */
  jobEdit: "job-edit",
  jobEditRole: "job-edit-role",
  jobEditCompany: "job-edit-company",
  jobEditLocation: "job-edit-location",
  jobEditUrl: "job-edit-url",
  jobEditStatus: "job-edit-status",
  jobEditSave: "job-edit-save",
  jobEditDelete: "job-edit-delete",
} as const;

/** A saved chat, by id — the one AI surface whose rows outlive the request that
 * drew them, so position would not identify them across a reload. `part` names
 * a control inside the row. */
export const chatSessionTestId = (id: string, part?: "delete") =>
  part ? `chat-session-${id}-${part}` : `chat-session-${id}`;

/** Proposed changes are keyed by position, not by id: a proposal is transient
 * (nothing persists it) and the model does not assign its changes ids. */
export const proposalChangeTestId = (index: number) => `ai-change-${index}`;
export const proposalApplyTestId = (index: number) =>
  `ai-change-apply-${index}`;

/** Requirements are keyed by position for the same reason — a streamed
 * analysis is transient and its rows carry no identifier. */
export const requirementRowTestId = (index: number) =>
  `job-requirement-${index}`;

/** Tailoring rewrites, likewise by position. Kept separate from the proposal
 * ids rather than shared: both reviews can be on screen in one session (the chat
 * and the job page), and a selector that matched either would pass against the
 * wrong one. */
export const tailorChangeTestId = (index: number) => `tailor-change-${index}`;
export const tailorApplyTestId = (index: number) =>
  `tailor-change-apply-${index}`;

/** A cover letter's body paragraphs, by position — streamed prose carries no
 * identifier and the letter is never persisted. */
/** One demonstrated-but-unlisted skill row, by term — these have no id of their
 * own, and the term is what the user is deciding about. */
export const skillGapTestId = (skill: string) =>
  `skill-gap-${skill.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

/** A tracker card, **by id** — a job outlives the request that drew it and moves
 * between columns, so position identifies nothing across a drag or a reload.
 * That is the same rule the blog and triage rows follow. */
export const jobCardTestId = (id: string) => `job-card-${id}`;

/** A board column, by status. Statuses are a closed set from `@resfolio/job`, so
 * this is a name rather than a generated key — a spec asserting on
 * `job-column-applied` reads as what it is. */
export const jobColumnTestId = (status: string) => `job-column-${status}`;

export const letterParagraphTestId = (index: number) =>
  `letter-paragraph-${index}`;

export const navItemTestId = (key: string) => `nav-${key}`;
export const blogPostItemTestId = (id: string) => `blog-post-${id}`;
export const themeOptionTestId = (theme: string) => `theme-option-${theme}`;
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
export const resumeSectionToggleTestId = (key: string) =>
  `resume-section-toggle-${key}`;
export const resumeSectionItemTestId = (key: string, id: string) =>
  `resume-section-item-${key}-${id}`;
export const resumeSectionDragTestId = (key: string) =>
  `resume-section-drag-${key}`;

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
