import { LtrText } from "@workspace/ui/components/ltr-text";

export type StaffNameParts = {
  firstName?: string | null;
  lastName?: string | null;
  username: string;
};

/** "First Last", or the username for an account activated before names were collected that has not added them yet. */
export function staffName(s: StaffNameParts): string {
  return s.firstName && s.lastName ? `${s.firstName} ${s.lastName}` : s.username;
}

/**
 * A staff member as the apps show them: the first and last name, isolated in the direction of its own script (names
 * may be Arabic or Latin), or the username, kept left-to-right, while the account has no name.
 */
export function StaffName({ staff, className }: { staff: StaffNameParts; className?: string }) {
  return staff.firstName && staff.lastName ? (
    <bdi dir="auto" className={className}>
      {staffName(staff)}
    </bdi>
  ) : (
    <LtrText className={className}>{staff.username}</LtrText>
  );
}
