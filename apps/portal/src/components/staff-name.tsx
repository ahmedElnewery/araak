import { personFullName } from "@workspace/auth";
import { LtrText } from "@workspace/ui/components/ltr-text";

type Staff = { firstName?: string | null; lastName?: string | null; username: string };

/**
 * A staff member as the portal shows them: the first and last name, isolated in the direction of its own script,
 * or the username (kept left-to-right) for an account that has not added a name yet.
 */
export function StaffName({ staff, className }: { staff: Staff; className?: string }) {
  const name = personFullName(staff);
  return name ? <bdi dir="auto" className={className}>{name}</bdi> : <LtrText className={className}>{staff.username}</LtrText>;
}
