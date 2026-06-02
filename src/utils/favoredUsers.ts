import { isNiceListUser } from "@/db/niceList";

/** Users on the nice list; everyone else gets the snarky tone. */
export function isFavoredUser(userId: string): boolean {
  return isNiceListUser(userId);
}
