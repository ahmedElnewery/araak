export * from "./catalog";
export * from "./audit-categories";
export { loadEffectivePermissions, can, auditCategoriesFor, type EffectivePermissions, type EffectiveGrant } from "./evaluate";
export { canGrant, type RequestedGrant, type CeilingResult } from "./grant-ceiling";
export { scopeAllows, type RecordRef, type ScopeActor } from "./scope";
export {
  ROLE_SWITCHES, switchesToGrants, grantsToSwitches, offerableSwitches, applySwitchEdit,
  type RoleSwitch, type GrantPayload, type StoredGrant, type RoleGrantPayload,
} from "./role-switches";
