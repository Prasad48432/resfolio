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
export { ProfileDataError, ProfileNotFoundError } from "./errors";

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
  itemSourceSchema,
  richTextSchema,
  safeLinkUrlSchema,
  type ItemSource,
} from "./schema/primitives";

export { migrateProfile } from "./migrate";

export {
  buildProfileView,
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
  createEmptyProfile,
  createSeedProfile,
  type SeedIdentity,
} from "./seed";
