/**
 * @resfolio/profile — the profile engine
 * (docs/architecture/01-profile-engine.md): canonical Zod schema v1, lazy
 * migrations, the ProfileView projection, and pure edit helpers.
 *
 * This entry point is pure and framework-free — safe to import from server
 * code, client components (the editor form), and tests alike. Database
 * operations live in `@resfolio/profile/server`.
 */
export { createItemId } from "./ids";
export {
  HandleTakenError,
  ProfileDataError,
  ProfileNotFoundError,
} from "./errors";

export {
  PROFILE_SCHEMA_VERSION,
  SECTION_KEYS,
  SECTION_ITEM_SCHEMAS,
  profileSchema,
  profileSectionsSchema,
  type Profile,
  type ProfileInput,
  type ProfileSections,
  type SectionItemMap,
  type SectionKey,
} from "./schema/profile";

export {
  awardItemSchema,
  basicsSchema,
  certificationItemSchema,
  customItemSchema,
  customSectionSchema,
  educationItemSchema,
  experienceItemSchema,
  languageItemSchema,
  profileLinkSchema,
  projectItemSchema,
  skillGroupSchema,
  writingItemSchema,
  type AwardItem,
  type CertificationItem,
  type CustomItem,
  type CustomSection,
  type EducationItem,
  type ExperienceItem,
  type LanguageItem,
  type ProfileBasics,
  type ProfileLink,
  type ProjectItem,
  type SkillGroup,
  type WritingItem,
} from "./schema/sections";

export {
  ITEM_SOURCES,
  calendarDateSchema,
  httpUrlSchema,
  inlineRichTextSchema,
  itemIdSchema,
  itemSourceSchema,
  richTextSchema,
  safeLinkUrlSchema,
  type ItemSource,
} from "./schema/primitives";

export { RESERVED_HANDLES, handleSchema, isReservedHandle } from "./handle";

export {
  describeProfileItems,
  profileItemLabel,
  type ProfileItemRef,
} from "./describe";

export { migrateProfile } from "./migrate";

export {
  buildProfileView,
  orderedSectionKeys,
  sectionViewDefinitionSchema,
  viewDefinitionSchema,
  type ProfileView,
  type ProfileViewCustomSection,
  type ProfileViewSection,
  type ProfileViewStandardSection,
  type SectionViewDefinition,
  type StandardSectionKey,
  type ViewDefinition,
} from "./view";

export {
  addItem,
  moveItem,
  removeItem,
  updateBasics,
  updateItem,
} from "./edit";

export {
  MAX_PROPOSED_CHANGES,
  PROPOSABLE_ITEM_FIELDS,
  PROPOSABLE_SECTIONS,
  applyProfileChanges,
  profileChangeSchema,
  profileProposalSchema,
  reviewProfileChanges,
  type ChangeRejectionReason,
  type ProfileChange,
  type ProfileChangeReview,
  type ProfileProposal,
  type ProposableField,
  type ProposableSection,
  type RejectedChange,
  type ReviewedChange,
} from "./proposal";

export {
  addDemonstratedSkills,
  demonstrationHaystack,
  findDemonstratedSkills,
  termAppearsIn,
  type DemonstratedSkill,
  type SkillAddition,
  type SkillGroupRef,
} from "./skills";

export {
  applyTailoredChanges,
  applyTailoredEmphasis,
  clearTailoring,
  countTailoredFields,
  hasEmphasis,
  reviewTailorPlan,
  tailorEmphasisSchema,
  tailorPlanSchema,
  type TailorEmphasis,
  type TailorEmphasisInput,
  type TailorPlan,
  type TailorReview,
  type TailorSectionEmphasis,
} from "./tailor";

export {
  createEmptyProfile,
  createSeedProfile,
  type SeedIdentity,
} from "./seed";
